import { desenrollar } from '../geometria/angulo'
import type { MuestraAngulo } from './calculo'

/*
 * Cero de referencia (paso 5 de la fase 2, decisión D3). Los gomets no caen
 * exactamente sobre los ejes articulares, así que de pie el ángulo no sale 0
 * (−4,7° en la prueba de la fase 1). Toma estática: la persona elige un tramo
 * quieto, se calcula el ángulo medio filtrado en él y se resta.
 *
 * Se guarda el tramo, no la media: si cambia el corte del filtro o se corrige
 * un marcador, la media se recalcula. Siempre se muestran los dos valores, el
 * ángulo sin cero y el relativo al estático.
 */

/** Tramo estático, en segundos de vídeo (desde < hasta). */
export interface TramoEstatico {
  readonly desde: number
  readonly hasta: number
}

export function esTramoEstatico(v: unknown): v is TramoEstatico {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const { desde, hasta } = v as Record<string, unknown>
  return (
    typeof desde === 'number' && typeof hasta === 'number' && Number.isFinite(desde) && Number.isFinite(hasta) &&
    desde < hasta && Object.keys(v).length === 2
  )
}

export interface CeroReferencia {
  readonly tramo: TramoEstatico
  /** Ángulo medio en el tramo (°), en la misma vuelta que la serie de la que sale. */
  readonly media: number
  /** Desviación típica en el tramo (°): cuánto se movió durante la toma estática. */
  readonly desviacion: number
  /** Frames con ángulo dentro del tramo. */
  readonly muestras: number
}

/**
 * Media del ángulo en el tramo (extremos incluidos), con los frames que
 * tienen valor. null si no hay ninguno. Los valores se desenrollan antes de
 * promediar, para que una postura cerca de ±180° no dé una media absurda.
 */
export function ceroDeReferencia(serie: readonly MuestraAngulo[], tramo: TramoEstatico): CeroReferencia | null {
  const valores = desenrollar(serie.filter((m) => m.t >= tramo.desde && m.t <= tramo.hasta && Number.isFinite(m.valor)).map((m) => m.valor))
  if (valores.length === 0) return null
  const media = valores.reduce((s, v) => s + v, 0) / valores.length
  const desviacion = Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length)
  return { tramo, media, desviacion, muestras: valores.length }
}

/**
 * Ángulo relativo al cero de referencia. NaN si no hay ángulo. `valor` sale de
 * la misma serie continua que el cero, así que la resta es directa: un
 * movimiento que se aleja más de 180° del cero (un hombro) no da la vuelta.
 */
export function relativoAlCero(valor: number, cero: CeroReferencia): number {
  return Number.isFinite(valor) ? valor - cero.media : NaN
}

/**
 * Tramo de los primeros `segundos` del vídeo (la toma estática habitual: de
 * pie antes de empezar), sin pasar del último frame. null si el vídeo tiene
 * un solo instante.
 */
export function tramoInicial(tiempos: ArrayLike<number>, segundos = 2): TramoEstatico | null {
  const t0 = tiempos[0]
  const tn = tiempos[tiempos.length - 1]
  if (t0 === undefined || tn === undefined || !(tn > t0)) return null
  return { desde: t0, hasta: Math.min(tn, t0 + segundos) }
}

/** Medio ancho del tramo corto del cero (s): 0,4 s en total, unos 12 frames a 30 fps, cabe en el valle entre dos repeticiones. */
export const SEMI_TRAMO_CORTO_S = 0.2

/**
 * Tramo corto centrado en `t` (± `semi` s): para poner el cero de un toque en una pausa breve (de pie entre dos
 * sentadillas). Junto a un extremo del vídeo se desplaza hacia dentro para conservar el ancho, sin pasar de `t0` ni de
 * `tn`. null si el vídeo tiene un solo instante.
 */
export function tramoAlrededor(t: number, t0: number, tn: number, semi = SEMI_TRAMO_CORTO_S): TramoEstatico | null {
  if (!(tn > t0) || !Number.isFinite(t)) return null
  const ancho = Math.min(2 * semi, tn - t0)
  const desde = Math.min(Math.max(t0, t - semi), tn - ancho)
  return { desde, hasta: desde + ancho }
}
