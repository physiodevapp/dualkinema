import { anguloConSigno, desenrollar, normalizarGrados } from '../geometria/angulo'
import { aCanonico, NORMAL_CANONICA, type OrientacionVista } from '../geometria/canonico'
import { segmento, type Vec3 } from '../geometria/vector'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import type { DefinicionArticulacion } from './definicion'

/**
 * Valor clínico de una articulación, en grados, a partir de puntos ya en un
 * marco donde `normal` es el eje del plano (canónico en 2D, anatómico en 3D).
 * NaN si falta algún punto o un segmento tiene longitud 0.
 */
export function anguloArticular(
  def: DefinicionArticulacion,
  puntos: ReadonlyMap<IdMarcador, Vec3>,
  normal: Vec3 = NORMAL_CANONICA,
): number {
  const p0 = puntos.get(def.proximal.desde)
  const p1 = puntos.get(def.proximal.hasta)
  const d0 = puntos.get(def.distal.desde)
  const d1 = puntos.get(def.distal.hasta)
  if (!p0 || !p1 || !d0 || !d1) return NaN
  const theta = anguloConSigno(segmento(p0, p1), segmento(d0, d1), normal)
  if (Number.isNaN(theta)) return NaN
  return normalizarGrados(def.signo * theta - def.cero)
}

export interface MuestraAngulo {
  readonly t: number
  /** Grados; NaN cuando no hay valor (marcador perdido o ausente). */
  readonly valor: number
}

/** Calidad mínima para usar una muestra. Por debajo, el marcador está perdido. */
export const CALIDAD_MINIMA = 0.5

/**
 * Serie temporal de una articulación en una vista 2D. Las trayectorias salen
 * de la misma tabla de frames, así que se emparejan por `t` exacto. Un instante
 * en el que falta algún marcador o su calidad es baja queda como hueco (NaN),
 * nunca interpolado. La serie se desenrolla para que no salte ±360°.
 */
export function serieAngular(
  def: DefinicionArticulacion,
  trayectorias: Readonly<Record<IdMarcador, readonly Muestra2D[]>>,
  orientacion: OrientacionVista,
): MuestraAngulo[] {
  if (def.plano !== orientacion.plano) {
    throw new Error(
      `La articulación «${def.nombre}» es del plano ${def.plano} y la vista es ${orientacion.plano}.`,
    )
  }
  const ids = [...new Set([def.proximal.desde, def.proximal.hasta, def.distal.desde, def.distal.hasta])]
  const porMarcador = ids.map((id) => {
    const m = new Map<number, Muestra2D>()
    for (const s of trayectorias[id] ?? []) m.set(s.t, s)
    return [id, m] as const
  })

  const tiempos = new Set<number>()
  for (const [, m] of porMarcador) for (const t of m.keys()) tiempos.add(t)
  const ordenados = [...tiempos].sort((a, b) => a - b)

  const crudos = ordenados.map((t) => {
    const puntos = new Map<IdMarcador, Vec3>()
    for (const [id, m] of porMarcador) {
      const s = m.get(t)
      if (s && s.calidad >= CALIDAD_MINIMA) puntos.set(id, aCanonico(s.x, s.y, orientacion))
    }
    return anguloArticular(def, puntos)
  })

  const continuos = desenrollar(crudos)
  return ordenados.map((t, i) => ({ t, valor: continuos[i] ?? NaN }))
}
