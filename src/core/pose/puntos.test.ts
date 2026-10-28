import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import {
  conPuntosMedios,
  esPuntoMedio,
  fusionarDeteccion,
  idMedio,
  idPose,
  LINEAS_ESQUELETO,
  PUNTOS_POSE,
  puntoMedio,
  puntosDeLandmarks,
  trayectoriasPose,
  VALORES_POR_PUNTO,
  type FramePose,
} from './puntos'

describe('puntos del modelo', () => {
  it('son 12, con el índice de MediaPipe de cada parte y lado de la persona', () => {
    expect(PUNTOS_POSE).toHaveLength(12)
    const indice = (id: string) => PUNTOS_POSE.find((p) => p.id === id)!.indice
    expect(indice('pose_hombro_izq')).toBe(11)
    expect(indice('pose_cadera_der')).toBe(24)
    expect(indice('pose_rodilla_izq')).toBe(25)
    expect(indice('pose_rodilla_der')).toBe(26)
    expect(indice('pose_tobillo_der')).toBe(28)
    expect(indice('pose_punta_izq')).toBe(31)
    expect(new Set(PUNTOS_POSE.map((p) => p.id)).size).toBe(12)
  })

  it('las líneas del esqueleto unen puntos que existen', () => {
    const ids = new Set(PUNTOS_POSE.map((p) => p.id))
    for (const [a, b] of LINEAS_ESQUELETO) {
      expect(ids.has(a)).toBe(true)
      expect(ids.has(b)).toBe(true)
    }
  })

  it('pasan de la salida normalizada del modelo a px del vídeo, con la visibilidad entre 0 y 1', () => {
    const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 0.5, visibility: 0.9 }))
    landmarks[25] = { x: 0.25, y: 0.75, visibility: 1.2 }
    landmarks[26] = { x: 0.5, y: 0.1, visibility: NaN }
    const r = puntosDeLandmarks(landmarks, 1920, 1080)
    expect(r).toHaveLength(12 * VALORES_POR_PUNTO)
    const k = (id: string) => PUNTOS_POSE.findIndex((p) => p.id === id) * VALORES_POR_PUNTO
    expect(r.slice(k('pose_rodilla_izq'), k('pose_rodilla_izq') + 3)).toEqual([480, 810, 1])
    expect(r.slice(k('pose_rodilla_der'), k('pose_rodilla_der') + 3)).toEqual([960, 108, 0])
    expect(r[k('pose_hombro_izq')]).toBeCloseTo(0.11 * 1920)
  })

  it('un punto que falta en la salida queda perdido', () => {
    const r = puntosDeLandmarks([], 100, 100)
    expect(r[0]).toBeNaN()
    expect(r[2]).toBe(0)
  })

  it('trayectorias: calidad = visibilidad; sin persona, perdido (NaN, calidad 0); sin procesar, sin muestra', () => {
    const puntos = PUNTOS_POSE.flatMap((_, k) => [10 + k, 20 + k, 0.3])
    const frames: FramePose[] = [
      { indice: 0, t: 0, puntos },
      { indice: 1, t: 1 / 30, puntos: null },
    ]
    const tr = trayectoriasPose(frames, 3)
    const rodilla = tr.get(idPose('rodilla', 'izq'))!
    const k = PUNTOS_POSE.findIndex((p) => p.id === 'pose_rodilla_izq')
    expect(rodilla[0]).toEqual({ t: 0, x: 10 + k, y: 20 + k, calidad: 0.3, editadoManual: false })
    expect(rodilla[1]!.calidad).toBe(0)
    expect(rodilla[1]!.x).toBeNaN()
    expect(rodilla[2]).toBeUndefined()
  })
})

const m = (x: number, y: number, calidad = 0.9, extra: Partial<Muestra2D> = {}): Muestra2D => ({ t: 0, x, y, calidad, editadoManual: false, ...extra })

describe('puntos medios', () => {
  it('la media de los dos lados, con la peor calidad', () => {
    expect(puntoMedio(m(100, 200, 0.9), m(300, 260, 0.6))).toEqual({ t: 0, x: 200, y: 230, calidad: 0.6, editadoManual: false })
  })

  it('interpolado si lo es alguno de los dos', () => {
    expect(puntoMedio(m(0, 0), m(10, 0, 0.9, { interpolado: true }))!.interpolado).toBe(true)
  })

  it('perdido si alguno lo está, y sin muestra si falta alguno: nunca se inventa', () => {
    const p = puntoMedio(m(0, 0), m(NaN, NaN, 0))!
    expect(p.x).toBeNaN()
    expect(p.calidad).toBe(0)
    expect(puntoMedio(m(0, 0), undefined)).toBeUndefined()
  })

  it('se añaden a las trayectorias frame a frame, sin tocar las demás', () => {
    const izq = [m(100, 0), m(110, 0), undefined]
    const der = [m(200, 0), m(220, 10), m(0, 0)]
    const series = new Map([
      [idPose('cadera', 'izq'), izq],
      [idPose('cadera', 'der'), der],
    ])
    const r = conPuntosMedios(series)
    expect(r.get(idPose('cadera', 'izq'))).toBe(izq)
    expect(r.get(idMedio('cadera'))!.map((p) => p && [p.x, p.y])).toEqual([[150, 0], [165, 5], undefined])
    expect(r.get(idMedio('hombro'))).toEqual([])
    expect(esPuntoMedio(idMedio('hombro'))).toBe(true)
    expect(esPuntoMedio(idPose('hombro', 'der'))).toBe(false)
  })
})

describe('fusionarDeteccion', () => {
  it('lo marcado a mano se queda; lo demás, lo detectado; donde no se detectó, lo de antes', () => {
    const id = idPose('rodilla', 'der')
    const manual = m(5, 5, 1, { editadoManual: true })
    const previas = new Map([
      [id, [m(1, 1), manual, m(3, 3), undefined]],
      ['epicondilo_femoral_der', [m(9, 9)]],
    ])
    const nuevas = new Map([[id, [m(10, 10), m(20, 20), undefined, m(40, 40)]]])
    const r = fusionarDeteccion(previas, nuevas)
    expect(r.get(id)!.map((p) => p?.x)).toEqual([10, 5, 3, 40])
    expect(r.get(id)![1]).toBe(manual)
    expect(r.get('epicondilo_femoral_der')!.map((p) => p?.x)).toEqual([9])
    // Copias: lo de entrada no cambia.
    expect(previas.get(id)![0]!.x).toBe(1)
  })

  it('una serie nueva entra entera', () => {
    const r = fusionarDeteccion(new Map(), new Map([[idPose('talon', 'izq'), [m(1, 2)]]]))
    expect(r.get(idPose('talon', 'izq'))![0]!.x).toBe(1)
  })
})
