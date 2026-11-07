import { describe, expect, it } from 'vitest'
import { DURACION_SECUENCIA_S, PITIDO_OTRA_S } from '../sincronia/pitido'
import { EMPIEZA_S, GUIONES, guionPorId, numeroGrabacion, siguienteGuion } from './guionVoz'

describe('guiones por voz de la toma B1', () => {
  it('la voz empieza después de los pitidos de ida y vuelta (no los tapa)', () => {
    expect(EMPIEZA_S).toBeGreaterThan(PITIDO_OTRA_S + DURACION_SECUENCIA_S)
    for (const g of GUIONES) expect(g.frases[0]!.t).toBe(EMPIEZA_S)
  })

  it('cada guion va en orden, deja al menos 2 s entre frases y acaba antes de la duración', () => {
    for (const g of GUIONES) {
      const ts = g.frases.map((f) => f.t)
      for (let k = 1; k < ts.length; k++) expect(ts[k]! - ts[k - 1]!, `${g.id} en ${ts[k]} s`).toBeGreaterThanOrEqual(2)
      expect(ts[ts.length - 1]!).toBeLessThan(g.duracionS)
      expect(g.frases[g.frases.length - 1]!.texto).toBe('Fin.')
    }
  })

  it('cada gesto del protocolo está en su guion', () => {
    const textos = (id: string) => guionPorId(id)!.frases.map((f) => f.texto).join(' ')
    expect(textos('b1-1')).toMatch(/pasos.*Sentadilla.*Una.*Dos.*Tres.*Marcha/s)
    expect(textos('b1-2')).toMatch(/derecha.*Una.*Dos.*Tres.*izquierda.*Una.*Dos.*Tres/s)
    expect(guionPorId('otro')).toBeNull()
  })
})

describe('de una grabación a la siguiente', () => {
  it('tras la 1 viene la 2; tras la 2 (o sin guion), ninguna', () => {
    expect(siguienteGuion('b1-1')?.id).toBe('b1-2')
    expect(siguienteGuion('b1-2')).toBeNull()
    expect(siguienteGuion(null)).toBeNull()
    expect(numeroGrabacion(guionPorId('b1-2')!)).toBe(2)
  })
})
