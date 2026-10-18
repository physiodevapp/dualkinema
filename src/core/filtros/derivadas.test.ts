import { describe, expect, it } from 'vitest'
import { anguloArticular } from '../articulaciones/calculo'
import { marcadores, modeloRodilla3 } from '../articulaciones/catalogo'
import { aCanonico, type OrientacionVista } from '../geometria/canonico'
import type { Vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { aTiemposReales, derivadasAngulares, derivarRejilla, derivarTramo, velocidadMarcador } from './derivadas'
import { filtrarTrayectoria, rejillaUniforme, type TrayectoriaFiltrada } from './tramos'

// ---- Utilidades de prueba ----

const FS = 30
const rango = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))
const muestra = (t: number, x: number, y: number): Muestra2D => ({ t, x, y, calidad: 1, editadoManual: false })

/**
 * Tiempos de un móvil con fps variable: 30 fps con ±3 ms de variación y
 * frames que faltan (el paso es el doble). Reproducible.
 */
function tiemposVariables(n: number, saltos: readonly number[] = []): number[] {
  const ts: number[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    ts.push(t + 0.003 * Math.sin(i * 1.7))
    t += (saltos.includes(i) ? 2 : 1) / FS
  }
  return ts
}

/** Índices con valor finito. */
const conValor = (a: ArrayLike<number>) => rango(a.length, (i) => i).filter((i) => Number.isFinite(a[i]!))

// ---- Diferencias centrales y vuelta a los tiempos reales ----

describe('derivadas: diferencias centrales en la rejilla', () => {
  const parabola = (t: number) => 3 * t * t + 2 * t + 1 // v = 6t + 2, a = 6

  it('son exactas con una parábola, y los extremos quedan sin derivada (NaN, no 0)', () => {
    const h = 1 / FS
    const rej = rango(31, (k) => k * h)
    const d = derivarRejilla(rej.map(parabola), h)
    expect(Number.isNaN(d.velocidad[0]!)).toBe(true)
    expect(Number.isNaN(d.velocidad[30]!)).toBe(true)
    expect(Number.isNaN(d.aceleracion[0]!)).toBe(true)
    expect(Number.isNaN(d.aceleracion[30]!)).toBe(true)
    for (let k = 1; k < 30; k++) {
      expect(d.velocidad[k]).toBeCloseTo(6 * rej[k]! + 2, 9)
      expect(d.aceleracion[k]).toBeCloseTo(6, 6)
    }
  })

  it('con fps variable, una parábola da su derivada exacta en los tiempos reales', () => {
    const ts = tiemposVariables(40, [12, 25])
    const rej = rejillaUniforme(ts[0]!, ts[ts.length - 1]!, FS)
    const d = derivarTramo(rej, Array.from(rej, parabola), ts)
    // Primer y último frame: sin derivada.
    expect(Number.isNaN(d.velocidad[0]!)).toBe(true)
    expect(Number.isNaN(d.velocidad[ts.length - 1]!)).toBe(true)
    const definidos = conValor(d.velocidad)
    expect(definidos.length).toBeGreaterThanOrEqual(ts.length - 4)
    for (const i of definidos) {
      // La velocidad es una recta y la aceleración una constante: el spline las reproduce.
      expect(d.velocidad[i]).toBeCloseTo(6 * ts[i]! + 2, 8)
      expect(d.aceleracion[i]).toBeCloseTo(6, 5)
    }
  })

  it('un seno de 1 Hz a 30 fps: error de la derivada < 1 % del pico (es del orden de h²)', () => {
    const ts = tiemposVariables(90, [30, 60])
    const rej = rejillaUniforme(ts[0]!, ts[ts.length - 1]!, FS)
    const w = 2 * Math.PI
    const d = derivarTramo(rej, Array.from(rej, (t) => 10 * Math.sin(w * t)), ts)
    for (const i of conValor(d.velocidad)) {
      expect(Math.abs(d.velocidad[i]! - 10 * w * Math.cos(w * ts[i]!))).toBeLessThan(0.01 * 10 * w)
      expect(Math.abs(d.aceleracion[i]! + 10 * w * w * Math.sin(w * ts[i]!))).toBeLessThan(0.01 * 10 * w * w)
    }
  })

  it('no extrapola: un tiempo fuera de los nodos con derivada queda en NaN', () => {
    const r = aTiemposReales([0, 1, 2, 3], [NaN, 5, 7, NaN], [0, 0.5, 1, 1.5, 2, 2.5, 3])
    expect(Array.from(r).map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, null, 5, 6, 7, null, null])
  })

  it('con menos de tres nodos no hay derivada', () => {
    const d = derivarTramo([0, 0.1], [1, 2], [0, 0.1])
    expect(conValor(d.velocidad)).toEqual([])
  })
})

