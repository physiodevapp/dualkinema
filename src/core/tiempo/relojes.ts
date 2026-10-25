/*
 * Pasar las marcas de captura del vídeo al reloj de la página (fase 4, paso 8).
 *
 * Chrome marca cada frame de la cámara (`VideoFrame.timestamp`, µs) en un reloj propio (en el Pixel 8, unos 353 000 s
 * por delante de `performance.now()`), y el aviso de cada frame pintado (`requestVideoFrameCallback`) da su instante de
 * captura (`captureTime`, ms) en el reloj de la página. Un mismo frame tiene las dos, así que su diferencia es el paso de
 * un reloj al otro. No se sabe qué frame del aviso es cuál de los otros (el aviso se salta frames y llega por otro
 * camino), pero no hace falta: entre todas las parejas posibles, las de un mismo frame dan siempre la misma diferencia y
 * las demás se reparten. Se toma la diferencia que más se repite (en casillas de CASILLA_MS) y su media dentro de ella,
 * si se repite bastante más que cualquier otra.
 */

/**
 * Ancho de las casillas al contar diferencias (ms): las marcas vienen redondeadas a 0,1 ms o a 1 µs. Estrecho a
 * propósito: un frame con el siguiente difiere en el paso entre frames más su variación (de 1 a varios ms), que lo
 * reparte entre muchas casillas, y un frame consigo mismo siempre cae en la misma.
 */
export const CASILLA_MS = 0.2
/** Parejas de un mismo frame que hacen falta para fiarse. */
export const VOTOS_MINIMOS = 5
/** Y cuántas veces más que la siguiente diferencia más repetida (las coincidencias al azar no se juntan tanto). */
export const DOMINIO_MINIMO = 2

export interface PasoDeReloj {
  /** marca (ms, en su reloj) − instante en el reloj de la página (ms). */
  readonly diferenciaMs: number
  /** Parejas que la dan. */
  readonly votos: number
}

/**
 * La diferencia entre dos relojes con las marcas de unos mismos frames vistas en cada uno (`marcasMs`, en el reloj del
 * vídeo; `capturasMs`, en el de la página), sin saber cuál es cuál. null si no hay VOTOS_MINIMOS parejas que coincidan.
 */
export function pasoDeReloj(marcasMs: readonly number[], capturasMs: readonly number[]): PasoDeReloj | null {
  const casillas = new Map<number, number[]>()
  for (const m of marcasMs) {
    for (const c of capturasMs) {
      const d = m - c
      const k = Math.round(d / CASILLA_MS)
      const lista = casillas.get(k)
      if (lista) lista.push(d)
      else casillas.set(k, [d])
    }
  }
  // Una diferencia en el borde entre dos casillas se reparte: se cuentan las dos vecinas juntas.
  let mejor: number[] | null = null
  let kMejor = 0
  for (const [k, lista] of casillas) {
    const junto = [...lista, ...(casillas.get(k + 1) ?? [])]
    if (!mejor || junto.length > mejor.length) {
      mejor = junto
      kMejor = k
    }
  }
  if (!mejor || mejor.length < VOTOS_MINIMOS) return null
  let segunda = 0
  for (const [k, lista] of casillas) {
    if (k >= kMejor - 1 && k <= kMejor + 2) continue
    segunda = Math.max(segunda, lista.length + (casillas.get(k + 1)?.length ?? 0))
  }
  if (mejor.length < DOMINIO_MINIMO * segunda) return null
  const centro = mejor.reduce((s, d) => s + d, 0) / mejor.length
  const cerca = mejor.filter((d) => Math.abs(d - centro) <= CASILLA_MS)
  return { diferenciaMs: cerca.reduce((s, d) => s + d, 0) / cerca.length, votos: cerca.length }
}
