import { describe, expect, it } from 'vitest'
import { articulacionesSagitales } from '../articulaciones/catalogo'
import { aImagen, direccion } from '../articulaciones/poses'
import type { OrientacionVista } from '../geometria/canonico'
import type { Muestra2D } from '../modelo/tipos'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { anguloFiltradoPorFrame, compararSeries } from './comparar'
import { idPose, rodillaSagitalPose } from './puntos'

describe('compararSeries', () => {
  it('una diferencia constante es todo sesgo: ECM sin sesgo 0 y correlación 1', () => {
    const a = [0, 10, 20, 30, 40, 50]
    const b = a.map((x) => x + 5)
    const c = compararSeries(a, b)!
    expect(c.n).toBe(6)
    expect(c.media).toBeCloseTo(5)
    expect(c.de).toBeCloseTo(0)
    expect(c.ecm).toBeCloseTo(5)
    expect(c.ecmSinSesgo).toBeCloseTo(0)
    expect(c.correlacion).toBeCloseTo(1)
    expect(c.rangoA).toEqual({ min: 0, max: 50 })
    expect(c.rangoB).toEqual({ min: 5, max: 55 })
  })

  it('valores conocidos: diferencias ±1 alrededor de 2', () => {
    const a = [0, 0, 0, 0]
    const b = [1, 3, 1, 3]
    const c = compararSeries(a, b)!
    expect(c.media).toBeCloseTo(2)
    expect(c.ecmSinSesgo).toBeCloseTo(1)
    expect(c.de).toBeCloseTo(Math.sqrt(4 / 3))
    expect(c.ecm).toBeCloseTo(Math.sqrt(5))
    expect(c.correlacion).toBeNaN() // a no varía
  })

  it('solo cuenta los frames con valor en las dos', () => {
    const c = compararSeries([1, NaN, 3, 4, NaN], [2, 5, NaN, 6, 7])!
    expect(c.n).toBe(2)
    expect(c.media).toBeCloseTo(1.5)
  })

  it('con menos de dos frames en común no compara', () => {
    expect(compararSeries([1, NaN], [NaN, 2])).toBeNull()
    expect(compararSeries([], [])).toBeNull()
  })
})

describe('anguloFiltradoPorFrame', () => {
  const o: OrientacionVista = { plano: 'sagital', mira: 'derecha' }
  const def = rodillaSagitalPose('der')
  const tabla = crearTablaFrames(Array.from({ length: 60 }, (_, i) => i / 30))
  // Flexión que sube de 0° a 59° (1° por frame) con el muslo quieto.
  const flexion = (i: number) => i
  const trayectorias = (hueco: Set<number>) => {
    const r = new Map<string, (Muestra2D | undefined)[]>()
    const pon = (id: string, i: number, p: { x: number; y: number }) => {
      if (!r.has(id)) r.set(id, new Array(60))
      r.get(id)![i] = { t: tabla.tiempos[i]!, ...aImagen(p, o), calidad: hueco.has(i) && id === idPose('tobillo', 'der') ? 0 : 0.9, editadoManual: false }
    }
    for (let i = 0; i < 60; i++) {
      const rodilla = { x: 0, y: -1.3 }
      const d = direccion(-flexion(i))
      pon(idPose('cadera', 'der'), i, { x: 0, y: 0 })
      pon(idPose('rodilla', 'der'), i, rodilla)
      pon(idPose('tobillo', 'der'), i, { x: rodilla.x + d.x * 1.2, y: rodilla.y + d.y * 1.2 })
    }
    return r
  }

  it('sigue el ángulo real (filtrado a 6 Hz; una rampa no cambia lejos de los extremos)', () => {
    const v = anguloFiltradoPorFrame(trayectorias(new Set()), def, o, tabla, { corteHz: 6 })
    for (const i of [15, 30, 45]) expect(v[i]).toBeCloseTo(flexion(i), 0)
  })

  it('no cruza un hueco: sin valor dentro y con valor a los lados', () => {
    const hueco = new Set([28, 29, 30, 31])
    const v = anguloFiltradoPorFrame(trayectorias(hueco), def, o, tabla, { corteHz: 6 })
    for (const i of hueco) expect(v[i]).toBeNaN()
    expect(Number.isFinite(v[20])).toBe(true)
    expect(Number.isFinite(v[40])).toBe(true)
  })

  it('con la articulación de otro plano no da nada', () => {
    const rodillaGomets = articulacionesSagitales('der')[1]!
    const v = anguloFiltradoPorFrame(trayectorias(new Set()), rodillaGomets, { plano: 'frontal', ve: 'delante' }, tabla, { corteHz: 6 })
    expect([...v].every(Number.isNaN)).toBe(true)
  })
})
