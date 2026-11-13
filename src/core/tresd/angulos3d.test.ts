import { describe, expect, it } from 'vitest'
import { vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { ARTICULACIONES_3D, serieAngular3D } from './angulos3d'
import { calibrar3D } from './calibracion3d'
import { aplicar, camaraMirando, focalPrevia, proyectar, type Camara } from './camara'
import { correspondencias } from './correspondencias'
import { aLaboratorio, filtrar3D, marcoLaboratorio, triangularSesion, type Muestra3D, type Trayectorias3D } from './puntos3d'
import { estadoEn, puntosDe, type EstadoSintetico } from './sintetico'

const H = 1.75
const FPS = 30
const g = (r: number) => (r * 180) / Math.PI

/** Las trayectorias 3D de verdad de la persona sintética (sin pasar por las cámaras), de t0 a t1. */
function verdad(t0: number, t1: number): { tr: Trayectorias3D; estados: EstadoSintetico[] } {
  const tiempos: number[] = []
  for (let k = Math.round(t0 * FPS); k < Math.round(t1 * FPS); k++) tiempos.push(k / FPS)
  const series = new Map<IdMarcador, Muestra3D[]>()
  const estados = tiempos.map((t) => estadoEn(t, H))
  estados.forEach((e, i) => {
    for (const [n, X] of puntosDe(e, H)) {
      const id = `pose_${n}`
      if (!series.has(id)) series.set(id, [])
      series.get(id)![i] = { t: tiempos[i]!, x: X.x, y: X.y, z: X.z, calidad: 0.9, editadoManual: false, error: 0 }
    }
  })
  return { tr: { tiempos, series, enMetros: true }, estados }
}

const cerca = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} frente a ${b}`).toBeLessThan(tol)

// Cálculos de verdad con la persona sintética: en el runner de la CI, alguno pasa de los 5 s por defecto.
describe('ángulos 3D con la persona sintética (de verdad conocida)', { timeout: 30_000 }, () => {
  it('sagitales de las dos piernas y el tronco, en la sentadilla y en la marcha, mire hacia donde mire', () => {
    const { tr, estados } = verdad(0, 18)
    const s = (id: string) => serieAngular3D(id, tr)
    const rodD = s('3d_rodilla_sagital_der')
    const rodI = s('3d_rodilla_sagital_izq')
    const cadD = s('3d_cadera_sagital_der')
    const tobI = s('3d_tobillo_sagital_izq')
    const tronco = s('3d_tronco_sagital')
    for (let i = 0; i < estados.length; i += 7) {
      const e = estados[i]!
      cerca(rodD[i]!.valor, g(e.rodillaFlex.der), 0.01)
      cerca(rodI[i]!.valor, g(e.rodillaFlex.izq), 0.01)
      // La cadera es el muslo respecto al tronco (hombro → cadera): su flexión más la del tronco.
      cerca(cadD[i]!.valor, g(e.caderaFlex.der + e.troncoFlex), 0.01)
      // El pie, horizontal: la flexión dorsal es lo que la pierna se inclina hacia delante.
      cerca(tobI[i]!.valor, g(e.rodillaFlex.izq - e.caderaFlex.izq), 0.01)
      cerca(tronco[i]!.valor, g(e.troncoFlex), 0.01)
    }
  })

  it('frontales y transversales en cero con las piernas en su plano; la pelvis gira lo que gira la persona', () => {
    const { tr, estados } = verdad(0, 6)
    const lab = aLaboratorio(tr)
    for (const id of ['3d_rodilla_frontal_der', '3d_rodilla_frontal_izq', '3d_cadera_frontal_der', '3d_pelvis_frontal', '3d_tronco_frontal', '3d_tronco_transversal', '3d_pie_progresion_der', '3d_pie_progresion_izq']) {
      const serie = serieAngular3D(id, lab)
      for (let i = 0; i < serie.length; i += 11) cerca(serie[i]!.valor, 0, 0.01)
    }
    const pelvis = serieAngular3D('3d_pelvis_transversal', lab)
    for (let i = 0; i < estados.length; i += 9) cerca(pelvis[i]!.valor, g(estados[i]!.rumbo - estados[0]!.rumbo), 0.01)
  })

  it('una pelvis caída hacia la derecha, el tronco ladeado y el pie hacia fuera, con su signo', () => {
    const { tr } = verdad(12, 12.1)
    const mover = (id: string, f: (p: Muestra3D) => Muestra3D) => (tr.series as Map<IdMarcador, Muestra3D[]>).set(id, tr.series.get(id)!.map((p) => f(p!)))
    // Mira hacia +y: su derecha es +x. Cadera derecha 5 cm más baja: oblicuidad «cadera izquierda más alta» (+).
    const anchura = H * 0.191
    mover(idPose('cadera', 'der'), (p) => ({ ...p, z: p.z - 0.05 }))
    const obl = serieAngular3D('3d_pelvis_frontal', tr)[0]!.valor
    cerca(obl, g(Math.atan2(0.05, anchura)), 0.05)
    // La punta del pie derecho 10 cm hacia su derecha (+x): hacia fuera, +.
    mover(idPose('punta', 'der'), (p) => ({ ...p, x: p.x + 0.1 }))
    expect(serieAngular3D('3d_pie_progresion_der', tr)[0]!.valor).toBeGreaterThan(20)
    // Los hombros desplazados hacia la izquierda de la persona (−x): tronco inclinado a la izquierda (+).
    mover(idPose('hombro', 'der'), (p) => ({ ...p, x: p.x - 0.1 }))
    mover(idPose('hombro', 'izq'), (p) => ({ ...p, x: p.x - 0.1 }))
    expect(serieAngular3D('3d_tronco_frontal', tr)[0]!.valor).toBeGreaterThan(5)
  })

  it('el catálogo: las sagitales y frontales de las dos piernas, la pelvis, el tronco y los transversales, sin repetir', () => {
    const ids = ARTICULACIONES_3D.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['3d_rodilla_sagital_der', '3d_rodilla_sagital_izq', '3d_tronco_sagital', '3d_rodilla_frontal_izq', '3d_pelvis_frontal', '3d_pelvis_transversal', '3d_pie_progresion_izq']),
    )
    expect(ARTICULACIONES_3D.find((a) => a.id === '3d_rodilla_sagital_der')!.nombre).toBe('Rodilla derecha (flexo-extensión) en 3D')
  })
})

// Cálculos de verdad con la persona sintética: en el runner de la CI, alguno pasa de los 5 s por defecto.
describe('puntos 3D de la sesión: triangular, marco del laboratorio y filtro', { timeout: 30_000 }, () => {
  const IMG = { ancho: 1080, alto: 1920 }
  const f = focalPrevia(IMG.ancho, IMG.alto)
  const A = camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
  const B = camaraMirando(vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
  const tiempos = Array.from({ length: 540 }, (_, k) => k / FPS)
  const vista = (c: Camara) => {
    const series = new Map<IdMarcador, ({ t: number; x: number; y: number; calidad: number; editadoManual: boolean } | undefined)[]>()
    tiempos.forEach((t, k) => {
      for (const [n, X] of puntosDe(estadoEn(t, H), H)) {
        const id = `pose_${n}`
        if (!series.has(id)) series.set(id, [])
        const p = proyectar(c, X)
        series.get(id)![k] = { t, x: p.u, y: p.v, calidad: 0.9, editadoManual: false }
      }
    })
    return { series, tabla: crearTablaFrames(tiempos), desfase: 0, paso: 1 / FPS }
  }
  const [va, vb] = [vista(A), vista(B)]
  const ids = [...va.series.keys()]
  const cal = calibrar3D({
    vistas: ['a', 'b'],
    correspondencias: correspondencias(va, vb, ids, { tramo: { desde: 0, hasta: 6 } }),
    imagenes: [IMG, IMG],
    verticales: [aplicar(A.R, vec3(0, 0, -1)), aplicar(B.R, vec3(0, 0, -1))],
    tramo: { desde: 0, hasta: 6 },
    estatura: H,
    distanciaCinta: null,
    fecha: '2026-11-08T10:00:00.000Z',
    desfases: [0, 0],
  })!

  it('los ángulos de la sentadilla a través de las cámaras calibradas caen en la verdad', () => {
    const tr = filtrar3D(aLaboratorio(triangularSesion(cal, va, vb, ids, 1920)), FPS, { corteHz: 6 })
    expect(tr.enMetros).toBe(true)
    const rod = serieAngular3D('3d_rodilla_sagital_der', tr)
    const tronco = serieAngular3D('3d_tronco_sagital', tr)
    for (const t of [7, 7.5, 9, 10.5]) {
      const i = Math.round(t * FPS)
      const e = estadoEn(t, H)
      cerca(rod[i]!.valor, g(e.rodillaFlex.der), 1.5)
      cerca(tronco[i]!.valor, g(e.troncoFlex), 1.5)
    }
    // El marco del laboratorio: el suelo en z ≈ 0 y la pelvis al empezar sobre el origen.
    const talon = tr.series.get(idPose('talon', 'der'))!.find((p) => p && Number.isFinite(p.z))!
    cerca(talon.z, H * 0.039 * 0.2, 0.05)
    expect(marcoLaboratorio(tr.series)!.origen.x).toBeCloseTo(0, 4)
  })

  it('un punto que solo ve una cámara no se triangula (nunca se inventa)', () => {
    const sinB = { ...vb, series: new Map([...vb.series].map(([id, s]) => [id, id === idPose('rodilla', 'der') ? s.map(() => undefined) : s])) }
    const tr = triangularSesion(cal, va, sinB, ids, 1920)
    expect(tr.series.get(idPose('rodilla', 'der'))!.every((p) => p === undefined)).toBe(true)
    expect(serieAngular3D('3d_rodilla_sagital_der', tr).every((m) => Number.isNaN(m.valor))).toBe(true)
  })
})

describe('brazos y cabeza en 3D (fase 8) con posturas de verdad conocida', () => {
  const rad = (d: number) => (d * Math.PI) / 180
  type V = { x: number; y: number; z: number }
  /**
   * Un frame por postura: la persona mira hacia +x (su izquierda, +y), caderas a 1 m y hombros a 1,5 m, en el mismo y.
   * Brazo derecho: flexión `f` (hacia delante) o abducción `a` (hacia fuera, −y), y el antebrazo `codo` grados más allá en
   * el mismo plano; la cabeza adelantada `cs` y ladeada a la izquierda `cf`.
   */
  function posturas(lista: { f?: number; a?: number; codo?: number; cs?: number; cf?: number }[]): Trayectorias3D {
    const tiempos = lista.map((_, i) => i / FPS)
    const series = new Map<IdMarcador, Muestra3D[]>()
    const poner = (id: IdMarcador, i: number, p: V) => {
      if (!series.has(id)) series.set(id, [])
      series.get(id)![i] = { t: tiempos[i]!, ...p, calidad: 0.9, editadoManual: false, error: 0 }
    }
    lista.forEach((q, i) => {
      const hd = { x: 0, y: -0.2, z: 1.5 }
      const hi = { x: 0, y: 0.2, z: 1.5 }
      poner(idPose('cadera', 'der'), i, { x: 0, y: -0.2, z: 1 })
      poner(idPose('cadera', 'izq'), i, { x: 0, y: 0.2, z: 1 })
      poner(idPose('hombro', 'der'), i, hd)
      poner(idPose('hombro', 'izq'), i, hi)
      // Dirección del brazo: colgando (0, 0, −1) girado hacia delante (f) o hacia fuera (a).
      const dir = (g1: number): V => (q.a !== undefined ? { x: 0, y: -Math.sin(rad(g1)), z: -Math.cos(rad(g1)) } : { x: Math.sin(rad(g1)), y: 0, z: -Math.cos(rad(g1)) })
      const g0 = q.a ?? q.f ?? 0
      const brazo = dir(g0)
      const codo = { x: hd.x + 0.3 * brazo.x, y: hd.y + 0.3 * brazo.y, z: hd.z + 0.3 * brazo.z }
      const ante = dir(g0 + (q.codo ?? 0))
      poner(idPose('codo', 'der'), i, codo)
      poner(idPose('muneca', 'der'), i, { x: codo.x + 0.27 * ante.x, y: codo.y + 0.27 * ante.y, z: codo.z + 0.27 * ante.z })
      poner(idPose('oreja', 'der'), i, { x: hd.x + 0.25 * Math.sin(rad(q.cs ?? 0)), y: hd.y + 0.12, z: hd.z + 0.25 * Math.cos(rad(q.cs ?? 0)) })
      const b = rad(q.cf ?? 0)
      const c = { x: 0.03, y: 0, z: 1.75 }
      poner(idPose('oreja', 'izq'), i, { x: c.x, y: c.y + 0.08 * Math.cos(b), z: c.z - 0.08 * Math.sin(b) })
      // La oreja derecha de la cabeza ladeada (la de perfil va aparte: aquí se sobrescribe para lo de frente si se pide).
      if (q.cf !== undefined) poner(idPose('oreja', 'der'), i, { x: c.x, y: c.y - 0.08 * Math.cos(b), z: c.z + 0.08 * Math.sin(b) })
    })
    return { tiempos, series, enMetros: true }
  }

  it('codo: el ángulo real entre brazo y antebrazo, con el brazo hacia delante o separado', () => {
    const tr = posturas([{ f: 0, codo: 0 }, { f: 40, codo: 90 }, { a: 80, codo: 30 }, { a: 30, codo: 120 }])
    const s = serieAngular3D('3d_codo_der', tr).map((m) => m.valor)
    ;[0, 90, 30, 120].forEach((v, i) => cerca(s[i]!, v, 1e-6))
  })

  it('elevación del brazo: el ángulo real con el tronco de su lado, por delante o de lado', () => {
    const tr = posturas([{ f: 0 }, { f: 90 }, { a: 90 }, { a: 150 }, { f: 30, codo: 60 }])
    const s = serieAngular3D('3d_hombro_elevacion_der', tr).map((m) => m.valor)
    ;[0, 90, 90, 150, 30].forEach((v, i) => cerca(s[i]!, v, 1e-6))
  })

  it('hombro sagital y frontal en las vistas virtuales: flexión por delante y abducción de lado', () => {
    const tr = posturas([{ f: 60 }, { a: 45 }])
    cerca(serieAngular3D('3d_hombro_sagital_der', tr)[0]!.valor, 60, 1e-6)
    cerca(serieAngular3D('3d_hombro_frontal_der', tr)[1]!.valor, 45, 1e-6)
  })

  it('cabeza respecto al tronco (rotación, fase 10): las orejas giradas sobre la vertical respecto a los hombros', () => {
    // Orejas a ±8 cm del centro de la cabeza, giradas `g` grados a la izquierda (antihorario desde arriba); la persona
    // mira hacia +x, así que la línea izquierda → derecha de las orejas sin girar va hacia −y.
    const conCabeza = (g: number) => {
      const tr = posturas([{}])
      const s = new Map(tr.series)
      const r = rad(g)
      const c = { x: 0.03, y: 0, z: 1.72 }
      const oreja = (signo: 1 | -1): Muestra3D => ({ t: 0, x: c.x - signo * 0.08 * Math.sin(r), y: c.y + signo * 0.08 * Math.cos(r), z: c.z, calidad: 0.9, editadoManual: false, error: 0 })
      s.set(idPose('oreja', 'izq'), [oreja(1)])
      s.set(idPose('oreja', 'der'), [oreja(-1)])
      return { ...tr, series: s }
    }
    for (const g of [0, 30, -60, 85]) cerca(serieAngular3D('3d_cabeza_transversal', conCabeza(g))[0]!.valor, g, 1e-6)
  })

  it('cabeza: adelantada de perfil y ladeada de frente; codo de perfil solo entre segmentos', () => {
    cerca(serieAngular3D('3d_cabeza_sagital', posturas([{ cs: 20 }]))[0]!.valor, 20, 1e-6)
    cerca(serieAngular3D('3d_cabeza_frontal', posturas([{ cf: 12 }]))[0]!.valor, 12, 1e-6)
    const ids = ARTICULACIONES_3D.map((a) => a.id)
    expect(ids).not.toContain('3d_codo_sagital_der')
    expect(ids).not.toContain('3d_cabeza_sagital_izq')
    expect(ids.filter((id) => /codo|elevacion/.test(id))).toEqual(['3d_codo_der', '3d_hombro_elevacion_der', '3d_codo_izq', '3d_hombro_elevacion_izq'])
  })
})
