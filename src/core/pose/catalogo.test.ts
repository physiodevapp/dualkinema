import { describe, expect, it } from 'vitest'
import { serieAngular } from '../articulaciones/calculo'
import { articulacionesFrontales, articulacionesSagitales, conRodillaFrontal, marcadores, modeloRodilla3, type Lado } from '../articulaciones/catalogo'
import { marcadoresDeArticulacion, type DefinicionArticulacion } from '../articulaciones/definicion'
import { marcadoresParaVista, modeloDeVista } from '../articulaciones/modeloVista'
import { aImagen, direccion, frame } from '../articulaciones/poses'
import type { OrientacionVista } from '../geometria/canonico'
import type { Muestra2D } from '../modelo/tipos'
import {
  articulacionesPoseFrontales,
  articulacionesPoseSagitales,
  conPose,
  equivalenteGomets,
  fuenteDe,
  marcadoresPose,
  modeloPose,
  PELVIS_FRONTAL_POSE,
  TRONCO_FRONTAL_POSE,
} from './catalogo'
import { conPuntosMedios, esIdPose, idMedio, idPose, PUNTOS_POSE } from './puntos'

const LADOS: Lado[] = ['der', 'izq']
const SAGITALES: OrientacionVista[] = [
  { plano: 'sagital', mira: 'derecha' },
  { plano: 'sagital', mira: 'izquierda' },
]
const FRONTALES: OrientacionVista[] = [
  { plano: 'frontal', ve: 'delante' },
  { plano: 'frontal', ve: 'detras' },
]

type P = { x: number; y: number }
const sumar = (p: P, g: number, largo = 1): P => {
  const d = direccion(g)
  return { x: p.x + d.x * largo, y: p.y + d.y * largo }
}

/** Mide una articulación en un frame con los puntos dados en el marco canónico, vistos con la orientación `o`. */
function medir(def: DefinicionArticulacion, puntos: Record<string, P>, o: OrientacionVista) {
  const enImagen = Object.fromEntries(Object.entries(puntos).map(([id, p]) => [id, aImagen(p, o)]))
  const serie = serieAngular(def, frame(0, enImagen), o)
  expect(serie).toHaveLength(1)
  return serie[0]!.valor
}

/**
 * Pose de perfil en el marco canónico (x delante, y arriba) con los puntos del modelo de la pierna `l`. `tronco`: grados
 * de inclinación hacia delante; cadera, rodilla y tobillo: flexión (dorsal en el tobillo).
 */
function poseSagital(l: Lado, a: { tronco?: number; cadera?: number; rodilla?: number; tobillo?: number }): Record<string, P> {
  const tronco = a.tronco ?? 0
  const cadera = { x: 0.1, y: 0.9 }
  const hombro = { x: cadera.x + 1.6 * Math.sin((tronco * Math.PI) / 180), y: cadera.y + 1.6 * Math.cos((tronco * Math.PI) / 180) }
  // Direcciones desde «abajo», + = hacia delante: el tronco (hombro → cadera) es −tronco.
  const muslo = -tronco + (a.cadera ?? 0)
  const pierna = muslo - (a.rodilla ?? 0)
  const pie = pierna + 90 + (a.tobillo ?? 0)
  const rodilla = sumar(cadera, muslo, 1.3)
  const tobillo = sumar(rodilla, pierna, 1.2)
  return {
    [idPose('hombro', l)]: hombro,
    [idPose('cadera', l)]: cadera,
    [idPose('rodilla', l)]: rodilla,
    [idPose('tobillo', l)]: tobillo,
    [idPose('talon', l)]: sumar(tobillo, pie + 180, 0.2),
    [idPose('punta', l)]: sumar(tobillo, pie, 0.6),
  }
}

const sagital = (l: Lado, nombre: string) => articulacionesPoseSagitales(l).find((a) => a.id === `pose_${nombre}_sagital_${l}`)!

