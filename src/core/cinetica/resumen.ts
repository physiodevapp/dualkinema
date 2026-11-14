/*
 * Lo que se resume de la cinética de una toma (fase 11, paso 2): por pierna y articulación, el pico de cada componente
 * (el máximo positivo: extensor, flexor plantar o abductor) y la asimetría entre las dos piernas; y el reparto del peso
 * entre los pies (la parte que lleva el derecho) en cada frame con apoyo. Sin valor = NaN, nunca 0.
 */
import type { Lado } from '../articulaciones/catalogo'
import type { IdArticulacionCinetica, ResultadoCinetica } from './dinamica'

export const ARTICULACIONES_CINETICA: readonly IdArticulacionCinetica[] = ['cadera', 'rodilla', 'tobillo']
export type Componente = 'sagital' | 'frontal'

/** El máximo finito de una serie (NaN si no hay ninguno). */
export function maximo(v: readonly number[]): number {
  let m = -Infinity
  for (const x of v) if (Number.isFinite(x) && x > m) m = x
  return m === -Infinity ? NaN : m
}

/**
 * La asimetría de dos valores, en % de su media: (der − izq) / media · 100 (+ el derecho mayor). NaN si falta alguno o la
 * media es casi nula (|media| < 0,05 N·m/kg: un porcentaje de casi nada no dice nada).
 */
export function asimetria(der: number, izq: number): number {
  const media = (der + izq) / 2
  if (!Number.isFinite(media) || Math.abs(media) < 0.05) return NaN
  return ((der - izq) / media) * 100
}

export interface PicoArticulacion {
  readonly der: number
  readonly izq: number
  readonly asimetria: number
}

/** Los picos de una componente de cada articulación en las dos piernas (N·m/kg). */
export function picos(r: ResultadoCinetica, componente: Componente): Record<IdArticulacionCinetica, PicoArticulacion> {
  const res = {} as Record<IdArticulacionCinetica, PicoArticulacion>
  for (const a of ARTICULACIONES_CINETICA) {
    const der = maximo(r.articulaciones.der[a][componente])
    const izq = maximo(r.articulaciones.izq[a][componente])
    res[a] = { der, izq, asimetria: asimetria(der, izq) }
  }
  return res
}

/**
 * La parte del peso (de la fuerza vertical total) que lleva cada pie en cada frame, en %: NaN sin apoyo (o con fuerza
 * vertical casi nula). Las dos suman 100.
 */
export function repartoPeso(r: ResultadoCinetica): Record<Lado, number[]> {
  const der: number[] = []
  const izq: number[] = []
  for (let k = 0; k < r.tiempos.length; k++) {
    const fd = r.pies.der.fuerza[k]!.z
    const fi = r.pies.izq.fuerza[k]!.z
    const total = fd + fi
    const vale = Number.isFinite(total) && total > 1e-6
    der.push(vale ? (100 * fd) / total : NaN)
    izq.push(vale ? (100 * fi) / total : NaN)
  }
  return { der, izq }
}

/** La media finita de una serie (NaN si no hay ningún valor). */
export function media(v: readonly number[]): number {
  let s = 0
  let n = 0
  for (const x of v) {
    if (!Number.isFinite(x)) continue
    s += x
    n++
  }
  return n ? s / n : NaN
}
