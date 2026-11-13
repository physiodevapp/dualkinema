/*
 * El CSV de los ciclos de marcha (fase 9, D8): una fila por % del ciclo (0–100), con la media, la DE y cada ciclo incluido
 * en columnas; en la cabecera, la articulación, el cero, los parámetros y cada ciclo con sus instantes. Sin valor, celda
 * vacía (nunca 0).
 */
import type { AnalisisMarcha } from '../marcha/analisis'
import { PUNTOS_CICLO } from '../marcha/ciclos'
import { BOM, celda, ESTILOS, numero, type FormatoCsv } from './csv'

export interface DatosCsvMarcha {
  readonly archivo: string
  readonly exportado: string
  readonly articulacion: { readonly id: string; readonly nombre: string }
  /** La media del cero (null sin cero: las curvas van a pelo). */
  readonly cero: number | null
  readonly corteHz: number
  readonly analisis: AnalisisMarcha
}

export function construirCsvMarcha(d: DatosCsvMarcha, formato: FormatoCsv = 'es'): string {
  const e = ESTILOS[formato]
  const n = (v: number | undefined, dec: number) => numero(v, dec, e)
  const a = d.analisis
  const p = a.parametros
  const usados = a.ciclos.filter((c) => !c.descarte && !c.excluido && c.curva)
  const cab: [string, string][] = [
    ['dualkinema', 'ciclos de marcha'],
    ['exportado', d.exportado],
    ['archivo', d.archivo],
    ['articulación', `${d.articulacion.nombre} (${d.articulacion.id})`],
    ['cero', d.cero === null ? 'sin cero (ángulo a pelo)' : `relativo al cero (${n(d.cero, 3)} grados)`],
    ['filtro', `Butterworth de 2.º orden ida y vuelta, ${n(d.corteHz, 1)} Hz`],
    ['ciclos en la media', String(usados.length)],
  ]
  if (p) {
    cab.push(['zancada (s)', `${n(p.zancada.media, 3)} ± ${n(p.zancada.de, 3)}`])
    cab.push(['cadencia (pasos/min)', n(p.cadencia, 1)])
    cab.push(['apoyo (% del ciclo)', `${n(p.apoyo.media, 1)} ± ${n(p.apoyo.de, 1)}`])
    cab.push(['en cinta', p.enCinta ? 'sí' : 'no'])
    if (p.longitud) cab.push(['longitud de zancada (m)', `${n(p.longitud.media, 3)} ± ${n(p.longitud.de, 3)}`])
    if (p.velocidad !== null) cab.push(['velocidad (m/s)', n(p.velocidad, 3)])
  }
  usados.forEach((c, k) => cab.push([`ciclo ${k + 1}`, `${n(c.inicio, 3)} s a ${n(c.fin, 3)} s, despegue ${c.despegue === null ? '—' : `${n(c.despegue, 3)} s`}`]))
  const lineas = cab.map(([clave, valor]) => `# ${celda(clave, e)}${e.sep}${celda(valor, e)}`)
  lineas.push(['ciclo_pct', 'media_grados', 'de_grados', ...usados.map((_, k) => `ciclo_${k + 1}_grados`)].join(e.sep))
  for (let i = 0; i < PUNTOS_CICLO; i++) {
    lineas.push([String(i), n(a.media?.media[i], 3), n(a.media?.de[i], 3), ...usados.map((c) => n(c.curva![i], 3))].join(e.sep))
  }
  return `${formato === 'es' ? BOM : ''}${lineas.join('\r\n')}\r\n`
}
