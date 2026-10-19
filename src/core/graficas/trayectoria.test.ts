import { describe, expect, it } from 'vitest'
import { polilineasTrayectoria } from './trayectoria'

const p = (x: number, interpolado = false) => ({ x, y: 2 * x, interpolado })
const xs = (r: ReturnType<typeof polilineasTrayectoria>) => r.map((l) => ({ x: l.puntos.map((q) => q.x), i: l.interpolado }))

describe('polilineasTrayectoria', () => {
  it('sin huecos ni interpolado: una sola línea con todos los frames', () => {
    const r = polilineasTrayectoria([p(0), p(1), p(2)])
    expect(r).toEqual([{ puntos: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }], interpolado: false }])
  })

  it('un hueco corta la línea: nunca se unen los dos lados', () => {
    expect(xs(polilineasTrayectoria([p(0), p(1), undefined, p(3), p(4)]))).toEqual([
      { x: [0, 1], i: false },
      { x: [3, 4], i: false },
    ])
    // Perdido (NaN) también es hueco.
    expect(xs(polilineasTrayectoria([p(0), p(1), { x: NaN, y: NaN }, p(3), p(4)]))).toHaveLength(2)
  })

  it('lo interpolado va aparte y comparte con lo medido el punto donde se juntan', () => {
    expect(xs(polilineasTrayectoria([p(0), p(1), p(2, true), p(3, true), p(4), p(5)]))).toEqual([
      { x: [0, 1], i: false },
      { x: [1, 2, 3, 4], i: true },
      { x: [4, 5], i: false },
    ])
  })

  it('una posición aislada queda como un punto', () => {
    expect(xs(polilineasTrayectoria([undefined, p(1), null, p(3), p(4)]))).toEqual([
      { x: [1], i: false },
      { x: [3, 4], i: false },
    ])
  })

  it('sin posiciones, nada', () => {
    expect(polilineasTrayectoria([])).toEqual([])
    expect(polilineasTrayectoria([undefined, undefined])).toEqual([])
  })
})
