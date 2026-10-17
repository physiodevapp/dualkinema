import { describe, expect, it } from 'vitest'
import { modeloRodilla3 } from '../articulaciones/catalogo'
import type { Muestra2D } from '../modelo/tipos'
import { ESQUEMA_ACTUAL, leerCabecera, leerDatos, migrar, prepararGuardado, type EntradaGuardado } from './esquema'
import type { HuellaArchivo } from './huella'
import { desempaquetarTrayectoria, empaquetarTrayectoria, errorTrayectoria } from './trayectorias'

const FRAMES = 6
const huella: HuellaArchivo = { nombre: 'sentadilla.mp4', tamano: 1000, duracion: 0.2, frames: FRAMES }
const modelo = modeloRodilla3('izq')
const [cadera, rodilla, tobillo] = modelo.marcadores.map((m) => m.id) as [string, string, string]

const m = (t: number, x: number, y: number, calidad = 1, editadoManual = false): Muestra2D => ({ t, x, y, calidad, editadoManual })

/** Serie con todos los casos: a mano, seguido, perdido (NaN) y frames sin muestra. */
const serieCadera: (Muestra2D | undefined)[] = [
  m(0, 100.123456789, 50.5, 1, true),
  m(0.033366, 101.25, 51.75, 0.8734512),
  m(0.066733, Number.NaN, Number.NaN, 0),
  undefined,
  m(0.133466, 104, 52, 0.31),
  undefined,
]

function entrada(): EntradaGuardado {
  return {
    id: 's1',
    nombre: 'sentadilla.mp4',
    creada: '2026-10-17T10:00:00.000Z',
    ahora: '2026-10-17T10:05:00.000Z',
    modelo,
    vistas: [
      {
        id: 'v1',
        huella,
        orientacion: { plano: 'sagital', mira: 'derecha' },
        series: new Map([
          [cadera, serieCadera],
          [rodilla, [m(0, 120, 80, 1, true), undefined, undefined, undefined, undefined, undefined]],
        ]),
      },
    ],
  }
}

// Existe en Node y en los navegadores; el núcleo se compila sin sus tipos (tsconfig.core.json).
declare const structuredClone: <T>(v: T) => T
/** Lo que devuelve IndexedDB: una copia estructurada (los arrays tipados siguen siéndolo). */
const comoIDB = <T,>(v: T): T => structuredClone(v)

describe('trayectorias guardadas', () => {
  it('ida y vuelta exacta: a mano, seguido, perdido y sin muestra', () => {
    const vuelta = desempaquetarTrayectoria(comoIDB(empaquetarTrayectoria(serieCadera)), FRAMES)
    expect(vuelta).toHaveLength(FRAMES)
    expect(vuelta).toEqual(serieCadera)
    expect(vuelta[3]).toBeUndefined() // nunca seguido ≠ perdido
    expect(Number.isNaN(vuelta[2]!.x)).toBe(true)
    expect(vuelta[2]!.calidad).toBe(0)
  })

  it('solo guarda los frames con muestra', () => {
    expect(Array.from(empaquetarTrayectoria(serieCadera).indices)).toEqual([0, 1, 2, 4])
  })

  it('rechaza lo que no cuadra', () => {
    const g = empaquetarTrayectoria(serieCadera)
    expect(errorTrayectoria(g, FRAMES)).toBeNull()
    expect(errorTrayectoria(g, 4)).toMatch(/fuera del vídeo/)
    expect(errorTrayectoria({ ...g, indices: Int32Array.from([0, 2, 1, 4]) }, FRAMES)).toMatch(/desordenados/)
    expect(errorTrayectoria({ ...g, x: Float64Array.from([1, 2]) }, FRAMES)).toMatch(/4 valores/)
    expect(errorTrayectoria({ ...g, calidad: Float64Array.from([1, 2, 0, 1]) }, FRAMES)).toMatch(/calidad/)
    expect(errorTrayectoria({ ...g, y: Float64Array.from([1, 2, 3, 4]) }, FRAMES)).toMatch(/a medias/)
    expect(errorTrayectoria({ ...g, t: Array.from(g.t) }, FRAMES)).toMatch(/Float64Array/)
  })
})