describe.each(LADOS)('convención sin marcadores de perfil, pierna %s', (l) => {
  describe.each(SAGITALES)('mirando a la $mira', (o) => {
    it.each([
      [0, 0],
      [45, 45],
      [90, 90],
      [-10, -10],
    ])('rodilla: flexión %d° → %d°', (flexion, esperado) => {
      expect(medir(sagital(l, 'rodilla'), poseSagital(l, { rodilla: flexion, cadera: 10 }), o)).toBeCloseTo(esperado, 9)
    })

    it.each([
      [0, 0],
      [30, 30],
      [90, 90],
      [-15, -15],
    ])('cadera: flexión %d° → %d° (con el tronco inclinado 20°)', (flexion, esperado) => {
      expect(medir(sagital(l, 'cadera'), poseSagital(l, { tronco: 20, cadera: flexion }), o)).toBeCloseTo(esperado, 9)
    })

    it.each([
      [0, 0],
      [15, 15],
      [-30, -30],
    ])('tobillo: flexión dorsal %d° → %d° (pie perpendicular a la pierna = 0)', (dorsal, esperado) => {
      expect(medir(sagital(l, 'tobillo'), poseSagital(l, { tobillo: dorsal, rodilla: 40, cadera: 30 }), o)).toBeCloseTo(esperado, 9)
    })

    it.each([
      [0, 0],
      [25, 25],
      [-10, -10],
      [60, 60],
    ])('tronco: inclinado %d° hacia delante → %d° (absoluto: no depende de las piernas)', (tronco, esperado) => {
      expect(medir(sagital(l, 'tronco'), poseSagital(l, { tronco, cadera: 50, rodilla: 70 }), o)).toBeCloseTo(esperado, 9)
    })

    it('cadera, rodilla y tobillo dan lo mismo que las de los gomets con los mismos puntos', () => {
      const m = marcadores(l)
      const pose = poseSagital(l, { tronco: 15, cadera: 40, rodilla: 65, tobillo: 10 })
      const comoGomets = {
        [m.hombro]: pose[idPose('hombro', l)]!,
        [m.cadera]: pose[idPose('cadera', l)]!,
        [m.rodilla]: pose[idPose('rodilla', l)]!,
        [m.tobillo]: pose[idPose('tobillo', l)]!,
        [m.talon]: pose[idPose('talon', l)]!,
        [m.antepie]: pose[idPose('punta', l)]!,
      }
      for (const nombre of ['cadera', 'rodilla', 'tobillo']) {
        const g = articulacionesSagitales(l).find((a) => a.id === `${nombre}_sagital_${l}`)!
        expect(medir(sagital(l, nombre), pose, o)).toBeCloseTo(medir(g, comoGomets, o), 9)
      }
    })
  })
})

/**
 * Pose de frente en el marco canónico (x hacia la izquierda de la persona, y arriba). `pelvis`: grados de oblicuidad
 * (+ = cadera izquierda más alta); `tronco`: inclinación lateral (+ = hacia la izquierda); por pierna, `abd` (abducción
 * respecto a la pelvis) y `valgo` (FPPA).
 */
function poseFrontal(a: { pelvis?: number; tronco?: number; izq?: { abd?: number; valgo?: number }; der?: { abd?: number; valgo?: number } }) {
  const b = ((a.pelvis ?? 0) * Math.PI) / 180
  const centro = { x: 0.05, y: 1 }
  const caderaIzq = { x: centro.x + 0.15 * Math.cos(b), y: centro.y + 0.15 * Math.sin(b) }
  const caderaDer = { x: centro.x - 0.15 * Math.cos(b), y: centro.y - 0.15 * Math.sin(b) }
  const lt = ((a.tronco ?? 0) * Math.PI) / 180
  const hombros = { x: centro.x + 0.55 * Math.sin(lt), y: centro.y + 0.55 * Math.cos(lt) }
  const r: Record<string, P> = {
    [idPose('cadera', 'izq')]: caderaIzq,
    [idPose('cadera', 'der')]: caderaDer,
    // Los hombros, a los lados de su punto medio y con su propia inclinación (no debe influir en el tronco).
    [idPose('hombro', 'izq')]: { x: hombros.x + 0.2, y: hombros.y + 0.03 },
    [idPose('hombro', 'der')]: { x: hombros.x - 0.2, y: hombros.y - 0.03 },
  }
  for (const [l, cadera] of [['izq', caderaIzq], ['der', caderaDer]] as const) {
    // «Abajo» perpendicular a la línea de las caderas es girar la vertical lo mismo que la pelvis; la abducción lleva
    // la rodilla hacia fuera (+x en la izquierda, −x en la derecha), y el valgo gira la pierna hacia fuera desde el muslo.
    const fuera = l === 'izq' ? 1 : -1
    const muslo = (a.pelvis ?? 0) + fuera * (a[l]?.abd ?? 0)
    const pierna = muslo + fuera * (a[l]?.valgo ?? 0)
    const rodilla = sumar(cadera, muslo, 0.45)
    r[idPose('rodilla', l)] = rodilla
    r[idPose('tobillo', l)] = sumar(rodilla, pierna, 0.42)
  }
  return r
}

/** Las medidas de frente necesitan los puntos medios (el tronco): se añaden como haría el visor. */
function medirFrontal(def: DefinicionArticulacion, puntos: Record<string, P>, o: OrientacionVista) {
  const enImagen = Object.fromEntries(Object.entries(puntos).map(([id, p]) => [id, aImagen(p, o)]))
  const series = new Map(Object.entries(frame(0, enImagen)) as [string, (Muestra2D | undefined)[]][])
  const conMedios = conPuntosMedios(series)
  const serie = serieAngular(def, Object.fromEntries([...conMedios].map(([id, s]) => [id, s.filter((m): m is Muestra2D => !!m)])), o)
  return serie[0]!.valor
}

