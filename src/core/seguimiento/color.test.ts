import { describe, expect, it } from 'vitest'
import { aprenderColor, difTono, distanciaColor, rgbAHsv } from './color'

describe('rgbAHsv', () => {
  it.each([
    [255, 0, 0, 0, 1, 1],
    [0, 255, 0, 120, 1, 1],
    [0, 0, 255, 240, 1, 1],
    [128, 128, 128, 0, 0, 128 / 255],
    [255, 0, 128, 330, 1, 1],
  ])('(%d, %d, %d) → h %d, s %d', (r, g, b, h, s, v) => {
    const c = rgbAHsv(r, g, b)
    expect(c.h).toBeCloseTo(h, 0)
    expect(c.s).toBeCloseTo(s)
    expect(c.v).toBeCloseTo(v)
  })
})

describe('tono', () => {
  it('la diferencia de tono da la vuelta en 360°', () => {
    expect(difTono(350, 10)).toBe(20)
    expect(difTono(10, 350)).toBe(20)
    expect(difTono(0, 180)).toBe(180)
  })

  it('la media de tonos es circular (rojos a ambos lados de 0°)', () => {
    const m = aprenderColor([
      { h: 350, s: 0.9, v: 0.8 },
      { h: 10, s: 0.9, v: 0.8 },
    ])
    expect(difTono(m.h, 0)).toBeLessThan(0.001)
  })
})

describe('distanciaColor', () => {
  const verde = aprenderColor([{ h: 140, s: 0.8, v: 0.75 }])

  it('es 0 con el mismo color y crece al cambiar de tono', () => {
    expect(distanciaColor({ h: 140, s: 0.8, v: 0.75 }, verde)).toBeCloseTo(0)
    expect(distanciaColor({ h: 160, s: 0.8, v: 0.75 }, verde)).toBeGreaterThan(2)
  })

  it('pesa poco el brillo (luz)', () => {
    expect(distanciaColor({ h: 140, s: 0.8, v: 0.45 }, verde)).toBeLessThan(1.5)
  })

  it('rechaza píxeles casi grises aunque el tono coincida', () => {
    expect(distanciaColor({ h: 140, s: 0.1, v: 0.75 }, verde)).toBe(Infinity)
  })
})
