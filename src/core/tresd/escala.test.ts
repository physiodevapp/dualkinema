import { describe, expect, it } from 'vitest'
import { vec3 } from '../geometria/vector'
import { alturaSuelo, compararDistancia, escalaPorEstatura, TOBILLO_HOMBRO } from './escala'
import { estadoEn, puntosDe } from './sintetico'

describe('escala por la estatura', () => {
  it('con la persona sintética a escala 1:2,5 (unidades = 0,4 m), recupera los metros por unidad', () => {
    const H = 1.7
    const k = 0.4
    const pares = Array.from({ length: 540 }, (_, i) => {
      const p = puntosDe(estadoEn(i / 30, H), H)
      const a = (v: { x: number; y: number; z: number }) => vec3(v.x / k, v.y / k, v.z / k)
      return { hombro: a(p.get('hombro_der')!), tobillo: a(p.get('tobillo_der')!) }
    })
    // La persona sintética anda con el tronco algo inclinado (0,05 rad): la altura de pie es un 0,1 % menor.
    expect(escalaPorEstatura(H, pares)! / k).toBeCloseTo(1, 2)
  })

  it('sin bastantes instantes o sin estatura, null', () => {
    const p = { hombro: vec3(0, 0, 1.3), tobillo: vec3(0, 0, 0.07) }
    expect(escalaPorEstatura(1.7, Array(5).fill(p))).toBeNull()
    expect(escalaPorEstatura(0, Array(20).fill(p))).toBeNull()
    expect(TOBILLO_HOMBRO).toBeCloseTo(0.779, 9)
  })

  it('la distancia entre los móviles casa con la del pitido hasta medio metro (su margen real)', () => {
    expect(compararDistancia(2.1, 2.0)).toMatchObject({ casa: true })
    // La primera toma real: 1,94 m por la estatura y 1,68 m por el pitido.
    expect(compararDistancia(1.94, 1.68).casa).toBe(true)
    expect(compararDistancia(2.6, 2.0).casa).toBe(false)
  })
})

describe('alturaSuelo', () => {
  it('los pies de la persona sintética apoyan en z = 0 (talón y punta, a la altura del tobillo × 0,2 sobre él)', () => {
    const H = 1.7
    const pies = Array.from({ length: 540 }, (_, i) => puntosDe(estadoEn(i / 30, H), H)).flatMap((p) => [p.get('talon_der')!, p.get('punta_izq')!])
    // Talón y punta quedan a 0,2·0,039·H sobre el suelo; con la sentadilla y los pasos, algo más.
    expect(alturaSuelo(pies)).toBeCloseTo(0.2 * 0.039 * H - 0.01, 2)
    expect(alturaSuelo([])).toBeNaN()
  })
})
