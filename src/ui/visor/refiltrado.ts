/*
 * Cuándo volver a filtrar mientras se sigue (pendiente G de la revisión de la
 * fase 2). Cada lote del worker cambia las trayectorias; refiltrar con cada
 * uno costaría demasiado en un móvil con un vídeo largo, pero no refiltrar
 * dejaba lo filtrado (ángulo, velocidades, gráfica, trayectoria) en la pasada
 * anterior sin decirlo: con valores donde ya no había nada seguido.
 *
 * Se refiltra como mucho cada INTERVALO_MIN_MS, o cada FACTOR_COSTE veces lo
 * que tardó la última pasada si es más (así el filtrado no se come más de un
 * 5 % del tiempo mientras se sigue).
 */

export const INTERVALO_MIN_MS = 1000
export const FACTOR_COSTE = 20

/**
 * Milisegundos que faltan para poder refiltrar (0 = ya), dado el instante en
 * que empezó la última pasada y lo que tardó, en ms.
 */
export function esperaRefiltrado(ahora: number, inicioUltima: number, costeUltima: number): number {
  const intervalo = Math.max(INTERVALO_MIN_MS, FACTOR_COSTE * costeUltima)
  return Math.max(0, inicioUltima + intervalo - ahora)
}
