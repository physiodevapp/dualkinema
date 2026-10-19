/** Rango por defecto del eje Y (grados) cuando todavía no hay datos. */
export const RANGO_Y_VACIO: readonly [number, number] = [-10, 100]

/**
 * Rango del eje Y de una gráfica: abarca los datos y el 0 (la posición de
 * referencia, o velocidad nula, siempre se ve), con un 10 % de margen y un
 * mínimo de alto (20° por defecto) para que un movimiento pequeño no se vea
 * como una recta ampliada. Ignora valores no finitos (huecos).
 */
export function rangoY(valores: Iterable<number | null | undefined>, altoMinimo = 20): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of valores) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Infinity) return altoMinimo === 20 ? [RANGO_Y_VACIO[0], RANGO_Y_VACIO[1]] : [-altoMinimo / 2, altoMinimo / 2]
  const lo = Math.min(min, 0)
  const hi = Math.max(max, 0)
  const alto = Math.max(hi - lo, altoMinimo)
  const centro = (hi + lo) / 2
  const margen = alto * 0.1
  return [centro - alto / 2 - margen, centro + alto / 2 + margen]
}

export interface ResumenSerie {
  readonly min: { readonly t: number; readonly valor: number } | null
  readonly max: { readonly t: number; readonly valor: number } | null
  /** Muestras con valor y muestras sin él (huecos) dentro del tramo con datos. */
  readonly validas: number
  readonly huecos: number
}

/** Máximo, mínimo y huecos de una serie angular. */
export function resumirSerie(serie: readonly { readonly t: number; readonly valor: number }[]): ResumenSerie {
  let min: ResumenSerie['min'] = null
  let max: ResumenSerie['max'] = null
  let validas = 0
  let huecos = 0
  for (const { t, valor } of serie) {
    if (!Number.isFinite(valor)) {
      huecos++
      continue
    }
    validas++
    if (!min || valor < min.valor) min = { t, valor }
    if (!max || valor > max.valor) max = { t, valor }
  }
  return { min, max, validas, huecos }
}
