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
