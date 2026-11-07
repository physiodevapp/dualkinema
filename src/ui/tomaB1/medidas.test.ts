import { describe, expect, it } from 'vitest'
import { anguloPorDistancias, CASILLAS_GRABACION, CASILLAS_POR_PASO, desmarcar, fueraDeRango, hechasDelPaso, leerNumero, leerProgreso, MEDIDAS_VACIAS, PROGRESO_INICIAL, textoMedidas } from './medidas'

describe('medidas de la toma B1', () => {
  it('lee números con coma o punto; vacío o ilegible, null', () => {
    expect(leerNumero('2,85')).toBe(2.85)
    expect(leerNumero(' 1.02 ')).toBe(1.02)
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('abc')).toBeNull()
  })

  it('avisa de lo que parece mal escrito (cm en lugar de m)', () => {
    expect(fueraDeRango('estatura', 175)).toBe(true)
    expect(fueraDeRango('estatura', 1.75)).toBe(false)
    expect(fueraDeRango('alturaDerecho', null)).toBe(false)
  })

  it('el ángulo entre los móviles por el teorema del coseno: a 3 m de la persona y 4,24 m entre ellos, 90°', () => {
    const m = { ...MEDIDAS_VACIAS, distanciaDerecho: 3, distanciaIzquierdo: 3, distanciaMoviles: 3 * Math.SQRT2 }
    expect(anguloPorDistancias(m)).toBeCloseTo(90, 9)
    expect(anguloPorDistancias({ ...m, distanciaMoviles: 7 })).toBeNull()
    expect(anguloPorDistancias(MEDIDAS_VACIAS)).toBeNull()
  })

  it('lo guardado se lee validado; lo ilegible vuelve al principio', () => {
    const p = { paso: 3, hechos: ['material'], medidas: { ...MEDIDAS_VACIAS, estatura: 1.75, gomets: true } }
    expect(leerProgreso(JSON.stringify(p))).toEqual(p)
    expect(leerProgreso('{roto')).toEqual(PROGRESO_INICIAL)
    expect(leerProgreso(JSON.stringify({ paso: 99, hechos: [1, 'a'], medidas: { estatura: 'x' } }))).toEqual({ ...PROGRESO_INICIAL, hechos: ['a'] })
  })

  it('el texto para copiar lleva cada medida, con «—» la que falta', () => {
    const t = textoMedidas({ ...MEDIDAS_VACIAS, distanciaMoviles: 4.2, estatura: 1.75 })
    expect(t).toMatch(/Distancia entre los móviles: 4,2 m/)
    expect(t).toMatch(/Estatura: 1,75 m/)
    expect(t).toMatch(/Ángulo entre los móviles: —/)
  })
})

describe('rehacer sin empezar de nuevo', () => {
  it('rehacer un paso o repetir una grabación quita solo sus casillas y deja las medidas', () => {
    const p = { paso: 4, hechos: ['cinta', 't1-pasos', 't2-derecha', 'no-movido'], medidas: { ...MEDIDAS_VACIAS, estatura: 1.7 } }
    expect(desmarcar(p, CASILLAS_GRABACION[2])).toEqual({ ...p, hechos: ['cinta', 't1-pasos'] })
    expect(desmarcar(p, CASILLAS_POR_PASO[0]!).hechos).toEqual(['t1-pasos', 't2-derecha', 'no-movido'])
    expect(hechasDelPaso(p, 4)).toEqual({ hechas: 3, total: 10 })
  })

  it('cada casilla está en un solo paso', () => {
    const todas = CASILLAS_POR_PASO.flat()
    expect(new Set(todas).size).toBe(todas.length)
  })
})
