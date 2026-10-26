import { describe, expect, it } from 'vitest'
import { fpsDeMarcas, nombreGrabacion, preverFps, revisarFps } from './revision'

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

describe('fpsDeMarcas', () => {
  it('30 fps exactos; un frame de cada dos descartado da 15', () => {
    const t = Array.from({ length: 61 }, (_, i) => i / 30)
    expect(fpsDeMarcas(t)).toBeCloseTo(30, 9)
    expect(fpsDeMarcas(t.filter((_, i) => i % 2 === 0))).toBeCloseTo(15, 9)
  })

  it('cuenta los huecos sueltos: 60 frames en 2 s con 6 descartados dan 27', () => {
    const t = Array.from({ length: 61 }, (_, i) => i / 30).filter((_, i) => i === 0 || i % 10 !== 5)
    expect(fpsDeMarcas(t)).toBeCloseTo(27, 9)
  })

  it('con menos de 3 marcas o sin duración, NaN', () => {
    expect(fpsDeMarcas([0, 0.033])).toBeNaN()
    expect(fpsDeMarcas([1, 1, 1])).toBeNaN()
  })
})

describe('preverFps', () => {
  it('cámara y codificador a 30: bien', () => {
    expect(preverFps(30, 30, 29.8)).toEqual({ fps: 29.8, bajos: false, causa: null })
  })

  it('la cámara da 20 (poca luz, o la cámara falsa de las e2e): la causa es la cámara', () => {
    expect(preverFps(30, 20, 20)).toEqual({ fps: 20, bajos: true, causa: 'camara' })
  })

  it('la cámara da 30 y el codificador 10 (la tablet por software): la causa es el codificador', () => {
    expect(preverFps(30, 30, 10)).toEqual({ fps: 10, bajos: true, causa: 'codificador' })
  })

  it('sin medida del codificador, avisa', () => {
    expect(preverFps(30, 30, NaN).bajos).toBe(true)
  })
})

describe('nombreGrabacion', () => {
  it('fecha y hora local de inicio con ceros a la izquierda', () => {
    expect(nombreGrabacion(new Date(2026, 9, 4, 9, 5, 7))).toBe('dualkinema-2026-10-04-090507.mp4')
  })
})
