import { describe, expect, it } from 'vitest'
import { saltosDeFrames } from './saltos'
import { crearTablaFrames } from './tablaFrames'

const rejilla = (n: number, paso: number) => Array.from({ length: n }, (_, i) => i * paso)

describe('saltosDeFrames', () => {
  it('sin saltos en 30 fps constantes', () => {
    const r = saltosDeFrames(crearTablaFrames(rejilla(90, 1 / 30)))
    expect(r.saltos).toBe(0)
    expect(r.framesPerdidos).toBe(0)
    expect(r.pasoMediano).toBeCloseTo(1 / 30, 9)
  })

  it('un hueco de 3 pasos son 2 frames perdidos', () => {
    // frames 0..9, luego del 10 al 12 no hay nada y sigue el 13
    const ts = [...rejilla(10, 0.04), ...rejilla(10, 0.04).map((t) => t + 13 * 0.04)]
    const r = saltosDeFrames(crearTablaFrames(ts))
    expect(r.saltos).toBe(1)
    expect(r.framesPerdidos).toBe(3) // del frame 9 al 13: paso de 4 → 3 perdidos
    expect(r.pasoMax).toBeCloseTo(0.16, 9)
  })

  it('el jitter normal (±20 %) no cuenta como salto', () => {
    const ts = rejilla(60, 0.04).map((t, i) => t + (i % 2 ? 0.008 : -0.008))
    expect(saltosDeFrames(crearTablaFrames(ts)).saltos).toBe(0)
  })

  it('menos de 2 frames: NaN y sin saltos', () => {
    const r = saltosDeFrames(crearTablaFrames([0.5]))
    expect(r.saltos).toBe(0)
    expect(r.pasoMediano).toBeNaN()
  })
})
