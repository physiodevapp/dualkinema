/*
 * Minigráfica grande arriba del todo (móvil, vista mixta). En la primera pantalla solo se ve el vídeo, la
 * minigráfica, la tira de pestañas y la barra fija: la minigráfica crece hasta que la tira acaba justo sobre la
 * barra, de modo que no asoma nada de la tarjeta de la herramienta. En cuanto se baja un poco vuelve a su alto de
 * siempre y las tarjetas suben a ocupar su sitio. Lógica pura: el visor mide y este archivo decide.
 */

/** Alto de la minigráfica en reposo (px). */
export const ALTO_MINI_PX = 76
/** Lo máximo que puede crecer (px): en una tableta en vertical no tiene sentido una gráfica de media pantalla. */
export const EXTRA_MAXIMO_PX = 260
/** Hasta aquí (px de scroll) se considera «arriba del todo»: al volver a estar así, la minigráfica crece. */
export const ARRIBA_PX = 2
/** Más abajo de esto (px) la minigráfica vuelve a su alto de reposo. Mayor que `ARRIBA_PX`: sin él, vibraría en el límite. */
export const SOLTAR_PX = 6

/** ¿Está la minigráfica grande con el scroll en `y`? Entre `ARRIBA_PX` y `SOLTAR_PX` se queda como estaba. */
export function siguienteGrande(grande: boolean, y: number): boolean {
  if (y <= ARRIBA_PX) return true
  if (y > SOLTAR_PX) return false
  return grande
}

/**
 * Lo que tiene que crecer la minigráfica para que la tira de pestañas acabe justo sobre la barra fija.
 * `bordeTira` es el borde de abajo de la tira con la minigráfica en reposo y la página arriba del todo; `bordeBarra`, el
 * de arriba de la barra fija (los dos en px de la ventana). Nunca negativo (si no cabe, se queda en reposo) ni más que
 * `maximo` (`EXTRA_MAXIMO_PX`, más lo que se haya quitado al vídeo al repartir el alto: ver `reparto.ts`).
 */
export function extraParaLlenar(bordeTira: number, bordeBarra: number, maximo = EXTRA_MAXIMO_PX): number {
  const libre = bordeBarra - bordeTira
  if (!Number.isFinite(libre)) return 0
  return Math.min(maximo, Math.max(0, Math.floor(libre)))
}
