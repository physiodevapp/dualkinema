/*
 * Ciclos de marcha, normalización al % del ciclo, curva media y parámetros espaciotemporales (fase 9, D4–D6 de
 * docs/plan-fase-9.md).
 *
 * Un ciclo (zancada) va de un contacto al siguiente del mismo pie, con un despegue en medio, dentro de un mismo tramo de la
 * señal (sin huecos). Los que duran un 25 % más o menos que la mediana se descartan, con su motivo. Cada ciclo válido se
 * normaliza a 101 puntos (0–100 %) interpolando linealmente la serie del ángulo de siempre; un ciclo con algún frame sin
 * valor no se normaliza (nunca se inventa). La media y la desviación típica van punto a punto.
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import type { EventoMarcha, TramoSenal } from './eventos'

/** Puntos de un ciclo normalizado (0, 1, …, 100 %). */
export const PUNTOS_CICLO = 101
/** Desviación máxima de la duración de un ciclo respecto a la mediana. */
export const DESVIO_DURACION_MAX = 0.25

export type MotivoDescarte = 'duracion' | 'despegues' | 'hueco'

export interface Ciclo {
  readonly lado: Lado
  /** Contacto inicial y el siguiente del mismo pie (s, tiempo del vídeo). */
  readonly inicio: number
  readonly fin: number
  /** El despegue de en medio (null si no hay exactamente uno). */
  readonly despegue: number | null
  /** null = válido. */
  readonly descarte: MotivoDescarte | null
}

