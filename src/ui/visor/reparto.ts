/*
 * Reparto del alto entre el vídeo y la gráfica pequeña (móvil, vista mixta), dentro del bloque de arriba (el que deja
 * el asa de las herramientas: ver `repartoHerramientas.ts`). Un separador entre los dos se arrastra: el vídeo crece o
 * mengua y la gráfica llena lo que quede del bloque, así la tira de pestañas no se mueve. Al soltar encaja en una de
 * tres posiciones, que se guardan en este dispositivo. Lógica pura: el separador mide y este archivo decide.
 */

export type Reparto = 'grafica' | 'normal' | 'video'

/**
 * Lo que ocupa en el bloque de arriba lo que no es ni el vídeo ni la gráfica (px): el asa, la fila de botones de la
 * gráfica y los huecos. Las posiciones reparten lo que queda; sin restarlo, con el bloque bajo la gráfica se quedaba en nada.
 */
export const RESTO_BLOQUE_PX = 60

/** Tope de alto del vídeo en cada posición, en % de lo que queda en el bloque de arriba (sin `RESTO_BLOQUE_PX`). «normal» es el de partida. */
export const PORCENTAJE_VIDEO: Readonly<Record<Reparto, number>> = { grafica: 40, normal: 60, video: 90 }

/** Lo que hay que tirar más allá de una posición extrema (px) para que, al soltar, se pase a la vista ampliada. */
export const AMPLIAR_PX = 56

/** Lo que hay que tirar del asa de una vista ampliada (px, en el sentido contrario al de entrar) para volver a la mixta al soltar. */
export const VOLVER_PX = 56

/**
 * ¿Se ha tirado lo bastante del asa de una vista ampliada para volver? `sentido`: hacia dónde hay que tirar, hacia
 * arriba en el vídeo grande (lo contrario de lo que se hizo para ampliarlo) y hacia abajo en solo gráficas.
 */
export function pasaParaVolver(dy: number, sentido: 'arriba' | 'abajo'): boolean {
  return (sentido === 'arriba' ? -dy : dy) >= VOLVER_PX
}

/** Cuánto se desplaza el asa con el dedo (px, con signo de `dy`): lo que se tira, con resistencia y con tope. */
export function desplazamientoAsa(dy: number, sentido: 'arriba' | 'abajo'): number {
  const a = sentido === 'arriba' ? -dy : dy
  const dentro = Math.min(Math.max(a, 0), VOLVER_PX) * ELASTICO
  return sentido === 'arriba' ? 0 - dentro : dentro
}

/** Lo que tiene que moverse el dedo (px) para que cuente como arrastre y no como toque. */
export const MOVER_PX = 4
/** Dos toques seguidos dentro de este tiempo (ms) vuelven al reparto de siempre. */
export const DOBLE_TOQUE_MS = 350

const ORDEN: readonly Reparto[] = ['grafica', 'normal', 'video']

/**
 * Alto del vídeo (px) en cada posición con un bloque de arriba de `altoBloque` px. `techo` es lo más alto que puede
 * verse el vídeo por su ancho (un vídeo horizontal llena el ancho antes de llegar al tope): ninguna pasa de ahí.
 */
export function altosVideo(altoBloque: number, techo: number): Record<Reparto, number> {
  const util = Math.max(0, altoBloque - RESTO_BLOQUE_PX)
  const alto = (r: Reparto) => Math.min(techo, (util * PORCENTAJE_VIDEO[r]) / 100)
  return { grafica: alto('grafica'), normal: alto('normal'), video: alto('video') }
}

/** Alto del vídeo mientras se arrastra: el de partida más lo movido, sin salir de las posiciones extremas. */
export function altoArrastrado(inicio: number, dy: number, altos: Record<Reparto, number>): number {
  return Math.min(altos.video, Math.max(altos.grafica, inicio + dy))
}

/** Cuánto del movimiento del dedo más allá de un extremo sigue el vídeo (0 = se para en seco, 1 = sin resistencia). */
export const ELASTICO = 0.35

/**
 * Alto del vídeo mientras se arrastra, con resistencia más allá de los extremos: sigue al dedo sin salirse (como
 * `altoArrastrado`) y, pasado el extremo, un poco más (`ELASTICO` de lo que se tira, como mucho hasta `AMPLIAR_PX`), para
 * que no se pare en seco. Solo es el dibujo: lo que se hace al soltar lo decide `desbordeArrastre` con el movimiento real.
 */
export function altoElastico(inicio: number, dy: number, altos: Record<Reparto, number>): number {
  const alto = inicio + dy
  if (alto > altos.video) return altos.video + Math.min(alto - altos.video, AMPLIAR_PX) * ELASTICO
  if (alto < altos.grafica) return altos.grafica - Math.min(altos.grafica - alto, AMPLIAR_PX) * ELASTICO
  return alto
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

/**
 * Reparto con el que se vuelve de una vista ampliada: el extremo del que se viene (se entró tirando más allá de él), para
 * seguir viendo en grande lo que se estaba mirando. Solo vale para esa vuelta: no cambia el reparto guardado.
 */
export const repartoAlVolver = (desde: 'video' | 'graficas'): Reparto => (desde === 'video' ? 'video' : 'grafica')

export const esReparto = (v: unknown): v is Reparto => typeof v === 'string' && (ORDEN as readonly string[]).includes(v)

export const CLAVE_REPARTO = 'dualkinema.repartoVideo'

/** Reparto del alto entre el vídeo y la gráfica guardado en este dispositivo (el de siempre si no hay o no se puede leer). */
export function leerReparto(): Reparto {
  try {
    const v = localStorage.getItem(CLAVE_REPARTO)
    return esReparto(v) ? v : 'normal'
  } catch {
    return 'normal'
  }
}
