import { describe, expect, it } from 'vitest'
import { partirInterpolado, seriePorFrame } from './series'

describe('seriePorFrame', () => {
  const tiempos = [0, 0.033, 0.07, 0.1]

  it('empareja por tiempo exacto y deja NaN donde la serie no tiene valor', () => {
    const r = seriePorFrame(
      [
        { t: 0.07, valor: 30, interpolado: true },
        { t: 0, valor: 10 },
      ],
      tiempos,
    )
    expect([...r.valores]).toEqual([10, NaN, 30, NaN])
    expect([...r.interpolado]).toEqual([0, 0, 1, 0])
  })

  it('un hueco marcado como interpolado no cuenta como interpolado', () => {
    const r = seriePorFrame([{ t: 0.033, valor: NaN, interpolado: true }], tiempos)
    expect([...r.interpolado]).toEqual([0, 0, 0, 0])
  })
})

describe('partirInterpolado', () => {
  it('lo medido corta en los huecos y en lo interpolado', () => {
    const r = partirInterpolado([1, 2, NaN, 4, 5, 6], [0, 0, 0, 0, 1, 0])
    expect(r.medida).toEqual([1, 2, null, 4, null, 6])
  })

  it('lo interpolado lleva un frame medido a cada lado para unirse con la línea continua', () => {
    const r = partirInterpolado([1, 2, 3, 4, 5], [0, 0, 1, 1, 0])
    expect(r.interpolada).toEqual([null, 2, 3, 4, 5])
  })

  it('nunca une a través de un hueco', () => {
    const r = partirInterpolado([1, NaN, 3, 4], [0, 0, 1, 0])
    expect(r.interpolada).toEqual([null, null, 3, 4])
    expect(r.medida).toEqual([1, null, null, 4])
  })

  it('sin nada interpolado, la serie de trazos queda vacía', () => {
    expect(partirInterpolado([1, 2, 3], [0, 0, 0]).interpolada).toEqual([null, null, null])
  })

  it('completa hasta n frames sin valor', () => {
    const r = partirInterpolado([1, 2], [0, 0], 4)
    expect(r.medida).toEqual([1, 2, null, null])
    expect(r.interpolada).toEqual([null, null, null, null])
  })
})
