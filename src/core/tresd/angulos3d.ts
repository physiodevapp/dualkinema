/*
 * Los ángulos en 3D (fase 6, paso 4; D7 de docs/plan-fase-6.md), de las dos piernas a la vez, a partir de los puntos 3D
 * filtrados (`puntos3d.ts`).
 *
 * Marco de la pelvis en cada instante: la vertical es la gravedad (z), el eje mediolateral la línea de las caderas en
 * horizontal y el anteroposterior, hacia delante de la persona. Los ángulos sagitales y frontales son **los mismos que en
 * 2D sin marcadores** (`core/pose/catalogo.ts`, con sus convenciones y sus tests), calculados sobre la proyección de los
 * puntos en el plano sagital o frontal de la pelvis: una «vista virtual» ortográfica que ya no depende de dónde estuviera
 * cada cámara (de perfil, a la derecha para la pierna derecha y a la izquierda para la izquierda; de frente, desde delante).
 * Así la misma persona da lo mismo en 2D de perfil y en 3D sagital cuando el movimiento va en el plano. Los transversales
 * (rotación de la pelvis, del tronco respecto a la pelvis y ángulo de progresión del pie) se calculan aquí.
 *
 * Con dos puntos por segmento (centros articulares) no hay rotación axial del muslo ni de la pierna: la rotación de cadera
 * y de rodilla no se calcula (fase 7, con el esqueleto). Tampoco la anteversión de la pelvis (haría falta otro punto).
 */
import { serieAngular, type MuestraAngulo } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import type { DefinicionArticulacion } from '../articulaciones/definicion'
import { centrarVueltasPorTrozos, desenrollar, normalizarGrados } from '../geometria/angulo'
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { articulacionesPoseFrontales, articulacionesPoseSagitales } from '../pose/catalogo'
import { idMedio, idPose, PUNTOS_MEDIOS } from '../pose/puntos'
import type { Muestra3D, Trayectorias3D } from './puntos3d'

export type Plano3D = 'sagital' | 'frontal' | 'transversal'

export interface Articulacion3D {
  readonly id: string
  readonly nombre: string
  readonly plano: Plano3D
  /** La pierna (null: pelvis o tronco). */
  readonly lado: Lado | null
  readonly positivo: string
  readonly negativo: string
}

/** Escala de las vistas virtuales (px por unidad): cualquiera vale, los ángulos no dependen de ella. */
const ESCALA_VIRTUAL = 1000

const utilizable = (m: Muestra3D | undefined): m is Muestra3D => !!m && m.calidad > 0 && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)

/** El rumbo de la persona (hacia dónde mira, en horizontal: rad desde +x) en cada frame, de la línea de las caderas. NaN sin las dos. */
export function rumbos(tr: Trayectorias3D): number[] {
  const izq = tr.series.get(idPose('cadera', 'izq')) ?? []
  const der = tr.series.get(idPose('cadera', 'der')) ?? []
  return tr.tiempos.map((_, i) => {
    const a = izq[i]
    const b = der[i]
    if (!utilizable(a) || !utilizable(b)) return NaN
    // Delante = z × (derecha − izquierda).
    return Math.atan2(b.x - a.x, -(b.y - a.y))
  })
}

/** Una vista virtual (2D, ortográfica) de las trayectorias 3D en un plano de la pelvis, como si la grabara una cámara. */
interface VistaVirtual {
  readonly orientacion: OrientacionVista
  readonly series: ReadonlyMap<IdMarcador, Muestra2D[]>
}

/**
 * Proyecta los puntos en el plano sagital (con la cámara a la derecha o a la izquierda de la persona) o frontal (desde
 * delante) de la pelvis de cada instante. En el marco canónico de la vista (`aCanonico`), sagital = (delante, arriba) y
 * frontal desde delante = (hacia la izquierda de la persona, arriba): los de las vistas reales de perfil y de frente.
 */
