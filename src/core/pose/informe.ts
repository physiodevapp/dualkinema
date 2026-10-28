/*
 * Informe de la comparación sin marcadores frente a gomets (fase 5, paso 3b; el paso 1 tenía otro, del experimento): un
 * texto para copiar y pegar con lo que hace falta para validar el modelo (paso 5 de docs/plan-fase-5.md): qué detectó,
 * con qué, cuánto ve de la pierna de la cámara y cuánto se aparta de los gomets, a pelo y relativo al cero. Sin el nombre
 * del archivo (puede llevar el del paciente).
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import type { TramoEstatico } from '../articulaciones/cero'
import type { DeteccionPose, IdMarcador, Muestra2D } from '../modelo/tipos'
import type { Comparacion, ComparacionFuentes } from './comparar'
import { idPose, type ParteCuerpo } from './puntos'

export interface DatosInforme {
  readonly deteccion: DeteccionPose | null
  readonly ancho: number
  readonly alto: number
  readonly duracion: number
  readonly total: number
  readonly fps: number
  /** La pierna que ve la cámara. */
  readonly lado: Lado
  readonly trayectorias: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>
  /** El ángulo que se compara (sin «sin marcadores» en el nombre) y lo que da positivo. */
  readonly articulacion: string
  readonly positivo: string
  readonly comparacion: ComparacionFuentes
  /** El tramo del cero con que se compara relativo al cero (null = sin cero). */
  readonly tramo: TramoEstatico | null
  readonly corteHz: number
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
const n3 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 1000) / 1000 + 0).toFixed(3).replace('.', ',') : '—')
const pc = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : '—')

function lineasComparacion(c: Comparacion): string[] {
  return [
    `  ${c.n} frames con las dos · diferencia media ${n1(c.media)}° · DE ${n1(c.de)}° · ECM ${n1(c.ecm)}° · ECM sin la diferencia media ${n1(c.ecmSinSesgo)}°`,
    `  rango gomets ${n1(c.rangoA.min)}° a ${n1(c.rangoA.max)}° (${n1(c.rangoA.max - c.rangoA.min)}°) · sin marcadores ${n1(c.rangoB.min)}° a ${n1(c.rangoB.max)}° (${n1(c.rangoB.max - c.rangoB.min)}°) · correlación ${n2(c.correlacion)}`,
  ]
}

export function textoInforme(d: DatosInforme): string {
  const l: string[] = []
  l.push('dualkinema · sin marcadores frente a gomets (fase 5)')
  const det = d.deteccion
  l.push(
    det
      ? `Detección: ${det.libreria}, Pose Landmarker ${det.modelo} · ${det.delegado} · persona en ${det.conPersona} de ${d.total} frames (${pc(det.conPersona, d.total)}) · piernas corregidas en ${det.intercambiados} frames, dudosas en ${det.dudosos}`
      : 'Detección: sin datos',
  )
  l.push(`Vídeo: ${d.ancho}×${d.alto}, ${n1(d.duracion)} s, ${d.total} frames, ${n1(d.fps)} fps medianos; filtro ${n1(d.corteHz)} Hz`)
  const lado = d.lado === 'der' ? 'derecha' : 'izquierda'
  const partes = (['hombro', 'cadera', 'rodilla', 'tobillo', 'talon', 'punta'] as const).map((p) => {
    const s = d.trayectorias.get(idPose(p, d.lado)) ?? []
    const vis = s.filter((m): m is Muestra2D => !!m && Number.isFinite(m.x)).map((m) => m.calidad)
    const utiles = s.filter((m) => m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)).length
    return `${NOMBRE_PARTE[p]} ${n2(mediana(vis))} (${pc(utiles, d.total)} ≥ ${n1(CALIDAD_MINIMA)})`
  })
  l.push(`Visibilidad mediana, pierna ${lado} (la de la cámara): ${partes.join(' · ')}`)
  l.push(`${d.articulacion} (${d.positivo} +), sin marcadores − gomets:`)
  const c = d.comparacion
  if (!c.directa) l.push('  muy pocos frames con las dos para comparar')
  else {
    l.push('A pelo:', ...lineasComparacion(c.directa))
    if (c.relativa && d.tramo) {
      l.push(`Relativo al cero de cada una (tramo ${n3(d.tramo.desde)}–${n3(d.tramo.hasta)} s; cero gomets ${n1(c.ceroA)}°, sin marcadores ${n1(c.ceroB)}°):`)
      l.push(...lineasComparacion(c.relativa))
    } else l.push('Relativo al cero: sin cero de referencia (pon uno en «Análisis» para quitar la diferencia constante)')
  }
  return l.join('\n')
}
