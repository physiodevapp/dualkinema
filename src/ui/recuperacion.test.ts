import { describe, expect, it } from 'vitest'
import type { CabeceraSesion, VistaCabecera } from '../core/persistencia/esquema'
import { vistaDeHuella, vistasQueFaltan, type Abiertos } from './recuperacion'

const vista = (id: string, nombre: string, tamano: number): VistaCabecera => ({
  id,
  huella: { nombre, tamano, duracion: 4, frames: 120 },
  orientacion: { plano: 'sagital', mira: 'derecha' },
  desfase: 0,
  calibracion: null,
  ceros: {},
  marcadores: [],
  deteccion: null,
  sincronia: { metodo: 'ninguna' },
})

const cabecera = { vistas: [vista('v1', 'lateral.mp4', 1000), vista('v2', 'frontal.mp4', 2000)] } as unknown as CabeceraSesion
const abierto = {} as Abiertos[string]

describe('recuperar una sesión de dos vistas', () => {
  it('reconoce cada vídeo por su huella, también con otro nombre', () => {
    expect(vistaDeHuella(cabecera, { nombre: 'frontal.mp4', tamano: 2000, duracion: 4, frames: 120 }, {})?.id).toBe('v2')
    expect(vistaDeHuella(cabecera, { nombre: '1000012345.mp4', tamano: 1000, duracion: 4, frames: 120 }, {})?.id).toBe('v1')
  })
  it('un vídeo que no es de la sesión no corresponde a ninguna vista', () => {
    expect(vistaDeHuella(cabecera, { nombre: 'otro.mp4', tamano: 3000, duracion: 4, frames: 120 }, {})).toBeUndefined()
  })
  it('una vista que ya tiene su vídeo no se asigna otra vez', () => {
    expect(vistaDeHuella(cabecera, { nombre: 'lateral.mp4', tamano: 1000, duracion: 4, frames: 120 }, { v1: abierto })).toBeUndefined()
  })
  it('dice qué vistas faltan', () => {
    expect(vistasQueFaltan(cabecera, {}).map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(vistasQueFaltan(cabecera, { v1: abierto }).map((v) => v.id)).toEqual(['v2'])
    expect(vistasQueFaltan(cabecera, { v1: abierto, v2: abierto })).toEqual([])
  })
})
