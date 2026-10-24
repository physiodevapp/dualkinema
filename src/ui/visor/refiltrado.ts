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

/**
 * La versión de las trayectorias con que se filtra. Parado, la actual. Mientras se sigue, la «pedida», que alcanza a la
 * actual a intervalos (`esperaRefiltrado`), salvo en el render en que se empieza a seguir: entonces también la actual.
 * «Seguir desde aquí» borra lo seguido después del frame (la versión sube) a la vez que empieza a seguir; si se tomara
 * la pedida, que viene de la pasada anterior y puede ser justo la versión de antes de borrar, lo filtrado no se rehacía
 * y se veía la pasada anterior donde ya no había nada seguido hasta el siguiente intervalo.
 */
export function versionAFiltrar(siguiendo: boolean, empiezaASeguir: boolean, version: number, pedida: number): number {
  return siguiendo && !empiezaASeguir ? pedida : version
}
