import { describe, expect, it } from 'vitest'
import { grabar } from '../sincronia/sintetico'
import { golpesDeAudio, retrasoDeCamara } from './calibracion'

describe('golpesDeAudio', () => {
  it('encuentra el comienzo de cada palmada a menos de 2 ms, con ruido y en el tiempo del vídeo', () => {
    const golpes = [1.234, 3.9871, 6.5]
    const muestras = grabar({ tasa: 48000, duracion: 8, golpes, ruido: 0.002, ecos: [{ retardo: 0.008, amplitud: 0.4 }], semilla: 3 })
    const r = golpesDeAudio({ inicio: 0.02, tasa: 48000, muestras })
    expect(r.map((g) => g.t)).toHaveLength(3)
    r.forEach((g, i) => expect(Math.abs(g.t - (golpes[i]! + 0.02))).toBeLessThan(0.002))
  })

  it('en silencio o con ruido constante, ninguna', () => {
    expect(golpesDeAudio({ inicio: 0, tasa: 48000, muestras: grabar({ tasa: 48000, duracion: 3, golpes: [], ruido: 0.01 }) })).toEqual([])
  })
})

describe('retrasoDeCamara', () => {
  it('la sexta prueba real: sonido a 5,997 s, manos separadas a 6,016 y juntas a 6,082 → entre 19 y 85 ms', () => {
    const r = retrasoDeCamara([{ sonido: 5.997, antes: 6.016, juntas: 6.082 }])!
    expect(r.ms).toBeCloseTo(52, 6)
    expect(r.cotaMs).toBeCloseTo(33, 6)
  })

  it('varias palmadas estrechan la cota (la intersección): retraso de verdad 50 ms, frames a 30 fps', () => {
    // Cada palmada cae en otro punto del paso entre frames: la intersección queda en unos ms.
    const marcas = [0.003, 0.017, 0.029, 0.011].map((fase, i) => {
      const contacto = 2 + 2 * i // instante real (y del sonido)
      const visto = contacto + 0.05 // la imagen, 50 ms tarde
      const juntas = visto + (0.0333 - fase) // primer frame tras el contacto
      return { sonido: contacto, antes: juntas - 0.0333, juntas }
    })
    const r = retrasoDeCamara(marcas)!
    expect(r.incoherente).toBe(false)
    expect(Math.abs(r.ms - 50)).toBeLessThanOrEqual(r.cotaMs + 1e-9)
    expect(r.cotaMs).toBeLessThan(10)
  })

  it('palmadas que no casan (un frame mal marcado): la mediana, con una cota que las cubre y el aviso', () => {
    const r = retrasoDeCamara([
      { sonido: 1, antes: 1.02, juntas: 1.053 },
      { sonido: 3, antes: 3.02, juntas: 3.053 },
      { sonido: 5, antes: 5.2, juntas: 5.233 },
    ])!
    expect(r.incoherente).toBe(true)
    expect(r.ms).toBeCloseTo(36.5, 6)
    expect(r.cotaMs).toBeGreaterThan(190)
    expect(retrasoDeCamara([])).toBeNull()
  })
})
