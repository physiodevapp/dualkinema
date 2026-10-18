/**
 * Cómo conseguir el frame `indice` cuando no está en la caché.
 *
 * - `seguir`: el decodificador ya está antes del frame y no hay ningún
 *   fotograma clave entre medias. Seguir decodificando hacia delante cuesta
 *   lo mismo o menos que volver a empezar desde el fotograma clave (que
 *   decodificaría esos mismos frames), y los de paso quedan en la caché. Es
 *   lo que pasa al mantener pulsado «siguiente» cuando el móvil no da abasto
 *   y «el último gana» se salta frames: antes cada salto de 2 o 3 frames
 *   volvía al fotograma clave y el avance se quedaba atascado en 130–200 ms
 *   por frame.
 * - `saltar`: empezar de nuevo. El decodificador arranca siempre en el
 *   fotograma clave anterior; `desde` es el primer frame que se entrega (y se
 *   guarda en la caché): el fotograma clave o, si queda lejos, el primero de
 *   los `capacidad` frames que caben antes del pedido. Así un paso atrás deja
 *   listos los anteriores y los siguientes pasos atrás salen de la caché.
 */
export type PlanLectura = { readonly modo: 'seguir' } | { readonly modo: 'saltar'; readonly desde: number }

export interface EstadoLectura {
  readonly indice: number
  /** Índice del próximo frame que entregará el decodificador, o null si no hay ninguno abierto. */
  readonly siguiente: number | null
  /** Índices de los fotogramas clave, ordenados. */
  readonly claves: readonly number[]
  readonly capacidad: number
}

/** Índice del último fotograma clave en o antes de `indice` (0 si no hay ninguno antes). */
export function claveAnterior(claves: readonly number[], indice: number): number {
  let lo = 0
  let hi = claves.length - 1
  let r = 0
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (claves[m]! <= indice) {
      r = claves[m]!
      lo = m + 1
    } else hi = m - 1
  }
  return r
}

export function planificarLectura({ indice, siguiente, claves, capacidad }: EstadoLectura): PlanLectura {
  const clave = claveAnterior(claves, indice)
  if (siguiente !== null && indice >= siguiente && clave <= siguiente) return { modo: 'seguir' }
  return { modo: 'saltar', desde: Math.max(clave, indice - Math.max(1, capacidad) + 1) }
}