const frontal = (id: string) => articulacionesPoseFrontales().find((a) => a.id === id)!

describe.each(FRONTALES)('convención sin marcadores de frente, cámara $ve', (o) => {
  describe.each(LADOS)('pierna %s', (l) => {
    it.each([
      [0, 0],
      [10, 10],
      [-8, -8],
    ])('FPPA: valgo %d° → %d°, con la otra pierna en varo', (valgo, esperado) => {
      const otra = l === 'izq' ? 'der' : 'izq'
      const pose = poseFrontal({ pelvis: 5, [l]: { abd: 4, valgo }, [otra]: { valgo: -6 } })
      expect(medirFrontal(frontal(`pose_rodilla_frontal_${l}`), pose, o)).toBeCloseTo(esperado, 9)
      expect(medirFrontal(frontal(`pose_rodilla_frontal_${otra}`), pose, o)).toBeCloseTo(-6, 9)
    })

    it.each([
      [0, 0],
      [20, 20],
      [-10, -10],
    ])('cadera: abducción %d° respecto a la pelvis → %d° (pelvis inclinada 7°)', (abd, esperado) => {
      expect(medirFrontal(frontal(`pose_cadera_frontal_${l}`), poseFrontal({ pelvis: 7, [l]: { abd, valgo: 5 } }), o)).toBeCloseTo(esperado, 9)
    })

    it('FPPA igual que el de los gomets con los mismos puntos', () => {
      const m = marcadores(l)
      const pose = poseFrontal({ pelvis: -3, [l]: { abd: 6, valgo: 12 } })
      const g = articulacionesFrontales(l).find((a) => a.id === `rodilla_frontal_${l}`)!
      const comoGomets = { [m.musloProximal]: pose[idPose('cadera', l)]!, [m.centroRodilla]: pose[idPose('rodilla', l)]!, [m.centroTobillo]: pose[idPose('tobillo', l)]! }
      expect(medirFrontal(frontal(`pose_rodilla_frontal_${l}`), pose, o)).toBeCloseTo(medir(g, comoGomets, o), 9)
    })
  })

  it.each([
    [0, 0],
    [6, 6],
    [-4, -4],
  ])('pelvis: cadera izquierda %d° más alta → %d°', (pelvis, esperado) => {
    expect(medirFrontal(PELVIS_FRONTAL_POSE, poseFrontal({ pelvis, tronco: 5 }), o)).toBeCloseTo(esperado, 9)
  })

  it.each([
    [0, 0],
    [10, 10],
    [-15, -15],
  ])('tronco: inclinado %d° hacia la izquierda → %d° (absoluto, del punto medio de las caderas al de los hombros)', (tronco, esperado) => {
    expect(medirFrontal(TRONCO_FRONTAL_POSE, poseFrontal({ tronco, pelvis: 8 }), o)).toBeCloseTo(esperado, 9)
  })
})

