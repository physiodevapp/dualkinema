import { describe, expect, it } from 'vitest'
import { modeloRodilla3 } from '../articulaciones/catalogo'
import type { CeroReferencia } from '../articulaciones/cero'
import type { VelocidadMarcador } from '../filtros/derivadas'
import type { TrayectoriaFiltrada } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import { construirCsv } from './csv'
import { datosCsv, type EntradaDatosCsv } from './datos'

const BOM = String.fromCharCode(0xfeff)
const modelo = modeloRodilla3('izq')
const articulacion = modelo.articulaciones[0]!
const cadera = modelo.marcadores[0]!

// Tres frames a 10 fps; el del medio no tiene ángulo (NaN) ni posición.
const tiempos = [0, 0.1, 0.2]
const NaNs = () => new Float64Array(3).fill(NaN)
const crudoCadera: (Muestra2D | undefined)[] = [
  { t: 0, x: 100, y: 200, calidad: 1, editadoManual: false },
  undefined,
  { t: 0.2, x: 102, y: 204, calidad: 1, editadoManual: false },
]
const filtradoCadera: TrayectoriaFiltrada = {
  posiciones: [
    { t: 0, x: 100, y: 200, corto: false, interpolado: false, editadoManual: false },
    undefined,
    { t: 0.2, x: 102, y: 204, corto: false, interpolado: false, editadoManual: false },
  ],
  tramos: [],
  rejillas: [],
}
const velocidadCadera: VelocidadMarcador = { vx: NaNs(), vy: NaNs(), modulo: NaNs(), unidad: 'px/s' }
const cero: CeroReferencia = { tramo: { desde: 0, hasta: 0 }, media: 10, desviacion: 0, muestras: 1 }

const entrada = (extra: Partial<EntradaDatosCsv> = {}): EntradaDatosCsv => ({
  tiempos,
  marcadores: [cadera],
  crudo: new Map([[cadera.id, crudoCadera]]),
  filtrado: {
    porMarcador: new Map([[cadera.id, filtradoCadera]]),
    velocidades: new Map([[cadera.id, velocidadCadera]]),
    derivadas: { velocidad: Float64Array.of(NaN, NaN, 5), aceleracion: NaNs() },
    corte: 4,
  },
  articulacion,
  orientacion: { plano: 'sagital', mira: 'derecha' },
  anguloCrudo: Float64Array.of(10, NaN, 30),
  anguloFiltrado: Float64Array.of(11, NaN, 31),
  cero,
  calibracion: null,
  info: { nombre: 'sentadilla.mp4', ancho: 720, alto: 1280, rotacion: 90, duracion: 0.2 },
  est: { fpsMedio: 10, variable: false },
  corteHz: 6,
  exportado: '2026-10-18T10:00:00.000Z',
  ...extra,
})

describe('datosCsv', () => {
  it('relativo = filtrado − media del cero; sin valor sigue siendo NaN, nunca 0', () => {
    const a = datosCsv(entrada()).angulo!
    expect(a.id).toBe(articulacion.id)
    expect(a.relativo![0]).toBe(1) // 11 − 10
    expect(Number.isNaN(a.relativo![1]!)).toBe(true)
    expect(a.relativo![2]).toBe(21) // 31 − 10
    // Las series del ángulo salen tal cual, sin recalcular.
    expect(Array.from(a.crudo)).toEqual([10, NaN, 30])
    expect(Array.from(a.filtrado)).toEqual([11, NaN, 31])
    expect(a.velocidad[2]).toBe(5)
    expect(a.cero).toBe(cero)
  })

  it('sin cero no hay relativo; en otro plano no hay ángulo', () => {
    expect(datosCsv(entrada({ cero: null })).angulo!.relativo).toBeNull()
    expect(datosCsv(entrada({ orientacion: { plano: 'frontal', ve: 'delante' } })).angulo).toBeNull()
  })

  it('cada marcador lleva lo suyo (o vacío si no hay) y la cabecera, corte pedido y aplicado', () => {
    const d = datosCsv(entrada())
    expect(d.marcadores).toHaveLength(1)
    expect(d.marcadores[0]).toMatchObject({ id: cadera.id, nombre: cadera.nombre, crudo: crudoCadera, filtrado: filtradoCadera, velocidad: velocidadCadera })
    expect(datosCsv(entrada({ crudo: new Map() })).marcadores[0]!.crudo).toEqual([])
    expect(d.tiempos).toBe(tiempos)
    expect(d.meta).toEqual({
      archivo: 'sentadilla.mp4', ancho: 720, alto: 1280, rotacion: 90, duracionS: 0.2, fpsMedio: 10, fpsVariable: false,
      orientacion: { plano: 'sagital', mira: 'derecha' }, corteHz: 6, corteEfectivoHz: 4, exportado: '2026-10-18T10:00:00.000Z',
    })
  })

  it('en el CSV, el frame sin ángulo sale con las cinco celdas vacías y los demás con su valor', () => {
    const csv = construirCsv(datosCsv(entrada()), 'internacional')
    const filas = csv.replace(BOM, '').split('\r\n').filter((l) => l !== '' && !l.startsWith('#')).slice(1)
    expect(filas).toHaveLength(3)
    // Últimas cinco columnas: ángulo crudo, filtrado, relativo, velocidad y aceleración angulares.
    const angulo = (f: string) => f.split(',').slice(-5)
    expect(angulo(filas[0]!).slice(0, 3)).toEqual(['10.000', '11.000', '1.000'])
    expect(angulo(filas[1]!)).toEqual(['', '', '', '', ''])
    expect(angulo(filas[2]!).slice(0, 3)).toEqual(['30.000', '31.000', '21.000'])
    expect(Number(angulo(filas[2]!)[3])).toBe(5)
  })
})
