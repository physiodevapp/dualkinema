/*
 * El esqueleto en toda la toma (fase 7, paso 3): las medidas de la persona de sus puntos 3D, el ajuste frame a frame sobre
 * las dos vistas (con B en el instante común, sin cruzar huecos) y los ángulos del esqueleto, filtrados por tramos con el
 * filtro de la sesión (un frame sin ajuste es un hueco: nunca se filtra a través de él).
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import { filtrarTramo, SALTO_MAX_PASOS, type AjustesFiltro } from '../filtros/tramos'
import { centrarVueltasPorTrozos, desenrollar } from '../geometria/angulo'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { camaraDe, type Calibracion3D } from '../tresd/calibracion3d'
import { posicionEn, type VistaParaEmparejar } from '../tresd/correspondencias'
import type { Trayectorias3D } from '../tresd/puntos3d'
import { ajustarFrame, arranqueDe, medidasDeLaToma, RODILLA_ROTACION_VISIBLE, type Observaciones } from './ajuste'
import { indiceGrado, type Grado, type Medidas } from './modelo'
import { idPose } from '../pose/puntos'

/** Del marco del laboratorio (el de las trayectorias 3D) al mundo de la calibración: lo contrario de `enMarco`. */
export function deMarco(cal: Calibracion3D, marco: Trayectorias3D['marco']): (p: Vec3) => Vec3 {
  const k = cal.metrosPorUnidad ?? 1
  const suelo = cal.suelo ?? 0
  const c = marco ? Math.cos(marco.rumbo) : 1
  const s = marco ? Math.sin(marco.rumbo) : 0
  const o = marco?.origen ?? vec3(0, 0, 0)
  return (p) => {
    const x = c * p.x - s * p.y + o.x
    const y = s * p.x + c * p.y + o.y
    return vec3(x / k, y / k, p.z / k + suelo)
  }
}

export interface ResultadoEsqueleto {
  readonly tiempos: readonly number[]
  readonly medidas: Medidas
  readonly asimetria: Readonly<Record<'muslo' | 'pierna' | 'pie', number>>
  /** La postura de cada frame de A (null: no se pudo ajustar). */
  readonly posturas: readonly (readonly number[] | null)[]
  readonly errores: readonly number[]
  /** Si la rotación de cada cadera se ve en cada frame (la rodilla doblada, D4). */
  readonly rotacionVisible: readonly Readonly<Record<Lado, boolean>>[]
  /** En cuántas vistas se vio cada punto en cada frame (un ángulo sin sus puntos a la vista no tiene valor). */
  readonly vistas: readonly Readonly<Record<IdMarcador, number>>[]
}

/** Lo que ve una vista en el instante común `tc` (B interpolada sin cruzar huecos). */
function observacionesEn(v: VistaParaEmparejar, tc: number, ids: readonly IdMarcador[]): Observaciones {
  const o = new Map<IdMarcador, { u: number; v: number; calidad: number }>()
  for (const id of ids) {
    const s = v.series.get(id)
    const p = s ? posicionEn(s, v.tabla, v.paso, tc - v.desfase) : null
    if (p) o.set(id, { u: p.x, v: p.y, calidad: p.calidad })
  }
  return o
}

/**
 * Ajusta el esqueleto en cada frame de A. `tr`: los puntos 3D filtrados en el marco del laboratorio (de ellos salen las
 * medidas y el arranque). `progreso` se llama de vez en cuando con la fracción hecha; si devuelve false, se para. null sin
 * medidas (no hay bastantes puntos 3D).
 */
