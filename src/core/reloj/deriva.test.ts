import { describe, expect, it } from 'vitest'
import { desfaseConDeriva, estimarDeriva } from './deriva'
import { relojRemoto, retardoRed, simularIntercambios } from './sintetico'

const sesion = (deriva: number, minimo: number, media: number, semilla: number) => ({
  desfase: 5000,
  deriva,
  n: 120, // 2 minutos con un ping por segundo
  intervalo: 1000,
  ida: retardoRed(minimo, media),
  vuelta: retardoRed(minimo, media),
  semilla,
})

describe('estimarDeriva', () => {
  it('50, 0 y −80 ppm en 2 minutos: el error real cabe en 3 errores típicos (5 redes distintas cada una)', () => {
    for (const deriva of [50, 0, -80]) {
      for (const semilla of [1, 2, 3, 4, 5]) {
        const d = estimarDeriva(simularIntercambios(sesion(deriva, 10, 10, semilla)))!
        expect(Math.abs(d.ppm - deriva), `${deriva} ppm, semilla ${semilla}: ${d.ppm} ± ${d.errorPpm}`).toBeLessThanOrEqual(3 * d.errorPpm)
        expect(d.errorPpm).toBeLessThan(10)
      }
    }
  })

  it('el desfase de cada instante según la recta, a menos de 3 ms del real', () => {
    const o = sesion(50, 10, 10, 1)
    const d = estimarDeriva(simularIntercambios(o))!
    for (const t of [0, 60_000, 120_000]) expect(Math.abs(desfaseConDeriva(d, t) - (relojRemoto(o, t) - t))).toBeLessThan(3)
  })

  it('una red más lenta y variable se ve en el error típico (más ancho), no en un resultado falso', () => {
    const rapida = estimarDeriva(simularIntercambios(sesion(50, 5, 5, 1)))!
    const lenta = estimarDeriva(simularIntercambios(sesion(50, 10, 30, 1)))!
    expect(lenta.errorPpm).toBeGreaterThan(3 * rapida.errorPpm)
    expect(Math.abs(lenta.ppm - 50)).toBeLessThanOrEqual(3 * lenta.errorPpm)
  })

  it('con menos de 20 s de intercambios no hay deriva que medir', () => {
    expect(estimarDeriva(simularIntercambios({ desfase: 0, deriva: 50, n: 15, intervalo: 1000, ida: () => 10, vuelta: () => 10 }))).toBeNull()
    expect(estimarDeriva([])).toBeNull()
  })
})
