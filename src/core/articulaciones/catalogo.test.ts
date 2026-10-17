import { describe, expect, it } from 'vitest'
import type { OrientacionVista } from '../geometria/canonico'
import { serieAngular } from './calculo'
import { articulacionesFrontales, articulacionesSagitales, marcadores, modeloRodilla3, type Lado } from './catalogo'
import type { DefinicionArticulacion } from './definicion'
import { aImagen, direccion, frame } from './poses'

const LADOS: Lado[] = ['der', 'izq']
const SAGITALES: OrientacionVista[] = [
  { plano: 'sagital', mira: 'derecha' },
  { plano: 'sagital', mira: 'izquierda' },
]
const FRONTALES: OrientacionVista[] = [
  { plano: 'frontal', ve: 'delante' },
  { plano: 'frontal', ve: 'detras' },
]

const sumar = (p: { x: number; y: number }, g: number, largo = 1) => {
  const d = direccion(g)
  return { x: p.x + d.x * largo, y: p.y + d.y * largo }
}

/**
 * Pose sagital en el marco canónico (x delante, y arriba). Ángulos en grados
 * desde «abajo», + = hacia delante. `tronco` inclina el tronco hacia delante.
 */
function poseSagital(l: Lado, a: { tronco?: number; cadera?: number; rodilla?: number; tobillo?: number; hombro?: number; codo?: number }) {
  const m = marcadores(l)
  const tronco = a.tronco ?? 0
  const muslo = tronco + (a.cadera ?? 0)
  const pierna = muslo - (a.rodilla ?? 0)
  const pie = pierna + 90 + (a.tobillo ?? 0)
  const brazo = tronco + (a.hombro ?? 0)
  const antebrazo = brazo + (a.codo ?? 0)

  const cadera = { x: 0, y: 0 }
  const hombro = sumar(cadera, tronco + 180, 1.6) // el hombro queda por encima de la cadera
  const rodilla = sumar(cadera, muslo, 1.3)
  const tobillo = sumar(rodilla, pierna, 1.2)
  const talon = sumar(tobillo, pie + 180, 0.2) // detrás del tobillo, en la línea del pie
  const antepie = sumar(tobillo, pie, 0.6)
  const codo = sumar(hombro, brazo, 0.9)
  const muneca = sumar(codo, antebrazo, 0.8)
  return {
    [m.cadera]: cadera, [m.hombro]: hombro, [m.rodilla]: rodilla, [m.tobillo]: tobillo,
    [m.talon]: talon, [m.antepie]: antepie, [m.codo]: codo, [m.muneca]: muneca,
  }
}

function medir(def: DefinicionArticulacion, puntos: Record<string, { x: number; y: number }>, o: OrientacionVista) {
  const enImagen = Object.fromEntries(Object.entries(puntos).map(([id, p]) => [id, aImagen(p, o)]))
  const serie = serieAngular(def, frame(0, enImagen), o)
  expect(serie).toHaveLength(1)
  return serie[0]!.valor
}

const def = (l: Lado, id: string) => [...articulacionesSagitales(l), ...articulacionesFrontales(l)].find((a) => a.id === `${id}_${l}`)!

describe.each(LADOS)('convención sagital, lado %s', (l) => {
  describe.each(SAGITALES)('vista mirando a la $mira', (o) => {
    it.each([
      [0, 0],
      [45, 45],
      [90, 90],
      [130, 130],
      [-10, -10],
    ])('rodilla: %d° de flexión → %d°', (flexion, esperado) => {
      expect(medir(def(l, 'rodilla_sagital'), poseSagital(l, { cadera: 20, rodilla: flexion }), o)).toBeCloseTo(esperado)
    })

    it.each([
      [0, 0],
      [90, 90],
      [-20, -20],
    ])('cadera: %d° de flexión → %d°', (flexion, esperado) => {
      expect(medir(def(l, 'cadera_sagital'), poseSagital(l, { cadera: flexion, rodilla: 30 }), o)).toBeCloseTo(esperado)
    })

    it('cadera: se mide respecto al tronco, no a la vertical', () => {
      expect(medir(def(l, 'cadera_sagital'), poseSagital(l, { tronco: 30, cadera: 60 }), o)).toBeCloseTo(60)
    })

    it.each([
      [0, 0],
      [20, 20],
      [-40, -40],
    ])('tobillo: %d° (+ dorsal) → %d°', (flexion, esperado) => {
      expect(medir(def(l, 'tobillo_sagital'), poseSagital(l, { cadera: 10, rodilla: 25, tobillo: flexion }), o)).toBeCloseTo(esperado)
    })

    it.each([
      [0, 0],
      [90, 90],
      [170, 170],
      [-40, -40],
    ])('hombro: %d° de flexión → %d°', (flexion, esperado) => {
      expect(medir(def(l, 'hombro_sagital'), poseSagital(l, { hombro: flexion }), o)).toBeCloseTo(esperado)
    })

    it.each([
      [0, 0],
      [90, 90],
      [140, 140],
      [-5, -5],
    ])('codo: %d° de flexión → %d°', (flexion, esperado) => {
      expect(medir(def(l, 'codo_sagital'), poseSagital(l, { hombro: 30, codo: flexion }), o)).toBeCloseTo(esperado)
    })
  })
})

describe.each(LADOS)('convención frontal, lado %s', (l) => {
  describe.each(FRONTALES)('vista desde $ve', (o) => {
    it.each([
      [0, 0],
      [30, 30],
      [-15, -15],
    ])('cadera: %d° de abducción → %d°', (abd, esperado) => {
      // Marco frontal: x = izquierda de la persona. La abducción aleja el muslo
      // de la línea media: hacia +x en el lado izquierdo, hacia −x en el derecho.
      const m = marcadores(l)
      const haciaFuera = l === 'izq' ? abd : -abd
      const cadera = { x: l === 'izq' ? 0.2 : -0.2, y: 0 }
      const puntos = {
        [m.cadera]: cadera,
        [m.hombro]: { x: cadera.x, y: 1.6 },
        [m.rodilla]: sumar(cadera, haciaFuera, 1.3),
      }
      expect(medir(def(l, 'cadera_frontal'), puntos, o)).toBeCloseTo(esperado)
    })
  })
})

describe('catálogo', () => {
  const todas = LADOS.flatMap((l) => [...articulacionesSagitales(l), ...articulacionesFrontales(l)])

  it('no repite identificadores', () => {
    expect(new Set(todas.map((a) => a.id)).size).toBe(todas.length)
  })

  it('el modelo de rodilla de la fase 1 usa solo sus 3 marcadores', () => {
    for (const l of LADOS) {
      const modelo = modeloRodilla3(l)
      const ids = new Set(modelo.marcadores.map((m) => m.id))
      expect(ids.size).toBe(3)
      for (const a of modelo.articulaciones) {
        for (const id of [a.proximal.desde, a.proximal.hasta, a.distal.desde, a.distal.hasta]) expect(ids.has(id)).toBe(true)
      }
    }
  })
})
