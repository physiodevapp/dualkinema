import { describe, expect, it } from 'vitest'
import { ARRIBA_PX, EXTRA_MAXIMO_PX, extraParaLlenar, siguienteGrande, SOLTAR_PX } from './miniGrande'

describe('minigráfica grande: cuándo', () => {
  it('crece arriba del todo y se encoge al pasar SOLTAR_PX', () => {
    expect(siguienteGrande(false, 0)).toBe(true)
    expect(siguienteGrande(false, ARRIBA_PX)).toBe(true)
    expect(siguienteGrande(true, SOLTAR_PX + 1)).toBe(false)
  })

  it('entre los dos umbrales se queda como estaba (sin vibrar)', () => {
    const y = (ARRIBA_PX + SOLTAR_PX) / 2
    expect(siguienteGrande(true, y)).toBe(true)
    expect(siguienteGrande(false, y)).toBe(false)
  })
})

describe('minigráfica grande: cuánto', () => {
  it('llena el espacio libre entre la tira y la barra', () => {
    // Tira acaba en 500 y la barra empieza en 705: sobran 205 px.
    expect(extraParaLlenar(500, 705)).toBe(205)
    expect(extraParaLlenar(500, 705.9)).toBe(205)
  })

  it('no es negativo si no cabe y tiene tope', () => {
    expect(extraParaLlenar(720, 705)).toBe(0)
    expect(extraParaLlenar(300, 2000)).toBe(EXTRA_MAXIMO_PX)
    expect(extraParaLlenar(NaN, 705)).toBe(0)
  })

  it('el tope puede subir (al quitar alto al vídeo)', () => {
    expect(extraParaLlenar(300, 2000, EXTRA_MAXIMO_PX + 80)).toBe(EXTRA_MAXIMO_PX + 80)
  })
})
