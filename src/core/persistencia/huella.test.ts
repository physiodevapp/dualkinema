import { describe, expect, it } from 'vitest'
import { claveHuella, compararHuella, diferenciasHuella, esHuella, type HuellaArchivo } from './huella'

const h: HuellaArchivo = { nombre: 'VID_20261017_101500.mp4', tamano: 48_213_337, duracion: 12.345678, frames: 371 }

describe('huella del vídeo', () => {
  it('la clave no lleva el nombre y absorbe el ruido de coma flotante de la duración', () => {
    expect(claveHuella(h)).toBe('48213337:371:12346')
    expect(claveHuella({ ...h, nombre: '1000012345.mp4', duracion: 12.3456781 })).toBe(claveHuella(h))
  })

  it('el mismo archivo es «igual»', () => {
    expect(compararHuella(h, { ...h })).toBe('igual')
  })

  it('el mismo vídeo con otro nombre (selector de fotos de Android) se reconoce y se avisa', () => {
    expect(compararHuella(h, { ...h, nombre: '1000012345.mp4' })).toBe('otroNombre')
  })

  it('un byte, un frame o un milisegundo de diferencia es otro vídeo', () => {
    expect(compararHuella(h, { ...h, tamano: h.tamano + 1 })).toBe('distinta')
    expect(compararHuella(h, { ...h, frames: h.frames - 1 })).toBe('distinta')
    expect(compararHuella(h, { ...h, duracion: h.duracion + 0.001 })).toBe('distinta')
  })

  it('dice qué cambia, para explicar por qué no coincide', () => {
    expect(diferenciasHuella(h, { ...h, nombre: 'otro.mp4', frames: 300 })).toEqual(['nombre', 'frames'])
    expect(diferenciasHuella(h, h)).toEqual([])
  })

  it('valida lo leído', () => {
    expect(esHuella(h)).toBe(true)
    expect(esHuella({ ...h, frames: 0 })).toBe(false)
    expect(esHuella({ ...h, tamano: 1.5 })).toBe(false)
    expect(esHuella({ ...h, duracion: Number.NaN })).toBe(false)
    expect(esHuella({ nombre: 'a.mp4' })).toBe(false)
    expect(esHuella(null)).toBe(false)
  })
})
