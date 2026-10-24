/*
 * FFT compleja radix-2 (Cooley–Tukey iterativa, en sitio), para la correlación del audio (`gccPhat.ts`).
 *
 * Trabaja sobre dos Float64Array (parte real e imaginaria) de longitud potencia de 2. La inversa incluye el 1/N, así que
 * `fft` seguida de `fft(…, true)` devuelve la señal de partida.
 */

/** La menor potencia de 2 que es ≥ n (1 para n ≤ 1). */
export function siguientePotencia2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/** Transforma en sitio `re` + i·`im`. Con `inversa`, la transformada inversa (con el 1/N). */
export function fft(re: Float64Array, im: Float64Array, inversa = false): void {
  const n = re.length
  if (im.length !== n) throw new Error('Las partes real e imaginaria deben medir lo mismo.')
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`La longitud de la FFT debe ser potencia de 2 (es ${n}).`)

  // Reordenación por inversión de bits.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }

  // Tabla de giros e^(∓2πik/n), calculados uno a uno (sin acumular error al multiplicarlos).
  const signo = inversa ? 1 : -1
  const cosenos = new Float64Array(n / 2)
  const senos = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cosenos[k] = Math.cos((2 * Math.PI * k) / n)
    senos[k] = signo * Math.sin((2 * Math.PI * k) / n)
  }

  for (let tam = 2; tam <= n; tam *= 2) {
    const mitad = tam / 2
    const salto = n / tam
    for (let inicio = 0; inicio < n; inicio += tam) {
      for (let k = 0; k < mitad; k++) {
        const cr = cosenos[k * salto]!
        const ci = senos[k * salto]!
        const a = inicio + k
        const b = a + mitad
        const br = re[b]! * cr - im[b]! * ci
        const bi = re[b]! * ci + im[b]! * cr
        re[b] = re[a]! - br
        im[b] = im[a]! - bi
        re[a] = re[a]! + br
        im[a] = im[a]! + bi
      }
    }
  }

  if (inversa) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n
      im[i] = im[i]! / n
    }
  }
}
