import { describe, expect, it } from 'vitest'
import { indiceGrado, posturaNeutra, type Grado } from '../../esqueleto/modelo'
import { medidasDe } from '../../esqueleto/sintetico'
import { vec3 } from '../../geometria/vector'
import { ALTURA, COORDENADAS, COORDENADAS_OSIM, ENTRADAS } from './caso.prueba'
import { ENTRADA, VENTANA } from './normalizador'
import { alturaDeMedidas, aZxy, butterBajo, coordenadasOsim, derivadaSpline, entradasDeCoordenadas, filtfilt, OSIM, prepararToma, zxy } from './preparar'

const deg = Math.PI / 180

describe('GaitDynamics: lo de SciPy', () => {
  it('butter(4, 15 Hz a 100 Hz): los coeficientes de SciPy', () => {
    // scipy.signal.butter(4, 0.3): b y a.
    const { b, a } = butterBajo(4, 15, 100)
    const bS = [0.01856301062689717, 0.07425204250758868, 0.11137806376138303, 0.07425204250758868, 0.01856301062689717]
    const aS = [1, -1.570398851228172, 1.27561332498328, -0.4844033683350857, 0.07619706461033242]
    b.forEach((v, k) => expect(v).toBeCloseTo(bS[k]!, 8))
    a.forEach((v, k) => expect(v).toBeCloseTo(aS[k]!, 8))
  })

  it('filtfilt de una recta da lo mismo que SciPy (con su relleno impar); la derivada de la spline de una cúbica es exacta', () => {
    const { b, a } = butterBajo(4, 10, 100)
    const y = filtfilt(b, a, Array.from({ length: 60 }, (_, i) => 2 + 0.3 * i))
    // scipy.signal.filtfilt(*butter(4, 0.2), 2 + 0.3·arange(60))
    ;[1.99696457, 2.29895862, 2.60054398].forEach((v, i) => expect(y[i]).toBeCloseTo(v, 7))
    expect(y[58]).toBeCloseTo(19.40495223, 7)
    expect(y[59]).toBeCloseTo(19.69766004, 7)
    const cub = Array.from({ length: 30 }, (_, i) => 0.01 * i ** 3 - 0.2 * i ** 2 + i)
    derivadaSpline(cub).forEach((v, i) => expect(v).toBeCloseTo(0.03 * i ** 2 - 0.4 * i + 1, 8))
  })
})

describe('GaitDynamics: el preprocesado, igual que su código en Python', () => {
  it('el caso de prueba: las 51 entradas normalizadas de cada muestra', () => {
    expect([...COORDENADAS_OSIM]).toEqual([...OSIM])
    const { entradas } = entradasDeCoordenadas(COORDENADAS, ALTURA)
    let peor = 0
    for (let t = 0; t < COORDENADAS.length; t++)
      for (let k = 0; k < ENTRADA.length; k++) peor = Math.max(peor, Math.abs(entradas[t * ENTRADA.length + k]! - ENTRADAS[t]![k]!))
    expect(peor).toBeLessThan(1e-4)
  })

  it('zxy y su inversa', () => {
    const [a, b, c] = aZxy(zxy(0.3, -0.4, 1.1))
    expect(a).toBeCloseTo(0.3, 12)
    expect(b).toBeCloseTo(-0.4, 12)
    expect(c).toBeCloseTo(1.1, 12)
  })
})

