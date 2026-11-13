import { describe, expect, it } from 'vitest'
import type { ResultadoEsqueleto } from '../esqueleto/sesion'
import { N_GRADOS } from '../esqueleto/modelo'
import type { Muestra3D, Trayectorias3D } from '../tresd/puntos3d'
import { desempaquetarEsqueleto, empaquetarEsqueleto, huellaTrayectorias3D, leerAjustes3D } from './esqueleto'
import { leerCabecera, leerDatos, prepararGuardado } from './esquema'
import { modeloRodilla3 } from '../articulaciones/catalogo'

const q = (k: number) => Array.from({ length: N_GRADOS }, (_, g) => k * 0.01 + g * 0.1)

/** Un esqueleto de 4 frames con todos los casos: frames ajustados, uno sin ajuste, rotación vista o no, puntos vistos. */
const resultado: ResultadoEsqueleto = {
  tiempos: [0, 0.0333, 0.0667, 0.1],
  medidas: { anchoCaderas: 0.18, muslo: 0.42, pierna: 0.4, talon: { x: -0.05, z: -0.07 }, punta: { x: 0.15, z: -0.07 }, tronco: 0.5, anchoHombros: 0.36 },
  asimetria: { muslo: 0.01, pierna: 0.02, pie: 0 },
  posturas: [q(0), q(1), null, q(3)],
  errores: [1.5, 2.25, Number.NaN, 3],
  rotacionVisible: [
    { der: true, izq: false },
    { der: false, izq: true },
    { der: false, izq: false },
    { der: true, izq: true },
  ],
  vistas: [{ pose_cadera_der: 2, pose_rodilla_der: 1 }, { pose_cadera_der: 0 }, {}, { pose_rodilla_der: 2 }],
}

const muestra = (x: number, y: number, z: number, calidad = 1): Muestra3D => ({ t: 0, x, y, z, calidad, editadoManual: false, error: 0 })
const puntos = (): Trayectorias3D => ({
  tiempos: [0, 0.0333, 0.0667],
  enMetros: true,
  series: new Map([
    ['pose_cadera_der', [muestra(0.1, 0.2, 0.9), undefined, muestra(0.11, 0.2, 0.9)]],
    ['pose_rodilla_der', [muestra(0.1, 0.25, 0.5), muestra(0.1, 0.26, 0.5), muestra(Number.NaN, Number.NaN, Number.NaN, 0)]],
  ]),
})

describe('el esqueleto guardado', () => {
  it('vuelve tal cual: posturas (null el frame sin ajuste), errores, rotación vista, puntos vistos y medidas', () => {
    const g = empaquetarEsqueleto(resultado, 'abc')
    const d = desempaquetarEsqueleto({ ...g })!
    expect(d.huella).toBe('abc')
    expect(d.resultado).toEqual(resultado)
  })

  it('lo que no se puede leer se descarta (null), sin romper nada', () => {
    const g = empaquetarEsqueleto(resultado, 'abc')
    expect(desempaquetarEsqueleto(null)).toBeNull()
    expect(desempaquetarEsqueleto({ ...g, huella: 3 })).toBeNull()
    expect(desempaquetarEsqueleto({ ...g, posturas: new Float64Array(5) })).toBeNull()
    expect(desempaquetarEsqueleto({ ...g, errores: [1, 2, 3, 4] })).toBeNull()
    expect(desempaquetarEsqueleto({ ...g, medidas: { ...g.medidas, muslo: Number.NaN } })).toBeNull()
    expect(desempaquetarEsqueleto({ ...g, vistas: new Uint8Array(1) })).toBeNull()
  })
})

