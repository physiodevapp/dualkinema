import { describe, expect, it } from 'vitest'
import { ARTICULACIONES_3D } from '../tresd/angulos3d'
import type { Calibracion3D } from '../tresd/calibracion3d'
import type { Muestra3D, Trayectorias3D } from '../tresd/puntos3d'
import { construirCsv3D } from './csv3d'

const camara = { f: 1000, cx: 540, cy: 960, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] as [number, number, number] }
const cal: Calibracion3D = {
  fecha: '2026-11-08T10:00:00.000Z',
  vistas: ['v1', 'v2'],
  tramo: null,
  instantes: 100,
  correspondencias: 1000,
  camaras: [camara, camara],
  metrosPorUnidad: 4,
  escalaDe: 'estatura',
  suelo: 0,
  errorMediano: 1.23,
  errorPorPunto: {},
  fraccionBuenas: 1,
  sinVertical: [false, false],
  correccionVertical: [0, 0],
}
const m = (t: number, x: number, calidad = 0.9): Muestra3D => ({ t, x, y: 0.5, z: 1.25, calidad, editadoManual: false, error: 1 })
const tr: Trayectorias3D = { tiempos: [0, 0.5], series: new Map([['pose_cadera_izq', [m(0, 0.1), m(0.5, NaN, 0)]]]), enMetros: true }
const art = ARTICULACIONES_3D[0]!

describe('CSV del 3D', () => {
  it('una fila por frame, ángulos con su relativo y coordenadas en metros; sin valor, celda vacía', () => {
    const texto = construirCsv3D({ tr, calibracion: cal, angulos: [{ art, serie: [{ t: 0, valor: 12.5, interpolado: false }, { t: 0.5, valor: NaN, interpolado: false }], cero: 2.5 }], puntos: ['pose_cadera_izq'], corteHz: 6, sincronia: 'pitido' })
    const lineas = texto.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lineas[0]).toBe('# dualkinema;3D calibrado con la persona')
    expect(lineas.some((l) => l.startsWith(`# ${art.id};`) && l.includes('cero 2,50°'))).toBe(true)
    const i = lineas.findIndex((l) => l.startsWith('t_comun_s'))
    expect(lineas[i]).toBe(`t_comun_s;frame;${art.id}_grados;${art.id}_relativo_grados;pose_cadera_izq_x_m;pose_cadera_izq_y_m;pose_cadera_izq_z_m`)
    expect(lineas[i + 1]).toBe('0,000000;1;12,500;10,000;0,1000;0,5000;1,2500')
    expect(lineas[i + 2]).toBe('0,500000;2;;;;;')
  })

  it('sin escala, en unidades de la distancia entre los móviles; formato internacional', () => {
    const texto = construirCsv3D({ tr: { ...tr, enMetros: false }, calibracion: { ...cal, metrosPorUnidad: null, escalaDe: null }, angulos: [], puntos: ['pose_cadera_izq'], corteHz: 6, sincronia: 'reloj' }, 'internacional')
    expect(texto.startsWith('#')).toBe(true)
    expect(texto).toContain('t_comun_s,frame,pose_cadera_izq_x_u')
    expect(texto).toContain('sin escala')
  })
})
