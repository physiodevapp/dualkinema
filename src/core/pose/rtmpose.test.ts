import { describe, expect, it } from 'vitest'
import { idPose, PUNTOS_POSE } from './puntos'
import {
  ALTO_POSE,
  ANCHO_POSE,
  cajasDelDetector,
  decodificarSimcc,
  elegirPersona,
  escalaDetector,
  INDICE_HALPE26,
  iou,
  PUNTOS_HALPE26,
  puntosDeHalpe26,
  recorteDeCaja,
  tensorDePixeles,
  type Caja,
} from './rtmpose'

const caja = (x1: number, y1: number, x2: number, y2: number, puntuacion = 0.9): Caja => ({ x1, y1, x2, y2, puntuacion })

describe('detector de personas', () => {
  it('la escala del detector deja la imagen entera en 320 sin deformar', () => {
    expect(escalaDetector(1920, 1080)).toBeCloseTo(320 / 1920, 12)
    expect(escalaDetector(1080, 1920)).toBeCloseTo(320 / 1920, 12)
  })

  it('las cajas vuelven a px de la imagen y se descartan las de poca puntuación o vacías', () => {
    const dets = [10, 20, 110, 220, 0.8, 0, 0, 5, 5, 0.1, 5, 5, 5, 50, 0.9]
    expect(cajasDelDetector(dets, 3, 0.5)).toEqual([caja(20, 40, 220, 440, 0.8)])
  })

  it('iou: igual 1, sin solape 0, la mitad 1/3', () => {
    expect(iou(caja(0, 0, 10, 10), caja(0, 0, 10, 10))).toBe(1)
    expect(iou(caja(0, 0, 10, 10), caja(20, 0, 30, 10))).toBe(0)
    expect(iou(caja(0, 0, 10, 10), caja(5, 0, 15, 10))).toBeCloseTo(1 / 3, 12)
  })

  it('elige la persona más grande la primera vez y después la que sigue en su sitio, aunque otra sea mayor', () => {
    const cerca = caja(0, 0, 100, 300)
    const lejos = caja(500, 100, 550, 250)
    expect(elegirPersona([lejos, cerca], null)).toBe(cerca)
    const otraMayor = caja(300, 0, 500, 400)
    expect(elegirPersona([otraMayor, caja(5, 0, 105, 300)], cerca)).toEqual(caja(5, 0, 105, 300))
    // Si ya no se solapa con ninguna (salió y entró por otro sitio), la más grande.
    expect(elegirPersona([lejos, otraMayor], cerca)).toBe(otraMayor)
    expect(elegirPersona([], cerca)).toBeNull()
  })
})

describe('recorte y decodificación de RTMPose', () => {
  it('la caja se agranda un 25 % y se ajusta a 3:4, centrada', () => {
    // 100 × 300 → 125 × 375 → de ancho, 375 · 3/4 = 281,25.
    const r = recorteDeCaja(caja(100, 100, 200, 400))
    expect(r.ax * ANCHO_POSE).toBeCloseTo(281.25, 9)
    expect(r.ay * ALTO_POSE).toBeCloseTo(375, 9)
    expect(r.x0 + (ANCHO_POSE / 2) * r.ax).toBeCloseTo(150, 9)
    expect(r.y0 + (ALTO_POSE / 2) * r.ay).toBeCloseTo(250, 9)
    // Una caja ancha crece en alto.
    const a = recorteDeCaja(caja(0, 0, 400, 100))
    expect(a.ay * ALTO_POSE).toBeCloseTo((400 * 1.25 * 4) / 3, 9)
  })

  it('el máximo de cada eje da la posición (en medios píxeles) y la puntuación es el menor de los dos máximos', () => {
    const nx = ANCHO_POSE * 2
    const ny = ALTO_POSE * 2
    const sx = new Float32Array(2 * nx)
    const sy = new Float32Array(2 * ny)
    sx[100] = 0.9 // punto 0: x = 50 px de la entrada
    sy[300] = 0.7 // y = 150
    sx[nx + 0] = 0.2 // punto 1: x = 0
    sy[ny + ny - 1] = 0.8 // y = 255,5
    const r = { x0: 10, y0: 20, ax: 2, ay: 3 }
    const kp = decodificarSimcc(sx, sy, 2, r)
    expect(kp.slice(0, 3)).toEqual([10 + 50 * 2, 20 + 150 * 3, expect.closeTo(0.7, 6)])
    expect(kp.slice(3, 6)).toEqual([10, 20 + 255.5 * 3, expect.closeTo(0.2, 6)])
  })
})

describe('de Halpe26 a los 12 puntos de la app', () => {
  it('cada punto sale de su índice de Halpe26, con la calidad limitada a 0–1', () => {
    const kp: number[] = []
    for (let i = 0; i < PUNTOS_HALPE26; i++) kp.push(i * 10, i * 10 + 1, i === 13 ? 1.3 : i / 100)
    const r = puntosDeHalpe26(kp)
    expect(r.length).toBe(PUNTOS_POSE.length * 3)
    PUNTOS_POSE.forEach((p, k) => {
      const i = INDICE_HALPE26[p.parte][p.lado]
      expect(r.slice(k * 3, k * 3 + 2)).toEqual([i * 10, i * 10 + 1])
    })
    const k = PUNTOS_POSE.findIndex((p) => p.id === idPose('rodilla', 'izq'))
    expect(r[k * 3 + 2]).toBe(1)
    // Dedo gordo como punta; talones 24 y 25.
    expect(INDICE_HALPE26.punta).toEqual({ izq: 20, der: 21 })
    expect(INDICE_HALPE26.talon).toEqual({ izq: 24, der: 25 })
  })
})

describe('tensor de los píxeles', () => {
  it('CHW normalizado, en RGB o en BGR', () => {
    // 2 píxeles: (10, 20, 30) y (40, 50, 60).
    const rgba = [10, 20, 30, 255, 40, 50, 60, 255]
    expect([...tensorDePixeles(rgba, 2, 1, [0, 0, 0], [1, 1, 1], false)]).toEqual([10, 40, 20, 50, 30, 60])
    expect([...tensorDePixeles(rgba, 2, 1, [0, 0, 0], [1, 1, 1], true)]).toEqual([30, 60, 20, 50, 10, 40])
    expect([...tensorDePixeles(rgba, 1, 1, [10, 10, 10], [2, 5, 10], false)]).toEqual([0, 2, 2])
  })
})
