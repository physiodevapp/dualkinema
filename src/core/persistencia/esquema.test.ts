import { describe, expect, it } from 'vitest'
import { modeloRodilla3 } from '../articulaciones/catalogo'
import type { Muestra2D } from '../modelo/tipos'
import { modeloPose } from '../pose/catalogo'
import { ESQUEMA_ACTUAL, leerCabecera, leerDatos, migrar, prepararGuardado, type EntradaGuardado, type VistaCabecera } from './esquema'
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
  it('lo interpolado guarda y recupera lo que sustituyó (perdido, dudoso o nada)', () => {
    const interp = (t: number, sustituida: Muestra2D | null): Muestra2D => ({ ...m(t, 7, 8), interpolado: true, sustituida })
    const serie: (Muestra2D | undefined)[] = [
      m(0, 1, 2),
      interp(0.0333, m(0.0333, NaN, NaN, 0)),
      interp(0.0667, m(0.0667, 3.25, 4.5, 0.42)),
      interp(0.1, null),
      { ...m(0.1333, 9, 9), interpolado: true }, // rellenado sin apuntarlo (de antes)
      undefined,
    ]
    const g = comoIDB(empaquetarTrayectoria(serie))
    expect(errorTrayectoria(g, FRAMES)).toBeNull()
    const vuelta = desempaquetarTrayectoria(g, FRAMES)
    expect(vuelta).toEqual(serie)
    expect(vuelta[3]!.sustituida).toBeNull()
    expect(vuelta[4]).not.toHaveProperty('sustituida')
    expect(vuelta[0]).not.toHaveProperty('sustituida')
  })

  it('una trayectoria sin lo sustituido (guardada antes) es válida; a medias o en un frame no interpolado, no', () => {
    const { sustituidaX, sustituidaY, sustituidaCalidad, ...antigua } = empaquetarTrayectoria(serieCadera)
    expect(errorTrayectoria(antigua, FRAMES)).toBeNull()
    expect(desempaquetarTrayectoria(antigua, FRAMES)).toEqual(serieCadera)
    expect(errorTrayectoria({ ...antigua, sustituidaX, sustituidaY }, FRAMES)).toMatch(/a medias/)
    const c = Float64Array.from(sustituidaCalidad!)
    c[1] = 0.5
    expect(errorTrayectoria({ ...antigua, sustituidaX, sustituidaY, sustituidaCalidad: c }, FRAMES)).toMatch(/no interpolado/)
  })

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
    expect(errorTrayectoria({ ...g, interpolado: Uint8Array.from([1, 0, 0, 0]) }, FRAMES)).toMatch(/a mano e interpolado/)
  })
})