const mediana = (v: readonly number[]) => {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Los ciclos de un pie a partir de sus eventos (y los de la señal del talón, que no deben cruzar). */
export function ciclosDe(eventos: readonly EventoMarcha[], lado: Lado, tramos: readonly TramoSenal[]): Ciclo[] {
  const delPie = eventos.filter((e) => e.lado === lado).sort((a, b) => a.t - b.t)
  const contactos = delPie.filter((e) => e.tipo === 'contacto')
  const tramoDe = (t: number) => tramos.findIndex((tr) => t >= tr.desde - 1e-9 && t <= tr.hasta + 1e-9)
  const brutos: Ciclo[] = []
  for (let k = 0; k + 1 < contactos.length; k++) {
    const inicio = contactos[k]!.t
    const fin = contactos[k + 1]!.t
    const desp = delPie.filter((e) => e.tipo === 'despegue' && e.t > inicio && e.t < fin)
    const mismoTramo = tramos.length === 0 || (tramoDe(inicio) >= 0 && tramoDe(inicio) === tramoDe(fin))
    const descarte: MotivoDescarte | null = !mismoTramo ? 'hueco' : desp.length !== 1 ? 'despegues' : null
    brutos.push({ lado, inicio, fin, despegue: desp.length === 1 ? desp[0]!.t : null, descarte })
  }
  const m = mediana(brutos.filter((c) => !c.descarte).map((c) => c.fin - c.inicio))
  return brutos.map((c) => (!c.descarte && Math.abs(c.fin - c.inicio - m) > DESVIO_DURACION_MAX * m ? { ...c, descarte: 'duracion' } : c))
}

/** El valor de una serie (ordenada por t) en el instante `t`, interpolado linealmente entre sus dos frames; NaN si falta. */
function valorEn(serie: readonly MuestraAngulo[], t: number): number {
  let lo = 0
  let hi = serie.length - 1
  if (hi < 0 || t < serie[0]!.t - 1e-9 || t > serie[hi]!.t + 1e-9) return NaN
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (serie[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = serie[lo]!
  const b = serie[hi]!
  if (Math.abs(t - a.t) < 1e-9) return a.valor
  if (Math.abs(t - b.t) < 1e-9) return b.valor
  if (!Number.isFinite(a.valor) || !Number.isFinite(b.valor)) return NaN
  return a.valor + ((b.valor - a.valor) * (t - a.t)) / (b.t - a.t)
}

/**
 * Un ciclo normalizado a `PUNTOS_CICLO` puntos (0–100 %), de la serie del ángulo (una muestra por frame, ordenada por t):
 * null si algún frame dentro del ciclo (o de los que lo rodean) no tiene valor.
 */
export function normalizarCiclo(serie: readonly MuestraAngulo[], inicio: number, fin: number): number[] | null {
  if (!(fin > inicio)) return null
  for (const m of serie) if (m.t > inicio && m.t < fin && !Number.isFinite(m.valor)) return null
  const r: number[] = []
  for (let k = 0; k < PUNTOS_CICLO; k++) {
    const v = valorEn(serie, inicio + ((fin - inicio) * k) / (PUNTOS_CICLO - 1))
    if (!Number.isFinite(v)) return null
    r.push(v)
  }
  return r
}

/** Media y desviación típica (n − 1) punto a punto; con un ciclo, la DE es NaN; sin ciclos, null. */
export function mediaYDesviacion(ciclos: readonly (readonly number[])[]): { media: number[]; de: number[] } | null {
  const n = ciclos.length
  if (n === 0) return null
  const media: number[] = []
  const de: number[] = []
  for (let k = 0; k < PUNTOS_CICLO; k++) {
    const m = ciclos.reduce((s, c) => s + c[k]!, 0) / n
    media.push(m)
    de.push(n > 1 ? Math.sqrt(ciclos.reduce((s, c) => s + (c[k]! - m) ** 2, 0) / (n - 1)) : NaN)
  }
  return { media, de }
}

/** Media y desviación típica (n − 1) de una lista; NaN si no hay (o, la DE, con uno). */
export function mediaDe(v: readonly number[]): { media: number; de: number } {
  const n = v.length
  if (n === 0) return { media: NaN, de: NaN }
  const media = v.reduce((s, x) => s + x, 0) / n
  return { media, de: n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : NaN }
}

export interface ParametrosMarcha {
  readonly ciclos: number
  /** Tiempo de zancada (s). */
  readonly zancada: { readonly media: number; readonly de: number }
  /** Pasos por minuto (120 / zancada media). */
  readonly cadencia: number
  /** Apoyo, % de la zancada. */
  readonly apoyo: { readonly media: number; readonly de: number }
  /** En cinta: la cadera apenas avanza (no hay longitud ni velocidad). */
  readonly enCinta: boolean
  /** Longitud de zancada (m), con escala y por el suelo; null si no. */
  readonly longitud: { readonly media: number; readonly de: number } | null
  /** Velocidad (m/s), con escala y por el suelo; null si no. */
  readonly velocidad: number | null
}

/**
 * Los parámetros de los ciclos incluidos. `xCadera` y `xTalon` dan la posición hacia delante (x canónico, px) en un
 * instante; `largoPie` es la distancia talón–punta típica (px), para decidir si es en cinta (la cadera avanza menos de un pie
 * por ciclo); `metrosPorPx`, la escala de la vista (null sin ella).
 */
export function parametrosMarcha(
  ciclos: readonly Ciclo[],
  xCadera: (t: number) => number,
  xTalon: (t: number) => number,
  largoPie: number,
  metrosPorPx: number | null,
  enCintaForzado: boolean | null = null,
): ParametrosMarcha | null {
  const validos = ciclos.filter((c) => !c.descarte)
  if (validos.length === 0) return null
  const zancada = mediaDe(validos.map((c) => c.fin - c.inicio))
  const apoyo = mediaDe(validos.filter((c) => c.despegue !== null).map((c) => (100 * (c.despegue! - c.inicio)) / (c.fin - c.inicio)))
  const avances = validos.map((c) => xCadera(c.fin) - xCadera(c.inicio)).filter(Number.isFinite)
  const enCinta = enCintaForzado ?? (avances.length > 0 && Math.abs(mediana(avances)) < largoPie)
  let longitud: ParametrosMarcha['longitud'] = null
  let velocidad: number | null = null
  if (!enCinta && metrosPorPx !== null) {
    const l = validos.map((c) => Math.abs(xTalon(c.fin) - xTalon(c.inicio)) * metrosPorPx).filter(Number.isFinite)
    if (l.length) longitud = mediaDe(l)
    const v = validos.map((c) => (Math.abs(xCadera(c.fin) - xCadera(c.inicio)) * metrosPorPx) / (c.fin - c.inicio)).filter(Number.isFinite)
    if (v.length) velocidad = mediaDe(v).media
  }
  return { ciclos: validos.length, zancada, cadencia: 120 / zancada.media, apoyo, enCinta, longitud, velocidad }
}
