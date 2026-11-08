/*
 * Los puntos del cuerpo en 3D a lo largo de la toma (fase 6, paso 4; D6 y D7 de docs/plan-fase-6.md). Con la calibración
 * guardada, cada punto se triangula en cada frame de la vista A con la posición de B en ese instante común (interpolada
 * sin cruzar huecos: `posicionEn`); un punto que no ven las dos, o cuyo error de reproyección es muy alto, no tiene 3D
 * (nunca se inventa). Después se pasa al marco del laboratorio (z hacia arriba desde el suelo, x hacia delante de la persona
 * al empezar, origen bajo el punto medio de las caderas) y se filtra por tramos con el filtro de la sesión, coordenada a
 * coordenada, sin cruzar un hueco.
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import { filtrarTramo, SALTO_MAX_PASOS, tramosUtiles, type AjustesFiltro } from '../filtros/tramos'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { camaraDe, type Calibracion3D } from './calibracion3d'
import { posicionEn, type VistaParaEmparejar } from './correspondencias'
import { triangular } from './triangular'

/** Una muestra 3D: la de 2D (x, y en el suelo) más la altura z; en m (o en unidades de la calibración sin escala). */
export interface Muestra3D extends Muestra2D {
  readonly z: number
  /** Error de reproyección del punto en este instante (px). */
  readonly error: number
}

/** Error de reproyección de un punto (fracción del lado largo de la imagen) a partir del cual no se usa: 1 % ≈ 19 px a 1920. */
export const ERROR_PUNTO_MAX = 0.01

export interface Trayectorias3D {
  /** Tiempo común de cada frame de la vista A. */
  readonly tiempos: readonly number[]
  readonly series: ReadonlyMap<IdMarcador, readonly (Muestra3D | undefined)[]>
  /** Si las coordenadas están en metros (la calibración tiene escala). */
  readonly enMetros: boolean
}

const utilizable = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x) && Number.isFinite(m.y)

/**
 * Triangula los marcadores `ids` en cada frame de A, en el mundo de la calibración escalado a metros (si hay escala) y con
 * el suelo en z = 0 (si se conoce). La calidad es la peor de las dos vistas, o 0 (posición NaN) si el error de
 * reproyección pasa de `ERROR_PUNTO_MAX` del lado largo de la imagen.
 */
export function triangularSesion(cal: Calibracion3D, a: VistaParaEmparejar, b: VistaParaEmparejar, ids: readonly IdMarcador[], ladoLargo: number): Trayectorias3D {
  const [A, B] = [camaraDe(cal.camaras[0]), camaraDe(cal.camaras[1])]
  const k = cal.metrosPorUnidad ?? 1
  const suelo = cal.suelo ?? 0
  const tiempos = a.tabla.tiempos.map((t) => t + a.desfase)
  const series = new Map<IdMarcador, (Muestra3D | undefined)[]>()
  const errorMax = ERROR_PUNTO_MAX * ladoLargo
  for (const id of ids) {
    const sa = a.series.get(id)
    const sb = b.series.get(id)
    const r: (Muestra3D | undefined)[] = new Array(tiempos.length)
    if (sa && sb) {
      tiempos.forEach((tc, i) => {
        const ma = sa[i]
        if (!utilizable(ma)) return
        const pb = posicionEn(sb, b.tabla, b.paso, tc - b.desfase)
        if (!pb) return
        const p = triangular([
          { camara: A, u: ma.x, v: ma.y },
          { camara: B, u: pb.x, v: pb.y },
        ])
        const bueno = Number.isFinite(p.error) && p.error <= errorMax
        r[i] = {
          t: tc,
          x: bueno ? p.X.x * k : NaN,
          y: bueno ? p.X.y * k : NaN,
          z: bueno ? (p.X.z - suelo) * k : NaN,
          calidad: bueno ? Math.min(ma.calidad, pb.calidad) : 0,
          editadoManual: ma.editadoManual,
          error: p.error,
        }
      })
    }
    series.set(id, r)
  }
  return { tiempos, series, enMetros: cal.metrosPorUnidad !== null }
}

const valida = (m: Muestra3D | undefined): m is Muestra3D => utilizable(m) && Number.isFinite(m.z)

/**
 * El marco del laboratorio: el giro alrededor de la vertical y el origen que dejan, en el primer instante con las dos
 * caderas, el punto medio de las caderas sobre el origen (en el suelo) y la persona mirando hacia +x (la izquierda de la
 * persona hacia +y). null sin ese instante.
 */
export function marcoLaboratorio(series: Trayectorias3D['series']): { readonly origen: Vec3; readonly rumbo: number } | null {
  const izq = series.get(idPose('cadera', 'izq')) ?? []
  const der = series.get(idPose('cadera', 'der')) ?? []
  for (let i = 0; i < Math.max(izq.length, der.length); i++) {
    const a = izq[i]
    const b = der[i]
    if (!valida(a) || !valida(b)) continue
    // Hacia la derecha de la persona: de la cadera izquierda a la derecha, en horizontal. Delante = z × derecha.
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.hypot(dx, dy) < 1e-9) continue
    const delante = { x: -dy, y: dx }
    return { origen: vec3((a.x + b.x) / 2, (a.y + b.y) / 2, 0), rumbo: Math.atan2(delante.y, delante.x) }
  }
  return null
}

/** Pasa las trayectorias al marco del laboratorio (sin él, tal cual). */
export function aLaboratorio(tr: Trayectorias3D): Trayectorias3D {
  const m = marcoLaboratorio(tr.series)
  if (!m) return tr
  const c = Math.cos(-m.rumbo)
  const s = Math.sin(-m.rumbo)
  const series = new Map<IdMarcador, (Muestra3D | undefined)[]>()
  for (const [id, serie] of tr.series) {
    series.set(
      id,
      serie.map((p) => {
        if (!p) return p
        const x = p.x - m.origen.x
        const y = p.y - m.origen.y
        return { ...p, x: c * x - s * y, y: s * x + c * y }
      }),
    )
  }
  return { ...tr, series }
}

/**
 * Filtra cada trayectoria 3D por tramos (los de 2D: frames seguidos utilizables, cortados en un salto en el tiempo), las
 * tres coordenadas con el mismo Butterworth de fase cero de la sesión. `fs`: los fps medianos de la vista A.
 */
export function filtrar3D(tr: Trayectorias3D, fs: number, ajustes: AjustesFiltro): Trayectorias3D {
  const series = new Map<IdMarcador, (Muestra3D | undefined)[]>()
  for (const [id, serie] of tr.series) {
    const r: (Muestra3D | undefined)[] = new Array(serie.length)
    const limpia = serie.map((m) => (valida(m) ? m : undefined))
    for (const tramo of tramosUtiles(limpia, SALTO_MAX_PASOS / fs)) {
      const ms: Muestra3D[] = []
      for (let i = tramo.primero; i <= tramo.ultimo; i++) ms.push(limpia[i]!)
      const [xs, ys, zs] = filtrarTramo(
        ms.map((m) => m.t),
        [ms.map((m) => m.x), ms.map((m) => m.y), ms.map((m) => m.z)],
        fs,
        ajustes.corteHz,
      )
      ms.forEach((m, k) => {
        r[tramo.primero + k] = { ...m, x: xs![k]!, y: ys![k]!, z: zs![k]! }
      })
    }
    series.set(id, r)
  }
  return { ...tr, series }
}
