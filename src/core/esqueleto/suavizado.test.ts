import { describe, expect, it } from 'vitest'
import { vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { calibrar3D } from '../tresd/calibracion3d'
import { aplicar, camaraMirando, focalPrevia, proyectar, type Camara } from '../tresd/camara'
import { correspondencias, type VistaParaEmparejar } from '../tresd/correspondencias'
import { aLaboratorio, filtrar3D, triangularSesion } from '../tresd/puntos3d'
import { generadorRuido } from '../tresd/sintetico'
import { cineticaDeLaToma } from '../cinetica/dinamica'
import { indiceGrado, N_GRADOS, puntosDePostura } from './modelo'
import { ajustarSesion } from './sesion'
import { medidasDe, posturaEn } from './sintetico'
import { suavizarPosturas } from './suavizado'

const H = 1.75
const FPS = 30
/** Información isótropa: cada grado de libertad visto con ruido σ (en sus unidades). */
const isotropa = (sigma: number) => {
  const I = new Float64Array(N_GRADOS * N_GRADOS)
  for (let k = 0; k < N_GRADOS; k++) I[k * N_GRADOS + k] = 1 / (sigma * sigma)
  return I
}
const ecm = (a: readonly number[], b: readonly number[]) => Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]!) ** 2, 0) / a.length)

describe('suavizado de toda la toma (fase 11, D12)', () => {
  it('un movimiento a velocidad constante se queda exacto, también a través de las ventanas (600 frames, ventanas de 600)', () => {
    const tiempos = Array.from({ length: 600 }, (_, k) => k / FPS)
    const verdad = tiempos.map((t) => Array.from({ length: N_GRADOS }, (_, i) => 0.1 * i + (0.02 + 0.01 * i) * t))
    const s = suavizarPosturas({ tiempos, posturas: verdad, informacion: tiempos.map(() => isotropa(0.05)), errores: tiempos.map(() => 1), fs: FPS, unidad: 1, ventana: 200 })
    for (const k of [0, 239, 240, 241, 479, 480, 599]) for (let i = 0; i < N_GRADOS; i++) expect(s[k]![i]).toBeCloseTo(verdad[k]![i]!, 6)
  })

  it('por ventanas casi igual que de una vez, también lo que apenas se ve (sin escalón en la costura)', () => {
    const n = 2700
    const tiempos = Array.from({ length: n }, (_, k) => k / FPS)
    const rnd = generadorRuido(11)
    const posturas = tiempos.map((t) => Array.from({ length: N_GRADOS }, (_, g) => Math.sin(1.3 * t + g) + 0.05 * rnd()))
    // Un grado de libertad que apenas se ve (σ = 1 rad en cada frame): lo dictan vecinos lejanos.
    const info = tiempos.map(() => {
      const I = isotropa(0.05)
      I[5 * N_GRADOS + 5] = 1
      return I
    })
    const base = { tiempos, posturas, informacion: info, errores: tiempos.map(() => 1), fs: FPS, unidad: 1 }
    const entera = suavizarPosturas({ ...base, ventana: 100_000 })
    const troceada = suavizarPosturas(base)
    let peor = 0
    for (let k = 0; k < n; k++) for (let g = 0; g < N_GRADOS; g++) peor = Math.max(peor, Math.abs(entera[k]![g]! - troceada[k]![g]!))
    expect(peor).toBeLessThan(2e-3) // 0,1°
  })

  it('las sentadillas con ruido de 2°: más cerca de la verdad que sin suavizar; lo que no se ve lo ponen sus vecinos', () => {
    const tiempos = Array.from({ length: 180 }, (_, k) => 6 + k / FPS)
    const verdad = tiempos.map((t) => posturaEn(t, H))
    const rnd = generadorRuido(5)
    const sigma = (2 * Math.PI) / 180
    const ruidosas = verdad.map((q) => q.map((v, i) => (i < 3 ? v : v + sigma * rnd())))
    // La rotación de la cadera derecha no se ve entre los frames 60 y 75 (medio segundo): su información es nula y su valor, basura.
    const iRot = indiceGrado('caderaRotDer')
    const info = tiempos.map((_, k) => {
      const I = isotropa(sigma)
      if (k >= 60 && k < 75) I[iRot * N_GRADOS + iRot] = 0
      return I
    })
    ruidosas.forEach((q, k) => k >= 60 && k < 75 && (q[iRot] = 1))
    const s = suavizarPosturas({ tiempos, posturas: ruidosas, informacion: info, errores: tiempos.map(() => 1), fs: FPS, unidad: 1 })
    const i = indiceGrado('rodillaDer')
    const col = (qs: readonly (readonly number[] | null)[], j: number) => qs.map((q) => q![j]!)
    expect(ecm(col(s, i), col(verdad, i))).toBeLessThan(0.5 * ecm(col(ruidosas, i), col(verdad, i)))
    // Lo no visto: a menos de 3° de la verdad (no se queda en el valor basura de 57°).
    for (let k = 60; k < 75; k++) expect(Math.abs(s[k]![iRot]! - verdad[k]![iRot]!)).toBeLessThan((3 * Math.PI) / 180)
  })

  it('nunca a través de un hueco: lo que falta sigue faltando y un salto se conserva', () => {
    const tiempos = Array.from({ length: 60 }, (_, k) => k / FPS)
    const posturas = tiempos.map((_, k) => (k === 30 ? null : new Array<number>(N_GRADOS).fill(k < 30 ? 0 : 1)))
    const s = suavizarPosturas({ tiempos, posturas, informacion: tiempos.map(() => isotropa(0.05)), errores: tiempos.map(() => 1), fs: FPS, unidad: 1 })
    expect(s[30]).toBeNull()
    expect(s[29]![5]).toBeCloseTo(0, 9)
    expect(s[31]![5]).toBeCloseTo(1, 9)
  })
})

