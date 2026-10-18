import { describe, expect, it } from 'vitest'
import { velocidadMarcador } from '../filtros/derivadas'
import { filtrarTrayectoria } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import {
  crearEscala,
  DISTANCIA_MIN_PX,
  distanciaPx,
  esCalibracion,
  ERROR_MEDIA_MARCADOR_PX,
  incertidumbreEscala,
  incertidumbreRelativa,
  INCERTIDUMBRE_AVISO,
  medirEntreMarcadores,
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

describe('escala entre dos marcadores', () => {
  const m = (t: number, x: number, y: number, calidad = 1): Muestra2D => ({ t, x, y, calidad, editadoManual: false })
  // Rodilla en (300, 100) y tobillo en (300, 260) de pie (160 px), con ruido alterno de ±0,5 px en y.
  const n = 90
  const rodilla = Array.from({ length: n }, (_, i) => m(i / 30, 300, 100 + (i % 2 ? 0.5 : -0.5)))
  const tobillo = Array.from({ length: n }, (_, i) => m(i / 30, 300, 260 + (i % 2 ? -0.5 : 0.5)))

  it('posición media de cada marcador en el tramo y dispersión de la distancia', () => {
    const r = medirEntreMarcadores(rodilla, tobillo, { desde: 0, hasta: 59 / 30 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.muestras).toBe(60)
    expect(r.a.x).toBeCloseTo(300, 12)
    expect(r.a.y).toBeCloseTo(100, 12)
    expect(r.b.y).toBeCloseTo(260, 12)
    // La distancia es 161 o 159 px, por igual: desviación típica 1 px.
    expect(r.dispersionPx).toBeCloseTo(1, 12)
    // 40 cm entre ellos → 2,5 mm por píxel.
    const e = crearEscala({ objeto: 'marcadores', a: r.a, b: r.b, longitudM: 0.4, t: 0, entre: { desde: 'r', hasta: 't', tramo: { desde: 0, hasta: 59 / 30 }, muestras: r.muestras, dispersionPx: r.dispersionPx } })
    expect(e.ok && metrosPorPx(e.valor)).toBeCloseTo(0.0025, 12)
    // Error de la media: 1/√60 = 0,13 px → se queda en el mínimo de 0,25 px; sobre 160 px.
    expect(e.ok && incertidumbreEscala(e.valor)).toBeCloseTo(ERROR_MEDIA_MARCADOR_PX / 160, 12)
    // Con pocos frames y mucha dispersión manda dispersión / √n.
    expect(incertidumbreEscala({ a: r.a, b: r.b, entre: { desde: 'r', hasta: 't', tramo: { desde: 0, hasta: 0 }, muestras: 4, dispersionPx: 2 } })).toBeCloseTo(1 / 160, 12)
    // Sin `entre`, la de dos toques.
    expect(incertidumbreEscala({ a: r.a, b: r.b })).toBeCloseTo(Math.SQRT2 / 160, 12)
  })

  it('con el segmento girando en el tramo, la distancia es la del segmento, no la de las posiciones medias', () => {
    // Pierna de 120 px que gira 90° alrededor de la rodilla: las posiciones medias del tobillo
    // quedan a unos 108 px de la rodilla, pero el segmento mide 120 en todos los frames.
    const r0 = Array.from({ length: 31 }, (_, i) => m(i / 30, 300, 100))
    const t0 = r0.map((_, i) => m(i / 30, 300 + 120 * Math.sin((i / 30) * (Math.PI / 2)), 100 + 120 * Math.cos((i / 30) * (Math.PI / 2))))
    const r = medirEntreMarcadores(r0, t0, { desde: 0, hasta: 1 })
    expect(r.ok && distanciaPx(r.a, r.b)).toBeCloseTo(120, 9)
    expect(r.ok && r.dispersionPx).toBeLessThan(1e-9)
    // b, en la dirección media del tobillo (45°).
    expect(r.ok && Math.atan2(r.b.x - r.a.x, r.b.y - r.a.y)).toBeCloseTo(Math.PI / 4, 9)
  })

  it('un solo frame vale; ignora perdidos, poco fiables y lo de fuera del tramo', () => {
    const uno = medirEntreMarcadores(rodilla, tobillo, { desde: 1 / 30, hasta: 1 / 30 })
    expect(uno.ok && uno.muestras).toBe(1)
    expect(uno.ok && uno.dispersionPx).toBe(0)
    const a = [...rodilla]
    a[2] = m(2 / 30, NaN, NaN, 0)
    a[3] = m(3 / 30, 0, 0, 0.4)
    const b = [...tobillo]
    b[4] = undefined as unknown as Muestra2D
    const r = medirEntreMarcadores(a, b, { desde: 0, hasta: 9 / 30 })
    expect(r.ok && r.muestras).toBe(7)
    expect(r.ok && r.a.y).toBeCloseTo(100, 0)
    expect(medirEntreMarcadores(rodilla, tobillo, { desde: 10, hasta: 11 })).toMatchObject({ ok: false, motivo: /tramo/ })
  })

  it('crearEscala y esCalibracion exigen el origen con «marcadores» y solo con él', () => {
    const entre = { desde: 'r', hasta: 't', tramo: { desde: 0, hasta: 1 }, muestras: 30, dispersionPx: 0.2 }
    const base = { a: { x: 0, y: 0 }, b: { x: 0, y: 160 }, longitudM: 0.4, t: 0 }
    expect(crearEscala({ ...base, objeto: 'marcadores' }).ok).toBe(false)
    expect(crearEscala({ ...base, objeto: 'palo', entre }).ok).toBe(false)
    const r = crearEscala({ ...base, objeto: 'marcadores', entre })
    expect(r.ok && esCalibracion(r.valor)).toBe(true)
    const v = { tipo: 'escala-plano', objeto: 'marcadores', ...base, entre }
    for (const malo of [
      { ...v, entre: undefined },
      { ...v, entre: { ...entre, hasta: 'r' } },
      { ...v, entre: { ...entre, tramo: { desde: 2, hasta: 1 } } },
      { ...v, entre: { ...entre, muestras: 0 } },
      { ...v, entre: { ...entre, dispersionPx: -1 } },
    ]) {
      expect(esCalibracion(malo), JSON.stringify(malo)).toBe(false)
    }
  })
})
