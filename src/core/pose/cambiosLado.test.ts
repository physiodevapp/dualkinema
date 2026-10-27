import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import { cambiosDeLado } from './cambiosLado'
import { idPose } from './puntos'

const m = (x: number, y: number, calidad = 0.9): Muestra2D => ({ t: 0, x, y, calidad, editadoManual: false })

/** Dos piernas de perfil: la izquierda en x = 100 y la derecha en x = 200 (rodilla en y = 300, tobillo en y = 500). */
function piernas(n: number, cruzadas: Set<number>, xIzq = 100, xDer = 200) {
  const r = new Map<string, (Muestra2D | undefined)[]>()
  for (const parte of ['rodilla', 'tobillo'] as const) {
    const y = parte === 'rodilla' ? 300 : 500
    r.set(idPose(parte, 'izq'), Array.from({ length: n }, (_, i) => m(cruzadas.has(i) ? xDer : xIzq, y)))
    r.set(idPose(parte, 'der'), Array.from({ length: n }, (_, i) => m(cruzadas.has(i) ? xIzq : xDer, y)))
  }
  return r
}

describe('cambiosDeLado', () => {
  it('sin intercambios no detecta nada', () => {
    expect(cambiosDeLado(piernas(10, new Set()), 20)).toEqual([])
  })

  it('un tramo con las piernas intercambiadas: al entrar y al salir', () => {
    expect(cambiosDeLado(piernas(10, new Set([4, 5, 6])), 20)).toEqual([4, 7])
  })

  it('con las piernas una sobre otra, intercambiarlas no cuenta', () => {
    expect(cambiosDeLado(piernas(10, new Set([4, 5]), 150, 152), 20)).toEqual([])
  })

  it('si falta un punto en alguno de los dos frames, no se compara', () => {
    const tr = piernas(10, new Set([4]))
    tr.get(idPose('tobillo', 'der'))![4] = m(NaN, NaN, 0)
    expect(cambiosDeLado(tr, 20)).toEqual([])
  })

  it('la pierna lejana con poca visibilidad también cuenta (calidad > 0)', () => {
    const tr = piernas(10, new Set([3]))
    tr.set(
      idPose('rodilla', 'izq'),
      tr.get(idPose('rodilla', 'izq'))!.map((s) => s && { ...s, calidad: 0.1 }),
    )
    expect(cambiosDeLado(tr, 20)).toEqual([3, 4])
  })
})