export function ajustarSesion(
  cal: Calibracion3D,
  a: VistaParaEmparejar,
  b: VistaParaEmparejar,
  tr: Trayectorias3D,
  ids: readonly IdMarcador[],
  progreso: (fraccion: number) => boolean = () => true,
): ResultadoEsqueleto | null {
  const frames3d = tr.tiempos.map((_, i) => new Map<IdMarcador, Vec3 | undefined>(ids.map((id) => {
    const p = tr.series.get(id)?.[i]
    return [id, p && p.calidad > 0 ? vec3(p.x, p.y, p.z) : undefined]
  })))
  const m = medidasDeLaToma(frames3d)
  if (!m) return null
  const camaras = [camaraDe(cal.camaras[0]), camaraDe(cal.camaras[1])]
  const aMundo = deMarco(cal, tr.marco ?? null)
  // Metros por unidad de las trayectorias (para la continuidad de la pelvis): 1 con escala; sin ella, por un muslo de ~43 cm.
  const unidad = cal.metrosPorUnidad ? 1 : 0.43 / Math.max(m.medidas.muslo, 1e-9)
  const posturas: (number[] | null)[] = []
  const errores: number[] = []
  const rotacionVisible: Record<Lado, boolean>[] = []
  const vistas: Readonly<Record<IdMarcador, number>>[] = []
  let anterior: number[] | null = null
  let tAnterior = NaN
  const paso = a.paso
  for (let i = 0; i < tr.tiempos.length; i++) {
    if (i % 20 === 0 && !progreso(i / tr.tiempos.length)) break
    const tc = tr.tiempos[i]!
    // Tras un hueco o un salto en el tiempo, se arranca de nuevo (sin continuidad con lo de antes).
    if (anterior && !(tc - tAnterior <= SALTO_MAX_PASOS * paso)) anterior = null
    const arranque = anterior ?? arranqueDe(frames3d[i]!)
    if (!arranque) {
      posturas.push(null)
      errores.push(NaN)
      rotacionVisible.push({ der: false, izq: false })
      vistas.push({})
      continue
    }
    const r = ajustarFrame({ camaras, aMundo, medidas: m.medidas, observaciones: [observacionesEn(a, tc, ids), observacionesEn(b, tc, ids)], anterior, arranque, unidad })
    if (!r) {
      posturas.push(null)
      errores.push(NaN)
      rotacionVisible.push({ der: false, izq: false })
      vistas.push({})
      anterior = null
      continue
    }
    posturas.push(r.q)
    errores.push(r.error)
    rotacionVisible.push({ ...r.rotacionVisible })
    vistas.push(r.vistas)
    anterior = r.q
    tAnterior = tc
  }
  while (posturas.length < tr.tiempos.length) {
    posturas.push(null)
    errores.push(NaN)
    rotacionVisible.push({ der: false, izq: false })
    vistas.push({})
  }
  return { tiempos: tr.tiempos, medidas: m.medidas, asimetria: m.asimetria, posturas, errores, rotacionVisible, vistas }
}

export interface ArticulacionEsqueleto {
  readonly id: string
  readonly nombre: string
  readonly plano: 'sagital' | 'frontal' | 'transversal'
  readonly grado: Grado
  readonly positivo: string
  readonly negativo: string
  /** La rotación de cadera solo se ve con la rodilla doblada (D4). */
  readonly ladoRotacion?: Lado
  /** Los puntos que tienen que verse para que el ángulo tenga valor (todos en una vista al menos, alguno en las dos). */
  readonly necesita: readonly IdMarcador[]
}

const CADERAS = [idPose('cadera', 'der'), idPose('cadera', 'izq')]
const HOMBROS = [idPose('hombro', 'der'), idPose('hombro', 'izq')]
/** Lo que necesita ver cada grado de libertad para tener valor. */
function necesita(g: Grado): IdMarcador[] {
  const l: Lado = g.endsWith('Izq') ? 'izq' : 'der'
  if (g.startsWith('caderaRot')) return [...CADERAS, idPose('rodilla', l), idPose('tobillo', l)]
  if (g.startsWith('cadera')) return [...CADERAS, idPose('rodilla', l)]
  if (g.startsWith('rodilla')) return [idPose('cadera', l), idPose('rodilla', l), idPose('tobillo', l)]
  if (g.startsWith('tobillo')) return [idPose('rodilla', l), idPose('tobillo', l), idPose('talon', l), idPose('punta', l)]
  if (g.startsWith('tronco')) return [...CADERAS, ...HOMBROS]
  return CADERAS
}

const art = (id: string, nombre: string, plano: ArticulacionEsqueleto['plano'], grado: Grado, positivo: string, negativo: string, ladoRotacion?: Lado): ArticulacionEsqueleto => ({
  id: `esq_${id}`,
  necesita: necesita(grado),
  nombre: `${nombre} (esqueleto)`,
  plano,
  grado,
  positivo,
  negativo,
  ...(ladoRotacion ? { ladoRotacion } : {}),
})

