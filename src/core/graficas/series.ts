/*
 * Series por frame para las gráficas: un valor por frame de la tabla (eje X =
 * tiempos de los frames), null donde no hay valor. Un hueco es null y corta la
 * línea; lo interpolado a petición va en una serie aparte, a trazos.
 */

/** Valor (NaN = sin valor) y si sale de algo interpolado, en un instante. */
export interface PuntoSerie {
  readonly t: number
  readonly valor: number
  readonly interpolado?: boolean
}

export interface SeriePorFrame {
  /** Un valor por frame; NaN donde la serie no tiene valor. */
  readonly valores: Float64Array
  /** 1 donde el valor sale de algo interpolado. */
  readonly interpolado: Uint8Array
}

/**
 * Coloca una serie (ordenada o no) en los frames de la tabla, emparejando por
 * `t` exacto: las series salen de la misma tabla de frames.
 */
export function seriePorFrame(serie: readonly PuntoSerie[], tiempos: ArrayLike<number>): SeriePorFrame {
  const porT = new Map<number, PuntoSerie>()
  for (const p of serie) porT.set(p.t, p)
  const n = tiempos.length
  const valores = new Float64Array(n).fill(NaN)
  const interpolado = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const p = porT.get(tiempos[i]!)
    if (!p) continue
    valores[i] = p.valor
    if (p.interpolado && Number.isFinite(p.valor)) interpolado[i] = 1
  }
  return { valores, interpolado }
}

export interface SeriePartida {
  /** Lo medido: null en los huecos y en lo interpolado. */
  readonly medida: (number | null)[]
  /**
   * Lo interpolado, con el frame medido a cada lado para que las dos líneas se
   * unan sin cruzar ningún hueco. null en el resto.
   */
  readonly interpolada: (number | null)[]
}

/**
 * Separa una serie por frame en la línea continua y la de trazos, con `n`
 * frames (los que falten al final de `valores` quedan sin valor).
 */
export function partirInterpolado(valores: ArrayLike<number>, interpolado: ArrayLike<number | boolean>, n = valores.length): SeriePartida {
  const medida: (number | null)[] = new Array(n)
  const interpolada: (number | null)[] = new Array(n)
  const interp = (i: number) => i >= 0 && i < n && !!interpolado[i]
  for (let i = 0; i < n; i++) {
    const v = i < valores.length ? valores[i]! : NaN
    const hay = Number.isFinite(v)
    medida[i] = hay && !interp(i) ? v : null
    interpolada[i] = hay && (interp(i) || interp(i - 1) || interp(i + 1)) ? v : null
  }
  return { medida, interpolada }
}
