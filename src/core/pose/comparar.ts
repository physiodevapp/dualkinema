/*
 * Comparar dos medidas del mismo ángulo frame a frame (fase 5, paso 1: los gomets frente al modelo sin marcadores).
 *
 * Los puntos no son los mismos (gomets sobre referencias óseas; el modelo, centros articulares aproximados), así que
 * se espera una diferencia más o menos constante. Por eso se da por separado: la diferencia media (el sesgo) y lo que
 * queda al quitarla (la dispersión y el error cuadrático medio sin sesgo), además de los rangos y la correlación. Solo
 * cuentan los frames con valor en las dos.
 */
import { serieAngular } from '../articulaciones/calculo'
import type { DefinicionArticulacion } from '../articulaciones/definicion'
import { comoMuestras, filtrarTrayectoria, type AjustesFiltro } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import { seriePorFrame } from '../graficas/series'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { fpsMediano, type TablaFrames } from '../tiempo/tablaFrames'

export interface Rango {
  readonly min: number
  readonly max: number
}

export interface Comparacion {
  /** Frames con valor en las dos. */
  readonly n: number
  /** Media de b − a. */
  readonly media: number
  /** Desviación típica de b − a (muestral). */
  readonly de: number
  /** Raíz del error cuadrático medio de b − a. */
  readonly ecm: number
  /** Raíz del error cuadrático medio de b − a una vez quitada su media. */
  readonly ecmSinSesgo: number
  /** Rango de cada una en esos frames. */
  readonly rangoA: Rango
  readonly rangoB: Rango
  /** Correlación de Pearson (NaN si alguna no varía). */
  readonly correlacion: number
}

/** Compara b con a en los frames donde las dos tienen valor (NaN = sin valor). null si hay menos de 2. */
export function compararSeries(a: ArrayLike<number>, b: ArrayLike<number>): Comparacion | null {
  const xs: number[] = []
  const ys: number[] = []
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]!
    const y = b[i]!
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x)
      ys.push(y)
    }
  }
  const k = xs.length
  if (k < 2) return null
  const media = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const d = ys.map((y, i) => y - xs[i]!)
  const md = media(d)
  const sumaDesv = d.reduce((s, x) => s + (x - md) ** 2, 0)
  const mx = media(xs)
  const my = media(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < k; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my)
    sxx += (xs[i]! - mx) ** 2
    syy += (ys[i]! - my) ** 2
  }
  return {
    n: k,
    media: md,
    de: Math.sqrt(sumaDesv / (k - 1)),
    ecm: Math.sqrt(d.reduce((s, x) => s + x * x, 0) / k),
    ecmSinSesgo: Math.sqrt(sumaDesv / k),
    rangoA: { min: Math.min(...xs), max: Math.max(...xs) },
    rangoB: { min: Math.min(...ys), max: Math.max(...ys) },
    correlacion: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN,
  }
}

/**
 * El ángulo filtrado de una articulación, un valor por frame (NaN = sin valor), con el mismo camino que el visor
 * (`useFiltrado`): cada marcador filtrado por tramos con el corte de la sesión y el ángulo calculado con lo filtrado.
 */
export function anguloFiltradoPorFrame(
  trayectorias: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>,
  articulacion: DefinicionArticulacion,
  orientacion: OrientacionVista,
  tabla: TablaFrames,
  ajustes: AjustesFiltro,
): Float64Array {
  const fs = fpsMediano(tabla)
  const ids = [...new Set([articulacion.proximal.desde, articulacion.proximal.hasta, articulacion.distal.desde, articulacion.distal.hasta])]
  if (!Number.isFinite(fs) || orientacion.plano !== articulacion.plano) return new Float64Array(tabla.tiempos.length).fill(NaN)
  const filtradas = Object.fromEntries(ids.map((id) => [id, comoMuestras(filtrarTrayectoria(trayectorias.get(id) ?? [], fs, ajustes))]))
  return seriePorFrame(serieAngular(articulacion, filtradas, orientacion), tabla.tiempos).valores
}