// ---- Velocidad lineal de un marcador ----

describe('velocidad lineal de un marcador', () => {
  // Giro de 1 Hz y 100 px de radio: rapidez constante de 2π·100 ≈ 628 px/s.
  const RADIO = 100
  const RAPIDEZ = 2 * Math.PI * RADIO
  const enCirculo = (t: number) => muestra(t, 300 + RADIO * Math.cos(2 * Math.PI * t), 200 + RADIO * Math.sin(2 * Math.PI * t))

  function trayectoria(): { serie: (Muestra2D | undefined)[]; ts: number[] } {
    const ts = tiemposVariables(150, [41, 81])
    const serie: (Muestra2D | undefined)[] = ts.map(enCirculo)
    for (let i = 60; i < 66; i++) serie[i] = undefined // hueco
    for (let i = 100; i < 104; i++) serie[i] = undefined // deja 104–109 en un tramo corto (6)
    for (let i = 110; i < 113; i++) serie[i] = { ...serie[i]!, x: NaN, y: NaN, calidad: 0 } // perdido
    return { serie, ts }
  }

  it('px/s con fps variable y huecos: sin valor en el hueco, en los bordes de cada tramo ni en el tramo corto', () => {
    const { serie } = trayectoria()
    const f = filtrarTrayectoria(serie, FS)
    expect(f.tramos.map((t) => [t.primero, t.ultimo, t.corto])).toEqual([
      [0, 59, false],
      [66, 99, false],
      [104, 109, true],
      [113, 149, false],
    ])
    const v = velocidadMarcador(f)
    expect(v.unidad).toBe('px/s')
    const nan = (i: number) => Number.isNaN(v.modulo[i]!)
    // Bordes de cada tramo, hueco, perdido y tramo corto: sin valor.
    for (const i of [0, 59, 66, 99, 113, 149]) expect(nan(i), `borde ${i}`).toBe(true)
    for (let i = 60; i < 66; i++) expect(nan(i)).toBe(true)
    for (let i = 100; i < 113; i++) expect(nan(i), `frame ${i}`).toBe(true)
    // Nunca 0: donde no hay derivada es NaN.
    expect(Array.from(v.modulo).some((m) => m === 0)).toBe(false)
    // Dentro de cada tramo (lejos de los bordes, donde la reflexión deforma algo), la rapidez real.
    for (const [a, b] of [[0, 59], [66, 99], [113, 149]] as const) {
      for (let i = a + 6; i <= b - 6; i++) expect(Math.abs(v.modulo[i]! / RAPIDEZ - 1), `frame ${i}`).toBeLessThan(0.01)
      // Y en todo lo derivado, sin disparates en los bordes.
      for (let i = a + 1; i < b; i++) if (!nan(i)) expect(Math.abs(v.modulo[i]! / RAPIDEZ - 1), `frame ${i}`).toBeLessThan(0.08)
    }
  })

  it('las componentes son las de la derivada real (dirección incluida)', () => {
    const { serie, ts } = trayectoria()
    const v = velocidadMarcador(filtrarTrayectoria(serie, FS))
    for (let i = 10; i < 50; i++) {
      const w = 2 * Math.PI
      expect(Math.abs(v.vx[i]! + RADIO * w * Math.sin(w * ts[i]!))).toBeLessThan(0.01 * RAPIDEZ)
      expect(Math.abs(v.vy[i]! - RADIO * w * Math.cos(w * ts[i]!))).toBeLessThan(0.01 * RAPIDEZ)
    }
  })

  it('con escala (paso 6) pasa a m/s', () => {
    const { serie } = trayectoria()
    const f = filtrarTrayectoria(serie, FS)
    const px = velocidadMarcador(f)
    const m = velocidadMarcador(f, 0.002)
    expect(m.unidad).toBe('m/s')
    expect(m.modulo[30]).toBeCloseTo(px.modulo[30]! * 0.002, 12)
    expect(Number.isNaN(m.modulo[0]!)).toBe(true)
  })
})

// ---- Velocidad y aceleración angulares ----

