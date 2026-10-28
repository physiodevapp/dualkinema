import { describe, expect, it } from 'vitest'
import { serieAngular } from '../articulaciones/calculo'
import { articulacionesSagitales, marcadores, type Lado } from '../articulaciones/catalogo'
import { aImagen, direccion, frame } from '../articulaciones/poses'
import type { OrientacionVista } from '../geometria/canonico'
import { idPose, LINEAS_ESQUELETO, PUNTOS_POSE, puntosDeLandmarks, rodillaSagitalPose, trayectoriasPose, VALORES_POR_PUNTO, type FramePose } from './puntos'

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

describe('rodilla de perfil sin marcadores', () => {
  const LADOS: Lado[] = ['der', 'izq']
  const VISTAS: OrientacionVista[] = [
    { plano: 'sagital', mira: 'derecha' },
    { plano: 'sagital', mira: 'izquierda' },
  ]
  // Muslo y pierna en el marco canónico (x delante, y arriba) con la flexión dada.
  const pierna = (flexion: number) => {
    const cadera = { x: 0, y: 0 }
    const d1 = direccion(10) // muslo algo adelantado
    const rodilla = { x: d1.x * 1.3, y: d1.y * 1.3 }
    const d2 = direccion(10 - flexion)
    return { cadera, rodilla, tobillo: { x: rodilla.x + d2.x * 1.2, y: rodilla.y + d2.y * 1.2 } }
  }
  describe.each(LADOS)('lado %s', (l) => {
    it.each(VISTAS)('mirando a la $mira: da lo mismo que la de los gomets con los mismos puntos', (o) => {
      const defPose = rodillaSagitalPose(l)
      const defGomets = articulacionesSagitales(l).find((a) => a.id === `rodilla_sagital_${l}`)!
      const m = marcadores(l)
      for (const flexion of [0, 45, 90, 120, -10]) {
        const p = pierna(flexion)
        const img = (q: { x: number; y: number }) => aImagen(q, o)
        const pose = serieAngular(defPose, frame(0, { [idPose('cadera', l)]: img(p.cadera), [idPose('rodilla', l)]: img(p.rodilla), [idPose('tobillo', l)]: img(p.tobillo) }), o)
        const gomets = serieAngular(defGomets, frame(0, { [m.cadera]: img(p.cadera), [m.rodilla]: img(p.rodilla), [m.tobillo]: img(p.tobillo) }), o)
        expect(pose[0]!.valor).toBeCloseTo(flexion, 6)
        expect(pose[0]!.valor).toBeCloseTo(gomets[0]!.valor, 9)
      }
    })
  })
})
