/** Diámetro de la lupa en pantalla, px. */
export const LUPA = 160

/**
 * Lado, en px del vídeo, del trozo de imagen que muestra la lupa.
 *
 * Un aumento fijo respecto a la pantalla (antes 3×) dejaba el gomet pequeño
 * en vídeos grandes: un 1080 en un móvil ya se ve reducido unas 3,7 veces.
 * Aquí la lupa abarca un 7,5 % del lado menor del vídeo (81 px en un 1080,
 * donde un gomet suele medir unos 25), y nunca menos de 40 px del vídeo
 * para no ampliar el ruido de vídeos pequeños. Como mínimo amplía 2× lo que
 * ya se ve en la pantalla.
 *
 * @param escala px del vídeo por px de pantalla.
 */
export function campoLupa(ancho: number, alto: number, escala: number): number {
  const objetivo = Math.max(40, Math.min(ancho, alto) * 0.075)
  return Math.min(objetivo, (LUPA / 2) * escala)
}

/**
 * Hasta dónde se busca el gomet alrededor del dedo, en px del vídeo: medio
 * campo de la lupa. Es decir, si el gomet se ve dentro de la lupa, se
 * encuentra, y el marcador va a su centro.
 */
export const radioBusquedaLupa = (campo: number) => campo / 2
