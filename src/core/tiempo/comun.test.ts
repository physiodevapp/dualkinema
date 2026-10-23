import { describe, expect, it } from 'vitest'
import { aComun, aVideo, frameMasCercanoEnComun, frameVisibleEnComun, rangoComun, rangoSesion, tiempoComunDeFrame } from './comun'
import { crearTablaFrames } from './tablaFrames'

/** n frames a `fps` desde `inicio` (s de vídeo). */
const tabla = (n: number, fps: number, inicio = 0) => crearTablaFrames(Array.from({ length: n }, (_, i) => inicio + i / fps))

// Referencia: 30 fps, 3 s (90 frames). La otra vista: 25 fps, 3 s (75 frames), que empezó a grabar 0,733 s después:
// su t = 0 es el instante común 0,733 (desfase +0,733).
const ref = { tabla: tabla(90, 30), desfase: 0 }
const otra = { tabla: tabla(75, 25), desfase: 0.733 }

describe('tiempo común', () => {
  it('ida y vuelta entre el tiempo del vídeo y el común', () => {
    expect(aComun(1, 0.733)).toBeCloseTo(1.733, 12)
    expect(aVideo(1.733, 0.733)).toBeCloseTo(1, 12)
    expect(aVideo(aComun(2.5, -0.4), -0.4)).toBeCloseTo(2.5, 12)
  })

  it('el rango de cada vista va de su primer frame a que acaba de verse el último', () => {
    expect(rangoComun(ref)).toEqual({ desde: 0, hasta: expect.closeTo(3, 9) })
    const r = rangoComun(otra)!
    expect(r.desde).toBeCloseTo(0.733, 12)
    expect(r.hasta).toBeCloseTo(0.733 + 74 / 25 + 1 / 25, 9) // 3,733
    expect(rangoComun({ tabla: crearTablaFrames([]), desfase: 0 })).toBeNull()
  })

  it('el rango de la sesión es la unión (D10)', () => {
    const r = rangoSesion([ref, otra])!
    expect(r.desde).toBe(0)
    expect(r.hasta).toBeCloseTo(3.733, 9)
    // Con desfase negativo la otra empieza antes que la referencia.
    const antes = rangoSesion([ref, { ...otra, desfase: -0.5 }])!
    expect(antes.desde).toBeCloseTo(-0.5, 12)
    expect(antes.hasta).toBeCloseTo(3, 9)
    expect(rangoSesion([])).toBeNull()
  })

  it('en un instante común, cada vista muestra su frame por tiempo (fps distintos), no por índice', () => {
    // t común = 1,0: referencia, frame 30 (1,0 s); la otra, t de vídeo 0,267 → frame 6 (0,24 s; el 7 empieza en 0,28).
    expect(frameVisibleEnComun(ref, 1)).toBe(30)
    expect(frameVisibleEnComun(otra, 1)).toBe(6)
    // t común = 2,0: la otra en 1,267 s → frame 31 (1,24 s).
    expect(frameVisibleEnComun(otra, 2)).toBe(31)
    // El frame i de la otra empieza en el instante común t_i + desfase.
    expect(tiempoComunDeFrame(otra, 31)).toBeCloseTo(1.24 + 0.733, 12)
    // Ida y vuelta: 1,24 + 0,733 − 0,733 da 1,2399999…; sin el margen de redondeo caería en el frame 30.
    expect(aVideo(tiempoComunDeFrame(otra, 31), otra.desfase)).toBeLessThan(1.24)
    expect(frameVisibleEnComun(otra, tiempoComunDeFrame(otra, 31))).toBe(31)
    for (let i = 0; i < 75; i++) expect(frameVisibleEnComun(otra, tiempoComunDeFrame(otra, i)), `frame ${i}`).toBe(i)
    for (let i = 0; i < 90; i++) expect(frameVisibleEnComun(ref, tiempoComunDeFrame(ref, i)), `frame ${i}`).toBe(i)
  })

  it('fuera de un vídeo, esa vista no tiene frame', () => {
    expect(frameVisibleEnComun(otra, 0.5)).toBeNull() // aún no ha empezado
    expect(frameVisibleEnComun(otra, 0.733)).toBe(0) // justo en su primer frame
    expect(frameVisibleEnComun(otra, 3.7)).toBe(74) // el último frame se ve hasta 3,733
    expect(frameVisibleEnComun(otra, 3.74)).toBeNull() // ya ha acabado
    expect(frameVisibleEnComun(ref, 3.5)).toBeNull()
    expect(frameVisibleEnComun(ref, -0.01)).toBeNull()
  })

  it('al tocar la gráfica en el tiempo común, el frame más cercano de la vista', () => {
    // t común 1,0 → 0,267 s de vídeo en la otra: entre el 6 (0,24) y el 7 (0,28), más cerca del 7.
    expect(frameMasCercanoEnComun(otra, 1)).toBe(7)
    expect(frameMasCercanoEnComun(otra, 0.2)).toBeNull()
  })
})