describe('GaitDynamics: de nuestro esqueleto a las coordenadas de OpenSim', () => {
  const M = medidasDe(1.75)
  const de = (c: Partial<Record<Grado, number>>) => {
    const q = posturaNeutra(vec3(1, 2, 0.93))
    for (const [g, v] of Object.entries(c)) q[indiceGrado(g as Grado)] = v
    return q
  }
  const o = (q: number[], c: (typeof OSIM)[number]) => coordenadasOsim(q, M)[OSIM.indexOf(c)]!
  it('de pie, todo 0 salvo la posición (y arriba, z a la derecha)', () => {
    const q = de({})
    for (const c of OSIM) if (!c.startsWith('pelvis_t')) expect(Math.abs(o(q, c))).toBeLessThan(1e-12)
    expect(o(q, 'pelvis_tx')).toBe(1)
    expect(o(q, 'pelvis_ty')).toBe(0.93)
    expect(o(q, 'pelvis_tz')).toBe(-2)
  })
  it('flexión de cadera y de rodilla, flexión del tronco (extensión lumbar −), rumbo a la izquierda (rotación +)', () => {
    expect(o(de({ caderaFlexDer: 30 * deg }), 'hip_flexion_r')).toBeCloseTo(30 * deg, 9)
    expect(o(de({ caderaFlexIzq: 30 * deg }), 'hip_flexion_l')).toBeCloseTo(30 * deg, 9)
    expect(o(de({ rodillaIzq: 50 * deg }), 'knee_angle_l')).toBeCloseTo(50 * deg, 9)
    expect(o(de({ troncoFlex: 20 * deg }), 'lumbar_extension')).toBeCloseTo(-20 * deg, 9)
    expect(o(de({ pelvisRumbo: 25 * deg }), 'pelvis_rotation')).toBeCloseTo(25 * deg, 9)
    // Aducción de la cadera derecha: el pie hacia la izquierda (−z de OpenSim) = giro + alrededor de x.
    expect(o(de({ caderaAbdDer: -10 * deg }), 'hip_adduction_r')).toBeCloseTo(10 * deg, 9)
    // La izquierda (ejes de la derecha con coeficiente −1): aducción + y rotación interna + en las dos piernas.
    expect(o(de({ caderaAbdIzq: 10 * deg }), 'hip_adduction_l')).toBeCloseTo(-10 * deg, 9)
    expect(o(de({ caderaRotIzq: 12 * deg }), 'hip_rotation_l')).toBeCloseTo(12 * deg, 9)
    expect(o(de({ caderaRotDer: 12 * deg }), 'hip_rotation_r')).toBeCloseTo(12 * deg, 9)
  })
  it('la toma: ventanas de 1,5 s solapadas, solo en tramos que llegan', () => {
    const tiempos = Array.from({ length: 120 }, (_, k) => k / 30)
    const posturas = tiempos.map((t, k) => (k === 60 ? null : de({ pelvisX: 1.2 * t, caderaFlexDer: 0.3 * Math.sin(5 * t) })))
    // 0–1,97 s (59 frames, 1,97 s ≥ 1,5 s) y 2,03–3,97 s: dos tramos.
    const p = prepararToma(tiempos, posturas, M, 1, 30)
    expect(p.tramos).toHaveLength(2)
    expect(p.lote.length).toBe(p.ventanas * VENTANA * ENTRADA.length)
    for (const tr of p.tramos) expect(tr.inicios[tr.inicios.length - 1]! + VENTANA).toBe(tr.rejilla.length)
    expect(alturaDeMedidas(M)).toBeCloseTo(1.75, 6)
  })
  it('una ida y vuelta (la pelvis gira 180°): cada sentido se alinea por separado', () => {
    const tiempos = Array.from({ length: 240 }, (_, k) => k / 30)
    // 0–3,5 s hacia +x, media vuelta en 1 s, 4,5–8 s hacia −x.
    const rumbo = (t: number) => (t < 3.5 ? 0 : t < 4.5 ? Math.PI * (t - 3.5) : Math.PI)
    const posturas = tiempos.map((t) => de({ pelvisRumbo: rumbo(t), caderaFlexDer: 0.3 * Math.sin(5 * t) }))
    const p = prepararToma(tiempos, posturas, M, 1, 30)
    expect(p.tramos.length).toBeGreaterThanOrEqual(2)
    const giros = p.tramos.map((tr) => Math.atan2(tr.alineacion.giro[2], tr.alineacion.giro[0]))
    // El primero sin girar; el último, girado media vuelta.
    expect(Math.abs(giros[0]!)).toBeLessThan(1e-9)
    expect(Math.abs(Math.abs(giros[giros.length - 1]!) - Math.PI)).toBeLessThan(1e-6)
  })
})

describe('GaitDynamics: de lo que da la red a la fuerza de cada pie', () => {
  it('fuerza vertical en el pie derecho y el centro de presiones 10 cm por delante del talón, de vuelta en nuestro marco', async () => {
    const { ESCALA, MINIMO, SALIDA } = await import('./normalizador')
    const { decodificar } = await import('./preparar')
    const { cuerpoDePostura, enMetros } = await import('../segmentos')
    const M = medidasDe(1.75)
    const tiempos = Array.from({ length: 60 }, (_, k) => k / 30)
    // Anda hacia +x sin girar: la alineación no gira nada.
    const posturas = tiempos.map((t) => {
      const q = posturaNeutra(vec3(1.2 * t, 0, 0.93))
      return q
    })
    const prep = prepararToma(tiempos, posturas, M, 1, 30)
    expect(prep.ventanas).toBeGreaterThan(0)
    // En OpenSim: pie derecho Fy = 9,81 N/kg, Fx = 1; cop normalizado = (cop − calcáneo)·Fy / estatura.
    const altura = alturaDeMedidas(M)
    const valores = [1, 9.81, 0, (0.1 * 9.81) / altura, 0, 0, 0, 0, 0, 0, 0, 0]
    const salida = new Float32Array(prep.ventanas * VENTANA * 12)
    for (let i = 0; i < prep.ventanas * VENTANA; i++) for (let k = 0; k < 12; k++) salida[i * 12 + k] = valores[k]! * ESCALA[SALIDA[k]!]! + MINIMO[SALIDA[k]!]!
    const pies = decodificar(prep, salida, tiempos, posturas, M, 1, 0)
    const k = 30
    const der = pies[k]!.der!
    expect(der.F.x).toBeCloseTo(1, 4)
    expect(der.F.y).toBeCloseTo(0, 4)
    expect(der.F.z).toBeCloseTo(9.81, 4)
    const talon = cuerpoDePostura(enMetros(posturas[k]!, M, 1).q, M).puntos.talon.der
    expect(der.cop.x).toBeCloseTo(talon.x + 0.1, 4)
    expect(der.cop.y).toBeCloseTo(talon.y, 4)
    // El izquierdo, sin fuerza: en el aire (sin reacción, null; nunca un centro de presiones inventado).
    expect(pies[k]!.izq).toBeNull()
  })
})
