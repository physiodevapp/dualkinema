import { describe, expect, it } from 'vitest'
import { desfaseEn, estimarDesfase } from './desfase'
import { estimarDeriva } from './deriva'
import { relojRemoto, retardoRed, simularIntercambios } from './sintetico'

describe('desfaseEn: la estimación del reloj en el inicio de la grabación', () => {
  // 30 intercambios a uno por segundo (lo que usa la sala) y la grabación 11 s después del último.
  const caso = (deriva: number, semilla: number) => {
    const o = { desfase: 5000, deriva, n: 30, intervalo: 1000, ida: retardoRed(3, 3), vuelta: retardoRed(3, 3), semilla }
    const lista = simularIntercambios(o)
    const t = lista[lista.length - 1]!.t4 + 11_000
    return { e: estimarDesfase(lista)!, d: estimarDeriva(lista), real: relojRemoto(o, t) - t, t }
  }

  it('a 100 ppm la cota sin llevarla al inicio no cubre el desfase real; llevada, sí (200 redes)', () => {
    let fueraSin = 0
    for (let s = 1; s <= 200; s++) {
      const { e, real, t } = caso(100, s)
      if (Math.abs(e.desfase - real) > e.cota) fueraSin++
      const r = desfaseEn(e, t, null)
      expect(Math.abs(r.desfase - real), `semilla ${s}`).toBeLessThanOrEqual(r.cota)
    }
    expect(fueraSin).toBeGreaterThan(100)
  })

  it('con la deriva medida, el desfase se lleva por ella y la cota sigue cubriendo el real', () => {
    for (const deriva of [140, -150, 0]) {
      for (let s = 1; s <= 50; s++) {
        const { e, d, real, t } = caso(deriva, s)
        const r = desfaseEn(e, t, d)
        expect(Math.abs(r.desfase - real), `${deriva} ppm, semilla ${s}`).toBeLessThanOrEqual(r.cota)
      }
    }
  })

  it('en el mismo instante de la estimación no cambia nada', () => {
    const { e } = caso(0, 1)
    expect(desfaseEn(e, e.instante, null)).toEqual({ desfase: e.desfase, cota: e.cota })
  })
})
