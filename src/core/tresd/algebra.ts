/** Álgebra lineal pequeña para el 3D (TypeScript puro). Matrices densas por filas en arrays planos. */

/** Resuelve A·x = b (n×n) por eliminación de Gauss con pivote parcial; null si es singular. A y b no se tocan. */
export function resolver(A: readonly number[], b: readonly number[], n: number): number[] | null {
  const m = A.slice(0, n * n)
  const x = b.slice(0, n)
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r * n + c]!) > Math.abs(m[p * n + c]!)) p = r
    if (!(Math.abs(m[p * n + c]!) > 1e-300)) return null
    if (p !== c) {
      for (let k = 0; k < n; k++) [m[c * n + k], m[p * n + k]] = [m[p * n + k]!, m[c * n + k]!]
      ;[x[c], x[p]] = [x[p]!, x[c]!]
    }
    const d = m[c * n + c]!
    for (let r = c + 1; r < n; r++) {
      const f = m[r * n + c]! / d
      if (f === 0) continue
      for (let k = c; k < n; k++) m[r * n + k]! -= f * m[c * n + k]!
      x[r]! -= f * x[c]!
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    let s = x[c]!
    for (let k = c + 1; k < n; k++) s -= m[c * n + k]! * x[k]!
    x[c] = s / m[c * n + c]!
  }
  return x.every(Number.isFinite) ? x : null
}

/** Inversa de una 3×3 (por filas); null si es singular. */
export function inversa3(m: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!(Math.abs(det) > 1e-300)) return null
  const k = 1 / det
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k]
}

/** Autovector de menor autovalor de una matriz simétrica n×n (Jacobi), con ese autovalor. */
export function menorAutovector(m: readonly number[], n: number): { readonly vector: number[]; readonly valor: number } {
  const a = m.slice(0, n * n)
  const v: number[] = Array.from({ length: n * n }, (_, k) => (k % (n + 1) === 0 ? 1 : 0))
  for (let barrido = 0; barrido < 80; barrido++) {
    let fuera = 0
    let diag = 0
    for (let p = 0; p < n; p++) {
      diag += a[p * n + p]! ** 2
      for (let q = p + 1; q < n; q++) fuera += a[p * n + q]! ** 2
    }
    if (fuera <= 1e-30 * Math.max(diag, 1e-300)) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]!
        if (apq === 0) continue
        const theta = (a[q * n + q]! - a[p * n + p]!) / (2 * apq)
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p]!
          const akq = a[k * n + q]!
          a[k * n + p] = c * akp - s * akq
          a[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k]!
          const aqk = a[q * n + k]!
          a[p * n + k] = c * apk - s * aqk
          a[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]!
          const vkq = v[k * n + q]!
          v[k * n + p] = c * vkp - s * vkq
          v[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }
  let menor = 0
  for (let i = 1; i < n; i++) if (a[i * n + i]! < a[menor * n + menor]!) menor = i
  return { vector: Array.from({ length: n }, (_, k) => v[k * n + menor]!), valor: a[menor * n + menor]! }
}
