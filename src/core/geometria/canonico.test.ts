import { describe, expect, it } from 'vitest'
import { aCanonico } from './canonico'

describe('aCanonico', () => {
  it('invierte y (la imagen tiene y hacia abajo)', () => {
    expect(aCanonico(10, 20, { plano: 'sagital', mira: 'derecha' })).toEqual({ x: 10, y: -20, z: 0 })
  })

  it('refleja x cuando la persona mira a la izquierda: delante siempre es +x', () => {
    expect(aCanonico(10, 20, { plano: 'sagital', mira: 'izquierda' })).toEqual({ x: -10, y: -20, z: 0 })
  })

  it('en frontal, la izquierda de la persona es +x', () => {
    // De frente, su izquierda está a la derecha de la imagen; de espaldas, a la izquierda.
    expect(aCanonico(10, 0, { plano: 'frontal', ve: 'delante' }).x).toBe(10)
    expect(aCanonico(10, 0, { plano: 'frontal', ve: 'detras' }).x).toBe(-10)
  })
})
