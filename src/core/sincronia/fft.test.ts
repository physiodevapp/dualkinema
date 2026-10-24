import { describe, expect, it } from 'vitest'
import { fft, siguientePotencia2 } from './fft'

/** DFT directa, O(n²): la referencia contra la que se compara la FFT. */
function dft(re: ArrayLike<number>, im: ArrayLike<number>): [Float64Array, Float64Array] {
  const n = re.length
  const sr = new Float64Array(n)
  const si = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n
      sr[k] = sr[k]! + re[t]! * Math.cos(a) - im[t]! * Math.sin(a)
      si[k] = si[k]! + re[t]! * Math.sin(a) + im[t]! * Math.cos(a)
    }
  }
  return [sr, si]
}

describe('FFT', () => {
  it('siguientePotencia2', () => {
    expect([0, 1, 2, 3, 5, 1024, 1025].map(siguientePotencia2)).toEqual([1, 1, 2, 4, 8, 1024, 2048])
  })

  it('coincide con la DFT directa', () => {
    for (const n of [1, 2, 8, 64]) {
      const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.7) + (i % 3))
      const im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 0.3) - 0.5)
      const [er, ei] = dft(re, im)
      fft(re, im)
      for (let k = 0; k < n; k++) {
        expect(re[k]).toBeCloseTo(er[k]!, 9)
        expect(im[k]).toBeCloseTo(ei[k]!, 9)
      }
    }
  })

  it('un impulso en t da e^(−2πikt/n), y una sinusoide, dos rayas', () => {
    const n = 16
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    re[3] = 1
    fft(re, im)
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(Math.cos((-2 * Math.PI * k * 3) / n), 12)
      expect(im[k]).toBeCloseTo(Math.sin((-2 * Math.PI * k * 3) / n), 12)
    }
    const s = Float64Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * 2 * t) / n))
    const z = new Float64Array(n)
    fft(s, z)
    expect(s[2]).toBeCloseTo(n / 2, 12)
    expect(s[n - 2]).toBeCloseTo(n / 2, 12)
    expect(Math.abs(s[5]!)).toBeLessThan(1e-12)
  })

  it('la inversa devuelve la señal (también con 2¹⁸ puntos, el tamaño de un minuto de audio)', () => {
    const n = 1 << 18
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.001) * ((i * 7919) % 13))
    const im = new Float64Array(n)
    const original = re.slice()
    fft(re, im)
    fft(re, im, true)
    let error = 0
    for (let i = 0; i < n; i++) error = Math.max(error, Math.abs(re[i]! - original[i]!), Math.abs(im[i]!))
    expect(error).toBeLessThan(1e-9)
  })

  it('rechaza longitudes que no son potencia de 2', () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(/potencia de 2/)
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow()
  })
})