describe('velocidad y aceleración angulares', () => {
  const modelo = modeloRodilla3('izq')
  const rodilla = modelo.articulaciones[0]!
  const m = marcadores('izq')
  const orientacion: OrientacionVista = { plano: 'sagital', mira: 'derecha' }
  // Flexión de rodilla 0° → 90° → 0° en 4 s, como el vídeo sintético de las pruebas e2e.
  const flexion = (t: number) => 45 * (1 - Math.cos((Math.PI * t) / 2))
  const posiciones = (t: number) => {
    const a = (flexion(t) * Math.PI) / 180
    return {
      [m.cadera]: [300, 60],
      [m.rodilla]: [300, 200],
      [m.tobillo]: [300 - 140 * Math.sin(a), 200 + 140 * Math.cos(a)],
    } as Record<IdMarcador, [number, number]>
  }
  // Ángulo que da la definición con las posiciones exactas, y sus derivadas
  // numéricas finas: no depende de la convención de signo.
  const anguloReal = (t: number) => {
    const p = posiciones(t)
    const puntos = new Map<IdMarcador, Vec3>(Object.entries(p).map(([id, [x, y]]) => [id, aCanonico(x, y, orientacion)]))
    return anguloArticular(rodilla, puntos)
  }
  const H = 1e-4
  const velReal = (t: number) => (anguloReal(t + H) - anguloReal(t - H)) / (2 * H)
  const acelReal = (t: number) => (anguloReal(t + H) - 2 * anguloReal(t) + anguloReal(t - H)) / (H * H)

  function filtrar(ts: number[], quitar: (id: IdMarcador, i: number) => boolean = () => false) {
    const porMarcador = new Map<IdMarcador, TrayectoriaFiltrada>()
    for (const mk of modelo.marcadores) {
      const serie = ts.map((t, i) => (quitar(mk.id, i) ? undefined : muestra(t, ...posiciones(t)[mk.id]!)))
      porMarcador.set(mk.id, filtrarTrayectoria(serie, FS))
    }
    return porMarcador
  }

  it('el caso de prueba es el esperado: pico de 70,7 °/s a mitad de la subida', () => {
    expect(Math.abs(velReal(1))).toBeCloseTo(45 * (Math.PI / 2), 2)
  })

  it('con fps variable: la derivada real (±1 °/s y ±3 °/s²), sin valor en los extremos', () => {
    const ts = tiemposVariables(120, [41, 81])
    const d = derivadasAngulares(rodilla, filtrar(ts), orientacion, FS)
    expect(Number.isNaN(d.velocidad[0]!)).toBe(true)
    expect(Number.isNaN(d.velocidad[119]!)).toBe(true)
    expect(Number.isNaN(d.aceleracion[0]!)).toBe(true)
    for (let i = 6; i < 114; i++) {
      expect(Math.abs(d.velocidad[i]! - velReal(ts[i]!)), `frame ${i}`).toBeLessThan(1)
      expect(Math.abs(d.aceleracion[i]! - acelReal(ts[i]!)), `frame ${i}`).toBeLessThan(3)
    }
  })

  it('un hueco de un marcador corta la derivada; a sus lados, la real', () => {
    const ts = tiemposVariables(120, [41, 81])
    const d = derivadasAngulares(rodilla, filtrar(ts, (id, i) => id === m.tobillo && i >= 50 && i < 60), orientacion, FS)
    for (let i = 50; i < 60; i++) expect(Number.isNaN(d.velocidad[i]!)).toBe(true)
    expect(Number.isNaN(d.velocidad[49]!)).toBe(true) // borde del tramo
    expect(Number.isNaN(d.velocidad[60]!)).toBe(true)
    for (const i of [40, 45, 65, 70]) expect(Math.abs(d.velocidad[i]! - velReal(ts[i]!)), `frame ${i}`).toBeLessThan(1)
  })

  it('donde un marcador está en un tramo corto, no hay derivada', () => {
    const ts = tiemposVariables(120)
    // La cadera solo tiene 5 frames seguidos entre 70 y 74.
    const d = derivadasAngulares(rodilla, filtrar(ts, (id, i) => id === m.cadera && (i === 69 || i === 75)), orientacion, FS)
    for (let i = 69; i <= 75; i++) expect(Number.isNaN(d.velocidad[i]!), `frame ${i}`).toBe(true)
    expect(Number.isFinite(d.velocidad[60]!)).toBe(true)
    expect(Number.isFinite(d.velocidad[85]!)).toBe(true)
  })

  it('sin uno de los marcadores no hay nada', () => {
    const ts = tiemposVariables(40)
    const porMarcador = filtrar(ts)
    porMarcador.delete(m.tobillo)
    expect(conValor(derivadasAngulares(rodilla, porMarcador, orientacion, FS).velocidad)).toEqual([])
  })
})
