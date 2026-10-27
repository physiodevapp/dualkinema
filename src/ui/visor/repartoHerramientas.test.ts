import { describe, expect, it } from 'vitest'
import { ALTO_ASA_PX, altosBloque, bloqueArrastrado, esPosicionHerramientas, posicionMasCercana, posicionVecina } from './repartoHerramientas'

describe('reparto entre el bloque de arriba y las herramientas', () => {
  // 700 px para el visor y una tira de pestañas de 50 px.
  const altos = altosBloque(700, 50)

  it('cada posición deja a las herramientas su parte; plegadas, solo la tira; todo, nada arriba', () => {
    expect(altos).toEqual({
      plegadas: 700 - ALTO_ASA_PX - 50,
      media: 700 - ALTO_ASA_PX - 280,
      alta: 700 - ALTO_ASA_PX - 455,
      todo: 0,
    })
  })

  it('con poco sitio, ninguna es negativa y de plegadas a todo nunca crece', () => {
    const a = altosBloque(60, 50)
    expect(a.plegadas).toBe(0)
    expect(a.media).toBe(0)
    expect(a.alta).toBe(0)
    const b = altosBloque(120, 100)
    expect(b.plegadas).toBeGreaterThanOrEqual(b.media)
    expect(b.media).toBeGreaterThanOrEqual(b.alta)
  })

  it('al arrastrar no sale de los extremos', () => {
    expect(bloqueArrastrado(altos.media, 30, altos)).toBe(altos.media + 30)
    expect(bloqueArrastrado(altos.media, 2000, altos)).toBe(altos.plegadas)
    expect(bloqueArrastrado(altos.media, -2000, altos)).toBe(0)
  })

  it('al soltar encaja en la más cercana', () => {
    expect(posicionMasCercana(altos.plegadas - 10, altos)).toBe('plegadas')
    expect(posicionMasCercana(altos.media + 10, altos)).toBe('media')
    expect(posicionMasCercana(altos.alta - 10, altos)).toBe('alta')
    expect(posicionMasCercana(20, altos)).toBe('todo')
  })

  it('si dos coinciden (sin sitio), gana la de partida', () => {
    expect(posicionMasCercana(0, altosBloque(60, 50))).toBe('media')
  })

  it('con el teclado pasa a la de al lado sin salirse', () => {
    expect(posicionVecina('media', 1)).toBe('alta')
    expect(posicionVecina('todo', 1)).toBe('todo')
    expect(posicionVecina('plegadas', -1)).toBe('plegadas')
  })

  it('solo acepta lo guardado si es una posición', () => {
    expect(esPosicionHerramientas('alta')).toBe(true)
    expect(esPosicionHerramientas('grande')).toBe(false)
    expect(esPosicionHerramientas(undefined)).toBe(false)
  })
})