describe('esquema de la sesión', () => {
  it('cabecera de la versión actual con los huecos de los pasos siguientes vacíos', () => {
    const { cabecera } = prepararGuardado(entrada())
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL)
    expect(ESQUEMA_ACTUAL).toBe(5)
    expect(cabecera.filtro).toBeNull()
    // Sin decir nada: la vista sigue todos los marcadores del modelo, sin sincronizar, y es la referencia.
    expect(cabecera.vistas[0]).toMatchObject({ desfase: 0, calibracion: null, ceros: {}, marcadores: [cadera, rodilla, tobillo], sincronia: { metodo: 'ninguna' }, deteccion: null })
    expect(cabecera.referencia).toBe('v1')
    expect(cabecera.claves).toEqual(['1000:6:200'])
    // Frames 0, 1, 2 y 4 tienen alguna muestra; solo el 0 tiene marcas a mano.
    expect(cabecera.resumen).toEqual({ frames: FRAMES, conDatos: 4, aMano: 1, interpolados: 0 })
  })

  it('guarda el ajuste del filtro, y lo guardado sin él (null) sigue valiendo', () => {
    const { cabecera } = prepararGuardado({ ...entrada(), filtro: { corteHz: 8.5 } })
    const r = leerCabecera(structuredClone(cabecera))
    expect(r.ok && r.valor.filtro).toEqual({ corteHz: 8.5 })
    const sinFiltro = leerCabecera(structuredClone(prepararGuardado(entrada()).cabecera))
    expect(sinFiltro.ok && sinFiltro.valor.filtro).toBeNull()
  })

  it('guarda el tramo estático del cero de referencia sin cambiar de versión; lo guardado sin él ({}) sigue valiendo', () => {
    const art = modelo.articulaciones[0]!.id
    const e = entrada()
    const conCero = { ...e, vistas: [{ ...e.vistas[0]!, ceros: { [art]: { desde: 0, hasta: 2 } } }] }
    const { cabecera } = prepararGuardado(conCero)
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL) // rellenar el hueco no sube la versión
    const r = leerCabecera(comoIDB(cabecera))
    expect(r.ok && r.valor.vistas[0]!.ceros).toEqual({ [art]: { desde: 0, hasta: 2 } })
    // Una sesión guardada antes de este paso (ceros vacío) se lee igual.
    const antes = leerCabecera(comoIDB(prepararGuardado(entrada()).cabecera))
    expect(antes.ok && antes.valor.vistas[0]!.ceros).toEqual({})
    // Tramos no válidos o de una articulación ajena al modelo se rechazan.
    const vista = cabecera.vistas[0]!
    const casos: [unknown, RegExp][] = [
      [{ [art]: { desde: 2, hasta: 1 } }, /ceros/],
      [{ [art]: { desde: 0, hasta: Number.NaN } }, /ceros/],
      [{ [art]: { desde: 0, hasta: 1, media: 4 } }, /ceros/],
      [{ [art]: 5 }, /ceros/],
      [{ otra: { desde: 0, hasta: 1 } }, /no está en el modelo: otra/],
    ]
    for (const [ceros, motivo] of casos) {
      const l = leerCabecera({ ...cabecera, vistas: [{ ...vista, ceros }] })
      expect(l.ok, String(motivo)).toBe(false)
      if (!l.ok) expect(l.detalle).toMatch(motivo)
    }
  })

  it('guarda la escala de la vista sin cambiar de versión; lo guardado sin ella (null) sigue valiendo', () => {
    const e = entrada()
    const calibracion = { tipo: 'escala-plano', objeto: 'palo', a: { x: 10, y: 20 }, b: { x: 10, y: 452 }, longitudM: 1, t: 0.25 } as const
    const { cabecera } = prepararGuardado({ ...e, vistas: [{ ...e.vistas[0]!, calibracion }] })
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL) // rellenar el hueco no sube la versión
    const r = leerCabecera(comoIDB(cabecera))
    expect(r.ok && r.valor.vistas[0]!.calibracion).toEqual(calibracion)
    const antes = leerCabecera(comoIDB(prepararGuardado(entrada()).cabecera))
    expect(antes.ok && antes.valor.vistas[0]!.calibracion).toBeNull()
    const vista = cabecera.vistas[0]!
    for (const mala of [{ ...calibracion, longitudM: -1 }, { ...calibracion, b: calibracion.a }, { ...calibracion, objeto: 'metro' }, 5]) {
      const l = leerCabecera({ ...cabecera, vistas: [{ ...vista, calibracion: mala }] })
      expect(l.ok).toBe(false)
      if (!l.ok) expect(l.detalle).toMatch(/calibración no válida/)
    }
    // Entre dos marcadores: tienen que estar en el modelo.
    const [m1, m2] = modelo.marcadores.map((m) => m.id)
    const entre = { tipo: 'escala-plano', objeto: 'marcadores', a: { x: 0, y: 0 }, b: { x: 0, y: 160 }, longitudM: 0.4, t: 0, entre: { desde: m1!, hasta: m2!, tramo: { desde: 0, hasta: 1 }, muestras: 30, dispersionPx: 0.3 } }
    const bien = leerCabecera(comoIDB({ ...cabecera, vistas: [{ ...vista, calibracion: entre }] }))
    expect(bien.ok && bien.valor.vistas[0]!.calibracion?.entre?.hasta).toBe(m2)
    const ajena = leerCabecera({ ...cabecera, vistas: [{ ...vista, calibracion: { ...entre, entre: { ...entre.entre, hasta: 'otro' } } }] })
    expect(ajena.ok).toBe(false)
    if (!ajena.ok) expect(ajena.detalle).toMatch(/no están en el modelo/)
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
      [{ ...cabecera, filtro: { corteHz: 20 } }, /filtro/],
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

describe('interpolado (esquema 2)', () => {
  it('ida y vuelta de muestras interpoladas, contadas en el resumen', () => {
    const serie = [...serieCadera]
    serie[3] = { t: 0.1, x: 102.5, y: 51.9, calidad: 1, editadoManual: false, interpolado: true }
    const e = entrada()
    const { cabecera, datos } = prepararGuardado({ ...e, vistas: [{ ...e.vistas[0]!, series: new Map([[cadera, serie]]) }] })
    expect(cabecera.resumen).toMatchObject({ conDatos: 5, interpolados: 1 })
    const d = leerDatos(comoIDB(datos), cabecera)
    expect(d.ok).toBe(true)
    if (d.ok) expect(desempaquetarTrayectoria(d.valor.trayectorias.v1![cadera]!, FRAMES)).toEqual(serie)
  })

  it('una sesión guardada con el esquema 1 se lee igual, sin nada interpolado', () => {
    // Registro tal como lo escribía la versión 1 (paso 2 de la fase 2): sin lo interpolado ni lo del esquema 3.
    const { cabecera, datos } = prepararGuardado(entrada())
    const resumenV1: Record<string, unknown> = { ...cabecera.resumen }
    delete resumenV1.interpolados
    const cabeceraV1 = { ...comoV2(cabecera), esquema: 1, resumen: resumenV1 }
    const trayectoriasV1 = Object.fromEntries(
      Object.entries(datos.trayectorias.v1!).map(([id, g]) => {
        const resto: Record<string, unknown> = { ...g }
        delete resto.interpolado
        return [id, resto]
      }),
    )
    const datosV1 = { esquema: 1, id: datos.id, trayectorias: { v1: trayectoriasV1 } }

    const c = leerCabecera(comoIDB(cabeceraV1))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    const d = leerDatos(comoIDB(datosV1), c.valor)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.valor.esquema).toBe(ESQUEMA_ACTUAL)
    expect(desempaquetarTrayectoria(d.valor.trayectorias.v1![cadera]!, FRAMES)).toEqual(serieCadera)
    expect(Array.from(d.valor.trayectorias.v1![cadera]!.interpolado)).toEqual([0, 0, 0, 0])
  })
})