describe('suavizado en la cadena completa: la cinética dinámica (D12)', { timeout: 300_000 }, () => {
  it('con 6 px de ruido en las dos cámaras, la fuerza vertical a 4 Hz a menos del 3 % del peso (sin suavizar, más del 5 %)', { timeout: 300_000 }, () => {
    const M = medidasDe(H)
    const IMG = { ancho: 1080, alto: 1920 }
    const f = focalPrevia(IMG.ancho, IMG.alto)
    const A = camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
    const B = camaraMirando(vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
    const tiempos = Array.from({ length: 330 }, (_, k) => k / FPS)
    const ruido = generadorRuido(11)
    const vista = (c: Camara): VistaParaEmparejar => {
      const series = new Map<IdMarcador, (Muestra2D | undefined)[]>()
      tiempos.forEach((t, k) => {
        for (const [id, X] of puntosDePostura(posturaEn(t, H), M)) {
          if (!series.has(id)) series.set(id, [])
          const p = proyectar(c, X)
          series.get(id)![k] = { t, x: p.u + ruido() * 6, y: p.v + ruido() * 6, calidad: 0.9, editadoManual: false }
        }
      })
      return { series, tabla: crearTablaFrames(tiempos), desfase: 0, paso: 1 / FPS }
    }
    const [va, vb] = [vista(A), vista(B)]
    const ids = [...va.series.keys()]
    const cal = calibrar3D({ vistas: ['a', 'b'], correspondencias: correspondencias(va, vb, ids, { tramo: { desde: 0, hasta: 6 } }), imagenes: [IMG, IMG], verticales: [aplicar(A.R, vec3(0, 0, -1)), aplicar(B.R, vec3(0, 0, -1))], tramo: { desde: 0, hasta: 6 }, estatura: H, distanciaCinta: null, fecha: '2026-11-14T10:00:00.000Z', desfases: [0, 0] })!
    const tr = filtrar3D(aLaboratorio(triangularSesion(cal, va, vb, ids, 1920)), FPS, { corteHz: 6 })
    const r = ajustarSesion(cal, va, vb, tr, ids)!
    expect(r.suavizadas).toHaveLength(tiempos.length)
    const verdad = cineticaDeLaToma({ tiempos, posturas: tiempos.map((t) => posturaEn(t, H)), medidas: M, metrosPorUnidad: 1, suelo: 0, fs: FPS, corteHz: 6 })
    const fz = (posturas: readonly (readonly number[] | null)[]) => cineticaDeLaToma({ tiempos, posturas, medidas: r.medidas, metrosPorUnidad: 1, suelo: null, fs: FPS, corteHz: 4 }).fuerza.map((x) => x.z)
    // En las sentadillas (6–11 s).
    const error = (v: number[]) => {
      const vz = verdad.fuerza.map((x) => x.z)
      const ks = tiempos.flatMap((t, k) => (t > 6.3 && t < 10.7 && Number.isFinite(v[k]!) && Number.isFinite(vz[k]!) ? [k] : []))
      return Math.sqrt(ks.reduce((s, k) => s + (v[k]! - vz[k]!) ** 2, 0) / ks.length)
    }
    const suave = error(fz(r.suavizadas!))
    const crudo = error(fz(r.posturas))
    expect(suave, `suavizado ${suave.toFixed(2)} N/kg`).toBeLessThan(0.03 * 9.81)
    expect(crudo, `sin suavizar ${crudo.toFixed(2)} N/kg`).toBeGreaterThan(0.05 * 9.81)
  })
})
