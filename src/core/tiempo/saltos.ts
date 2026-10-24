import type { TablaFrames } from './tablaFrames'

/*
 * Saltos de una grabación (fase 4, paso 1): un móvil que no da abasto al grabar se salta frames, y en la tabla de pts
 * se ve como un paso mucho mayor que el típico. Sirve para medir una grabación de prueba, no para el análisis (que
 * trabaja con los pts tal cual: fps variable no es un problema).
 */

/** Un paso entre frames es un salto si pasa de esta fracción del paso mediano. */
export const FACTOR_SALTO = 1.5

export interface Saltos {
  /** Paso mediano entre frames (s); NaN con menos de 2 frames. */
  readonly pasoMediano: number
  /** Pasos entre frames consecutivos mayores que FACTOR_SALTO · pasoMediano. */
  readonly saltos: number
  /** Frames que faltan en esos saltos: round(paso / mediano) − 1 por cada uno. */
  readonly framesPerdidos: number
  /** Mayor paso entre dos frames (s); NaN con menos de 2 frames. */
  readonly pasoMax: number
}

export function saltosDeFrames(tabla: TablaFrames): Saltos {
  const ts = tabla.tiempos
  if (ts.length < 2) return { pasoMediano: NaN, saltos: 0, framesPerdidos: 0, pasoMax: NaN }
  const pasos: number[] = []
  for (let i = 1; i < ts.length; i++) pasos.push(ts[i]! - ts[i - 1]!)
  const orden = [...pasos].sort((a, b) => a - b)
  const m = orden.length >> 1
  const pasoMediano = orden.length % 2 ? orden[m]! : (orden[m - 1]! + orden[m]!) / 2
  let saltos = 0
  let framesPerdidos = 0
  for (const p of pasos) {
    if (p > FACTOR_SALTO * pasoMediano) {
      saltos++
      framesPerdidos += Math.round(p / pasoMediano) - 1
    }
  }
  return { pasoMediano, saltos, framesPerdidos, pasoMax: orden[orden.length - 1]! }
}
