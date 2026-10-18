import { describe, expect, it } from 'vitest'
import { constanciaSegmento, UMBRAL_CONSTANCIA } from './segmentos'

describe('constancia de la longitud de un segmento', () => {
  it('rígido y en el plano: siempre la misma longitud aunque gire', () => {
    // Pierna de 160 px que gira alrededor de la rodilla: la longitud no cambia.
    const rodilla = Array.from({ length: 50 }, () => ({ x: 300, y: 100 }))
    const tobillo = rodilla.map((_, i) => ({ x: 300 + 160 * Math.sin(i / 20), y: 100 + 160 * Math.cos(i / 20) }))
    const c = constanciaSegmento(rodilla, tobillo)!
    expect(c.referenciaPx).toBeCloseTo(160, 9)
    expect(c.rms).toBeLessThan(1e-12)
    expect(c.fuera).toBe(0)
    expect(c.muestras).toBe(50)
  })

  it('al salir del plano se acorta: mayor variación con su signo, frame y frames fuera del umbral', () => {
    // 160 px; entre los frames 30 y 34 la pierna gira hacia la cámara y se ve un 10 % más corta.
    const rodilla = Array.from({ length: 40 }, () => ({ x: 0, y: 0 }))
    const tobillo = rodilla.map((_, i) => ({ x: 0, y: i >= 30 && i < 35 ? 144 : 160 }))
    tobillo[32] = { x: 0, y: 136 } // −15 %
    const c = constanciaSegmento(rodilla, tobillo)!
    expect(c.referenciaPx).toBe(160)
    expect(c.maxRel).toBeCloseTo(-0.15, 12)
    expect(c.indiceMax).toBe(32)
    expect(c.fuera).toBe(5)
    expect(c.umbral).toBe(UMBRAL_CONSTANCIA)
    // rms = √((4·0,1² + 0,15²) / 40)
    expect(c.rms).toBeCloseTo(Math.sqrt((4 * 0.01 + 0.0225) / 40), 12)
  })

  it('sin un extremo, ese frame no cuenta; sin ninguno, null', () => {
    const a = [{ x: 0, y: 0 }, undefined, { x: NaN, y: 0 }, { x: 0, y: 0 }]
    const b = [{ x: 0, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 102 }]
    const c = constanciaSegmento(a, b)!
    expect(c.muestras).toBe(2)
    expect(c.referenciaPx).toBe(101) // mediana de 100 y 102
    expect(constanciaSegmento([undefined], [{ x: 0, y: 0 }])).toBeNull()
  })
})
