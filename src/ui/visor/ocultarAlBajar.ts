/*
 * Cuándo se oculta el vídeo pegado arriba en el móvil (paso posterior al cierre de la fase 2).
 * Con el vídeo y su gráfica el 39 % de la pantalla es fijo; al bajar por las tarjetas se esconden
 * y al subir un poco vuelven. Máquina de estados pura: el visor le da la posición de scroll y
 * si las pestañas ya están pegadas, y ella dice si el vídeo debe verse.
 */

/** Lo que se baja, seguido, antes de ocultarlo (px). */
export const BAJAR_PX = 32
/** Lo que se sube, seguido, para que vuelva (px). */
export const SUBIR_PX = 24
/** Por encima de esta posición de scroll el vídeo siempre se ve (px). */
export const TOPE_ARRIBA_PX = 60

export interface EstadoOcultar {
  /** Última posición de scroll vista. */
  readonly y: number
  /** Scroll acumulado en el sentido actual (+ baja, − sube). */
  readonly acumulado: number
  readonly oculto: boolean
  /** El usuario pidió ver el vídeo: no se oculta solo hasta volver al principio. */
  readonly anclado: boolean
}

export interface EntradaOcultar {
  readonly y: number
  /**
   * Las tarjetas ya han subido hasta la tira de pestañas (su borde de arriba está a la altura de la tira cuando sube a lo
   * más alto): ocultar el vídeo deja ver tarjetas. Antes, lo que hay entre el vídeo y las tarjetas (el hueco del vídeo, el
   * deslizador) solo dejaría un hueco vacío.
   */
  readonly tarjetasArriba: boolean
  /** Algo necesita el vídeo a la vista (p. ej. tocar los extremos de la escala). */
  readonly forzarVisible: boolean
}

export const ESTADO_INICIAL: EstadoOcultar = { y: 0, acumulado: 0, oculto: false, anclado: false }

export function siguienteEstado(e: EstadoOcultar, { y, tarjetasArriba, forzarVisible }: EntradaOcultar): EstadoOcultar {
  const dy = y - e.y
  // Un cambio de sentido reinicia lo acumulado.
  const acumulado = dy === 0 ? e.acumulado : Math.sign(dy) === Math.sign(e.acumulado) ? e.acumulado + dy : dy
  if (y < TOPE_ARRIBA_PX) return { y, acumulado, oculto: false, anclado: false }
  if (forzarVisible) return { y, acumulado, oculto: false, anclado: e.anclado }
  if (e.anclado) return { y, acumulado, oculto: false, anclado: true }
  if (acumulado >= BAJAR_PX && tarjetasArriba) return { y, acumulado, oculto: true, anclado: false }
  if (acumulado <= -SUBIR_PX) return { y, acumulado, oculto: false, anclado: false }
  return { y, acumulado, oculto: e.oculto, anclado: false }
}

/** El vídeo vuelve a verse (cambio de frame, de pestaña…) sin perder la posición. */
export const mostrar = (e: EstadoOcultar): EstadoOcultar => ({ ...e, acumulado: 0, oculto: false })

/** El usuario lo pide con el botón: se ve y no se oculta solo hasta volver al principio. */
export const anclar = (e: EstadoOcultar): EstadoOcultar => ({ ...e, acumulado: 0, oculto: false, anclado: true })