/** La cabecera tal como la escribía el esquema 2: sin marcadores ni sincronía por vista ni vista de referencia. */
function comoV2(cabecera: ReturnType<typeof prepararGuardado>['cabecera']): Record<string, unknown> {
  const { referencia, ...resto } = cabecera
  void referencia
  return {
    ...resto,
    esquema: 2,
    vistas: cabecera.vistas.map(({ marcadores, sincronia, ...v }) => {
      void marcadores
      void sincronia
      return v
    }),
  }
}

describe('varias vistas (esquema 3)', () => {
  // Una vista lateral (los 3 gomets de la rodilla) y una frontal con sus propios marcadores (inventados para la prueba).
  const frontal = ['muslo_izq', 'rodilla_centro_izq', 'tobillo_centro_izq']
  const modelo2 = { ...modelo, marcadores: [...modelo.marcadores, ...frontal.map((id) => ({ id, nombre: id }))] }
  const huellaFrontal: HuellaArchivo = { nombre: 'frontal.mp4', tamano: 2000, duracion: 0.24, frames: FRAMES }

  function entradaDos(): EntradaGuardado {
    const e = entrada()
    return {
      ...e,
      modelo: modelo2,
      vistas: [
        { ...e.vistas[0]!, marcadores: [cadera, rodilla, tobillo] },
        {
          id: 'v2',
          huella: huellaFrontal,
          orientacion: { plano: 'frontal', ve: 'delante' },
          series: new Map([[frontal[0]!, [m(0, 300, 40, 1, true), undefined, undefined, undefined, undefined, undefined]]]),
          desfase: -0.7333,
          marcadores: frontal,
          sincronia: { metodo: 'audio', audio: { calidad: 7.5, desfase: -0.7 } },
        },
      ],
    }
  }

  it('ida y vuelta de una sesión con dos vistas: desfase, marcadores y sincronía de cada una', () => {
    const { cabecera, datos } = prepararGuardado(entradaDos())
    expect(cabecera.referencia).toBe('v1')
    expect(cabecera.vistas[1]).toMatchObject({ desfase: -0.7333, marcadores: frontal, sincronia: { metodo: 'audio', audio: { calidad: 7.5, desfase: -0.7 } } })
    expect(cabecera.claves).toEqual(['1000:6:200', '2000:6:240'])
    const c = leerCabecera(comoIDB(cabecera))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    const d = leerDatos(comoIDB(datos), c.valor)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    // Cada vista guarda las trayectorias de todos los marcadores del modelo; las que no sigue, vacías.
    expect(desempaquetarTrayectoria(d.valor.trayectorias.v2![frontal[0]!]!, FRAMES)[0]).toEqual(m(0, 300, 40, 1, true))
    expect(desempaquetarTrayectoria(d.valor.trayectorias.v2![cadera]!, FRAMES).every((x) => x === undefined)).toBe(true)
  })

  it('la sincronía por audio guarda también el evento visual que la comprueba', () => {
    const e = entradaDos()
    const sincronia = { metodo: 'audio', audio: { calidad: 7.5, desfase: 0.48 }, evento: { referencia: 1, vista: 0.48 } } as const
    const { cabecera } = prepararGuardado({ ...e, vistas: [e.vistas[0]!, { ...e.vistas[1]!, desfase: 0.48, sincronia }] })
    const c = leerCabecera(comoIDB(cabecera))
    expect(c.ok && c.valor.vistas[1]!.sincronia).toEqual(sincronia)
  })

  it('la referencia puede ser otra vista, y entonces es la que tiene desfase 0', () => {
    const e = entradaDos()
    const vistas = [{ ...e.vistas[0]!, desfase: 0.7333 }, { ...e.vistas[1]!, desfase: 0 }]
    const { cabecera } = prepararGuardado({ ...e, vistas, referencia: 'v2' })
    expect(leerCabecera(comoIDB(cabecera))).toEqual({ ok: true, valor: cabecera })
  })

  it('una sesión guardada con el esquema 2 se lee igual que una nueva de una vista', () => {
    const { cabecera, datos } = prepararGuardado(entrada())
    const c = leerCabecera(comoIDB(comoV2(cabecera)))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    const d = leerDatos(comoIDB({ ...datos, esquema: 2 }), c.valor)
    expect(d).toEqual({ ok: true, valor: comoIDB(datos) })
  })

  it('una sesión guardada con el esquema 3 se lee igual (la migración 3 → 4 no cambia nada)', () => {
    const { cabecera, datos } = prepararGuardado(entradaDos())
    const c = leerCabecera(comoIDB({ ...cabecera, esquema: 3 }))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    expect(leerDatos(comoIDB({ ...datos, esquema: 3 }), c.valor)).toEqual({ ok: true, valor: comoIDB(datos) })
  })

  it('guarda y lee la sincronía por pitido y por reloj de una grabación doble (esquema 4)', () => {
    const e = entradaDos()
    for (const sincronia of [
      { metodo: 'pitido', pitido: { desfase: 0.009, calidad: 5.47, distancia: 1.98 } },
      { metodo: 'reloj', reloj: { desfase: -0.0006, cota: 0.0381 } },
      { metodo: 'pitido', pitido: { desfase: 0.009, calidad: 5.47, distancia: 1.98 }, evento: { referencia: 2.5, vista: 2.49 } },
    ] as const) {
      const vistas = [e.vistas[0]!, { ...e.vistas[1]!, desfase: 0.009, sincronia }]
      const { cabecera } = prepararGuardado({ ...e, vistas })
      expect(leerCabecera(comoIDB(cabecera))).toEqual({ ok: true, valor: cabecera })
    }
  })

  it('una sesión guardada con el esquema 4 se lee igual, sin detección sin marcadores (migración 4 → 5)', () => {
    const { cabecera, datos } = prepararGuardado(entradaDos())
    const comoV4 = { ...cabecera, esquema: 4, vistas: cabecera.vistas.map((v) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'deteccion'))) }
    const c = leerCabecera(comoIDB(comoV4))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    expect(leerDatos(comoIDB({ ...datos, esquema: 4 }), c.valor)).toEqual({ ok: true, valor: comoIDB(datos) })
  })

  it('guarda y lee la detección sin marcadores y un modelo con ángulos absolutos (esquema 5)', () => {
    const e = entrada()
    const pose = modeloPose({ plano: 'sagital', mira: 'derecha' }, 'der')
    const conPose = { marcadores: [...e.modelo.marcadores, ...pose.marcadores], articulaciones: [...e.modelo.articulaciones, ...pose.articulaciones] }
    const deteccion = { modelo: 'full', libreria: '@mediapipe/tasks-vision 1.1.0', delegado: 'GPU', fecha: '2026-10-28T10:00:00.000Z', conPersona: 6, intercambiados: 2, dudosos: 0 } as const
    const { cabecera, datos } = prepararGuardado({ ...e, modelo: conPose, vistas: [{ ...e.vistas[0]!, deteccion }] })
    expect(conPose.articulaciones.some((a) => 'referencia' in a.proximal)).toBe(true)
    const c = leerCabecera(comoIDB(cabecera))
    expect(c).toEqual({ ok: true, valor: cabecera })
    if (!c.ok) return
    expect(c.valor.vistas[0]!.deteccion).toEqual(deteccion)
    expect(leerDatos(comoIDB(datos), c.valor).ok).toBe(true)
  })

  it('guarda la articulación que se mira, opcional y sin cambiar de versión', () => {
    const e = entrada()
    const art = modelo.articulaciones[0]!.id
    const { cabecera } = prepararGuardado({ ...e, vistas: [{ ...e.vistas[0]!, articulacion: art }] })
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL)
    const c = leerCabecera(comoIDB(cabecera))
    expect(c.ok && c.valor.vistas[0]!.articulacion).toBe(art)
    expect('articulacion' in prepararGuardado(e).cabecera.vistas[0]!).toBe(false)
    const ajena = leerCabecera({ ...cabecera, vistas: [{ ...cabecera.vistas[0]!, articulacion: 'codo_sagital_der' }] })
    expect(ajena.ok).toBe(false)
    if (!ajena.ok) expect(ajena.detalle).toMatch(/articulación que no está en el modelo: codo_sagital_der/)
    const rara = leerCabecera({ ...cabecera, vistas: [{ ...cabecera.vistas[0]!, articulacion: 3 }] })
    expect(!rara.ok && rara.detalle).toMatch(/articulación elegida no válida/)
  })

  it('rechaza una detección o una referencia que no cuadran', () => {
    const e = entrada()
    const { cabecera } = prepararGuardado(e)
    const v = cabecera.vistas[0]!
    const tronco = modeloPose({ plano: 'sagital', mira: 'derecha' }, 'der').articulaciones.find((a) => 'referencia' in a.proximal)!
    const conArticulacion = (a: unknown) => ({ ...cabecera, modelo: { ...cabecera.modelo, articulaciones: [...cabecera.modelo.articulaciones, a] } })
    const casos: [Record<string, unknown>, RegExp][] = [
      [{ ...cabecera, vistas: [{ ...v, deteccion: { modelo: 'enorme' } }] }, /detección sin marcadores no válida/],
      [{ ...cabecera, vistas: [{ ...v, deteccion: undefined }] }, /detección sin marcadores no válida/],
      [conArticulacion({ ...tronco, proximal: { referencia: 'diagonal' } }), /articulación no válida/],
      [conArticulacion({ ...tronco, proximal: { referencia: 'vertical', desde: cadera } }), /articulación no válida/],
    ]
    for (const [registro, motivo] of casos) {
      const r = leerCabecera(registro)
      expect(r.ok, String(motivo)).toBe(false)
      if (!r.ok) expect(r.detalle).toMatch(motivo)
    }
  })

  it('rechaza marcadores, sincronía o referencia que no cuadran', () => {
    const { cabecera } = prepararGuardado(entradaDos())
    const [v1, v2] = cabecera.vistas as readonly VistaCabecera[]
    const conV2 = (cambio: Record<string, unknown>) => ({ ...cabecera, vistas: [v1, { ...v2, ...cambio }] })
    const casos: [Record<string, unknown>, RegExp][] = [
      [conV2({ marcadores: [] }), /marcadores no válidos/],
      [conV2({ marcadores: [frontal[0], frontal[0]] }), /marcadores repetidos/],
      [conV2({ marcadores: ['pie'] }), /marcador que no está en el modelo: pie/],
      [conV2({ sincronia: { metodo: 'gps' } }), /sincronía no válida/],
      [conV2({ sincronia: { metodo: 'reloj' } }), /reloj no válida/],
      [conV2({ sincronia: { metodo: 'reloj', reloj: { desfase: 0.01, cota: -1 } } }), /reloj no válida/],
      [conV2({ sincronia: { metodo: 'pitido', pitido: { desfase: 0.009, calidad: 5 } } }), /pitido no válida/],
      [conV2({ sincronia: undefined }), /sincronía no válida/],
      [conV2({ sincronia: { metodo: 'audio', audio: { calidad: Number.NaN, desfase: 0 } } }), /audio no válida/],
      [conV2({ sincronia: { metodo: 'evento', evento: { referencia: 1 } } }), /evento de sincronía/],
      [conV2({ desfase: Number.POSITIVE_INFINITY }), /desfase no válido/],
      [{ ...cabecera, referencia: 'v3' }, /referencia no es ninguna/],
      [{ ...cabecera, referencia: 'v2' }, /referencia tiene desfase/],
    ]
    for (const [registro, motivo] of casos) {
      const r = leerCabecera(registro)
      expect(r.ok, String(motivo)).toBe(false)
      if (!r.ok) expect(r.detalle).toMatch(motivo)
    }
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
