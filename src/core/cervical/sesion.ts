/*
 * Lo cervical de una vista (fase 10, D4, D7–D9): de lo que da el detector de la cara en cada frame a las tres curvas
 * cervicales filtradas respecto al neutro, el rango a cada lado y su asimetría, y lo que se guarda.
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import type { TramoEstatico } from '../articulaciones/cero'
import { esTramoEstatico } from '../articulaciones/cero'
import { filtrarTrayectoria, type AjustesFiltro } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import { anguloEntre, angulosCervicales, frontalidad, fusionar, giroDeTransformacion, giroEntreCamaras, giroMedio, IDENTIDAD, type Giro, type MedidaCabeza } from './orientacion'

/**
 * Lo de frente mínimo para usar un frame (D7): 0,35 ≈ la cara girada 70° respecto a la cámara. Más allá el detector
 * todavía puede dar algo, pero la malla de un perfil es poco fiable. **Pendiente de validar con vídeos.**
 */
export const CALIDAD_CARA_MINIMA = 0.35

/** La detección de la cara de una vista: el giro (9 números por frame, NaN sin cara) y su calidad (0 sin cara), y el cero. */
export interface CaraVista {
  readonly giros: Float64Array
  readonly calidad: Float32Array
  /** El tramo quieto del neutro (null: sin cero, no hay ángulos cervicales). */
  readonly cero: TramoEstatico | null
}

/** Lo que manda el worker en un frame. */
export interface FrameCara {
  readonly indice: number
  readonly matriz: readonly number[] | null
}

/** Una detección vacía de `total` frames (todo sin cara), para irla llenando con los lotes del worker. */
export function caraVacia(total: number): CaraVista {
  return { giros: new Float64Array(total * 9).fill(Number.NaN), calidad: new Float32Array(total), cero: null }
}

/** Pone los frames de un lote (en sitio: los arrays se comparten con quien los lee). Devuelve cuántos tienen cara. */
export function anotarFrames(c: CaraVista, lote: readonly FrameCara[]): number {
  let conCara = 0
  const total = c.calidad.length
  for (const f of lote) {
    if (f.indice < 0 || f.indice >= total) continue
    const r = f.matriz ? giroDeTransformacion(f.matriz) : null
    if (r) {
      c.giros.set(r, f.indice * 9)
      c.calidad[f.indice] = frontalidad(r)
      conCara++
    } else {
      c.giros.fill(Number.NaN, f.indice * 9, f.indice * 9 + 9)
      c.calidad[f.indice] = 0
    }
  }
  return conCara
}

/** La medida de la cabeza en un frame (null sin cara o por debajo de la calidad mínima). */
export function medidaEn(c: CaraVista, i: number): MedidaCabeza | null {
  const q = c.calidad[i] ?? 0
  if (!(q >= CALIDAD_CARA_MINIMA)) return null
  const g = Array.from(c.giros.subarray(i * 9, i * 9 + 9))
  return g.every(Number.isFinite) ? { giro: g as unknown as Giro, calidad: q } : null
}

/** El neutro: el giro medio de los frames utilizables del tramo (null si no hay ninguno). */
export function giroNeutro(medidas: readonly (MedidaCabeza | null)[], tiempos: readonly number[], tramo: TramoEstatico): Giro | null {
  const giros: Giro[] = []
  medidas.forEach((m, i) => {
    const t = tiempos[i]!
    if (m && t >= tramo.desde - 1e-9 && t <= tramo.hasta + 1e-9) giros.push(m.giro)
  })
  return giroMedio(giros)
}

export interface SeriesCervicales {
  readonly rotacion: MuestraAngulo[]
  readonly flexion: MuestraAngulo[]
  readonly inclinacion: MuestraAngulo[]
}

export type PlanoCervical = keyof SeriesCervicales

/**
 * Las tres curvas respecto al neutro, filtradas por tramos con el filtro de la sesión (nunca a través de un hueco: un frame
 * sin cara lo es). Una muestra por frame; sin valor, NaN.
 */
export function seriesCervicales(medidas: readonly (MedidaCabeza | null)[], tiempos: readonly number[], neutro: Giro, fs: number, ajustes: AjustesFiltro): SeriesCervicales {
  const crudas = medidas.map((m) => (m ? angulosCervicales(neutro, m.giro) : null))
  const filtrar = (k: PlanoCervical): MuestraAngulo[] => {
    const serie = crudas.map((a, i): Muestra2D | undefined => (a ? { t: tiempos[i]!, x: a[k], y: 0, calidad: 1, editadoManual: false } : undefined))
    const f = filtrarTrayectoria(serie, fs, ajustes)
    return tiempos.map((t, i) => ({ t, valor: f.posiciones[i]?.x ?? Number.NaN, interpolado: false }))
  }
  return { rotacion: filtrar('rotacion'), flexion: filtrar('flexion'), inclinacion: filtrar('inclinacion') }
}

