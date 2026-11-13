import { describe, expect, it } from 'vitest'
import type { MuestraAngulo } from '../articulaciones/calculo'
import { idPose } from '../pose/puntos'
import type { Muestra3D, Trayectorias3D } from '../tresd/puntos3d'
import { MARCHA_VACIA } from './guardado'
import { angulosEnFase, eventosVerdad, MARCHA_DEFECTO, puntosMarcha, type OpcionesMarcha } from './sintetico'
import { analizarMarcha3D, senales3D } from './tresd'

const FPS = 30
const AJUSTES = { corteHz: 6 }
const ANCHO = 0.2 // m entre los dos lados

/**
 * La persona sintética que anda, en 3D: su plano sagital girado `rumbo` grados (hacia donde anda) y cada lado a ±10 cm de
 * lo que da `puntosMarcha` (derecha hacia la derecha de la persona). Metros, z arriba.
 */
function andar3D(o: OpcionesMarcha, rumbo: number, duracion = 8, ruido = 0): Trayectorias3D {
  const th = (rumbo * Math.PI) / 180
  const delante = { x: Math.cos(th), y: Math.sin(th) }
  const izquierda = { x: -Math.sin(th), y: Math.cos(th) }
  let s = 11
  const azar = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s / 4294967296 - 0.5) * 2 * ruido
  }
  const tiempos: number[] = []
  for (let k = 0; k < duracion * FPS; k++) tiempos.push(k / FPS)
  const series = new Map<string, Muestra3D[]>()
  const poner = (id: string, i: number, p: { x: number; y: number }, lado: 1 | -1) => {
    if (!series.has(id)) series.set(id, [])
    const l = (lado * ANCHO) / 2
    series.get(id)![i] = { t: tiempos[i]!, x: 1 + delante.x * p.x + izquierda.x * l + azar(), y: 2 + delante.y * p.x + izquierda.y * l + azar(), z: p.y + azar(), calidad: 0.9, editadoManual: false, error: 0 }
  }
  tiempos.forEach((t, i) => {
    const q = puntosMarcha(t, o)
    for (const [lado, signo] of [['der', -1], ['izq', 1]] as const) {
      for (const parte of ['cadera', 'rodilla', 'tobillo', 'talon', 'punta'] as const) poner(idPose(parte, lado), i, q[lado][parte], signo)
      poner(idPose('hombro', lado), i, q.hombro, signo)
    }
  })
  return { tiempos, series, enMetros: true }
}

/** La rodilla derecha de verdad (para la curva). */
const rodillaDer = (tr: Trayectorias3D, o: OpcionesMarcha): MuestraAngulo[] => tr.tiempos.map((t) => ({ t, valor: angulosEnFase(o.fase0 + t / o.zancada).rodilla, interpolado: false }))

