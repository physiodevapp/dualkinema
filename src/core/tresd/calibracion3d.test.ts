import { describe, expect, it } from 'vitest'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { calibrar3D, campoDeVision, esCalibracion3D, informe3D, nombrePunto, resumir3D, textoAviso } from './calibracion3d'
import { aplicar, camaraMirando, centro, focalPrevia, proyectar, type Camara } from './camara'
import { estaturaEnMetros } from './escala'
import { correspondencias, instantesConCorrespondencias, posicionEn, type VistaParaEmparejar } from './correspondencias'
import { estadoEn, puntosDe } from './sintetico'

const H = 1.75
const ARRIBA = vec3(0, 0, 1)
const IMG = { ancho: 1080, alto: 1920 }
const f = focalPrevia(IMG.ancho, IMG.alto)
const abajoEn = (c: Camara) => aplicar(c.R, vec3(0, 0, -1))
const muestra = (t: number, x: number, y: number, calidad = 0.9): Muestra2D => ({ t, x, y, calidad, editadoManual: false })

/** Una vista de la persona sintética en los primeros 6 s: sus frames (con un desfase de reloj) y sus trayectorias. */
function vista(camara: Camara, tiempos: readonly number[], desfase: number, quitar: (id: string, k: number) => boolean = () => false): VistaParaEmparejar {
  const series = new Map<IdMarcador, (Muestra2D | undefined)[]>()
  tiempos.forEach((t, k) => {
    for (const [nombre, X] of puntosDe(estadoEn(t + desfase, H), H)) {
      const id = `pose_${nombre}`
      if (!series.has(id)) series.set(id, [])
      const p = proyectar(camara, X)
      series.get(id)![k] = quitar(id, k) ? undefined : muestra(t, p.u, p.v)
    }
  })
  return { series, tabla: crearTablaFrames(tiempos), desfase, paso: tiempos[1]! - tiempos[0]! }
}

const IDS = [...puntosDe(estadoEn(0, H), H).keys()].map((n) => `pose_${n}`)

describe('posicionEn', () => {
  const tabla = crearTablaFrames([0, 0.1, 0.2, 0.6])
  const serie = [muestra(0, 0, 0), muestra(0.1, 10, 20), muestra(0.2, 20, 40, 0.2), muestra(0.6, 0, 0)]
  it('justo en un frame, el frame; entre dos utilizables, interpolado', () => {
    expect(posicionEn(serie, tabla, 0.1, 0.1)).toEqual({ x: 10, y: 20, calidad: 0.9 })
    const p = posicionEn(serie, tabla, 0.1, 0.05)!
    expect(p.x).toBeCloseTo(5, 9)
    expect(p.y).toBeCloseTo(10, 9)
  })
  it('nunca a través de un frame poco fiable, de un salto en el tiempo ni fuera del vídeo', () => {
    expect(posicionEn(serie, tabla, 0.1, 0.15)).toBeNull()
    expect(posicionEn(serie, tabla, 0.1, 0.2)).toBeNull()
    expect(posicionEn([...serie.slice(0, 2), muestra(0.2, 0, 0), serie[3]], tabla, 0.1, 0.4)).toBeNull()
    expect(posicionEn(serie, tabla, 0.1, -0.01)).toBeNull()
    expect(posicionEn(serie, tabla, 0.1, 0.7)).toBeNull()
  })
})

describe('correspondencias entre las dos vistas', () => {
  const A = camaraMirando(vec3(2.1, 2.1, 1), vec3(0, 0, 0.9), ARRIBA, f, IMG.ancho, IMG.alto)
  const B = camaraMirando(vec3(-2.3, 2.3, 0.8), vec3(0, 0, 0.85), ARRIBA, f, IMG.ancho, IMG.alto)
  const tA = Array.from({ length: 180 }, (_, k) => k / 30)
  // B empezó 0,1 s más tarde: su frame en t_B ve el instante común t_B + 0,1. Y a 25 fps.
  const tB = Array.from({ length: 145 }, (_, k) => k / 25)

  it('B se interpola al instante común de cada frame de A y cae en la proyección de verdad', () => {
    const c = correspondencias(vista(A, tA, 0), vista(B, tB, 0.1), IDS)
    expect(instantesConCorrespondencias(c)).toBeGreaterThan(170)
    // Comprueba una: el punto de B en el instante común, proyectado de verdad (la interpolación lineal a 25 fps yerra poco).
    const x = c.find((k) => k.id === idPose('rodilla', 'der') && Math.abs(k.t - 2) < 1e-9)!
    const verdad = proyectar(B, puntosDe(estadoEn(2, H), H).get('rodilla_der')!)
    expect(Math.hypot(x.b.u - verdad.u, x.b.v - verdad.v)).toBeLessThan(3)
  })

  it('el tramo acota, el máximo reparte y un instante con pocos puntos no cuenta', () => {
    const a = vista(A, tA, 0)
    const b = vista(B, tB, 0.1, (id, k) => k < 50 && id !== idPose('cadera', 'der') && id !== idPose('cadera', 'izq') && id !== idPose('rodilla', 'der'))
    const c = correspondencias(a, b, IDS, { tramo: { desde: 1, hasta: 3 } })
    expect(Math.min(...c.map((k) => k.t))).toBeGreaterThanOrEqual(1)
    expect(Math.max(...c.map((k) => k.t))).toBeLessThanOrEqual(3)
    const pocos = correspondencias(a, b, IDS, { maximo: 20 })
    expect(instantesConCorrespondencias(pocos)).toBe(20)
    // Los primeros 50 frames de B (2 s) solo tienen 3 puntos: ningún instante de A antes de ~2,1 s.
    expect(Math.min(...correspondencias(a, b, IDS).map((k) => k.t))).toBeGreaterThan(1.9)
  })
})

