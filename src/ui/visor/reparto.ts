/*
 * Reparto del alto entre el vídeo y la gráfica pequeña (móvil, vista mixta). Un separador entre los dos se
 * arrastra: el vídeo crece o mengua y la gráfica, cuando está grande arriba del todo, llena lo que quede (ver
 * `miniGrande.ts`), así la tira de pestañas no se mueve. Al soltar encaja en una de tres posiciones, que se
 * guardan en este dispositivo. Lógica pura: el separador mide y este archivo decide.
 */

export type Reparto = 'grafica' | 'normal' | 'video'

/** Tope de alto del vídeo en cada posición, en % del alto de la ventana (`dvh`). «normal» es el de siempre. */
export const ALTO_VIDEO_DVH: Readonly<Record<Reparto, number>> = { grafica: 20, normal: 30, video: 45 }

/** Lo que hay que tirar más allá de una posición extrema (px) para que, al soltar, se pase a la vista ampliada. */
export const AMPLIAR_PX = 56

/** Lo que tiene que moverse el dedo (px) para que cuente como arrastre y no como toque. */
export const MOVER_PX = 4
/** Dos toques seguidos dentro de este tiempo (ms) vuelven al reparto de siempre. */
export const DOBLE_TOQUE_MS = 350

const ORDEN: readonly Reparto[] = ['grafica', 'normal', 'video']

/**
 * Alto del vídeo (px) en cada posición con una ventana de `altoVentana` px. `techo` es lo más alto que puede
 * verse el vídeo por su ancho (un vídeo horizontal llena el ancho antes de llegar al tope): ninguna pasa de ahí.
 */
export function altosVideo(altoVentana: number, techo: number): Record<Reparto, number> {
  const alto = (r: Reparto) => Math.min(techo, (altoVentana * ALTO_VIDEO_DVH[r]) / 100)
  return { grafica: alto('grafica'), normal: alto('normal'), video: alto('video') }
}

/** Alto del vídeo mientras se arrastra: el de partida más lo movido, sin salir de las posiciones extremas. */
export function altoArrastrado(inicio: number, dy: number, altos: Record<Reparto, number>): number {
  return Math.min(altos.video, Math.max(altos.grafica, inicio + dy))
}

/**
 * Si se ha tirado más allá de una posición extrema: hacia abajo pasado «vídeo grande», el vídeo ampliado; hacia arriba
 * pasado «gráfica grande», solo las gráficas. Si no, null (el arrastre normal).
 */
export function desbordeArrastre(inicio: number, dy: number, altos: Record<Reparto, number>): 'video' | 'graficas' | null {
  const alto = inicio + dy
  if (alto > altos.video + AMPLIAR_PX) return 'video'
  if (alto < altos.grafica - AMPLIAR_PX) return 'graficas'
  return null
}

/** Posición más cercana a `alto` al soltar. Si dos coinciden (el vídeo no puede crecer más), gana «normal». */
export function repartoMasCercano(alto: number, altos: Record<Reparto, number>): Reparto {
  let mejor: Reparto = 'normal'
  for (const r of ORDEN) if (Math.abs(altos[r] - alto) < Math.abs(altos[mejor] - alto)) mejor = r
  return mejor
}

/** Posición de al lado (teclado: flecha abajo agranda el vídeo, flecha arriba la gráfica). */
export function repartoVecino(r: Reparto, paso: 1 | -1): Reparto {
  return ORDEN[Math.min(ORDEN.length - 1, Math.max(0, ORDEN.indexOf(r) + paso))]!
}

export const esReparto = (v: unknown): v is Reparto => typeof v === 'string' && (ORDEN as readonly string[]).includes(v)