describe('marcha en 3D (los dos pies)', () => {
  it.each([0, 37, -120])('anda con rumbo %d°: los eventos de los dos pies a menos de 5 ms de la verdad', (rumbo) => {
    const tr = andar3D(MARCHA_DEFECTO, rumbo)
    const verdad = eventosVerdad(0, 8)
    const a = analizarMarcha3D({ tr, fs: FPS, ajustes: AJUSTES, guardado: MARCHA_VACIA, serieAngulo: rodillaDer(tr, MARCHA_DEFECTO), cero: null, ladoArticulacion: 'der' })
    for (const l of ['der', 'izq'] as const) {
      const centrales = verdad.filter((v) => v.lado === l && v.t > 0.5 && v.t < 7.5)
      for (const v of centrales) expect(a.eventos.some((e) => e.lado === l && e.tipo === v.tipo && Math.abs(e.t - v.t) < 0.005), `${v.tipo} ${l} en ${v.t}`).toBe(true)
    }
  })

  it('parámetros de los dos pies por el suelo: zancada, paso, apoyo, doble apoyo, longitud, velocidad y anchura', () => {
    const tr = andar3D(MARCHA_DEFECTO, 25)
    const a = analizarMarcha3D({ tr, fs: FPS, ajustes: AJUSTES, guardado: MARCHA_VACIA, serieAngulo: rodillaDer(tr, MARCHA_DEFECTO), cero: null, ladoArticulacion: 'der' })
    const p = a.parametros!
    // La verdad: el doble apoyo de la persona sintética, de sus eventos.
    const v = eventosVerdad(0, 8)
    const ev = (lado: string, tipo: string) => v.filter((e) => e.lado === lado && e.tipo === tipo).map((e) => e.t)
    const hs = ev('der', 'contacto')[1]!
    const to = ev('der', 'despegue').find((t) => t > hs)!
    const toI = ev('izq', 'despegue').find((t) => t > hs)!
    const hsI = ev('izq', 'contacto').find((t) => t > hs)!
    const doble = (100 * (toI - hs + (to - hsI))) / MARCHA_DEFECTO.zancada
    expect(p.enCinta).toBe(false)
    for (const l of ['der', 'izq'] as const) {
      const pie = p.porPie[l]!
      expect(pie.ciclos).toBeGreaterThanOrEqual(5)
      expect(pie.zancada.media).toBeCloseTo(1.1, 2)
      expect(pie.paso.media).toBeCloseTo(0.55, 2)
      expect(pie.longitud!.media).toBeCloseTo(1.32, 2)
    }
    expect(p.cadencia).toBeCloseTo(120 / 1.1, 0)
    // Cuatro eventos, cada uno a menos de 5 ms: el doble apoyo, a un 2 % de la zancada como mucho.
    expect(Math.abs(p.dobleApoyo.media - doble)).toBeLessThan(2)
    expect(p.velocidad!).toBeCloseTo(1.2, 2)
    expect(p.anchura!.media).toBeCloseTo(ANCHO, 2)
    // La curva, del pie de la articulación.
    expect(a.ladoCurva).toBe('der')
    expect(a.media!.media).toHaveLength(101)
    expect(Math.max(...a.media!.media)).toBeGreaterThan(55)
  })

  it('en cinta: se dice y no hay longitud ni velocidad; sin escala, tampoco anchura; con ruido, a menos de un frame', () => {
    const o = { ...MARCHA_DEFECTO, velocidad: 0 }
    const tr = andar3D(o, 90, 8, 0.005)
    const a = analizarMarcha3D({ tr, fs: FPS, ajustes: AJUSTES, guardado: MARCHA_VACIA, serieAngulo: rodillaDer(tr, o), cero: null, ladoArticulacion: null })
    expect(a.parametros!.enCinta).toBe(true)
    expect(a.parametros!.velocidad).toBeNull()
    expect(a.parametros!.porPie.der!.longitud).toBeNull()
    expect(a.parametros!.anchura!.media).toBeCloseTo(ANCHO, 1)
    const verdad = eventosVerdad(0, 8, o)
    for (const e of a.eventos.filter((x) => x.t > 0.5 && x.t < 7.5)) {
      expect(Math.min(...verdad.filter((v) => v.lado === e.lado && v.tipo === e.tipo).map((v) => Math.abs(v.t - e.t)))).toBeLessThan(1 / FPS)
    }
    const sinEscala = analizarMarcha3D({ tr: { ...tr, enMetros: false }, fs: FPS, ajustes: AJUSTES, guardado: MARCHA_VACIA, serieAngulo: [], cero: null, ladoArticulacion: null })
    expect(sinEscala.parametros!.anchura).toBeNull()
    expect(sinEscala.media).toBeNull()
  })

  it('las señales no inventan: sin una cadera, sin señal', () => {
    const tr = andar3D(MARCHA_DEFECTO, 0, 1)
    const sinCadera = { ...tr, series: new Map([...tr.series].filter(([id]) => id !== idPose('cadera', 'izq'))) }
    expect(senales3D(sinCadera, 'der').talon.every((m) => m === undefined)).toBe(true)
  })
})