// Cálculos de verdad con la persona sintética: en el runner de la CI, alguno pasa de los 5 s por defecto.
describe('calibrar3D con la persona sintética', { timeout: 30_000 }, () => {
  // Móviles en los flancos a ±45°, a 3 m de la persona, a 1,0 y 0,8 m de alto; B con un 5 % más de focal.
  const A = camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), ARRIBA, f, IMG.ancho, IMG.alto)
  const B = camaraMirando(vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), ARRIBA, f * 1.05, IMG.ancho, IMG.alto)
  const tA = Array.from({ length: 180 }, (_, k) => k / 30)
  const c = correspondencias(vista(A, tA, 0), vista(B, tA, 0), IDS)
  const base = { vistas: ['a', 'b'] as const, correspondencias: c, imagenes: [IMG, IMG] as const, verticales: [abajoEn(A), abajoEn(B)] as const, tramo: null, fecha: '2026-11-08T10:00:00.000Z', desfases: [0, 0] as const }
  const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
  const DISTANCIA = dist(centro(A), centro(B))

  it('con la estatura: ángulo entre móviles, distancia, alturas y campo de visión cerca de la verdad', () => {
    const cal = calibrar3D({ ...base, estatura: H, distanciaCinta: null })!
    expect(cal).not.toBeNull()
    expect(esCalibracion3D(cal)).toBe(true)
    expect(cal.errorMediano).toBeLessThan(0.5)
    expect(cal.escalaDe).toBe('estatura')
    const r = resumir3D(cal, { imagenes: [IMG, IMG], distanciaPitido: DISTANCIA, movido: [false, false], metodoSincronia: 'pitido' })
    expect(Math.abs(r.anguloCamaras - 90)).toBeLessThan(2)
    expect(r.enMetros).toBe(true)
    // La escala por la estatura toma el percentil 90 de tobillo → hombro (la persona sintética da pasos: algo por debajo).
    expect(Math.abs(r.distanciaCamaras / DISTANCIA - 1)).toBeLessThan(0.06)
    expect(Math.abs(r.alturas[0]! - 1.0)).toBeLessThan(0.1)
    expect(Math.abs(r.alturas[1]! - 0.8)).toBeLessThan(0.1)
    expect(Math.abs(r.campos[0] - campoDeVision(f, IMG))).toBeLessThan(3)
    expect(r.avisos).toEqual([])
  })

  it('la cinta manda sobre la estatura y da la distancia exacta', () => {
    const cal = calibrar3D({ ...base, estatura: 1.2, distanciaCinta: 4.24 })!
    expect(cal.escalaDe).toBe('cinta')
    const r = resumir3D(cal, { imagenes: [IMG, IMG], distanciaPitido: null, movido: [false, false], metodoSincronia: 'pitido' })
    expect(r.distanciaCamaras).toBeCloseTo(4.24, 9)
  })

  it('sin escala no hay metros; los avisos: sin sincronizar, sin acelerómetro, movido, pitido que no casa, campo raro', () => {
    const cal = calibrar3D({ ...base, estatura: null, distanciaCinta: null })!
    expect(cal.metrosPorUnidad).toBeNull()
    const r = resumir3D(cal, { imagenes: [IMG, IMG], distanciaPitido: null, movido: [false, true], metodoSincronia: 'ninguna' })
    expect(r.enMetros).toBe(false)
    expect(r.alturas).toEqual([null, null])
    expect(r.avisos.map((a) => a.tipo)).toEqual(['movido', 'sinSincronizar'])
    const conEstatura = calibrar3D({ ...base, estatura: H * 1.3, distanciaCinta: null })!
    const r2 = resumir3D(conEstatura, { imagenes: [IMG, IMG], distanciaPitido: DISTANCIA, movido: [false, false], metodoSincronia: 'reloj' })
    expect(r2.avisos.map((a) => a.tipo)).toEqual(['pitido', 'reloj'])
    expect(textoAviso(r2.avisos[0]!)).toMatch(/no casa con la del pitido .*\+\d+ %/)
    const raro = resumir3D({ ...cal, camaras: [{ ...cal.camaras[0], f: f * 3 }, cal.camaras[1]] }, { imagenes: [IMG, IMG], distanciaPitido: null, movido: [false, false], metodoSincronia: 'pitido' })
    expect(raro.avisos.some((a) => a.tipo === 'focal' && a.vista === 0)).toBe(true)
  })

  it('un punto que el detector pone en otro sitio desde un lado sale el peor y con su aviso', () => {
    // La cadera derecha 25 px más abajo en B (como si el detector la estimara distinto desde ese flanco). Un desvío a lo
    // largo de la línea epipolar (casi horizontal con los móviles a la misma altura) no se vería: el punto 3D se mueve y lo
    // absorbe (ver el test siguiente).
    const malas = c.map((k) => (k.id === idPose('cadera', 'der') ? { ...k, b: { u: k.b.u, v: k.b.v + 25 } } : k))
    const cal = calibrar3D({ ...base, correspondencias: malas, estatura: H, distanciaCinta: null })!
    const r = resumir3D(cal, { imagenes: [IMG, IMG], distanciaPitido: null, movido: [false, false], metodoSincronia: 'pitido' })
    expect(r.peorPunto?.id).toBe(idPose('cadera', 'der'))
    expect(r.avisos.some((a) => a.tipo === 'punto')).toBe(true)
    expect(textoAviso(r.avisos.find((a) => a.tipo === 'punto')!)).toMatch(/^La cadera derecha casa peor/)
  })

  it('un desvío a lo largo de la línea epipolar no se ve en el error: cambia la profundidad del punto', () => {
    const malas = c.map((k) => (k.id === idPose('cadera', 'der') ? { ...k, b: { u: k.b.u + 25, v: k.b.v } } : k))
    const cal = calibrar3D({ ...base, correspondencias: malas, estatura: H, distanciaCinta: null })!
    expect(cal.errorPorPunto[idPose('cadera', 'der')]).toBeLessThan(1)
  })

  it('una calibración degenerada (nada triangulable) no se devuelve: guardada, la sesión no se abriría', () => {
    // B ve todo a la vez en el mismo píxel: ningún punto se puede triangular.
    const rotas = c.map((k) => ({ ...k, b: { u: 540, v: 960 } }))
    expect(calibrar3D({ ...base, correspondencias: rotas, estatura: H, distanciaCinta: null })).toBeNull()
  })

  it('la estatura escrita: en cm o en m, y nada si no es razonable', () => {
    expect(estaturaEnMetros(175)).toBe(1.75)
    expect(estaturaEnMetros(1.62)).toBe(1.62)
    for (const raro of [3, 350, 1755, 0.5, NaN]) expect(estaturaEnMetros(raro)).toBeNull()
  })

  it('con pocos instantes no calibra', () => {
    expect(calibrar3D({ ...base, correspondencias: c.filter((k) => k.t < 0.5), estatura: H, distanciaCinta: null })).toBeNull()
  })

  it('el informe lleva lo que hay que mirar, sin nada del archivo', () => {
    const cal = calibrar3D({ ...base, estatura: H, distanciaCinta: null })!
    const r = resumir3D(cal, { imagenes: [IMG, IMG], distanciaPitido: 4.2, movido: [false, false], metodoSincronia: 'pitido' })
    const t = informe3D(cal, r, { estatura: H, distanciaPitido: 4.2, metodoSincronia: 'pitido' })
    expect(t).toMatch(/error de reproyección mediano: \d+,\d\d px/)
    expect(t).toMatch(/cadera izquierda: /)
    expect(t).toMatch(/ángulo entre los móviles .*: \d+,\d°/)
    expect(t).toMatch(/A: focal \d+ px \(campo \d+,\d°\), altura \d,\d\d m/)
  })

  it('nombres de los puntos con su género', () => {
    expect(nombrePunto(idPose('hombro', 'izq'))).toBe('hombro izquierdo')
    expect(nombrePunto(idPose('punta', 'der'), true)).toBe('la punta del pie derecha')
    expect(nombrePunto('trocanter')).toBe('trocanter')
  })
})
