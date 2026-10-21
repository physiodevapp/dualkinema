import { describe, expect, it } from 'vitest'
import { distanciaPx } from '../../core/calibracion/escala'
import { tocarExtremo, type ExtremosEscala } from './toquesEscala'

const vacio: ExtremosEscala = { a: null, b: null, t: null }
const tocar = (toques: [number, number, number][]) => toques.reduce((b, [x, y, t]) => tocarExtremo(b, { x, y }, t), vacio)

describe('toques para la escala con dos extremos', () => {
  it('primero a, después b; un tercer toque mueve el extremo más cercano', () => {
    const r = tocar([[100, 300, 1], [150, 300, 1], [500, 300, 1]])
    expect(r).toMatchObject({ a: { x: 100, y: 300 }, b: { x: 500, y: 300 }, t: 1, otroFrame: false })
  })

  it('los dos extremos son siempre del mismo frame: un objeto que se mueve no da una longitud falsa', () => {
    // Una regla de 100 px que se desplaza 10 px por frame: extremos en x = 10·f y 10·f + 100.
    const t = (f: number) => f / 30
    // Un extremo en el frame 0 y el otro en el 5: serían 150 px, longitud de ningún frame.
    const r = tocar([[0, 200, t(0)], [150, 200, t(5)]])
    expect(r.b).toBeNull()
    expect(r).toMatchObject({ a: { x: 150, y: 200 }, t: t(5), otroFrame: true })
    // Completado en el frame 5, mide lo que mide la regla.
    const completo = tocarExtremo(r, { x: 50, y: 200 }, t(5))
    expect(completo.otroFrame).toBe(false)
    expect(distanciaPx(completo.a!, completo.b!)).toBe(100)
  })

  it('con los dos extremos puestos, un toque en otro frame también empieza de nuevo', () => {
    const r = tocar([[100, 300, 1], [500, 300, 1], [480, 300, 2]])
    expect(r).toMatchObject({ a: { x: 480, y: 300 }, b: null, t: 2, otroFrame: true })
  })
})
