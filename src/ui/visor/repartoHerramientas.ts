/*
 * Reparto del alto entre el bloque de arriba (vídeo y gráfica pequeña) y las herramientas (tira de pestañas y tarjetas),
 * en el móvil con la vista mixta. La página no se desplaza: el visor ocupa justo el alto entre la cabecera y la barra
 * fija, y un asa entre la gráfica y las pestañas lo reparte. Al soltar encaja en una de cuatro posiciones, que se guarda
 * en este dispositivo:
 *
 * - `plegadas`: solo la tira de pestañas; vídeo y gráfica con todo el sitio.
 * - `media`: las herramientas en un 40 % (la de partida).
 * - `alta`: las herramientas en un 65 %.
 * - `todo`: solo herramientas; el vídeo y la gráfica se pliegan.
 *
 * Lo que se mueve es el alto del bloque de arriba; las herramientas llenan lo que queda (sus tarjetas se desplazan por
 * dentro). Dentro del bloque, el asa de siempre reparte entre el vídeo y la gráfica (`reparto.ts`). Lógica pura: el
 * visor mide y este archivo decide.
 */

export type PosicionHerramientas = 'plegadas' | 'media' | 'alta' | 'todo'

/** De menos a más herramientas. */
const ORDEN: readonly PosicionHerramientas[] = ['plegadas', 'media', 'alta', 'todo']

/** Parte del alto disponible para las herramientas en las posiciones intermedias. */
export const FRACCION_HERRAMIENTAS = { media: 0.4, alta: 0.65 } as const

/** Alto del asa (px): ocupa su sitio entre el bloque de arriba y las pestañas. */
export const ALTO_ASA_PX = 24

export const POSICION_DEFECTO: PosicionHerramientas = 'media'

/**
 * Alto del bloque de arriba (px) en cada posición, con `disponible` px para todo el visor (sin la barra fija) y una tira
 * de pestañas de `altoTira` px. De `plegadas` a `todo` nunca crece; nunca es negativo.
 */
export function altosBloque(disponible: number, altoTira: number): Record<PosicionHerramientas, number> {
  const libre = Math.max(0, disponible - ALTO_ASA_PX)
  const maximo = Math.max(0, libre - altoTira)
  const con = (f: number) => Math.min(maximo, Math.max(0, Math.round(libre - Math.max(altoTira, disponible * f))))
  return { plegadas: maximo, media: con(FRACCION_HERRAMIENTAS.media), alta: con(FRACCION_HERRAMIENTAS.alta), todo: 0 }
}

/** Alto del bloque de arriba mientras se arrastra el asa: el de partida más lo movido, sin salirse de los extremos. */
export function bloqueArrastrado(inicio: number, dy: number, altos: Record<PosicionHerramientas, number>): number {
  return Math.min(altos.plegadas, Math.max(altos.todo, inicio + dy))
}

/** Posición más cercana a un alto del bloque, al soltar. Con dos igual de cerca, gana la de partida (`media`). */
export function posicionMasCercana(alto: number, altos: Record<PosicionHerramientas, number>): PosicionHerramientas {
  let mejor: PosicionHerramientas = POSICION_DEFECTO
  for (const p of ORDEN) if (Math.abs(altos[p] - alto) < Math.abs(altos[mejor] - alto)) mejor = p
  return mejor
}

/** Posición de al lado (teclado: flecha arriba, más herramientas; flecha abajo, menos). */
export function posicionVecina(p: PosicionHerramientas, paso: 1 | -1): PosicionHerramientas {
  return ORDEN[Math.min(ORDEN.length - 1, Math.max(0, ORDEN.indexOf(p) + paso))]!
}

export const esPosicionHerramientas = (v: unknown): v is PosicionHerramientas => typeof v === 'string' && (ORDEN as readonly string[]).includes(v)

export const CLAVE_HERRAMIENTAS = 'dualkinema.repartoHerramientas'

/** Posición guardada en este dispositivo (la de partida si no hay o no se puede leer). */
export function leerPosicionHerramientas(): PosicionHerramientas {
  try {
    const v = localStorage.getItem(CLAVE_HERRAMIENTAS)
    return esPosicionHerramientas(v) ? v : POSICION_DEFECTO
  } catch {
    return POSICION_DEFECTO
  }
}

export function guardarPosicionHerramientas(p: PosicionHerramientas) {
  try {
    localStorage.setItem(CLAVE_HERRAMIENTAS, p)
  } catch {
    // Sin almacenamiento (modo privado): se usa solo esta vez.
  }
}
