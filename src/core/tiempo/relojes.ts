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

/** Un frame no puede llegar antes de capturarse: se tolera esto de redondeo (ms). */
export const TOLERANCIA_LLEGADA_MS = 1

/**
 * La diferencia entre dos relojes con las marcas de unos mismos frames vistas en cada uno (`marcasMs`, en el reloj del
 * vídeo; `capturasMs`, en el de la página), sin saber cuál es cuál. null si no hay VOTOS_MINIMOS parejas que coincidan.
 *
 * Con frames muy regulares (la cámara falsa de Chromium da uno cada 50,0 ms; la tablet del usuario, cada 70 ± 3), un
 * frame emparejado con el siguiente da casi tantas coincidencias como consigo mismo, a un paso entre frames de
 * distancia. Con `llegadasMs` (cuándo llegó cada marca, en el reloj de la página, en el mismo orden) se desempata: la
 * buena es la que deja cada frame capturado antes de llegar, y por poco (de 1 a 17 ms en Chromium y en los móviles del
 * usuario, menos que el paso entre frames). Sin llegadas, la más repetida tiene que doblar a cualquier otra.
 */
export function pasoDeReloj(marcasMs: readonly number[], capturasMs: readonly number[], llegadasMs?: readonly number[]): PasoDeReloj | null {
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
  const junto = (k: number) => [...(casillas.get(k) ?? []), ...(casillas.get(k + 1) ?? [])]
  const centro = (lista: readonly number[]) => {
    const c = lista.reduce((s, d) => s + d, 0) / lista.length
    const cerca = lista.filter((d) => Math.abs(d - c) <= CASILLA_MS)
    return { diferenciaMs: cerca.reduce((s, d) => s + d, 0) / cerca.length, votos: cerca.length }
  }

  if (llegadasMs && llegadasMs.length === marcasMs.length) {
    // Candidatas: los máximos locales con votos suficientes; de ellas, la de menor retraso de llegada no negativo.
    let mejor: { paso: PasoDeReloj; retraso: number } | null = null
    for (const k of casillas.keys()) {
      const n = junto(k).length
      if (n < VOTOS_MINIMOS || junto(k - 1).length > n || junto(k + 1).length > n) continue
      const paso = centro(junto(k))
      const retrasos = marcasMs.map((m, i) => llegadasMs[i]! - (m - paso.diferenciaMs)).sort((a, b) => a - b)
      const retraso = retrasos[Math.floor(retrasos.length / 2)]!
      if (retrasos[0]! < -TOLERANCIA_LLEGADA_MS) continue
      if (!mejor || retraso < mejor.retraso) mejor = { paso, retraso }
    }
    return mejor?.paso ?? null
  }

  let mejor: number[] | null = null
  let kMejor = 0
  for (const k of casillas.keys()) {
    const lista = junto(k)
    if (!mejor || lista.length > mejor.length) {
      mejor = lista
      kMejor = k
    }
  }
  if (!mejor || mejor.length < VOTOS_MINIMOS) return null
  let segunda = 0
  for (const k of casillas.keys()) {
    if (k >= kMejor - 1 && k <= kMejor + 2) continue
    segunda = Math.max(segunda, junto(k).length)
  }
  if (mejor.length < DOMINIO_MINIMO * segunda) return null
  return centro(mejor)
}
