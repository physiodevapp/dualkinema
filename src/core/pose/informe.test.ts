import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import { mediana, textoInforme, type DatosInforme } from './informe'
import { idPose } from './puntos'

const m = (calidad: number): Muestra2D => ({ t: 0, x: 1, y: 1, calidad, editadoManual: false })

const base: DatosInforme = {
  modelo: 'full',
  delegado: 'GPU',
  msCarga: 1500,
  msProceso: 20000,
  recuperados: 20,
  msAtras: 1500,
  procesados: 300,
  total: 300,
  ancho: 1080,
  alto: 1920,
  duracion: 10,
  fps: 30,
  lado: 'der',
  trayectorias: new Map([
    [idPose('cadera', 'der'), Array.from({ length: 300 }, (_, i) => (i < 270 ? m(0.9) : undefined))],
    [idPose('rodilla', 'der'), Array.from({ length: 300 }, () => m(0.4))],
  ]),
  conAngulo: 270,
  cambiosLado: 2,
  corteHz: 6,
  comparacion: { n: 270, media: -3.24, de: 2.5, ecm: 4.1, ecmSinSesgo: 2.49, rangoA: { min: 1, max: 95 }, rangoB: { min: -2, max: 90 }, correlacion: 0.991 },
  framesGomets: 280,
}

describe('mediana', () => {
  it('impar, par y sin valores', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
    expect(mediana([NaN])).toBeNaN()
  })
})

describe('textoInforme', () => {
  it('lleva tiempos, detección, visibilidad, cambios de lado y la comparación', () => {
    const t = textoInforme(base)
    expect(t).toContain('MediaPipe Pose Landmarker full · GPU')
    expect(t).toContain('1080×1920, 10,0 s, 300 frames, 30,0 fps')
    expect(t).toContain('proceso 20,0 s para 300 frames (15,0 frames/s, 2,00 × la duración); hacia atrás 1,5 s')
    expect(t).toContain('Persona detectada: 270 de 300 frames (90 %), 20 de ellos recuperados hacia atrás')
    expect(t).toContain('cadera 0,90 (90 % ≥ 0,5)')
    expect(t).toContain('rodilla 0,40 (0 % ≥ 0,5)')
    expect(t).toContain('Cambios de lado (izquierda ↔ derecha) detectados: 2')
    expect(t).toContain('diferencia media -3,2° · DE 2,5°')
    expect(t).toContain('correlación 0,99')
  })

  it('sin gomets lo dice, y si GPU no pudo, por qué', () => {
    const t = textoInforme({ ...base, comparacion: null, framesGomets: 0, delegado: 'CPU', avisoDelegado: 'GPU no disponible' })
    expect(t).toContain('· CPU (GPU no disponible)')
    expect(t).toContain('la vista no tiene gomets seguidos')
  })

  it('no lleva el nombre del archivo', () => {
    expect(textoInforme(base)).not.toMatch(/\.mp4|\.webm/)
  })
})