describe('catálogo sin marcadores', () => {
  it('ids únicos y que no chocan con los de los gomets', () => {
    const todas = [...LADOS.flatMap(articulacionesPoseSagitales), ...articulacionesPoseFrontales()]
    const ids = todas.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.startsWith('pose_')).toBe(true)
    const gomets = new Set(LADOS.flatMap((l) => [...articulacionesSagitales(l), ...articulacionesFrontales(l)]).map((a) => a.id))
    for (const id of ids) expect(gomets.has(id)).toBe(false)
  })

  it('de perfil, solo la pierna de la cámara; de frente, las dos piernas, la pelvis y el tronco', () => {
    expect(articulacionesPoseSagitales('der').map((a) => a.id)).toEqual([
      'pose_rodilla_sagital_der',
      'pose_cadera_sagital_der',
      'pose_tobillo_sagital_der',
      'pose_tronco_sagital_der',
    ])
    expect(articulacionesPoseFrontales('izq').map((a) => a.id)).toEqual([
      'pose_rodilla_frontal_izq',
      'pose_rodilla_frontal_der',
      'pose_cadera_frontal_izq',
      'pose_cadera_frontal_der',
      'pose_pelvis_frontal',
      'pose_tronco_frontal',
    ])
  })

  it('cada articulación usa marcadores del modelo de su plano, y la vista las calcula todas', () => {
    for (const o of [...SAGITALES, ...FRONTALES]) {
      const modelo = modeloPose(o, 'der')
      const ids = new Set(modelo.marcadores.map((m) => m.id))
      expect(ids.size).toBe(modelo.marcadores.length)
      for (const a of modelo.articulaciones) {
        expect(a.plano).toBe(o.plano)
        for (const id of marcadoresDeArticulacion(a)) expect(ids.has(id)).toBe(true)
      }
      const vista = modeloDeVista(modelo, [...ids], o)
      expect(vista.articulaciones).toHaveLength(modelo.articulaciones.length)
    }
  })

  it('los puntos medios solo están en el modelo de frente', () => {
    expect(modeloPose({ plano: 'sagital', mira: 'derecha' }, 'der').marcadores.some((m) => m.id === idMedio('cadera'))).toBe(false)
    expect(modeloPose({ plano: 'frontal', ve: 'delante' }, 'der').marcadores.some((m) => m.id === idMedio('cadera'))).toBe(true)
  })

  it('nombres de los marcadores virtuales', () => {
    const nombre = (id: string) => marcadoresPose(true).find((m) => m.id === id)!.nombre
    expect(nombre('pose_rodilla_der')).toBe('Rodilla derecha (modelo)')
    expect(nombre('pose_tobillo_izq')).toBe('Tobillo izquierdo (modelo)')
    expect(nombre('pose_punta_der')).toBe('Punta del pie derecho (modelo)')
    expect(nombre('pose_cadera_medio')).toBe('Punto medio de las caderas (modelo)')
  })

  it('fuente de cada articulación', () => {
    expect(fuenteDe(sagital('der', 'rodilla'))).toBe('sinMarcadores')
    expect(fuenteDe(TRONCO_FRONTAL_POSE)).toBe('sinMarcadores')
    expect(fuenteDe(articulacionesSagitales('der')[0]!)).toBe('gomets')
  })

  it('equivalente de los gomets: solo las que miden lo mismo con la misma convención', () => {
    expect(equivalenteGomets('pose_rodilla_sagital_der')).toBe('rodilla_sagital_der')
    expect(equivalenteGomets('pose_cadera_sagital_izq')).toBe('cadera_sagital_izq')
    expect(equivalenteGomets('pose_tobillo_sagital_der')).toBe('tobillo_sagital_der')
    expect(equivalenteGomets('pose_rodilla_frontal_izq')).toBe('rodilla_frontal_izq')
    expect(equivalenteGomets('pose_cadera_frontal_der')).toBeNull()
    expect(equivalenteGomets('pose_tronco_sagital_der')).toBeNull()
    expect(equivalenteGomets('pose_pelvis_frontal')).toBeNull()
    // Toda equivalencia existe en el catálogo de los gomets y tiene su signo y su cero.
    const gomets = LADOS.flatMap((l) => [...articulacionesSagitales(l), ...articulacionesFrontales(l)])
    for (const a of [...LADOS.flatMap(articulacionesPoseSagitales), ...articulacionesPoseFrontales()]) {
      const id = equivalenteGomets(a.id)
      if (!id) continue
      const g = gomets.find((x) => x.id === id)!
      expect([a.signo, a.cero, a.plano]).toEqual([g.signo, g.cero, g.plano])
    }
  })
})

describe('conPose: el modelo de la sesión con lo sin marcadores', () => {
  const base = conRodillaFrontal(modeloRodilla3('der'), 'der')

  it('añade los 12 puntos y las articulaciones de perfil de la pierna de la cámara, sin tocar lo que había', () => {
    const m = conPose(base, 'der')
    expect(m.marcadores.slice(0, base.marcadores.length)).toEqual(base.marcadores)
    expect(m.articulaciones.slice(0, base.articulaciones.length)).toEqual(base.articulaciones)
    expect(m.marcadores).toHaveLength(base.marcadores.length + 12)
    expect(m.articulaciones.map((a) => a.id).slice(base.articulaciones.length)).toEqual(articulacionesPoseSagitales('der').map((a) => a.id))
    expect(conPose(m, 'der')).toBe(m)
  })

  it('una vista con gomets sigue los suyos y mide con gomets; una sin marcadores, los puntos del modelo', () => {
    const m = conPose(base, 'der')
    const o: OrientacionVista = { plano: 'sagital', mira: 'derecha' }
    const gomets = marcadoresParaVista(m, o, (a) => fuenteDe(a) === 'gomets')
    expect(gomets).toEqual(modeloRodilla3('der').marcadores.map((mk) => mk.id))
    expect(modeloDeVista(m, gomets, o).articulaciones.map((a) => a.id)).toEqual(['rodilla_sagital_der'])
    const sin = marcadoresParaVista(m, o, (a) => fuenteDe(a) === 'sinMarcadores')
    expect(sin.every(esIdPose)).toBe(true)
    expect(modeloDeVista(m, PUNTOS_POSE.map((p) => p.id), o).articulaciones[0]!.id).toBe('pose_rodilla_sagital_der')
    // Con los dos, mandan los gomets (D5): su articulación va primero.
    expect(modeloDeVista(m, [...gomets, ...PUNTOS_POSE.map((p) => p.id)], o).articulaciones[0]!.id).toBe('rodilla_sagital_der')
  })
})
