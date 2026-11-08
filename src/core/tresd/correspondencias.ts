/*
 * Las correspondencias para calibrar en 3D (fase 6, D4 y D6 de docs/plan-fase-6.md): el mismo punto del cuerpo visto por
 * las dos vistas en el mismo instante. Los instantes son los frames de la vista A (la de referencia); la posición de la
 * vista B en ese instante se interpola entre sus dos frames vecinos **si los dos son utilizables y no hay un salto en el
 * tiempo entre ellos** (nunca a través de un hueco ni inventando: si no, no hay correspondencia). El tiempo común es el
 * del vídeo más su desfase, así que el instante de B es t_A + desfase_A − desfase_B.
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import { SALTO_MAX_PASOS } from '../filtros/tramos'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { indiceEnTiempo, type TablaFrames } from '../tiempo/tablaFrames'
import type { Correspondencia } from './calibrar'

/** Una vista para emparejar: sus trayectorias por frame, su tabla de tiempos, su desfase (s) y su paso típico (1/fps). */
export interface VistaParaEmparejar {
  readonly series: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>
  readonly tabla: TablaFrames
  readonly desfase: number
  readonly paso: number
}

/** Muestras de calibración: los instantes que se usan como mucho (repartidos en el tramo) y los puntos mínimos de cada uno. */
export const INSTANTES_MAXIMOS = 400
export const PUNTOS_MINIMOS_INSTANTE = 4

const utilizable = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x) && Number.isFinite(m.y)

/**
 * La posición de un marcador de una vista en su instante `t` (tiempo de su vídeo): la de un frame justo en `t`, o la
 * interpolada linealmente entre el anterior y el siguiente si los dos son utilizables y no los separa un salto en el
 * tiempo (más de `SALTO_MAX_PASOS` pasos). null si no se puede.
 */
export function posicionEn(serie: readonly (Muestra2D | undefined)[], tabla: TablaFrames, paso: number, t: number): { readonly x: number; readonly y: number; readonly calidad: number } | null {
  const ts = tabla.tiempos
  if (!ts.length || t < ts[0]! - 1e-9 || t > ts[ts.length - 1]! + 1e-9) return null
  const i = indiceEnTiempo(tabla, t + 1e-9)
  const a = serie[i]
  if (Math.abs(ts[i]! - t) <= 1e-6) return utilizable(a) ? { x: a.x, y: a.y, calidad: a.calidad } : null
  const b = serie[i + 1]
  const tb = ts[i + 1]
  if (tb === undefined || !utilizable(a) || !utilizable(b) || tb - ts[i]! > SALTO_MAX_PASOS * paso) return null
  const k = (t - ts[i]!) / (tb - ts[i]!)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, calidad: Math.min(a.calidad, b.calidad) }
}

/** Una correspondencia con el instante (tiempo común, s) del que sale. */
export interface CorrespondenciaEnTiempo extends Correspondencia {
  readonly t: number
}

/**
 * Las correspondencias de los marcadores `ids` entre las dos vistas en el tramo (tiempo común; sin él, toda la toma):
 * de los frames de A con al menos `PUNTOS_MINIMOS_INSTANTE` puntos vistos por las dos, como mucho `maximo` repartidos
 * por igual en el tiempo (para que no manden los ratos quietos ni la toma larga dé miles de incógnitas).
 */
export function correspondencias(
  a: VistaParaEmparejar,
  b: VistaParaEmparejar,
  ids: readonly IdMarcador[],
  { tramo = null, maximo = INSTANTES_MAXIMOS }: { readonly tramo?: { readonly desde: number; readonly hasta: number } | null; readonly maximo?: number } = {},
): CorrespondenciaEnTiempo[] {
  const porInstante: CorrespondenciaEnTiempo[][] = []
  a.tabla.tiempos.forEach((tA, i) => {
    const comun = tA + a.desfase
    if (tramo && (comun < tramo.desde - 1e-9 || comun > tramo.hasta + 1e-9)) return
    const tB = comun - b.desfase
    const lote: CorrespondenciaEnTiempo[] = []
    for (const id of ids) {
      const ma = a.series.get(id)?.[i]
      if (!utilizable(ma)) continue
      const sb = b.series.get(id)
      const pb = sb ? posicionEn(sb, b.tabla, b.paso, tB) : null
      if (pb) lote.push({ id, t: comun, a: { u: ma.x, v: ma.y }, b: { u: pb.x, v: pb.y } })
    }
    if (lote.length >= PUNTOS_MINIMOS_INSTANTE) porInstante.push(lote)
  })
  if (porInstante.length <= maximo) return porInstante.flat()
  // Repartidos: el k-ésimo de `maximo` cae en la posición proporcional.
  const r: CorrespondenciaEnTiempo[] = []
  for (let k = 0; k < maximo; k++) r.push(...porInstante[Math.floor((k * porInstante.length) / maximo)]!)
  return r
}

/** Cuántos instantes tienen correspondencias bastantes (para decir si se puede calibrar antes de intentarlo). */
export const instantesConCorrespondencias = (c: readonly CorrespondenciaEnTiempo[]): number => new Set(c.map((x) => x.t)).size
