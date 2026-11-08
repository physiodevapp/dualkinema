import { describe, expect, it } from 'vitest'
import { redondearInclinacion, revisarInclinacion } from './colocacion'

describe('colocación de un móvil por su inclinación', () => {
  it('casi horizontal y derecho: bien, sin consejo', () => {
    const r = revisarInclinacion({ cabeceo: 4.4, alabeo: -1 })
    expect(r).toMatchObject({ bienCabeceo: true, bienAlabeo: true, cabeceo: 'mira hacia abajo 4°', alabeo: 'imagen girada 1°', consejo: null })
  })

  it('mirando hacia abajo y torcido: qué hacer con cada cosa', () => {
    const r = revisarInclinacion({ cabeceo: 18, alabeo: 5 })
    expect(r.bienCabeceo).toBe(false)
    expect(r.bienAlabeo).toBe(false)
    expect(r.consejo).toMatch(/^Levanta la cámara.*; endereza el móvil.*antihorario\)\.$/)
    expect(revisarInclinacion({ cabeceo: -12, alabeo: -4 }).consejo).toMatch(/^Baja la cámara.*sentido horario/)
    expect(revisarInclinacion({ cabeceo: -12, alabeo: 0 }).cabeceo).toBe('mira hacia arriba 12°')
  })

  it('se manda al otro a medio grado', () => {
    expect(redondearInclinacion({ cabeceo: 3.26, alabeo: -0.2 })).toEqual({ cabeceo: 3.5, alabeo: 0 })
  })
})
