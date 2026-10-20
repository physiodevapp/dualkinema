import { describe, expect, it } from 'vitest'
import type { MuestraAngulo } from './calculo'
import { ceroDeReferencia, esTramoEstatico, relativoAlCero, tramoInicial } from './cero'

const serie = (pares: readonly [number, number][]): MuestraAngulo[] => pares.map(([t, valor]) => ({ t, valor, interpolado: false }))

describe('cero de referencia (toma estática)', () => {
  it('media del tramo elegido (extremos incluidos) y relativo = valor − media', () => {
    // De pie a −4,7° (gomets fuera de los ejes) durante 2 s y después flexión a 85,3°.
    const s = serie([
      ...Array.from({ length: 61 }, (_, i) => [i / 30, -4.7] as [number, number]),
      [2.5, 40],
      [3, 85.3],
    ])
    const c = ceroDeReferencia(s, { desde: 0, hasta: 2 })!
    expect(c.media).toBeCloseTo(-4.7, 12)
    expect(c.desviacion).toBeCloseTo(0, 12)
    expect(c.muestras).toBe(61)
    expect(relativoAlCero(85.3, c)).toBeCloseTo(90, 12)
    expect(relativoAlCero(-4.7, c)).toBeCloseTo(0, 12)
    expect(Number.isNaN(relativoAlCero(NaN, c))).toBe(true)
  })

  it('con oscilación: media y desviación típica conocidas; los huecos no cuentan', () => {
    const c = ceroDeReferencia(serie([[0, 9], [0.1, 11], [0.2, NaN], [0.3, 9], [0.4, 11], [0.5, 100]]), { desde: 0, hasta: 0.45 })!
    expect(c.media).toBeCloseTo(10, 12)
    expect(c.desviacion).toBeCloseTo(1, 12)
    expect(c.muestras).toBe(4)
  })

  it('cerca de ±180° no promedia a 0', () => {
    const c = ceroDeReferencia(serie([[0, 179], [0.1, -179], [0.2, 179], [0.3, -179]]), { desde: 0, hasta: 1 })!
    expect(Math.abs(c.media)).toBeCloseTo(180, 9)
    expect(c.desviacion).toBeCloseTo(1, 9)
    // El valor sale de la misma serie continua que el cero: tras 180° viene 182°, no −178°.
    expect(relativoAlCero(182, c)).toBeCloseTo(2, 9)
  })

  it('un movimiento que se aleja más de 180° del cero no da la vuelta', () => {
    // Hombro: cero de pie a −2°, brazo arriba a 185° (misma serie continua) → 187° relativo, no −173°.
    const c = ceroDeReferencia(serie([[0, -2], [0.1, -2]]), { desde: 0, hasta: 0.1 })!
    expect(c.media).toBeCloseTo(-2, 12)
    expect(relativoAlCero(185, c)).toBeCloseTo(187, 12)
  })

  it('un tramo sin ningún ángulo no da cero', () => {
    expect(ceroDeReferencia(serie([[0, NaN], [1, 5]]), { desde: 0, hasta: 0.5 })).toBeNull()
  })

  it('primeros 2 s, sin pasar del final del vídeo', () => {
    expect(tramoInicial([0.1, 0.2, 3, 5])).toEqual({ desde: 0.1, hasta: 2.1 })
    expect(tramoInicial([0, 0.5, 1.2])).toEqual({ desde: 0, hasta: 1.2 })
    expect(tramoInicial([0])).toBeNull()
  })

  it('valida el tramo guardado', () => {
    expect(esTramoEstatico({ desde: 0, hasta: 2 })).toBe(true)
    for (const v of [null, [], { desde: 2, hasta: 2 }, { desde: 0 }, { desde: 0, hasta: Infinity }, { desde: '0', hasta: 1 }, { desde: 0, hasta: 1, x: 1 }]) {
      expect(esTramoEstatico(v)).toBe(false)
    }
  })
})
