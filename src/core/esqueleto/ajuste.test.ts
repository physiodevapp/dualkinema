import { describe, expect, it } from 'vitest'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { camaraMirando, focalPrevia, proyectar } from '../tresd/camara'
import { generadorRuido } from '../tresd/sintetico'
import { ajustarFrame, arranqueDe, medidasDeLaToma, type Observaciones } from './ajuste'
import { indiceGrado, puntosDePostura, type Grado } from './modelo'
import { medidasDe, posturaEn } from './sintetico'

const H = 1.75
const M = medidasDe(H)
const IMG = { ancho: 1080, alto: 1920 }
const f = focalPrevia(IMG.ancho, IMG.alto)
const camaras = [
  camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), vec3(0, 0, 1), f, IMG.ancho, IMG.alto),
  camaraMirando(vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), vec3(0, 0, 1), f, IMG.ancho, IMG.alto),
]
const g = (r: number) => (r * 180) / Math.PI

/** Lo que vería cada cámara de una postura, con ruido (px) y, si se pide, un punto que una cámara no ve. */
function observar(q: readonly number[], ruido: () => number, px: number, ocultos: readonly [number, IdMarcador][] = []): Observaciones[] {
  const puntos = puntosDePostura(q, M)
  return camaras.map((c, k) => {
    const o = new Map<IdMarcador, { u: number; v: number; calidad: number }>()
    for (const [id, X] of puntos) {
      if (ocultos.some(([kk, ii]) => kk === k && ii === id)) continue
      const p = proyectar(c, X)
      o.set(id, { u: p.u + ruido() * px, v: p.v + ruido() * px, calidad: 0.9 })
    }
    return o
  })
}

/** Ajusta una secuencia de frames y devuelve las posturas. */
function secuencia(t0: number, t1: number, px: number, ocultos: readonly [number, IdMarcador][] = []) {
  const ruido = generadorRuido(3)
  let anterior: number[] | null = null as number[] | null
  const r: { t: number; q: number[]; verdad: number[]; error: number; rot: Record<'der' | 'izq', boolean> }[] = []
  for (let k = Math.round(t0 * 30); k < Math.round(t1 * 30); k++) {
    const t = k / 30
    const verdad = posturaEn(t, H)
    const puntos = puntosDePostura(verdad, M)
    const arranque = arranqueDe(new Map(puntos))!
    const a = ajustarFrame({ camaras, aMundo: (p) => p, medidas: M, observaciones: observar(verdad, ruido, px, ocultos), anterior, arranque, unidad: 1 })!
    anterior = a.q
    r.push({ t, q: a.q, verdad, error: a.error, rot: { ...a.rotacionVisible } })
  }
  return r
}

const dif = (a: readonly number[], b: readonly number[], gr: Grado) => Math.abs(g(a[indiceGrado(gr)]! - b[indiceGrado(gr)]!))

describe('medidas de la persona a partir de la toma', () => {
  it('las longitudes, el pie y los anchos de verdad salen de los puntos 3D de unos frames', () => {
    const frames = [0.5, 2, 4, 7, 9, 14].map((t) => new Map<IdMarcador, Vec3 | undefined>(puntosDePostura(posturaEn(t, H), M)))
    const r = medidasDeLaToma(frames)!
    for (const k of ['anchoCaderas', 'muslo', 'pierna', 'tronco', 'anchoHombros'] as const) expect(r.medidas[k]).toBeCloseTo(M[k], 9)
    expect(r.medidas.talon.x).toBeCloseTo(M.talon.x, 9)
    expect(r.medidas.punta.z).toBeCloseTo(M.punta.z, 9)
    expect(r.asimetria.muslo).toBeCloseTo(0, 9)
  })

  it('sin puntos no hay medidas', () => {
    expect(medidasDeLaToma([new Map()])).toBeNull()
  })
})

// Cálculos de verdad con la persona sintética: en el runner de la CI, alguno pasa de los 5 s por defecto.
describe('cinemática inversa sobre las dos vistas', { timeout: 30_000 }, () => {
  it('sin ruido: la postura de verdad, también la rotación de cadera con la rodilla doblada', () => {
    const r = secuencia(6, 9, 0)
    for (const x of r.filter((_, i) => i % 10 === 0)) {
      // La rotación de cadera con la rodilla recta queda sujeta a la anterior (D4): un error pequeño, no cero.
      expect(x.error).toBeLessThan(0.5)
      for (const gr of ['caderaFlexDer', 'rodillaIzq', 'troncoFlex', 'troncoLateral', 'pelvisOblicuidad'] as const) expect(dif(x.q, x.verdad, gr)).toBeLessThan(0.2)
      if (x.rot.der) expect(dif(x.q, x.verdad, 'caderaRotDer')).toBeLessThan(0.5)
    }
  })

  it('con 2 px de ruido en los pasos por la zona y la sentadilla (frame a frame, sin filtrar): sagitales y rotación de cadera cerca', () => {
    const r = secuencia(0, 10, 2)
    const rms = (gr: Grado, cuales = r) => Math.sqrt(cuales.reduce((s2, x) => s2 + dif(x.q, x.verdad, gr) ** 2, 0) / cuales.length)
    const max = (gr: Grado) => Math.max(...r.map((x) => dif(x.q, x.verdad, gr)))
    for (const gr of ['caderaFlexDer', 'caderaFlexIzq', 'rodillaDer', 'rodillaIzq', 'troncoFlex', 'pelvisOblicuidad', 'troncoLateral'] as const) {
      expect(rms(gr), gr).toBeLessThan(1.6)
      expect(max(gr), gr).toBeLessThan(5)
    }
    // La rotación de cadera, donde la rodilla está bien doblada (más de 35°).
    for (const [gr, rod] of [['caderaRotDer', 'rodillaDer'], ['caderaRotIzq', 'rodillaIzq']] as const) {
      const dobladas = r.filter((x) => x.verdad[indiceGrado(rod)]! > (35 * Math.PI) / 180)
      expect(dobladas.length).toBeGreaterThan(30)
      expect(rms(gr, dobladas), gr).toBeLessThan(3)
    }
  })

  it('un punto que solo ve una cámara también cuenta: la rodilla derecha oculta en B sigue saliendo', () => {
    const r = secuencia(7, 8, 1, [[1, idPose('rodilla', 'der')]])
    for (const x of r) expect(dif(x.q, x.verdad, 'rodillaDer')).toBeLessThan(2)
  })
})
