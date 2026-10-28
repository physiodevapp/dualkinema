import { describe, expect, it } from 'vitest'
import { comparacionDeTexto, esPestana, PESTANA_DEFECTO, pestanaDeTexto, seriesDeTexto } from './preferencias'

describe('pestaña recordada', () => {
  it('cada una de las cuatro pestañas se reconoce', () => {
    for (const id of ['marcar', 'analisis', 'escala', 'video']) {
      expect(esPestana(id)).toBe(true)
      expect(pestanaDeTexto(id)).toBe(id)
    }
  })

  it('sin valor o con uno que no es una pestaña, la de por defecto', () => {
    expect(PESTANA_DEFECTO).toBe('marcar')
    for (const v of [null, '', 'graficas', 'Marcar', 'null', '{}']) expect(pestanaDeTexto(v)).toBe('marcar')
  })
})

describe('series visibles recordadas', () => {
  const defecto = { crudo: true, filtrado: true, velocidad: true }

  it('sin valor, las de por defecto (y es una copia: no se comparte)', () => {
    const r = seriesDeTexto(null, defecto)
    expect(r).toEqual(defecto)
    expect(r).not.toBe(defecto)
    expect(seriesDeTexto('', defecto)).toEqual(defecto)
  })

  it('lo guardado manda sobre lo de por defecto, y lo no guardado conserva el suyo', () => {
    expect(seriesDeTexto('{"velocidad":false}', defecto)).toEqual({ crudo: true, filtrado: true, velocidad: false })
    expect(seriesDeTexto('{"segmento-a-b":true}', defecto)).toEqual({ ...defecto, 'segmento-a-b': true })
  })

  it('un JSON roto o que no es un objeto se ignora entero', () => {
    for (const v of ['{', 'nada', '[]', '[true]', '5', 'null', '"crudo"']) expect(seriesDeTexto(v, defecto)).toEqual(defecto)
  })

  it('solo valen los valores booleanos: lo demás se ignora y no pisa el de por defecto', () => {
    expect(seriesDeTexto('{"crudo":0,"filtrado":"no","velocidad":null,"extra":false}', defecto)).toEqual({ ...defecto, extra: false })
  })
})

describe('modo de comparar las dos vistas recordado', () => {
  it('los dos modos se reconocen', () => {
    expect(comparacionDeTexto('alineadas')).toBe('alineadas')
    expect(comparacionDeTexto('superpuestas')).toBe('superpuestas')
  })

  it('sin valor o con uno ajeno, las alineadas', () => {
    for (const v of [null, '', 'superpuesta', 'Alineadas', '{}', 'null']) expect(comparacionDeTexto(v)).toBe('alineadas')
  })
})