/** Las articulaciones del esqueleto (D5), con los signos del modelo (`modelo.ts`). */
export const ARTICULACIONES_ESQUELETO: readonly ArticulacionEsqueleto[] = [
  art('cadera_flex_der', 'Cadera derecha (flexo-extensión)', 'sagital', 'caderaFlexDer', 'flexión', 'extensión'),
  art('cadera_flex_izq', 'Cadera izquierda (flexo-extensión)', 'sagital', 'caderaFlexIzq', 'flexión', 'extensión'),
  art('rodilla_der', 'Rodilla derecha (flexo-extensión)', 'sagital', 'rodillaDer', 'flexión', 'hiperextensión'),
  art('rodilla_izq', 'Rodilla izquierda (flexo-extensión)', 'sagital', 'rodillaIzq', 'flexión', 'hiperextensión'),
  art('tobillo_der', 'Tobillo derecho (flexión dorsal-plantar)', 'sagital', 'tobilloDorsalDer', 'flexión dorsal', 'flexión plantar'),
  art('tobillo_izq', 'Tobillo izquierdo (flexión dorsal-plantar)', 'sagital', 'tobilloDorsalIzq', 'flexión dorsal', 'flexión plantar'),
  art('tronco_flex', 'Tronco respecto a la pelvis (flexo-extensión)', 'sagital', 'troncoFlex', 'flexión', 'extensión'),
  art('cadera_abd_der', 'Cadera derecha (abducción-aducción)', 'frontal', 'caderaAbdDer', 'abducción', 'aducción'),
  art('cadera_abd_izq', 'Cadera izquierda (abducción-aducción)', 'frontal', 'caderaAbdIzq', 'abducción', 'aducción'),
  art('pelvis_oblicuidad', 'Pelvis (oblicuidad)', 'frontal', 'pelvisOblicuidad', 'cadera izquierda más alta', 'cadera derecha más alta'),
  art('tronco_lateral', 'Tronco respecto a la pelvis (inclinación lateral)', 'frontal', 'troncoLateral', 'inclinación a la izquierda', 'inclinación a la derecha'),
  art('cadera_rot_der', 'Cadera derecha (rotación)', 'transversal', 'caderaRotDer', 'rotación interna', 'rotación externa', 'der'),
  art('cadera_rot_izq', 'Cadera izquierda (rotación)', 'transversal', 'caderaRotIzq', 'rotación interna', 'rotación externa', 'izq'),
  art('pie_der', 'Pie derecho respecto a la pierna (progresión)', 'transversal', 'tobilloProgresionDer', 'punta hacia fuera', 'punta hacia dentro'),
  art('pie_izq', 'Pie izquierdo respecto a la pierna (progresión)', 'transversal', 'tobilloProgresionIzq', 'punta hacia fuera', 'punta hacia dentro'),
  art('pelvis_rumbo', 'Pelvis (rotación respecto al principio)', 'transversal', 'pelvisRumbo', 'rotación a la izquierda', 'rotación a la derecha'),
  art('tronco_rot', 'Tronco respecto a la pelvis (rotación)', 'transversal', 'troncoRot', 'rotación a la izquierda', 'rotación a la derecha'),
]

const grados = (r: number) => (r * 180) / Math.PI

/**
 * La serie de un ángulo del esqueleto en cada frame: filtrada por tramos de frames ajustados (Butterworth de la sesión,
 * sin cruzar huecos ni saltos), en grados, desenrollada. `fiable`: false donde la rotación de cadera no se ve (D4).
 */
export function serieEsqueleto(a: ArticulacionEsqueleto, r: ResultadoEsqueleto, fs: number, ajustes: AjustesFiltro): (MuestraAngulo & { readonly fiable: boolean })[] {
  const ig = indiceGrado(a.grado)
  // Sin sus puntos a la vista, el ángulo no tiene valor: el ajuste lo dejaría en lo de antes o en 0, inventado.
  const visto = (k: number) => {
    const v = r.vistas[k] ?? {}
    return a.necesita.every((id) => (v[id] ?? 0) >= 1) && a.necesita.some((id) => (v[id] ?? 0) >= 2)
  }
  const crudos = r.posturas.map((q, k) => (q && visto(k) ? grados(q[ig]!) : NaN))
  // La pelvis respecto al principio: el rumbo menos el del primer frame ajustado.
  const primero = crudos.find(Number.isFinite)
  const base = a.grado === 'pelvisRumbo' && primero !== undefined ? primero : 0
  const continuos = centrarVueltasPorTrozos(desenrollar(crudos.map((v) => v - base)))
  const filtrados = new Array<number>(continuos.length).fill(NaN)
  let i = 0
  while (i < continuos.length) {
    if (!Number.isFinite(continuos[i]!)) {
      i++
      continue
    }
    let j = i
    while (j + 1 < continuos.length && Number.isFinite(continuos[j + 1]!) && r.tiempos[j + 1]! - r.tiempos[j]! <= SALTO_MAX_PASOS / fs) j++
    const ts = r.tiempos.slice(i, j + 1)
    const vs = continuos.slice(i, j + 1)
    const [f] = filtrarTramo(ts, [vs], fs, ajustes.corteHz)
    for (let k = 0; k < vs.length; k++) filtrados[i + k] = f![k]!
    i = j + 1
  }
  return r.tiempos.map((t, k) => ({ t, valor: filtrados[k]!, interpolado: false, fiable: a.ladoRotacion ? (r.rotacionVisible[k]?.[a.ladoRotacion] ?? false) : true }))
}

export { RODILLA_ROTACION_VISIBLE }