function vistaVirtual(tr: Trayectorias3D, orientacion: OrientacionVista, rumbo: readonly number[]): VistaVirtual {
  const series = new Map<IdMarcador, Muestra2D[]>()
  for (const [id, serie] of tr.series) {
    const r: Muestra2D[] = []
    serie.forEach((p, i) => {
      const th = rumbo[i]!
      if (!utilizable(p) || !Number.isFinite(th)) return
      const delante = p.x * Math.cos(th) + p.y * Math.sin(th)
      const izquierda = -p.x * Math.sin(th) + p.y * Math.cos(th)
      // De perfil a la derecha, la persona mira hacia la derecha de la imagen; de frente desde delante, su izquierda queda
      // a la derecha de la imagen (`aCanonico` deshace el espejo de mirar a la izquierda o desde detrás).
      const u =
        orientacion.plano === 'sagital' ? (orientacion.mira === 'derecha' ? delante : -delante) : orientacion.ve === 'delante' ? izquierda : -izquierda
      r.push({ t: p.t, x: u * ESCALA_VIRTUAL, y: -p.z * ESCALA_VIRTUAL, calidad: p.calidad, editadoManual: p.editadoManual })
    })
    series.set(id, r)
  }
  return { orientacion, series }
}

const sinFuente = (nombre: string) => nombre.replace(/ sin marcadores$/, ' en 3D')

const BRAZOS_CABEZA = /^pose_(hombro|codo|cabeza)_/

/** Las articulaciones del 2D sin marcadores que se calculan en una vista virtual, con su id 3D. */
function deCatalogo(): { readonly art: Articulacion3D; readonly def: DefinicionArticulacion; readonly orientacion: OrientacionVista }[] {
  const lado = (id: string): Lado | null => (id.endsWith('_der') ? 'der' : id.endsWith('_izq') ? 'izq' : null)
  const sagitales = (['der', 'izq'] as const).flatMap((l) =>
    articulacionesPoseSagitales(l)
      // El tronco respecto a la vertical, una vez (la de la pierna derecha).
      .filter((d) => l === 'der' || !d.id.startsWith('pose_tronco'))
      .map((def) => ({ def, orientacion: { plano: 'sagital', mira: l === 'der' ? 'derecha' : 'izquierda' } as OrientacionVista, lado: def.id.startsWith('pose_tronco') ? null : l })),
  )
  const frontales = articulacionesPoseFrontales('der').map((def) => ({ def, orientacion: { plano: 'frontal', ve: 'delante' } as OrientacionVista, lado: lado(def.id) }))
  // Los brazos y la cabeza (fase 8) todavía no se triangulan: llegan al 3D en su paso 2.
  return [...sagitales, ...frontales].filter(({ def }) => !BRAZOS_CABEZA.test(def.id)).map(({ def, orientacion, lado: l }) => ({
    def,
    orientacion,
    art: { id: `3d_${def.id.replace(/^pose_/, '').replace(/^tronco_sagital_der$/, 'tronco_sagital')}`, nombre: sinFuente(def.nombre), plano: def.plano, lado: l, positivo: def.positivo, negativo: def.negativo },
  }))
}

const TRANSVERSALES: readonly Articulacion3D[] = [
  { id: '3d_pelvis_transversal', nombre: 'Pelvis (rotación) en 3D', plano: 'transversal', lado: null, positivo: 'rotación a la izquierda', negativo: 'rotación a la derecha' },
  { id: '3d_tronco_transversal', nombre: 'Tronco (rotación respecto a la pelvis) en 3D', plano: 'transversal', lado: null, positivo: 'rotación a la izquierda', negativo: 'rotación a la derecha' },
  { id: '3d_pie_progresion_der', nombre: 'Pie derecho (ángulo de progresión) en 3D', plano: 'transversal', lado: 'der', positivo: 'punta hacia fuera', negativo: 'punta hacia dentro' },
  { id: '3d_pie_progresion_izq', nombre: 'Pie izquierdo (ángulo de progresión) en 3D', plano: 'transversal', lado: 'izq', positivo: 'punta hacia fuera', negativo: 'punta hacia dentro' },
]

/** Todas las articulaciones 3D: sagitales (de las dos piernas y el tronco), frontales y transversales. */
export const ARTICULACIONES_3D: readonly Articulacion3D[] = [...deCatalogo().map((x) => x.art), ...TRANSVERSALES]

/** El rumbo (rad) de la línea que va de `a` a `b` girada a «delante» (z × (b − a)), por frame. */
function rumboDeLinea(tr: Trayectorias3D, a: IdMarcador, b: IdMarcador): number[] {
  const sa = tr.series.get(a) ?? []
  const sb = tr.series.get(b) ?? []
  return tr.tiempos.map((_, i) => {
    const p = sa[i]
    const q = sb[i]
    return utilizable(p) && utilizable(q) ? Math.atan2(q.x - p.x, -(q.y - p.y)) : NaN
  })
}

