import { describe, expect, it } from 'vitest'
import { altoArrastrado, altosVideo, esReparto, repartoMasCercano, repartoVecino } from './reparto'

describe('reparto del alto entre vídeo y gráfica', () => {
  const altos = altosVideo(1000, Infinity)

  it('cada posición es su % de la ventana', () => {
    expect(altos).toEqual({ grafica: 200, normal: 300, video: 450 })
  })

  it('ninguna pasa de lo que permite el ancho del vídeo', () => {
    expect(altosVideo(1000, 250)).toEqual({ grafica: 200, normal: 250, video: 250 })
  })

  it('al arrastrar no sale de las posiciones extremas', () => {
    expect(altoArrastrado(300, 50, altos)).toBe(350)
    expect(altoArrastrado(300, 500, altos)).toBe(450)
    expect(altoArrastrado(300, -500, altos)).toBe(200)
  })

  it('al soltar encaja en la posición más cercana', () => {
    expect(repartoMasCercano(240, altos)).toBe('grafica')
    expect(repartoMasCercano(260, altos)).toBe('normal')
    expect(repartoMasCercano(380, altos)).toBe('video')
  })

  it('si el vídeo no puede crecer, «normal» gana a «vídeo»', () => {
    expect(repartoMasCercano(250, altosVideo(1000, 250))).toBe('normal')
  })

  it('con el teclado pasa a la de al lado sin salirse', () => {
    expect(repartoVecino('normal', 1)).toBe('video')
    expect(repartoVecino('video', 1)).toBe('video')
    expect(repartoVecino('grafica', -1)).toBe('grafica')
  })

  it('solo acepta lo guardado si es una posición', () => {
    expect(esReparto('video')).toBe(true)
    expect(esReparto('grande')).toBe(false)
    expect(esReparto(null)).toBe(false)
  })
})
