import { describe, expect, it } from 'vitest'
import { conCorrecciones, type EventoMarcha } from './eventos'
import { alternarExcluido, anadirEvento, estaExcluido, leerMarcha, MARCHA_VACIA, moverEvento, quitarEvento } from './guardado'

const det: EventoMarcha[] = [
  { tipo: 'contacto', lado: 'der', t: 1 },
  { tipo: 'despegue', lado: 'der', t: 1.6 },
  { tipo: 'contacto', lado: 'der', t: 2.1 },
]

describe('lo guardado de la marcha', () => {
  it('se lee lo válido y se descarta lo que no', () => {
    const m = moverEvento(MARCHA_VACIA, det[0]!, 1.04)
    expect(leerMarcha(JSON.parse(JSON.stringify(m)))).toEqual(m)
    expect(leerMarcha(null)).toBeNull()
    expect(leerMarcha({ ...m, enCinta: 'sí' })).toBeNull()
    expect(leerMarcha({ ...m, manuales: [{ tipo: 'salto', lado: 'der', t: 1 }] })).toBeNull()
    expect(leerMarcha({ ...m, excluidos: [-1] })).toBeNull()
  })

  it('mover, quitar y añadir: lo detectado quitado no vuelve, lo manual se borra del todo', () => {
    let m = moverEvento(MARCHA_VACIA, det[0]!, 1.04)
    expect(conCorrecciones(det, m.manuales, m.quitados).map((e) => e.t)).toEqual([1.04, 1.6, 2.1])
    m = quitarEvento(m, det[1]!)
    expect(conCorrecciones(det, m.manuales, m.quitados).map((e) => e.t)).toEqual([1.04, 2.1])
    const manual = conCorrecciones(det, m.manuales, m.quitados)[0]!
    m = quitarEvento(m, manual)
    expect(conCorrecciones(det, m.manuales, m.quitados).map((e) => e.t)).toEqual([2.1])
    m = anadirEvento(m, { tipo: 'despegue', lado: 'der', t: 1.7 })
    expect(conCorrecciones(det, m.manuales, m.quitados).map((e) => e.t)).toEqual([1.7, 2.1])
  })

  it('excluir un ciclo y volver a incluirlo', () => {
    const m = alternarExcluido(MARCHA_VACIA, 1.0)
    expect(estaExcluido(m.excluidos, 1.01)).toBe(true)
    expect(estaExcluido(alternarExcluido(m, 1.01).excluidos, 1.0)).toBe(false)
  })
})