describe('la huella de los puntos 3D', () => {
  it('es la misma con los mismos puntos y cambia si cambia una coordenada, una calidad, un tiempo o la unidad', () => {
    const h = huellaTrayectorias3D(puntos())
    expect(huellaTrayectorias3D(puntos())).toBe(h)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
    const cambiar = (f: (p: Trayectorias3D) => Trayectorias3D) => huellaTrayectorias3D(f(puntos()))
    expect(cambiar((p) => ({ ...p, series: new Map([...p.series, ['pose_cadera_der', [muestra(0.1, 0.2, 0.901), undefined, muestra(0.11, 0.2, 0.9)]]]) }))).not.toBe(h)
    expect(cambiar((p) => ({ ...p, series: new Map([...p.series, ['pose_cadera_der', [muestra(0.1, 0.2, 0.9, 0.5), undefined, muestra(0.11, 0.2, 0.9)]]]) }))).not.toBe(h)
    expect(cambiar((p) => ({ ...p, series: new Map([...p.series, ['pose_cadera_der', [muestra(0.1, 0.2, 0.9), muestra(0.1, 0.2, 0.9), muestra(0.11, 0.2, 0.9)]]]) }))).not.toBe(h)
    expect(cambiar((p) => ({ ...p, tiempos: [0, 0.034, 0.0667] }))).not.toBe(h)
    expect(cambiar((p) => ({ ...p, enMetros: false }))).not.toBe(h)
    // Una diferencia por debajo de la millonésima (el redondeo) no la cambia.
    expect(cambiar((p) => ({ ...p, series: new Map([...p.series, ['pose_cadera_der', [muestra(0.1 + 1e-12, 0.2, 0.9), undefined, muestra(0.11, 0.2, 0.9)]]]) }))).toBe(h)
  })

  it('no depende del orden en que estén los puntos', () => {
    const p = puntos()
    expect(huellaTrayectorias3D({ ...p, series: new Map([...p.series].reverse()) })).toBe(huellaTrayectorias3D(p))
  })
})

describe('lo que se mira en el 3D', () => {
  it('se lee si es válido; si no, null', () => {
    const t = { fuente: 'esqueleto', articulacion: 'esq_rodilla_der', ceros: { esq_rodilla_der: { desde: 0, hasta: 2 } } }
    expect(leerAjustes3D(t)).toEqual(t)
    expect(leerAjustes3D({ fuente: 'puntos', ceros: {} })).toEqual({ fuente: 'puntos', ceros: {} })
    expect(leerAjustes3D({ fuente: 'otra', ceros: {} })).toBeNull()
    expect(leerAjustes3D({ fuente: 'puntos', ceros: { x: { desde: 2 } } })).toBeNull()
    expect(leerAjustes3D({ fuente: 'puntos', articulacion: 4, ceros: {} })).toBeNull()
  })
})

describe('con la sesión', () => {
  const huella = { nombre: 'a.mp4', tamano: 1, duracion: 0.1, frames: 2 }
  const base = {
    id: 's1',
    nombre: 'a',
    creada: '2026-11-11T10:00:00.000Z',
    ahora: '2026-11-11T10:00:00.000Z',
    modelo: modeloRodilla3('der'),
    vistas: [{ id: 'v1', huella, orientacion: { plano: 'sagital', mira: 'derecha' } as const, series: new Map() }],
  }

  it('se guarda y se lee el esqueleto y lo que se mira (sin subir el esquema), y sin ellos la sesión es como antes', () => {
    const tresd = { fuente: 'esqueleto' as const, articulacion: 'esq_rodilla_der', ceros: { esq_rodilla_der: { desde: 0, hasta: 2 } } }
    const esqueleto = empaquetarEsqueleto(resultado, 'h')
    const { cabecera, datos } = prepararGuardado({ ...base, tresd, esqueleto })
    const c = leerCabecera({ ...cabecera })
    if (!c.ok) throw new Error(c.detalle)
    expect(c.valor.tresd).toEqual(tresd)
    const d = leerDatos({ ...datos }, c.valor)
    if (!d.ok) throw new Error(d.detalle)
    expect(desempaquetarEsqueleto(d.valor.esqueleto)?.resultado).toEqual(resultado)
    // Ocupa lo que ocupan sus arrays (más que sin él).
    expect(cabecera.bytes!).toBeGreaterThan(prepararGuardado(base).cabecera.bytes! + esqueleto.posturas.byteLength)
    const sin = prepararGuardado(base)
    expect('tresd' in sin.cabecera).toBe(false)
    expect('esqueleto' in sin.datos).toBe(false)
  })

  it('lo que se mira, si no se puede leer, se descarta sin rechazar la sesión', () => {
    const { cabecera } = prepararGuardado(base)
    const c = leerCabecera({ ...cabecera, tresd: { fuente: 'nada' } })
    expect(c.ok).toBe(true)
    if (c.ok) expect(c.valor.tresd).toBeUndefined()
  })
})

describe('la marcha en 3D guardada con lo que se mira', () => {
  it('se lee con los ajustes; ilegible, se descarta sin perder lo demás', () => {
    const marcha = { manuales: [{ tipo: 'contacto', lado: 'izq', t: 1.2, manual: true }], quitados: [], excluidos: [2.3], enCinta: null }
    const base = { fuente: 'puntos', ceros: {} }
    expect(leerAjustes3D({ ...base, marcha })).toEqual({ ...base, marcha })
    expect(leerAjustes3D({ ...base, marcha: { manuales: 'no' } })).toEqual(base)
  })
})
