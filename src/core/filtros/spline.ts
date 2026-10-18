/**
 * Spline cúbico natural (segunda derivada nula en los extremos) por los
 * puntos (ts[i], ys[i]), con ts estrictamente creciente. Pasa exactamente por
 * cada punto, es continuo hasta la segunda derivada y admite espaciado
 * desigual (fps variable). Con dos puntos es la recta entre ellos.
 *
 * Se usa para remuestrear un tramo a frecuencia constante y para volver de
 * esa rejilla a los tiempos reales de cada frame (`tramos.ts`).
 */
export function splineNatural(ts: ArrayLike<number>, ys: ArrayLike<number>): (t: number) => number {
  const n = ts.length
  if (n !== ys.length) throw new Error('Tiempos y valores de distinta longitud.')
  if (n === 0) throw new Error('Spline sin puntos.')
  if (n === 1) {
    const y0 = ys[0]!
    return () => y0
  }
  for (let i = 1; i < n; i++) if (!(ts[i]! > ts[i - 1]!)) throw new Error('Los tiempos del spline deben ser crecientes.')

  // Segundas derivadas M[i] (sistema tridiagonal, algoritmo de Thomas).
  const m = new Float64Array(n)
  if (n > 2) {
    const sup = new Float64Array(n)
    const der = new Float64Array(n)
    for (let i = 1; i < n - 1; i++) {
      const h0 = ts[i]! - ts[i - 1]!
      const h1 = ts[i + 1]! - ts[i]!
      const a = h0
      const b = 2 * (h0 + h1)
      const c = h1
      const d = 6 * ((ys[i + 1]! - ys[i]!) / h1 - (ys[i]! - ys[i - 1]!) / h0)
      const w = b - a * sup[i - 1]!
      sup[i] = c / w
      der[i] = (d - a * der[i - 1]!) / w
    }
    for (let i = n - 2; i >= 1; i--) m[i] = der[i]! - sup[i]! * m[i + 1]!
  }

  let k = 0
  return (t: number) => {
    // Intervalo [ts[k], ts[k+1]] que contiene t; empieza donde se quedó
    // (las evaluaciones suelen ir en orden) y fuera del rango extrapola con
    // el polinomio del primer o el último intervalo.
    if (k > n - 2 || t < ts[k]!) k = 0
    while (k < n - 2 && t > ts[k + 1]!) k++
    const t0 = ts[k]!
    const t1 = ts[k + 1]!
    const h = t1 - t0
    const a = (t1 - t) / h
    const b = (t - t0) / h
    return a * ys[k]! + b * ys[k + 1]! + ((a ** 3 - a) * m[k]! + (b ** 3 - b) * m[k + 1]!) * (h * h) / 6
  }
}