/** El rumbo de un vector de `a` a `b` (rad), por frame. */
function rumboDeVector(tr: Trayectorias3D, a: IdMarcador, b: IdMarcador): number[] {
  const sa = tr.series.get(a) ?? []
  const sb = tr.series.get(b) ?? []
  return tr.tiempos.map((_, i) => {
    const p = sa[i]
    const q = sb[i]
    return utilizable(p) && utilizable(q) && Math.hypot(q.x - p.x, q.y - p.y) > 1e-9 ? Math.atan2(q.y - p.y, q.x - p.x) : NaN
  })
}

/** Con los puntos medios de caderas y hombros (los usan el tronco y la pelvis de frente), de los dos lados, como en 2D. */
function conMedios3D(tr: Trayectorias3D): Trayectorias3D {
  const series = new Map(tr.series)
  for (const { parte } of PUNTOS_MEDIOS) {
    const a = tr.series.get(idPose(parte, 'izq')) ?? []
    const b = tr.series.get(idPose(parte, 'der')) ?? []
    series.set(
      idMedio(parte),
      tr.tiempos.map((_, i) => {
        const p = a[i]
        const q = b[i]
        if (!utilizable(p) || !utilizable(q)) return undefined
        return { ...p, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2, calidad: Math.min(p.calidad, q.calidad), error: Math.max(p.error, q.error) }
      }),
    )
  }
  return { ...tr, series }
}

const grados = (r: number) => (r * 180) / Math.PI

/** Una serie continua (desenrollada y centrada por trozos, como las de 2D) de valores en grados por frame. */
function serieContinua(tiempos: readonly number[], valores: readonly number[]): MuestraAngulo[] {
  const continuos = centrarVueltasPorTrozos(desenrollar(valores))
  return tiempos.map((t, i) => ({ t, valor: continuos[i] ?? NaN, interpolado: false }))
}

function transversal(id: string, tr: Trayectorias3D, rumbo: readonly number[]): MuestraAngulo[] {
  if (id === '3d_pelvis_transversal') {
    // Respecto al rumbo del principio (el marco del laboratorio lo deja en 0: +x): + hacia la izquierda (antihorario visto desde arriba).
    return serieContinua(tr.tiempos, rumbo.map((r) => (Number.isFinite(r) ? normalizarGrados(grados(r)) : NaN)))
  }
  if (id === '3d_tronco_transversal') {
    const hombros = rumboDeLinea(tr, idPose('hombro', 'izq'), idPose('hombro', 'der'))
    return serieContinua(tr.tiempos, hombros.map((h, i) => normalizarGrados(grados(h - rumbo[i]!))))
  }
  const l: Lado = id.endsWith('_der') ? 'der' : 'izq'
  const pie = rumboDeVector(tr, idPose('talon', l), idPose('punta', l))
  // Hacia fuera: para el pie derecho, girado a la derecha (horario: rumbo menor); para el izquierdo, a la izquierda.
  const s = l === 'der' ? -1 : 1
  return serieContinua(tr.tiempos, pie.map((p, i) => s * normalizarGrados(grados(p - rumbo[i]!))))
}

/**
 * La serie del ángulo de una articulación 3D en cada frame (tiempo común de los frames de A), de los puntos 3D filtrados.
 * Una sola serie por articulación, desenrollada y centrada, como en 2D.
 */
export function serieAngular3D(id: string, tr: Trayectorias3D): MuestraAngulo[] {
  const rumbo = rumbos(tr)
  if (TRANSVERSALES.some((a) => a.id === id)) return transversal(id, tr, rumbo)
  const x = deCatalogo().find((c) => c.art.id === id)
  if (!x) throw new Error(`Articulación 3D desconocida: ${id}`)
  const v = vistaVirtual(conMedios3D(tr), x.orientacion, rumbo)
  const porFrame = new Map(serieAngular(x.def, Object.fromEntries(v.series), v.orientacion).map((m) => [m.t, m]))
  return tr.tiempos.map((t) => porFrame.get(t) ?? { t, valor: NaN, interpolado: false })
}
