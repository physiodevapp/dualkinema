import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import { mediana, textoInforme, type DatosInforme } from './informe'
import { idPose } from './puntos'

const m = (calidad: number): Muestra2D => ({ t: 0, x: 1, y: 1, calidad, editadoManual: false })
const comparacion = (media: number) => ({ n: 270, media, de: 2.5, ecm: 4.1, ecmSinSesgo: 2.49, rangoA: { min: 1, max: 95 }, rangoB: { min: -2, max: 90 }, correlacion: 0.991 })

const base: DatosInforme = {
  deteccion: { modelo: 'full', libreria: '@mediapipe/tasks-vision 1.1.0', delegado: 'GPU', fecha: '2026-10-28T10:00:00.000Z', conPersona: 270, intercambiados: 5, dudosos: 0 },
  ancho: 1080,
  alto: 1920,
  duracion: 10,
  total: 300,
  fps: 30,
  lado: 'der',
  trayectorias: new Map([
    [idPose('cadera', 'der'), Array.from({ length: 300 }, (_, i) => (i < 270 ? m(0.9) : undefined))],
    [idPose('rodilla', 'der'), Array.from({ length: 300 }, () => m(0.4))],
  ]),
  articulacion: 'Rodilla derecha',
  positivo: 'flexión',
  comparacion: { directa: comparacion(7.54), relativa: comparacion(0.21), ceroA: -7.8, ceroB: 0.6 },
  tramo: { desde: 0, hasta: 2 },
  corteHz: 6,
}

describe('mediana', () => {
  it('impar, par y sin valores', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
    expect(mediana([NaN])).toBeNaN()
  })
})

describe('textoInforme', () => {
  it('lleva la detección, la visibilidad de la pierna de la cámara y la comparación a pelo y relativa al cero', () => {
    const t = textoInforme(base)
    expect(t).toContain('@mediapipe/tasks-vision 1.1.0, Pose Landmarker full · GPU · persona en 270 de 300 frames (90 %) · piernas corregidas en 5 frames, dudosas en 0')
    expect(t).toContain('1080×1920, 10,0 s, 300 frames, 30,0 fps medianos; filtro 6,0 Hz')
    expect(t).toContain('cadera 0,90 (90 % ≥ 0,5)')
    expect(t).toContain('rodilla 0,40 (0 % ≥ 0,5)')
    expect(t).toContain('Rodilla derecha (flexión +), sin marcadores − gomets:')
    expect(t).toContain('diferencia media 7,5° · DE 2,5°')
    expect(t).toContain('tramo 0,000–2,000 s; cero gomets -7,8°, sin marcadores 0,6°')
    expect(t).toContain('diferencia media 0,2°')
    expect(t).toContain('correlación 0,99')
  })

  it('sin cero lo dice, y sin frames en común también', () => {
    expect(textoInforme({ ...base, tramo: null, comparacion: { ...base.comparacion, relativa: null } })).toContain('sin cero de referencia')
    expect(textoInforme({ ...base, comparacion: { directa: null, relativa: null, ceroA: NaN, ceroB: NaN } })).toContain('muy pocos frames con las dos')
  })

  it('no lleva el nombre del archivo', () => {
    expect(textoInforme(base)).not.toMatch(/\.mp4|\.webm/)
  })
})
