import { describe, expect, it } from 'vitest'
import { nombreGrabacion, revisarFps } from './revision'

describe('revisarFps', () => {
  it('30 de 30 y 27,5 de 30 están bien; 25 de 30 (lo medido en el Pixel 8) avisa', () => {
    expect(revisarFps(30, 30.1).bajos).toBe(false)
    expect(revisarFps(30, 27.5).bajos).toBe(false)
    const r = revisarFps(30, 24.9)
    expect(r.bajos).toBe(true)
    expect(r.fraccion).toBeCloseTo(0.83, 2)
  })

  it('justo en el 90 % no avisa', () => {
    expect(revisarFps(30, 27).bajos).toBe(false)
  })

  it('sin medida (NaN) avisa', () => {
    expect(revisarFps(30, NaN).bajos).toBe(true)
  })
})

describe('nombreGrabacion', () => {
  it('fecha y hora local de inicio con ceros a la izquierda', () => {
    expect(nombreGrabacion(new Date(2026, 9, 4, 9, 5, 7))).toBe('dualkinema-2026-10-04-090507.mp4')
  })
})
