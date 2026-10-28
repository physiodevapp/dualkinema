/*
 * Informe del experimento sin marcadores (fase 5, paso 1): un texto para copiar y pegar con lo que hace falta para
 * decidir (docs/plan-fase-5.md): qué modelo, cuánto tarda, cuánto detecta y cuánto se aparta de los gomets. Sin el
 * nombre del archivo (puede llevar el del paciente).
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import type { Comparacion } from './comparar'
import { idPose, type ParteCuerpo } from './puntos'

export interface DatosInforme {
  readonly modelo: string
  /** El delegado con que corrió de verdad ('GPU' o 'CPU') y, si se pidió GPU y no pudo, por qué. */
  readonly delegado: string
  readonly avisoDelegado?: string
  /** Lo que tardó en cargar el modelo y en recorrer el vídeo, ms. */
  readonly msCarga: number
  readonly msProceso: number
  /** La segunda pasada, hacia atrás: frames sin persona que recuperó y lo que tardó, ms. */
  readonly recuperados: number
  readonly msAtras: number
  /** Frames procesados y frames del vídeo. */
  readonly procesados: number
  readonly total: number
  readonly ancho: number
  readonly alto: number
  readonly duracion: number
  readonly fps: number
  readonly lado: Lado
  readonly trayectorias: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>
  /** Frames con la flexión de la rodilla sin marcadores. */
  readonly conAngulo: number
  readonly cambiosLado: number
  readonly corteHz: number
  /** Gomets frente al modelo (b − a, con a = gomets); null si la vista no tiene gomets seguidos. */
  readonly comparacion: Comparacion | null
  readonly framesGomets: number
}

/** Mediana de los valores finitos (NaN si no hay). */
export function mediana(v: readonly number[]): number {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b)
  if (s.length === 0) return NaN
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

const NOMBRE_PARTE: Record<ParteCuerpo, string> = { hombro: 'hombro', cadera: 'cadera', rodilla: 'rodilla', tobillo: 'tobillo', talon: 'talón', punta: 'punta del pie' }
const n1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10 + 0).toFixed(1).replace('.', ',') : '—')
const n2 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 100) / 100 + 0).toFixed(2).replace('.', ',') : '—')
const pc = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : '—')

export function textoInforme(d: DatosInforme): string {
  const l: string[] = []
  l.push('dualkinema · experimento sin marcadores (fase 5, paso 1)')
  l.push(`Modelo: MediaPipe Pose Landmarker ${d.modelo} · ${d.delegado}${d.avisoDelegado ? ` (${d.avisoDelegado})` : ''}`)
  l.push(`Vídeo: ${d.ancho}×${d.alto}, ${n1(d.duracion)} s, ${d.total} frames, ${n1(d.fps)} fps medianos`)
  const segProceso = d.msProceso / 1000
  l.push(
    `Tiempo: carga ${n1(d.msCarga / 1000)} s; proceso ${n1(segProceso)} s para ${d.procesados} frames (${n1(d.procesados / Math.max(segProceso, 1e-9))} frames/s, ${n2(segProceso / Math.max(d.duracion, 1e-9))} × la duración); hacia atrás ${n1(d.msAtras / 1000)} s`,
  )
  const serieDe = (p: ParteCuerpo, lado: Lado) => d.trayectorias.get(idPose(p, lado)) ?? []
  const detectados = serieDe('cadera', d.lado).filter((m) => m && Number.isFinite(m.x)).length
  l.push(`Persona detectada: ${detectados} de ${d.procesados} frames (${pc(detectados, d.procesados)}), ${d.recuperados} de ellos recuperados hacia atrás`)
  const lado = d.lado === 'der' ? 'derecha' : 'izquierda'
  for (const [nombre, l2] of [[`pierna ${lado} (la de la cámara)`, d.lado], [`pierna ${d.lado === 'der' ? 'izquierda' : 'derecha'} (la lejana)`, d.lado === 'der' ? 'izq' : 'der']] as const) {
    const partes = (['cadera', 'rodilla', 'tobillo'] as const).map((p) => {
      const s = serieDe(p, l2)
      const vis = s.filter((m): m is Muestra2D => !!m && Number.isFinite(m.x)).map((m) => m.calidad)
      const utiles = s.filter((m) => m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)).length
      return `${NOMBRE_PARTE[p]} ${n2(mediana(vis))} (${pc(utiles, d.procesados)} ≥ ${n1(CALIDAD_MINIMA)})`
    })
    l.push(`Visibilidad mediana, ${nombre}: ${partes.join(' · ')}`)
  }
  l.push(`Flexión de la rodilla sin marcadores: ${d.conAngulo} frames con valor (${pc(d.conAngulo, d.total)}); filtro ${n1(d.corteHz)} Hz`)
  l.push(`Cambios de lado (izquierda ↔ derecha) detectados: ${d.cambiosLado}`)
  const c = d.comparacion
  if (!c) {
    l.push(d.framesGomets > 0 ? 'Gomets: muy pocos frames en común con el modelo para comparar.' : 'Gomets: la vista no tiene gomets seguidos (sin comparación).')
  } else {
    l.push(`Comparación con los gomets (sin marcadores − gomets), ${c.n} frames en común:`)
    l.push(`  diferencia media ${n1(c.media)}° · DE ${n1(c.de)}° · ECM ${n1(c.ecm)}° · ECM sin la diferencia media ${n1(c.ecmSinSesgo)}°`)
    l.push(`  rango gomets ${n1(c.rangoA.min)}° a ${n1(c.rangoA.max)}° (${n1(c.rangoA.max - c.rangoA.min)}°) · sin marcadores ${n1(c.rangoB.min)}° a ${n1(c.rangoB.max)}° (${n1(c.rangoB.max - c.rangoB.min)}°)`)
    l.push(`  correlación ${n2(c.correlacion)}`)
  }
  return l.join('\n')
}