export interface Rango {
  /** Lo más lejos hacia el lado positivo (izquierda, flexión) y hacia el negativo (derecha, extensión), en grados positivos. */
  readonly positivo: number
  readonly negativo: number
  /** (positivo − negativo) / (positivo + negativo); NaN si falta alguno. */
  readonly asimetria: number
}

/** El rango de una curva a cada lado (en un tramo de tiempo si se da): sin valores, NaN. */
export function rango(serie: readonly MuestraAngulo[], tramo?: TramoEstatico | null): Rango {
  let pos = Number.NaN
  let neg = Number.NaN
  for (const m of serie) {
    if (!Number.isFinite(m.valor) || (tramo && (m.t < tramo.desde - 1e-9 || m.t > tramo.hasta + 1e-9))) continue
    if (m.valor > 0) pos = Number.isFinite(pos) ? Math.max(pos, m.valor) : m.valor
    if (m.valor < 0) neg = Number.isFinite(neg) ? Math.max(neg, -m.valor) : -m.valor
  }
  const asimetria = Number.isFinite(pos) && Number.isFinite(neg) && pos + neg > 0 ? (pos - neg) / (pos + neg) : Number.NaN
  return { positivo: pos, negativo: neg, asimetria }
}

/** Lo guardado otra vez como detección, si se puede leer; si no, null (se vuelve a detectar). */
export function leerCara(v: unknown, total: number): CaraVista | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!(o.giros instanceof Float64Array) || !(o.calidad instanceof Float32Array)) return null
  if (o.calidad.length !== total || o.giros.length !== total * 9) return null
  if (o.cero !== null && !esTramoEstatico(o.cero)) return null
  return { giros: o.giros, calidad: o.calidad, cero: (o.cero as TramoEstatico | null) ?? null }
}

/** Bytes de los arrays (para lo que ocupa la sesión). */
export const bytesCara = (c: CaraVista): number => c.giros.byteLength + c.calidad.byteLength

/** La medida de B en el instante común de cada frame de A: la de su frame más cercano, si cae a menos de medio paso. */
function enInstantesDeA(tiemposA: readonly number[], desfaseA: number, medidasB: readonly (MedidaCabeza | null)[], tiemposB: readonly number[], desfaseB: number): (MedidaCabeza | null)[] {
  const pasoB = tiemposB.length > 1 ? (tiemposB[tiemposB.length - 1]! - tiemposB[0]!) / (tiemposB.length - 1) : Infinity
  let k = 0
  return tiemposA.map((tA) => {
    const tB = tA + desfaseA - desfaseB
    while (k + 1 < tiemposB.length && Math.abs(tiemposB[k + 1]! - tB) <= Math.abs(tiemposB[k]! - tB)) k++
    return Math.abs((tiemposB[k] ?? Infinity) - tB) <= pasoB / 2 + 1e-9 ? (medidasB[k] ?? null) : null
  })
}

export interface Fusion {
  /** Una medida por frame de A, en el marco de la cámara A (null sin cara en ninguno de los dos). */
  readonly medidas: (MedidaCabeza | null)[]
  /** Cuántos frames ha dado cada móvil (los dos a la vez cuentan en los dos) y cuántos frames comunes sacaron su giro. */
  readonly deA: number
  readonly deB: number
  readonly comunes: number
  /** El ángulo entre los dos móviles (grados), del giro que los une. */
  readonly anguloMoviles: number
}

/**
 * Dos móviles (D6): el giro de B al marco de A sacado de la propia cabeza en los frames que ven los dos, y en cada frame de A
 * la cabeza fusionada (el que mejor la ve o la media). null si no hay frames comunes para sacar el giro.
 */
export function fusionarVistas(
  a: { readonly medidas: readonly (MedidaCabeza | null)[]; readonly tiempos: readonly number[]; readonly desfase: number },
  b: { readonly medidas: readonly (MedidaCabeza | null)[]; readonly tiempos: readonly number[]; readonly desfase: number },
): Fusion | null {
  const bEnInstantes = enInstantesDeA(a.tiempos, a.desfase, b.medidas, b.tiempos, b.desfase)
  const bEnA = giroEntreCamaras(a.medidas, bEnInstantes, CALIDAD_CARA_MINIMA)
  if (!bEnA) return null
  const comunes = a.medidas.filter((m, i) => m && bEnInstantes[i]).length
  const medidas = a.medidas.map((m, i) => fusionar(m, bEnInstantes[i] ?? null, bEnA, CALIDAD_CARA_MINIMA))
  return {
    medidas,
    deA: a.medidas.filter(Boolean).length,
    deB: bEnInstantes.filter(Boolean).length,
    comunes,
    anguloMoviles: anguloEntre(IDENTIDAD, bEnA),
  }
}
