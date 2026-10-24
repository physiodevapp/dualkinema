import { describe, expect, it } from 'vitest'
import { ladoDeVista, ladoVisible } from './marcadores'

describe('pierna que ve la cámara', () => {
  it('de perfil, la del lado hacia el que mira la persona: mirando a la derecha de la imagen, la derecha', () => {
    // Vista desde arriba: la cámara mira hacia +y y la derecha de la imagen es +x. La persona mira hacia +x (adelante) con
    // la cabeza hacia +z (arriba): su izquierda es arriba × adelante = z × x = +y (lejos de la cámara), así que su lado
    // derecho (−y) queda hacia la cámara.
    expect(ladoVisible({ plano: 'sagital', mira: 'derecha' })).toBe('der')
    expect(ladoVisible({ plano: 'sagital', mira: 'izquierda' })).toBe('izq')
  })

  it('la de la vista de referencia; de frente no hay una pierna «que ve la cámara» y se toma la izquierda', () => {
    expect(ladoDeVista({ plano: 'sagital', mira: 'derecha' })).toBe('der')
    expect(ladoDeVista({ plano: 'frontal', ve: 'delante' })).toBe('izq')
  })
})
