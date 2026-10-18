import { describe, expect, it } from 'vitest'
import { campoLupa, LUPA, radioBusquedaLupa } from './lupa'

describe('campo de la lupa', () => {
  it('vídeo 1080 de móvil en un móvil (≈ 3,7 px del vídeo por px de pantalla): 81 px, unos 3× el gomet', () => {
    const campo = campoLupa(1080, 1920, 3.7)
    expect(campo).toBeCloseTo(81)
    // Un gomet de 25 px del vídeo ocupa ≈ 49 px de la lupa (antes, con 3× fijo, ≈ 20).
    expect((25 * LUPA) / campo).toBeGreaterThan(45)
    expect(radioBusquedaLupa(campo)).toBeCloseTo(40.5)
  })

  it('en vídeos pequeños no baja de 40 px del vídeo', () => {
    expect(campoLupa(640, 360, 1.64)).toBe(40)
  })

  it('amplía al menos 2× lo que se ve en pantalla (vídeo mostrado más grande que su tamaño real)', () => {
    expect(campoLupa(1080, 1920, 0.4)).toBeCloseTo((LUPA / 2) * 0.4)
  })
})
