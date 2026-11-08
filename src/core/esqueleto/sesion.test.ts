import { describe, expect, it } from 'vitest'
import { vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { calibrar3D } from '../tresd/calibracion3d'
import { aplicar, camaraMirando, focalPrevia, proyectar, type Camara } from '../tresd/camara'
import { correspondencias, type VistaParaEmparejar } from '../tresd/correspondencias'
import { aLaboratorio, filtrar3D, triangularSesion } from '../tresd/puntos3d'
import { generadorRuido } from '../tresd/sintetico'
import { indiceGrado, puntosDePostura } from './modelo'
import { ajustarSesion, ARTICULACIONES_ESQUELETO, serieEsqueleto } from './sesion'
import { medidasDe, posturaEn } from './sintetico'

const H = 1.75
const M = medidasDe(H)
const FPS = 30
const IMG = { ancho: 1080, alto: 1920 }
const f = focalPrevia(IMG.ancho, IMG.alto)
const A = camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
const B = camaraMirando(vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), vec3(0, 0, 1), f, IMG.ancho, IMG.alto)
const tiempos = Array.from({ length: 330 }, (_, k) => k / FPS) // 0–11 s: pasos y sentadillas
const ruido = generadorRuido(11)
const vista = (c: Camara, px: number): VistaParaEmparejar => {
  const series = new Map<IdMarcador, (Muestra2D | undefined)[]>()
  tiempos.forEach((t, k) => {
    for (const [id, X] of puntosDePostura(posturaEn(t, H), M)) {
      if (!series.has(id)) series.set(id, [])
      const p = proyectar(c, X)
      series.get(id)![k] = { t, x: p.u + ruido() * px, y: p.v + ruido() * px, calidad: 0.9, editadoManual: false }
    }
  })
  return { series, tabla: crearTablaFrames(tiempos), desfase: 0, paso: 1 / FPS }
}
const deg = (r: number) => (r * 180) / Math.PI

describe('el esqueleto en toda la toma', () => {
  it('calibrado con la persona, ajustado y filtrado: las rodillas, las caderas (también su rotación con la rodilla doblada) y el tronco', { timeout: 60000 }, () => {
    const [va, vb] = [vista(A, 1.5), vista(B, 1.5)]
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
    const tr = filtrar3D(aLaboratorio(triangularSesion(cal, va, vb, ids, 1920)), FPS, { corteHz: 6 })
    let llamadas = 0
    const r = ajustarSesion(cal, va, vb, tr, ids, () => (llamadas++, true))!
    expect(llamadas).toBeGreaterThan(5)
    // Las medidas, cerca de las de verdad (con la escala por la estatura).
    expect(Math.abs(r.medidas.muslo / M.muslo - 1)).toBeLessThan(0.06)
    expect(r.posturas.every((q) => q !== null)).toBe(true)
    const comprobar = (id: string, tol: number, donde: (k: number) => boolean = () => true) => {
      const a = ARTICULACIONES_ESQUELETO.find((x) => x.id === id)!
      const s = serieEsqueleto(a, r, FPS, { corteHz: 6 })
      const errores = tiempos.flatMap((t, k) => (donde(k) && k > 5 && k < tiempos.length - 5 ? [s[k]!.valor - deg(posturaEn(t, H)[indiceGrado(a.grado)]!)] : []))
      const rms = Math.sqrt(errores.reduce((x, e) => x + e * e, 0) / errores.length)
      expect(rms, `${id}: ${rms.toFixed(2)}°`).toBeLessThan(tol)
      return s
    }
    comprobar('esq_rodilla_der', 2.5)
    comprobar('esq_rodilla_izq', 2.5)
    comprobar('esq_cadera_flex_der', 2.5)
    comprobar('esq_tronco_flex', 3)
    // En la sentadilla (6–11 s) con la rodilla por encima de 35°: la rotación interna de cadera.
    const doblada = (k: number) => tiempos[k]! > 6 && posturaEn(tiempos[k]!, H)[indiceGrado('rodillaDer')]! > (35 * Math.PI) / 180
    const rot = comprobar('esq_cadera_rot_der', 4, doblada)
    // Con la rodilla recta, la rotación se marca como poco fiable.
    const recta = tiempos.findIndex((t) => t > 6 && posturaEn(t, H)[indiceGrado('rodillaDer')]! < (10 * Math.PI) / 180)
    expect(rot[recta]!.fiable).toBe(false)
  })
})
