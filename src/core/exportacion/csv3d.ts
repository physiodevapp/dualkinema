/*
 * CSV del 3D (fase 6, paso 4): una fila por frame de la vista A (tiempo común), con los ángulos 3D filtrados de todas las
 * articulaciones (y el relativo al cero de la que lo tenga) y las coordenadas 3D filtradas de cada punto del cuerpo en el
 * marco del laboratorio (m; sin escala, en unidades de la distancia entre los móviles). Una celda sin valor queda vacía,
 * nunca a 0. Mismos formatos que el CSV de 2D (`csv.ts`).
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import type { IdMarcador } from '../modelo/tipos'
import type { Articulacion3D } from '../tresd/angulos3d'
import type { Calibracion3D } from '../tresd/calibracion3d'
import type { Trayectorias3D } from '../tresd/puntos3d'
import { BOM, celda, ESTILOS, numero, type FormatoCsv } from './csv'

export interface DatosCsv3D {
  readonly tr: Trayectorias3D
  readonly calibracion: Calibracion3D
  readonly angulos: readonly { readonly art: Articulacion3D; readonly serie: readonly MuestraAngulo[]; readonly cero: number | null }[]
  /** Los ángulos del esqueleto (fase 7), si se ha ajustado: con `conFiable`, una columna 1/0 de si se ve (D4). */
  readonly esqueleto?: readonly { readonly art: { readonly id: string; readonly nombre: string; readonly positivo: string }; readonly serie: readonly (MuestraAngulo & { readonly fiable?: boolean })[]; readonly cero: number | null; readonly conFiable: boolean }[]
  readonly puntos: readonly IdMarcador[]
  readonly corteHz: number
  readonly sincronia: string
}

export function construirCsv3D(d: DatosCsv3D, formato: FormatoCsv = 'es'): string {
  const e = ESTILOS[formato]
  const n = (v: number | undefined, dec: number) => numero(v, dec, e)
  const u = d.tr.enMetros ? 'm' : 'u'
  const c = d.calibracion
  const cabecera: [string, string][] = [
    ['dualkinema', '3D calibrado con la persona'],
    ['calibración', `${c.fecha} · error de reproyección mediano ${n(c.errorMediano, 2)} px`],
    ['escala', c.escalaDe === 'cinta' ? 'distancia entre móviles con cinta' : c.escalaDe === 'estatura' ? 'estatura' : 'sin escala (u = distancia entre móviles)'],
    ['marco', 'z hacia arriba desde el suelo; x hacia delante de la persona al empezar; origen bajo el punto medio de las caderas'],
    ['filtro', `Butterworth 2.º orden ida y vuelta, ${n(d.corteHz, 1)} Hz`],
    ['sincronización', d.sincronia],
    ...[...d.angulos, ...(d.esqueleto ?? [])].map((a): [string, string] => [a.art.id, `${a.art.nombre}; + ${a.art.positivo}${a.cero !== null ? `; cero ${n(a.cero, 2)}°` : ''}`]),
  ]
  const lineas = cabecera.map(([k, v]) => `# ${celda(k, e)}${e.sep}${celda(v, e)}`)
  const columnas = ['t_comun_s', 'frame']
  for (const a of d.angulos) columnas.push(`${a.art.id}_grados`, ...(a.cero !== null ? [`${a.art.id}_relativo_grados`] : []))
  for (const a of d.esqueleto ?? []) columnas.push(`${a.art.id}_grados`, ...(a.cero !== null ? [`${a.art.id}_relativo_grados`] : []), ...(a.conFiable ? [`${a.art.id}_fiable`] : []))
  for (const id of d.puntos) columnas.push(`${id}_x_${u}`, `${id}_y_${u}`, `${id}_z_${u}`)
  lineas.push(columnas.join(e.sep))
  d.tr.tiempos.forEach((t, i) => {
    const f = [n(t, 6), String(i + 1)]
    for (const a of d.angulos) {
      const v = a.serie[i]?.valor
      f.push(n(v, 3))
      if (a.cero !== null) f.push(n(v !== undefined ? v - a.cero : undefined, 3))
    }
    for (const a of d.esqueleto ?? []) {
      const m = a.serie[i]
      const v = m?.valor
      f.push(n(v, 3))
      if (a.cero !== null) f.push(n(v !== undefined ? v - a.cero : undefined, 3))
      if (a.conFiable) f.push(m && Number.isFinite(m.valor) ? (m.fiable === false ? '0' : '1') : '')
    }
    for (const id of d.puntos) {
      const p = d.tr.series.get(id)?.[i]
      const ok = p && p.calidad > 0
      f.push(n(ok ? p.x : undefined, 4), n(ok ? p.y : undefined, 4), n(ok ? p.z : undefined, 4))
    }
    lineas.push(f.join(e.sep))
  })
  return `${formato === 'es' ? BOM : ''}${lineas.join('\r\n')}\r\n`
}
