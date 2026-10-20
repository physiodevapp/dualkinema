import { describe, expect, it } from 'vitest'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { framesConMarcaManual, quitarMarcasManuales } from './manuales'

const seguida = (i: number): Muestra2D => ({ t: i / 30, x: 10, y: 10, calidad: 0.9, editadoManual: false })
const manual = (i: number): Muestra2D => ({ t: i / 30, x: 12, y: 8, calidad: 1, editadoManual: true })

/** Tres marcadores en 10 frames, todo seguido salvo las marcas a mano pedidas: `{ id: [frames] }`. */
function series(manuales: Record<string, number[]>): Map<IdMarcador, (Muestra2D | undefined)[]> {
  return new Map(
    ['a', 'b', 'c'].map((id) => [id, Array.from({ length: 10 }, (_, i) => (manuales[id]?.includes(i) ? manual(i) : seguida(i)))] as const),
  )
}

describe('marcas a mano posteriores (anclas de «Seguir desde aquí»)', () => {
  it('lista los frames con alguna marca a mano después del actual, sin repetir y en orden', () => {
    const s = series({ a: [7, 3], b: [3], c: [5] })
    expect(framesConMarcaManual(s, 0)).toEqual([3, 5, 7])
    // El propio frame y los anteriores no cuentan: el seguimiento arranca de ahí.
    expect(framesConMarcaManual(s, 3)).toEqual([5, 7])
    expect(framesConMarcaManual(s, 7)).toEqual([])
    expect(framesConMarcaManual(series({}), 0)).toEqual([])
  })

  it('un frame sin muestra, perdido o interpolado no es una marca a mano', () => {
    const s = series({ a: [4] })
    s.get('b')![2] = undefined
    s.get('b')![6] = { t: 6 / 30, x: NaN, y: NaN, calidad: 0, editadoManual: false }
    s.get('c')![8] = { ...seguida(8), interpolado: true }
    expect(framesConMarcaManual(s, 0)).toEqual([4])
  })

  it('al quitarlas dejan el frame sin muestra y respetan lo anterior y lo seguido', () => {
    const s = series({ a: [2, 6], c: [6, 8] })
    expect(quitarMarcasManuales(s, 3)).toBe(3)
    expect(s.get('a')![2]?.editadoManual).toBe(true)
    expect(s.get('a')![6]).toBeUndefined()
    expect(s.get('c')![6]).toBeUndefined()
    expect(s.get('c')![8]).toBeUndefined()
    // Lo seguido de otros frames sigue ahí.
    expect(s.get('a')![5]).toEqual(seguida(5))
    expect(framesConMarcaManual(s, 3)).toEqual([])
  })

  it('un índice negativo o más allá del final no rompe nada', () => {
    const s = series({ a: [1] })
    expect(framesConMarcaManual(s, -5)).toEqual([1])
    expect(framesConMarcaManual(s, 100)).toEqual([])
    expect(quitarMarcasManuales(s, 100)).toBe(0)
  })
})
