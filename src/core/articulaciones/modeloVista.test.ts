import { describe, expect, it } from 'vitest'
import { conRodillaFrontal, marcadores, modeloRodilla3 } from './catalogo'
import { marcadoresParaVista, modeloDeVista } from './modeloVista'

const LATERAL = { plano: 'sagital', mira: 'derecha' } as const
const FRENTE = { plano: 'frontal', ve: 'delante' } as const
const m = marcadores('izq')
const sesion = conRodillaFrontal(modeloRodilla3('izq'), 'izq')

describe('lo que ve cada vista del modelo de la sesión', () => {
  it('una vista lateral nueva sigue los marcadores de la flexión; una de frente, los del FPPA', () => {
    expect(marcadoresParaVista(sesion, LATERAL)).toEqual([m.cadera, m.rodilla, m.tobillo])
    expect(marcadoresParaVista(sesion, FRENTE)).toEqual([m.musloProximal, m.centroRodilla, m.centroTobillo])
  })

  it('sin articulación de su plano, una vista sigue todos los marcadores (la de frente con el modelo de la fase 1)', () => {
    expect(marcadoresParaVista(modeloRodilla3('izq'), FRENTE)).toEqual([m.cadera, m.rodilla, m.tobillo])
  })

  it('cada vista ve solo sus marcadores y mide la articulación de su plano', () => {
    const lateral = modeloDeVista(sesion, marcadoresParaVista(sesion, LATERAL), LATERAL)
    expect(lateral.marcadores.map((mk) => mk.id)).toEqual([m.cadera, m.rodilla, m.tobillo])
    expect(lateral.articulaciones.map((a) => a.id)).toEqual(['rodilla_sagital_izq'])
    const frente = modeloDeVista(sesion, marcadoresParaVista(sesion, FRENTE), FRENTE)
    expect(frente.marcadores.map((mk) => mk.id)).toEqual([m.musloProximal, m.centroRodilla, m.centroTobillo])
    expect(frente.articulaciones.map((a) => a.id)).toEqual(['rodilla_frontal_izq'])
  })

  it('los marcadores van en el orden del modelo aunque la vista los guarde en otro', () => {
    const v = modeloDeVista(sesion, [m.centroTobillo, m.musloProximal, m.centroRodilla], FRENTE)
    expect(v.marcadores.map((mk) => mk.id)).toEqual([m.musloProximal, m.centroRodilla, m.centroTobillo])
  })

  it('con todos los marcadores, primero la articulación del plano de la vista', () => {
    const todos = sesion.marcadores.map((mk) => mk.id)
    expect(modeloDeVista(sesion, todos, FRENTE).articulaciones.map((a) => a.id)).toEqual(['rodilla_frontal_izq', 'rodilla_sagital_izq'])
    expect(modeloDeVista(sesion, todos, LATERAL).articulaciones.map((a) => a.id)).toEqual(['rodilla_sagital_izq', 'rodilla_frontal_izq'])
  })

  it('una vista de frente de antes del FPPA (con los marcadores laterales) sigue con la flexión, que no da ángulo de frente', () => {
    const v = modeloDeVista(sesion, [m.cadera, m.rodilla, m.tobillo], FRENTE)
    expect(v.articulaciones.map((a) => a.id)).toEqual(['rodilla_sagital_izq'])
  })

  it('siempre hay al menos una articulación, aunque con sus marcadores no se pueda calcular ninguna', () => {
    const v = modeloDeVista(sesion, [m.cadera], LATERAL)
    expect(v.marcadores.map((mk) => mk.id)).toEqual([m.cadera])
    expect(v.articulaciones).toHaveLength(1)
  })
})
