import { describe, expect, it } from 'vitest'
import { RANGO_Y_VACIO, rangoY, resumirSerie } from './rango'

describe('rangoY', () => {
  it('sin datos (o todo huecos) da el rango por defecto', () => {
    expect(rangoY([])).toEqual([...RANGO_Y_VACIO])
    expect(rangoY([NaN, null, undefined])).toEqual([...RANGO_Y_VACIO])
  })

  it('abarca los datos y el 0 con un 10 % de margen', () => {
    const [lo, hi] = rangoY([10, 90])
    expect(lo).toBeCloseTo(-9)
    expect(hi).toBeCloseTo(99)
  })

  it('incluye valores negativos (hiperextensión)', () => {
    const [lo, hi] = rangoY([-5, 85])
    expect(lo).toBeLessThan(-5)
    expect(hi).toBeGreaterThan(85)
  })

  it('un movimiento pequeño no se amplía sin límite: mínimo de 20° de alto', () => {
    const [lo, hi] = rangoY([1, 3])
    expect(hi - lo).toBeGreaterThanOrEqual(20)
    expect(lo).toBeLessThan(0)
    expect(hi).toBeGreaterThan(3)
  })

  it('ignora los huecos entre valores', () => {
    expect(rangoY([0, NaN, 50, null])).toEqual(rangoY([0, 50]))
  })
})

describe('resumirSerie', () => {
  it('máximo, mínimo y huecos', () => {
    const r = resumirSerie([
      { t: 0, valor: -4.7 },
      { t: 0.1, valor: NaN },
      { t: 0.2, valor: 86.7 },
      { t: 0.3, valor: 40 },
    ])
    expect(r.min).toEqual({ t: 0, valor: -4.7 })
    expect(r.max).toEqual({ t: 0.2, valor: 86.7 })
    expect(r.validas).toBe(3)
    expect(r.huecos).toBe(1)
  })

  it('serie sin valores', () => {
    expect(resumirSerie([{ t: 0, valor: NaN }])).toEqual({ min: null, max: null, validas: 0, huecos: 1 })
  })
})
