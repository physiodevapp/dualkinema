/**
 * Tabla de frames de una vista: el tiempo de presentación (pts, en segundos de
 * vídeo) de cada frame, ordenado. Es la referencia de tiempo de todo el
 * análisis: los móviles graban con fps variable, así que el frame i no está en
 * i / fps, sino en tiempos[i].
 */
export interface TablaFrames {
  readonly tiempos: readonly number[]
}

/** Crea la tabla a partir de los pts en cualquier orden (los vídeos con frames B no los dan ordenados). */
export function crearTablaFrames(pts: Iterable<number>): TablaFrames {
  const unicos = [...new Set([...pts].filter(Number.isFinite))].sort((a, b) => a - b)
  return { tiempos: unicos }
}

/**
 * Índice del frame que se ve en el instante t: el último con tiempo ≤ t.
 * Antes del primer frame devuelve 0; con la tabla vacía, −1.
 */
export function indiceEnTiempo(tabla: TablaFrames, t: number): number {
  const ts = tabla.tiempos
  if (ts.length === 0) return -1
  let lo = 0
  let hi = ts.length - 1
  if (t < ts[0]!) return 0
  while (lo < hi) {
    const mitad = (lo + hi + 1) >> 1
    if (ts[mitad]! <= t) lo = mitad
    else hi = mitad - 1
  }
  return lo
}

/** Margen para casar el tiempo de un frame decodificado con su entrada de la tabla (redondeos de la escala de tiempos). */
const MARGEN_FRAME_S = 1e-6

/**
 * Índice en la tabla del frame que entrega el decodificador con este tiempo.
 * Un tiempo un pelo por debajo del de la tabla (redondeo) es ese frame, no el anterior.
 */
export function indiceDeFrame(tabla: TablaFrames, timestamp: number): number {
  return indiceEnTiempo(tabla, timestamp + MARGEN_FRAME_S)
}

/**
 * Índice del frame cuyo tiempo está más cerca de t (para tocar una gráfica:
 * el frame más próximo al punto, no el último anterior). Con la tabla vacía, −1.
 */
export function indiceMasCercano(tabla: TablaFrames, t: number): number {
  const i = indiceEnTiempo(tabla, t)
  if (i < 0) return -1
  const ts = tabla.tiempos
  const siguiente = ts[i + 1]
  if (siguiente === undefined) return i
  return t - ts[i]! <= siguiente - t ? i : i + 1
}

/** Lleva un índice al rango válido de la tabla. */
export function limitarIndice(tabla: TablaFrames, i: number): number {
  return Math.min(Math.max(Math.round(i), 0), Math.max(tabla.tiempos.length - 1, 0))
}

export interface EstadisticasFrames {
  readonly frames: number
  /** Del primer al último frame, en s (no incluye la duración del último). */
  readonly intervalo: number
  /** Frames por segundo medios; NaN con menos de 2 frames. */
  readonly fpsMedio: number
  /** Separación mínima y máxima entre frames consecutivos, en s. */
  readonly pasoMin: number
  readonly pasoMax: number
  /** true si la separación entre frames varía más de un 10 %. */
  readonly variable: boolean
}

export function estadisticas(tabla: TablaFrames): EstadisticasFrames {
  const ts = tabla.tiempos
  const n = ts.length
  if (n < 2) return { frames: n, intervalo: 0, fpsMedio: NaN, pasoMin: NaN, pasoMax: NaN, variable: false }
  let pasoMin = Infinity
  let pasoMax = 0
  for (let i = 1; i < n; i++) {
    const paso = ts[i]! - ts[i - 1]!
    pasoMin = Math.min(pasoMin, paso)
    pasoMax = Math.max(pasoMax, paso)
  }
  const intervalo = ts[n - 1]! - ts[0]!
  return {
    frames: n,
    intervalo,
    fpsMedio: (n - 1) / intervalo,
    pasoMin,
    pasoMax,
    variable: pasoMax > pasoMin * 1.1,
  }
}

/**
 * Frecuencia de muestreo de referencia para filtrar: la inversa de la mediana
 * de la separación entre frames. A diferencia de la media, no la mueven los
 * frames que el móvil se salta. NaN con menos de 2 frames.
 */
export function fpsMediano(tabla: TablaFrames): number {
  const ts = tabla.tiempos
  if (ts.length < 2) return NaN
  const pasos = new Float64Array(ts.length - 1)
  for (let i = 1; i < ts.length; i++) pasos[i - 1] = ts[i]! - ts[i - 1]!
  pasos.sort()
  const m = pasos.length >> 1
  const mediana = pasos.length % 2 ? pasos[m]! : (pasos[m - 1]! + pasos[m]!) / 2
  return 1 / mediana
}
