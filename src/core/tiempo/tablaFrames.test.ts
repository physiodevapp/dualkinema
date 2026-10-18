import { describe, expect, it } from 'vitest'
import { crearTablaFrames, estadisticas, indiceEnTiempo, indiceMasCercano, limitarIndice, fpsMediano } from './tablaFrames'

describe('crearTablaFrames', () => {
  it('ordena los pts (frames B llegan desordenados) y quita duplicados y no finitos', () => {
    expect(crearTablaFrames([0.1, 0, 0.0667, 0.0333, 0.1, NaN, Infinity]).tiempos).toEqual([0, 0.0333, 0.0667, 0.1])
  })
})

describe('indiceEnTiempo', () => {
  const tabla = crearTablaFrames([0.5, 0.6, 0.75, 1])

  it.each([
    [0.5, 0],
    [0.59, 0],
    [0.6, 1],
    [0.7, 1],
    [0.75, 2],
    [1, 3],
    [5, 3],
    [0, 0],
  ])('t = %d s → frame %d', (t, i) => {
    expect(indiceEnTiempo(tabla, t)).toBe(i)
  })

  it('con la tabla vacía devuelve −1', () => {
    expect(indiceEnTiempo(crearTablaFrames([]), 1)).toBe(-1)
  })

  it('es exacto con muchos frames', () => {
    const t = crearTablaFrames(Array.from({ length: 10_000 }, (_, i) => i / 30))
    for (const i of [0, 1, 4999, 9998, 9999]) expect(indiceEnTiempo(t, i / 30)).toBe(i)
  })
})

describe('indiceMasCercano', () => {
  const tabla = crearTablaFrames([0, 0.1, 0.3, 0.4])

  it.each([
    [-1, 0],
    [0.04, 0],
    [0.06, 1],
    [0.19, 1],
    [0.21, 2],
    [0.38, 3],
    [9, 3],
  ])('t = %d s → frame %d', (t, i) => {
    expect(indiceMasCercano(tabla, t)).toBe(i)
  })

  it('con la tabla vacía devuelve −1', () => {
    expect(indiceMasCercano(crearTablaFrames([]), 1)).toBe(-1)
  })
})

describe('limitarIndice', () => {
  const tabla = crearTablaFrames([0, 1, 2])
  it.each([
    [-3, 0],
    [1.4, 1],
    [9, 2],
  ])('%d → %d', (i, r) => expect(limitarIndice(tabla, i)).toBe(r))
})

describe('estadisticas', () => {
  it('fps constantes', () => {
    const e = estadisticas(crearTablaFrames(Array.from({ length: 31 }, (_, i) => i / 30)))
    expect(e.frames).toBe(31)
    expect(e.fpsMedio).toBeCloseTo(30)
    expect(e.variable).toBe(false)
  })

  it('detecta fps variable', () => {
    const e = estadisticas(crearTablaFrames([0, 1 / 30, 2 / 30, 2 / 30 + 1 / 15, 2 / 30 + 2 / 15]))
    expect(e.pasoMin).toBeCloseTo(1 / 30)
    expect(e.pasoMax).toBeCloseTo(1 / 15)
    expect(e.variable).toBe(true)
  })

  it('con menos de 2 frames no inventa fps', () => {
    expect(estadisticas(crearTablaFrames([0])).fpsMedio).toBeNaN()
  })
})

describe('fpsMediano', () => {
  it('no lo mueven los frames saltados (la media sí)', () => {
    const ts = Array.from({ length: 31 }, (_, i) => i / 30).filter((_, i) => i !== 10 && i !== 11)
    const tabla = crearTablaFrames(ts)
    expect(fpsMediano(tabla)).toBeCloseTo(30, 6)
    expect(estadisticas(tabla).fpsMedio).toBeLessThan(29)
  })
  it('NaN con menos de dos frames', () => {
    expect(fpsMediano(crearTablaFrames([0.5]))).toBeNaN()
  })
})
