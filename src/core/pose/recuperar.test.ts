import { describe, expect, it } from 'vitest'
import { bloquesHaciaAtras, tramosParaRecuperar } from './recuperar'

const F = false
const T = true

describe('tramosParaRecuperar', () => {
  it('los frames del principio sin persona, hasta el primero con ella (el vídeo real: 148 frames de pie)', () => {
    const d = [...Array<boolean>(148).fill(F), ...Array<boolean>(455).fill(T)]
    expect(tramosParaRecuperar(d)).toEqual([{ desde: 0, hasta: 147, ancla: 148 }])
  })

  it('también un tramo en medio, pero no uno al final (no hay de dónde arrancar)', () => {
    expect(tramosParaRecuperar([T, F, F, T, T, F, F])).toEqual([{ desde: 1, hasta: 2, ancla: 3 }])
  })

  it('sin tramos sin persona, nada', () => {
    expect(tramosParaRecuperar([T, T, T])).toEqual([])
    expect(tramosParaRecuperar([])).toEqual([])
  })

  it('un frame sin procesar corta el tramo', () => {
    expect(tramosParaRecuperar([F, undefined, F, T])).toEqual([{ desde: 2, hasta: 2, ancla: 3 }])
  })
})

describe('bloquesHaciaAtras', () => {
  it('de 20 en 20 desde el ancla hasta el principio del tramo, sin solaparse y sin dejar ninguno', () => {
    const b = bloquesHaciaAtras({ desde: 0, hasta: 147, ancla: 148 }, 20)
    expect(b[0]).toEqual({ desde: 129, hasta: 148 })
    expect(b.at(-1)).toEqual({ desde: 0, hasta: 8 })
    const frames = b.flatMap(({ desde, hasta }) => Array.from({ length: hasta - desde + 1 }, (_, k) => hasta - k))
    expect(frames).toEqual(Array.from({ length: 149 }, (_, k) => 148 - k))
  })

  it('un tramo más corto que un bloque es un solo bloque con el ancla', () => {
    expect(bloquesHaciaAtras({ desde: 5, hasta: 6, ancla: 7 }, 20)).toEqual([{ desde: 5, hasta: 7 }])
  })
})
