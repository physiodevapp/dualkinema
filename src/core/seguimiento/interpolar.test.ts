import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import { HUECO_MAX_S, huecosInterpolables, interpolarHueco, quitarInterpolados } from './interpolar'

// 30 fps con un frame que falta tras el 9 (fps variable, como un móvil).
const tiempos = Array.from({ length: 30 }, (_, i) => (i < 10 ? i : i + 1) / 30)

const muestra = (t: number, x: number, y: number, calidad = 1): Muestra2D => ({ t, x, y, calidad, editadoManual: false })
const perdida = (t: number): Muestra2D => ({ t, x: NaN, y: NaN, calidad: 0, editadoManual: false })

/** Serie de la trayectoria `f(t)` con los frames de `huecos` perdidos. */
function serieCon(f: (t: number) => { x: number; y: number }, huecos: readonly number[]) {
  return tiempos.map((t, i) => (huecos.includes(i) ? perdida(t) : muestra(t, f(t).x, f(t).y)))
}

describe('huecos interpolables', () => {
  it('solo los rodeados de posiciones fiables y de 0,2 s o menos', () => {
    const s = serieCon(() => ({ x: 0, y: 0 }), [0, 1, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 29])
    // [0,1]: al principio (sin posición antes). [4–8]: del 3 al 9 = 0,2 s → sí.
    // [15–21]: del 14 al 22 = 0,3 s → no. [29]: al final.
    expect(huecosInterpolables(s, tiempos)).toEqual([{ antes: 3, despues: 9 }])
  })

  it('una detección dudosa o un frame sin muestra también son hueco', () => {
    const s: (Muestra2D | undefined)[] = serieCon(() => ({ x: 0, y: 0 }), [])
    s[5] = muestra(tiempos[5]!, 0, 0, 0.4)
    s[6] = undefined
    expect(huecosInterpolables(s, tiempos)).toEqual([{ antes: 4, despues: 7 }])
  })

  it('el límite es configurable y por defecto es 0,2 s', () => {
    expect(HUECO_MAX_S).toBe(0.2)
    const s = serieCon(() => ({ x: 0, y: 0 }), [15, 16, 17, 18, 19, 20, 21])
    expect(huecosInterpolables(s, tiempos, 0.3)).toEqual([{ antes: 14, despues: 22 }])
  })
})

describe('interpolar un hueco', () => {
  it('a velocidad constante es exacto, también con el frame que falta en medio', () => {
    const recta = (t: number) => ({ x: 100 + 240 * t, y: 50 - 90 * t })
    const s = serieCon(recta, [7, 8, 9, 10, 11])
    const r = interpolarHueco(s, tiempos, { antes: 6, despues: 12 })
    expect(r.map((x) => x.indice)).toEqual([7, 8, 9, 10, 11])
    for (const { muestra: m } of r) {
      expect(m.x).toBeCloseTo(recta(m.t).x, 9)
      expect(m.y).toBeCloseTo(recta(m.t).y, 9)
      expect(m).toMatchObject({ interpolado: true, editadoManual: false, calidad: 1 })
    }
  })

  it('una oscilación de 1 Hz con radio 100 px queda a menos de 0,5 px en un hueco de 0,2 s', () => {
    const giro = (t: number) => ({ x: 300 + 100 * Math.sin(2 * Math.PI * t), y: 200 + 100 * Math.cos(2 * Math.PI * t) })
    const s = serieCon(giro, [16, 17, 18, 19, 20])
    const r = interpolarHueco(s, tiempos, { antes: 15, despues: 21 })
    for (const { muestra: m } of r) expect(Math.hypot(m.x - giro(m.t).x, m.y - giro(m.t).y)).toBeLessThan(0.5)
  })

  it('con una sola posición a cada lado rellena en línea recta', () => {
    const s: (Muestra2D | undefined)[] = new Array(10)
    s[2] = muestra(tiempos[2]!, 0, 0)
    s[6] = muestra(tiempos[6]!, 40, 80)
    const r = interpolarHueco(s, tiempos, { antes: 2, despues: 6 })
    expect(r.map(({ muestra: m }) => [m.x, m.y])).toEqual([[10, 20], [20, 40], [30, 60]].map(([x, y]) => [expect.closeTo(x!, 9), expect.closeTo(y!, 9)]))
  })

  it('se niega si un borde no es una posición fiable', () => {
    const s = serieCon(() => ({ x: 0, y: 0 }), [3, 4])
    expect(() => interpolarHueco(s, tiempos, { antes: 3, despues: 5 })).toThrow(/posiciones fiables/)
  })
})

describe('quitar lo interpolado', () => {
  /** Hueco de 4 frames con una detección dudosa, un frame sin muestra y dos perdidos. */
  function conHueco() {
    const s: (Muestra2D | undefined)[] = serieCon((t) => ({ x: 100 + 60 * t, y: 50 }), [5, 7])
    s[4] = muestra(tiempos[4]!, 105, 52, 0.4)
    s[6] = undefined
    return s
  }

  it('devuelve exactamente lo que había: la dudosa con su posición, el frame sin muestra y los perdidos', () => {
    const original = conHueco()
    const s = [...original]
    const [h] = huecosInterpolables(s, tiempos)
    expect(h).toEqual({ antes: 3, despues: 8 })
    for (const { indice, muestra: m } of interpolarHueco(s, tiempos, h!)) s[indice] = m
    expect(s.slice(4, 8).every((m) => m?.interpolado)).toBe(true)
    expect(s[4]!.sustituida).toEqual(original[4])
    expect(s[6]!.sustituida).toBeNull()

    expect(quitarInterpolados([s])).toBe(4)
    expect(s).toEqual(original)
    expect(s[4]).toMatchObject({ x: 105, y: 52, calidad: 0.4 }) // la dudosa no se pierde
    expect(s[6]).toBeUndefined() // sin muestra ≠ perdido (celda vacía en el CSV)
    expect(6 in s).toBe(true)
  })

  it('lo rellenado sin apuntar lo sustituido (sesiones antiguas) vuelve como perdido', () => {
    const s: (Muestra2D | undefined)[] = [muestra(0, 1, 2), { ...muestra(1 / 30, 3, 4), interpolado: true }, muestra(2 / 30, 5, 6)]
    expect(quitarInterpolados([s])).toBe(1)
    expect(s[1]).toMatchObject({ t: 1 / 30, calidad: 0, editadoManual: false })
    expect(Number.isNaN(s[1]!.x)).toBe(true)
    expect(s[0]).toEqual(muestra(0, 1, 2))
  })
})
