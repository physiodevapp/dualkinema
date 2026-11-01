import { describe, expect, it } from 'vitest'
import { anguloConSigno, centrarVueltas, centrarVueltasPorTrozos, desenrollar, normalizarGrados } from './angulo'
import { vec3 } from './vector'

const Z = vec3(0, 0, 1)

describe('anguloConSigno', () => {
  it('es positivo en sentido antihorario alrededor de la normal', () => {
    expect(anguloConSigno(vec3(1, 0), vec3(0, 1), Z)).toBeCloseTo(90)
    expect(anguloConSigno(vec3(1, 0), vec3(0, -1), Z)).toBeCloseTo(-90)
  })

  it('cambia de signo si se invierte la normal', () => {
    expect(anguloConSigno(vec3(1, 0), vec3(0, 1), vec3(0, 0, -1))).toBeCloseTo(-90)
  })

  it('da 0 con vectores alineados y 180 con opuestos', () => {
    expect(anguloConSigno(vec3(2, 3), vec3(4, 6), Z)).toBeCloseTo(0)
    expect(anguloConSigno(vec3(1, 0), vec3(-1, 0), Z)).toBeCloseTo(180)
  })

  it('no depende de la longitud de los vectores', () => {
    expect(anguloConSigno(vec3(0.001, 0), vec3(500, 500), Z)).toBeCloseTo(45)
  })

  it('ignora la componente paralela a la normal (proyecta en el plano)', () => {
    expect(anguloConSigno(vec3(1, 0, 7), vec3(0, 1, -3), Z)).toBeCloseTo(90)
  })

  it('devuelve NaN, nunca 0, si el ángulo no está definido', () => {
    expect(anguloConSigno(vec3(0, 0), vec3(1, 0), Z)).toBeNaN()
    expect(anguloConSigno(vec3(1, 0), vec3(0, 0), Z)).toBeNaN()
    expect(anguloConSigno(vec3(0, 0, 1), vec3(1, 0), Z)).toBeNaN()
  })
})

describe('normalizarGrados', () => {
  it.each([
    [0, 0],
    [180, 180],
    [-180, 180],
    [190, -170],
    [-190, 170],
    [540, 180],
    [-721, -1],
  ])('%d° → %d°', (entrada, salida) => {
    expect(normalizarGrados(entrada)).toBeCloseTo(salida)
  })
})

describe('desenrollar', () => {
  it('quita el salto al cruzar ±180°', () => {
    expect(desenrollar([170, 179, -179, -170])).toEqual([170, 179, 181, 190])
  })

  it('funciona también al bajar', () => {
    expect(desenrollar([-170, -179, 179])).toEqual([-170, -179, -181])
  })

  it('conserva los huecos sin perder la continuidad', () => {
    const r = desenrollar([170, NaN, -175])
    expect(r[0]).toBe(170)
    expect(r[1]).toBeNaN()
    expect(r[2]).toBe(185)
  })

  it('no toca una serie sin saltos', () => {
    expect(desenrollar([0, 10, 20, 10])).toEqual([0, 10, 20, 10])
  })
})

describe('anguloConSigno con una normal cualquiera', () => {
  it('mide en el plano perpendicular a la normal, aunque no sea el plano xy', () => {
    // Plano yz (normal = +x): de +y a +z es +90°.
    expect(anguloConSigno(vec3(5, 1, 0), vec3(-2, 0, 1), vec3(3, 0, 0))).toBeCloseTo(90)
  })

  it('no devuelve −0', () => {
    expect(Object.is(anguloConSigno(vec3(0, -1), vec3(0, -2), vec3(0, 0, 1)), -0)).toBe(false)
  })
})

describe('centrarVueltas', () => {
  it('una serie desenrollada desde −175° que acaba en −360° vuelve a 185° → 0°', () => {
    const crudos = [185, 120, 60, 0].map(normalizarGrados) // lo que da cada frame por separado: −175, 120, 60, 0
    const continua = desenrollar(crudos)
    expect(continua).toEqual([-175, -240, -300, -360])
    expect(centrarVueltas(continua)).toEqual([185, 120, 60, 0])
  })

  it('no toca una serie cuyo recorrido ya está centrado en (−180°, 180°], aunque pase de 180°', () => {
    expect(centrarVueltas([170, 185, 190])).toEqual([170, 185, 190])
    expect(centrarVueltas([-10, 40, 90])).toEqual([-10, 40, 90])
  })

  it('conserva los huecos y una serie sin ningún valor', () => {
    expect(centrarVueltas([NaN, -400, NaN, -380])).toEqual([NaN, -40, NaN, -20])
    expect(centrarVueltas([NaN, NaN])).toEqual([NaN, NaN])
    expect(centrarVueltas([])).toEqual([])
  })
})


describe('centrarVueltasPorTrozos', () => {
  it('unos frames mal detectados no dejan una vuelta de más en lo que sigue', () => {
    // −10° de verdad; en medio, puntos cruzados que hacen girar el ángulo: desenrollado, lo bueno del final sale a 350°.
    const crudos = [-10, -12, 120, -100, -10, -8]
    const desenrollada = desenrollar(crudos)
    expect(desenrollada).toEqual([-10, -12, 120, 260, 350, 352])
    expect(centrarVueltas(desenrollada)).toEqual(desenrollada)
    expect(centrarVueltasPorTrozos(desenrollada)).toEqual([-10, -12, 120, -100, -10, -8])
  })

  it('también si lo mal detectado va al principio', () => {
    const desenrollada = desenrollar([170, -175, -10, -9, -11])
    expect(centrarVueltasPorTrozos(desenrollada)).toEqual([170, 185, -10, -9, -11])
  })

  it('sin saltos de más de 45° es lo mismo que centrarVueltas, con huecos o cruzando ±180°', () => {
    const lenta = desenrollar([170, 178, -175, -178, NaN, -179])
    expect(centrarVueltasPorTrozos(lenta)).toEqual(centrarVueltas(lenta))
    expect(centrarVueltasPorTrozos(lenta)).toEqual([170, 178, 185, 182, NaN, 181])
    const vuelta = [-400, -380, NaN, -360]
    expect(centrarVueltasPorTrozos(vuelta)).toEqual([-40, -20, NaN, 0])
  })

  it('un trozo de valores normales no se mueve aunque se parta', () => {
    expect(centrarVueltasPorTrozos([0, 10, 90, 95])).toEqual([0, 10, 90, 95])
    expect(centrarVueltasPorTrozos([])).toEqual([])
  })
})
