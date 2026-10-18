import { describe, expect, it } from 'vitest'
import { velocidadMarcador } from '../filtros/derivadas'
import { filtrarTrayectoria } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import {
  crearEscala,
  DISTANCIA_MIN_PX,
  distanciaPx,
  esCalibracion,
  incertidumbreRelativa,
  INCERTIDUMBRE_AVISO,
  metrosDesdeCm,
  metrosPorPx,
  type EscalaPlano,
} from './escala'

const escala = (a: { x: number; y: number }, b: { x: number; y: number }, longitudM: number): EscalaPlano => {
  const r = crearEscala({ objeto: 'palo', a, b, longitudM, t: 0.5 })
  if (!r.ok) throw new Error(r.motivo)
  return r.valor
}

describe('escala en el plano: metros por píxel', () => {
  it('con valores conocidos (triángulo 3-4-5), en cualquier dirección', () => {
    // 300 × 400 px → 500 px; 1 m → 2 mm por píxel.
    expect(distanciaPx({ x: 10, y: 20 }, { x: 310, y: 420 })).toBe(500)
    expect(metrosPorPx(escala({ x: 10, y: 20 }, { x: 310, y: 420 }, 1))).toBeCloseTo(0.002, 12)
    // El orden de los extremos y la orientación del objeto no importan: los píxeles son cuadrados.
    expect(metrosPorPx(escala({ x: 310, y: 420 }, { x: 10, y: 20 }, 1))).toBeCloseTo(0.002, 12)
    expect(metrosPorPx(escala({ x: 0, y: 0 }, { x: 0, y: 432 }, 1))).toBeCloseTo(1 / 432, 12)
    expect(metrosPorPx(escala({ x: 0, y: 0 }, { x: 432, y: 0 }, 1))).toBeCloseTo(1 / 432, 12)
  })

  it('la velocidad de un marcador sale en m/s con su valor real', () => {
    // Un marcador que avanza 150 px/s en x; un palo de 1 m ocupa 400 px → 0,375 m/s.
    const m = metrosPorPx(escala({ x: 100, y: 300 }, { x: 500, y: 300 }, 1))
    const serie: Muestra2D[] = Array.from({ length: 60 }, (_, i) => ({ t: i / 30, x: 50 + 150 * (i / 30), y: 200, calidad: 1, editadoManual: false }))
    const v = velocidadMarcador(filtrarTrayectoria(serie, 30), m)
    expect(v.unidad).toBe('m/s')
    for (const i of [5, 30, 54]) expect(v.modulo[i]).toBeCloseTo(0.375, 3)
    expect(v.modulo[0]).toBeNaN()
  })
})

describe('escala: incertidumbre por el marcado', () => {
  it('√2 px sobre la distancia', () => {
    expect(incertidumbreRelativa({ x: 0, y: 0 }, { x: 400, y: 0 })).toBeCloseTo(Math.SQRT2 / 400, 12)
    expect(incertidumbreRelativa({ x: 0, y: 0 }, { x: 400, y: 0 }, 2)).toBeCloseTo((2 * Math.SQRT2) / 400, 12)
  })

  it('un palo de 1 m no avisa; una regla de 30 cm en el mismo vídeo sí', () => {
    // 400 px por metro: el palo ocupa 400 px y la regla 120.
    expect(incertidumbreRelativa({ x: 0, y: 0 }, { x: 0, y: 400 })).toBeLessThan(INCERTIDUMBRE_AVISO)
    expect(incertidumbreRelativa({ x: 0, y: 0 }, { x: 0, y: 120 })).toBeGreaterThan(INCERTIDUMBRE_AVISO)
  })
})

describe('escala: validación', () => {
  const base = { objeto: 'cinta' as const, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, longitudM: 1, t: 0 }

  it('rechaza extremos sin marcar, demasiado juntos y longitudes fuera de rango', () => {
    expect(crearEscala({ ...base, b: { x: NaN, y: 0 } })).toMatchObject({ ok: false, motivo: /extremos/ })
    expect(crearEscala({ ...base, b: { x: DISTANCIA_MIN_PX - 1, y: 0 } })).toMatchObject({ ok: false, motivo: /juntos/ })
    expect(crearEscala({ ...base, b: { x: DISTANCIA_MIN_PX, y: 0 } }).ok).toBe(true)
    for (const longitudM of [0, -1, 0.005, 25, NaN]) expect(crearEscala({ ...base, longitudM })).toMatchObject({ ok: false, motivo: /longitud/i })
  })

  it('esCalibracion acepta lo creado y rechaza lo mal formado', () => {
    const r = crearEscala(base)
    expect(r.ok && esCalibracion(r.valor)).toBe(true)
    const v = { tipo: 'escala-plano', ...base }
    expect(esCalibracion(v)).toBe(true)
    for (const malo of [
      null,
      5,
      { ...v, tipo: 'dlt' },
      { ...v, objeto: 'metro' },
      { ...v, a: { x: 0 } },
      { ...v, b: { x: 5, y: 0 } },
      { ...v, longitudM: 0 },
      { ...v, longitudM: '1' },
      { ...v, t: NaN },
    ]) {
      expect(esCalibracion(malo), JSON.stringify(malo)).toBe(false)
    }
  })

  it('lee centímetros con coma o punto decimal', () => {
    expect(metrosDesdeCm('100')).toBe(1)
    expect(metrosDesdeCm(' 30,5 ')).toBeCloseTo(0.305, 12)
    expect(metrosDesdeCm('30.5')).toBeCloseTo(0.305, 12)
    expect(metrosDesdeCm(',5')).toBeCloseTo(0.005, 12)
    for (const malo of ['', '0', 'abc', '1,2,3', '-5', '10 cm']) expect(metrosDesdeCm(malo), malo).toBeNull()
  })
})
