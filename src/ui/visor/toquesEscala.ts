import { distanciaPx, type Punto2D } from '../../core/calibracion/escala'

/*
 * Toques en el vídeo al calibrar la escala con dos extremos (pendiente F de
 * la revisión de la fase 2). Los dos extremos tienen que ser del mismo frame:
 * si el objeto se mueve (o la cámara), uno en cada frame da una longitud en
 * px que no corresponde a ningún momento. Por eso un toque en otro frame
 * empieza de nuevo (queda como primer extremo) en vez de completar el par.
 */

/** Lo que el toque cambia del borrador de la escala. */
export interface ExtremosEscala {
  readonly a: Punto2D | null
  readonly b: Punto2D | null
  /** Instante (s de vídeo) del frame de los extremos. */
  readonly t: number | null
  /** El último toque empezó de nuevo porque los extremos eran de otro frame. */
  readonly otroFrame?: boolean
}

/**
 * Toque en `p` en el frame de instante `t`: el primero y el segundo, por
 * orden; después, cada toque mueve el extremo más cercano. En otro frame,
 * empieza de nuevo con este toque.
 */
export function tocarExtremo<B extends ExtremosEscala>(borrador: B, p: Punto2D, t: number): B {
  const { a, b } = borrador
  if (a && borrador.t !== null && borrador.t !== t) return { ...borrador, a: p, b: null, t, otroFrame: true }
  if (!a) return { ...borrador, a: p, t, otroFrame: false }
  if (!b || distanciaPx(p, b) < distanciaPx(p, a)) return { ...borrador, b: p, t, otroFrame: false }
  return { ...borrador, a: p, t, otroFrame: false }
}
