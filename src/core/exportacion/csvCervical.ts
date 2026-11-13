/*
 * El CSV cervical (fase 10, D8): una fila por frame con las tres curvas respecto al neutro (filtradas) y la calidad, y en la
 * cabecera el neutro y el rango a cada lado con su asimetría. Sin valor, celda vacía (nunca 0).
 */
import type { TramoEstatico } from '../articulaciones/cero'
import { rango, type SeriesCervicales } from '../cervical/sesion'
import { BOM, celda, ESTILOS, numero, type FormatoCsv } from './csv'

export interface DatosCsvCervical {
  readonly archivo: string
  readonly exportado: string
  readonly tiempos: readonly number[]
  readonly calidad: ArrayLike<number>
  readonly cero: TramoEstatico
  readonly series: SeriesCervicales
  readonly corteHz: number
  /** Otra fuente de la orientación (dos móviles): se dice en la cabecera. */
  readonly fuente?: string
}

const PLANOS = [
  ['rotacion', 'rotación', 'izquierda', 'derecha'],
  ['flexion', 'flexo-extensión', 'flexión', 'extensión'],
  ['inclinacion', 'inclinación lateral', 'izquierda', 'derecha'],
] as const

export function construirCsvCervical(d: DatosCsvCervical, formato: FormatoCsv = 'es'): string {
  const e = ESTILOS[formato]
  const n = (v: number | undefined, dec: number) => numero(v, dec, e)
  const cab: [string, string][] = [
    ['dualkinema', 'cervical: orientación de la cabeza respecto al neutro'],
    ['exportado', d.exportado],
    ['archivo', d.archivo],
    ['fuente', d.fuente ?? 'Face Landmarker (MediaPipe), un móvil'],
    ['neutro', `${n(d.cero.desde, 3)} s a ${n(d.cero.hasta, 3)} s`],
    ['convención', 'rotación + izquierda; flexión +; inclinación + izquierda (grados)'],
    ['filtro', `Butterworth de 2.º orden ida y vuelta, ${n(d.corteHz, 1)} Hz`],
  ]
  for (const [k, nombre, pos, neg] of PLANOS) {
    const r = rango(d.series[k])
    cab.push([`rango de ${nombre}`, `${pos} ${n(r.positivo, 1)} · ${neg} ${n(r.negativo, 1)} · asimetría ${n(r.asimetria, 2)}`])
  }
  const lineas = cab.map(([clave, valor]) => `# ${celda(clave, e)}${e.sep}${celda(valor, e)}`)
  lineas.push(['t_s', 'frame', 'rotacion_grados', 'flexion_grados', 'inclinacion_grados', 'calidad_cara'].join(e.sep))
  d.tiempos.forEach((t, i) => {
    lineas.push([n(t, 6), String(i + 1), n(d.series.rotacion[i]?.valor, 2), n(d.series.flexion[i]?.valor, 2), n(d.series.inclinacion[i]?.valor, 2), n(d.calidad[i], 2)].join(e.sep))
  })
  return `${formato === 'es' ? BOM : ''}${lineas.join('\r\n')}\r\n`
}