describe('esquema de la sesión', () => {
  it('cabecera de la versión actual con los huecos de los pasos siguientes vacíos', () => {
    const { cabecera } = prepararGuardado(entrada())
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL)
    expect(ESQUEMA_ACTUAL).toBe(1)
    expect(cabecera.filtro).toBeNull()
    expect(cabecera.vistas[0]).toMatchObject({ desfase: 0, calibracion: null, ceros: {} })
    expect(cabecera.claves).toEqual(['1000:6:200'])
    // Frames 0, 1, 2 y 4 tienen alguna muestra; solo el 0 tiene marcas a mano.
    expect(cabecera.resumen).toEqual({ frames: FRAMES, conDatos: 4, aMano: 1 })
  })

  it('guarda el modelo de marcadores completo, con la definición de la articulación', () => {
    expect(prepararGuardado(entrada()).cabecera.modelo).toEqual(modelo)
  })

  it('ida y vuelta por IndexedDB: se lee lo mismo que se guardó', () => {
    const { cabecera, datos } = prepararGuardado(entrada())
    const c = leerCabecera(comoIDB(cabecera))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    const d = leerDatos(comoIDB(datos), c.valor)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(desempaquetarTrayectoria(d.valor.trayectorias.v1![cadera]!, FRAMES)).toEqual(serieCadera)
    // Un marcador sin nada seguido se guarda vacío, no se omite.
    expect(d.valor.trayectorias.v1![tobillo]!.indices).toHaveLength(0)
  })

  it('un registro de una versión más nueva no se abre', () => {
    const { cabecera } = prepararGuardado(entrada())
    const r = leerCabecera({ ...cabecera, esquema: ESQUEMA_ACTUAL + 1 })
    expect(r).toMatchObject({ ok: false, motivo: 'nueva' })
  })

  it('rechaza cabeceras dañadas con un motivo legible', () => {
    const { cabecera } = prepararGuardado(entrada())
    const casos: [Record<string, unknown>, RegExp][] = [
      [{ ...cabecera, esquema: undefined }, /versión/],
      [{ ...cabecera, creada: 'ayer' }, /fechas/],
      [{ ...cabecera, vistas: [] }, /sin vistas/],
      [{ ...cabecera, vistas: [{ ...cabecera.vistas[0], orientacion: { plano: 'sagital', mira: 'arriba' } }] }, /orientación/],
      [{ ...cabecera, vistas: [{ ...cabecera.vistas[0], huella: { ...huella, frames: 0 } }] }, /huella/],
      [{ ...cabecera, claves: ['otra'] }, /claves/],
      [{ ...cabecera, filtro: 6 }, /filtro/],
      [{ ...cabecera, modelo: { ...modelo, articulaciones: [{ ...modelo.articulaciones[0], signo: 2 }] } }, /articulación/],
      [{ ...cabecera, modelo: { ...modelo, articulaciones: [{ ...modelo.articulaciones[0], distal: { desde: rodilla, hasta: 'pie' } }] } }, /articulación/],
    ]
    for (const [registro, motivo] of casos) {
      const r = leerCabecera(registro)
      expect(r.ok, String(motivo)).toBe(false)
      if (!r.ok) expect(r.detalle).toMatch(motivo)
    }
  })

  it('rechaza trayectorias de otra sesión o incompletas', () => {
    const { cabecera, datos } = prepararGuardado(entrada())
    expect(leerDatos({ ...datos, id: 'otra' }, cabecera)).toMatchObject({ ok: false, detalle: /otra sesión/ })
    const sinTobillo = { ...datos, trayectorias: { v1: { ...datos.trayectorias.v1, [tobillo]: undefined } } }
    expect(leerDatos(sinTobillo, cabecera)).toMatchObject({ ok: false, detalle: new RegExp(tobillo) })
  })
})

describe('migraciones', () => {
  it('aplica la cadena en orden hasta la versión actual', () => {
    const cadena = {
      1: (r: Record<string, unknown>) => ({ ...r, filtro: null }),
      2: (r: Record<string, unknown>) => ({ ...r, ceros: {} }),
    }
    expect(migrar({ esquema: 1, id: 'x' }, cadena, 3)).toEqual({ ok: true, valor: { esquema: 3, id: 'x', filtro: null, ceros: {} } })
    expect(migrar({ esquema: 2, id: 'x' }, cadena, 3)).toEqual({ ok: true, valor: { esquema: 3, id: 'x', ceros: {} } })
  })

  it('sin migración para un paso, no adivina', () => {
    expect(migrar({ esquema: 1 }, {}, 2)).toMatchObject({ ok: false, motivo: 'invalida', detalle: /del esquema 1 al 2/ })
  })
})
