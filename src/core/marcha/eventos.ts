/*
 * Los eventos del ciclo de marcha en una vista de perfil (fase 9, D1–D3 de docs/plan-fase-9.md).
 *
 * Contacto inicial = el talón en su punto más adelantado respecto a la cadera; despegue = la punta del pie en su punto más
 * atrasado (Zeni y cols., 2008). «Adelante» es el x del marco canónico de la vista (`aCanonico`): vale mirando a un lado o
 * al otro, y andando por el suelo o en cinta (es relativo a la pelvis).
 *
 * Las señales (talón − cadera y punta − cadera, en x) se filtran por tramos con el filtro de la sesión, como cualquier
 * trayectoria: nunca a través de un hueco ni de un salto en el tiempo. En cada tramo se buscan los extremos con una
 * separación mínima y una prominencia mínima, y el instante se afina con la parábola de los tres frames (por tiempo: los
 * móviles graban con fps variable). Un extremo en el borde de un tramo no cuenta: no se sabe si lo era.
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import { aCanonico, type OrientacionVista } from '../geometria/canonico'
import type { Muestra2D } from '../modelo/tipos'
import { filtrarTrayectoria, type AjustesFiltro } from '../filtros/tramos'

export type TipoEvento = 'contacto' | 'despegue'

export interface EventoMarcha {
  readonly tipo: TipoEvento
  readonly lado: Lado
  /** Tiempo del vídeo (s). */
  readonly t: number
  /** Puesto o movido a mano (D7): manda sobre lo detectado. */
  readonly manual?: boolean
}

/** Las trayectorias de un pie y su cadera, una muestra (o nada) por frame. */
export interface PuntosPie {
  readonly cadera: readonly (Muestra2D | undefined)[]
  readonly talon: readonly (Muestra2D | undefined)[]
  readonly punta: readonly (Muestra2D | undefined)[]
}

/** Separación mínima entre dos eventos iguales del mismo pie (s). */
export const SEPARACION_MIN_S = 0.4
/** Prominencia mínima de un extremo, como fracción del recorrido de la señal en su tramo. */
export const PROMINENCIA_MIN = 0.2

/** Un tramo de la señal (sin huecos), en tiempo del vídeo. */
export interface TramoSenal {
  readonly desde: number
  readonly hasta: number
}

const util = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x) && Number.isFinite(m.y)

/**
 * La señal relativa (x canónico del punto menos el de la cadera) por frame, como muestras (en y, 0): sin muestra donde
 * falta alguno de los dos.
 */
function relativa(punto: readonly (Muestra2D | undefined)[], cadera: readonly (Muestra2D | undefined)[], o: OrientacionVista): (Muestra2D | undefined)[] {
  return punto.map((p, i) => {
    const c = cadera[i]
    if (!util(p) || !util(c)) return undefined
    const x = aCanonico(p.x, p.y, o).x - aCanonico(c.x, c.y, o).x
    return { t: p.t, x, y: 0, calidad: 1, editadoManual: false }
  })
}

/** El vértice de la parábola que pasa por tres puntos (t, v): su instante (si no, el del medio). */
function vertice(t0: number, v0: number, t1: number, v1: number, t2: number, v2: number): number {
  const d0 = (v1 - v0) / (t1 - t0)
  const d1 = (v2 - v1) / (t2 - t1)
  const a = (d1 - d0) / (t2 - t0)
  if (!(a < 0) || !Number.isFinite(a)) return t1
  const b = d0 - a * (t0 + t1)
  const t = -b / (2 * a)
  return t >= t0 && t <= t2 ? t : t1
}

/**
 * Los máximos de una señal de un tramo (`ts` crecientes): locales, sin los bordes, con prominencia de al menos `PROMINENCIA_MIN`
 * del recorrido del tramo y separados al menos `SEPARACION_MIN_S` (se quedan los más altos). Devuelve sus instantes, afinados.
 */
export function maximos(ts: ArrayLike<number>, v: ArrayLike<number>): number[] {
  const n = v.length
  if (n < 3) return []
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    min = Math.min(min, v[i]!)
    max = Math.max(max, v[i]!)
  }
  const recorrido = max - min
  if (!(recorrido > 0)) return []
  const candidatos: { i: number; prominencia: number }[] = []
  for (let i = 1; i < n - 1; i++) {
    if (!(v[i]! > v[i - 1]! && v[i]! >= v[i + 1]!)) continue
    // Prominencia: lo que sobresale sobre el más alto de los dos valles hasta un pico más alto (o el borde).
    let izq = v[i]!
    for (let k = i - 1; k >= 0 && v[k]! <= v[i]!; k--) izq = Math.min(izq, v[k]!)
    let der = v[i]!
    for (let k = i + 1; k < n && v[k]! <= v[i]!; k++) der = Math.min(der, v[k]!)
    const prominencia = v[i]! - Math.max(izq, der)
    if (prominencia >= PROMINENCIA_MIN * recorrido) candidatos.push({ i, prominencia })
  }
  // Separación: de más alto a más bajo, se descarta lo que caiga cerca de uno ya elegido.
  const elegidos: number[] = []
  for (const c of [...candidatos].sort((a, b) => v[b.i]! - v[a.i]!)) {
    if (elegidos.every((j) => Math.abs(ts[j]! - ts[c.i]!) >= SEPARACION_MIN_S)) elegidos.push(c.i)
  }
  return elegidos.sort((a, b) => a - b).map((i) => vertice(ts[i - 1]!, v[i - 1]!, ts[i]!, v[i]!, ts[i + 1]!, v[i + 1]!))
}

/** Los extremos de una señal relativa filtrada por tramos: los máximos (o los mínimos, con `signo` −1) y los tramos. */
function extremos(serie: readonly (Muestra2D | undefined)[], signo: 1 | -1, fs: number, ajustes: AjustesFiltro): { instantes: number[]; tramos: TramoSenal[] } {
  const f = filtrarTrayectoria(serie, fs, ajustes)
  const instantes: number[] = []
  const tramos: TramoSenal[] = []
  for (const tr of f.tramos) {
    const ts: number[] = []
    const vs: number[] = []
    for (let i = tr.primero; i <= tr.ultimo; i++) {
      const p = f.posiciones[i]!
      ts.push(p.t)
      vs.push(signo * p.x)
    }
    tramos.push({ desde: ts[0]!, hasta: ts[ts.length - 1]! })
    if (!tr.corto) instantes.push(...maximos(ts, vs))
  }
  return { instantes, tramos }
}

export interface DeteccionPie {
  readonly eventos: readonly EventoMarcha[]
  /** Los tramos de la señal del talón (los ciclos no los cruzan). */
  readonly tramos: readonly TramoSenal[]
}

/** Los contactos y despegues de un pie (`fs`: los fps medianos del vídeo; `ajustes`: el filtro de la sesión). */
export function detectarEventos(p: PuntosPie, lado: Lado, o: OrientacionVista, fs: number, ajustes: AjustesFiltro): DeteccionPie {
  return eventosDeSenales(relativa(p.talon, p.cadera, o), relativa(p.punta, p.cadera, o), lado, fs, ajustes)
}

/**
 * Los contactos y despegues a partir de las señales ya relativas a la pelvis (en `x`, hacia delante; una muestra o nada por
 * frame): las de una vista de perfil (`detectarEventos`) o las de los puntos 3D (`marcha/tresd.ts`).
 */
export function eventosDeSenales(
  talon: readonly (Muestra2D | undefined)[],
  punta: readonly (Muestra2D | undefined)[],
  lado: Lado,
  fs: number,
  ajustes: AjustesFiltro,
): DeteccionPie {
  const contactos = extremos(talon, 1, fs, ajustes)
  const despegues = extremos(punta, -1, fs, ajustes)
  const eventos: EventoMarcha[] = [
    ...contactos.instantes.map((t) => ({ tipo: 'contacto' as const, lado, t })),
    ...despegues.instantes.map((t) => ({ tipo: 'despegue' as const, lado, t })),
  ].sort((a, b) => a.t - b.t)
  return { eventos, tramos: contactos.tramos }
}

/** Dos eventos son el mismo si son del mismo tipo y pie y caen a menos de esto (s). */
export const MISMO_EVENTO_S = 0.15

/**
 * Lo detectado junto con lo corregido a mano (D7): un evento manual quita los detectados del mismo tipo y pie que caigan
 * cerca (`MISMO_EVENTO_S`); `quitados` (instantes de eventos detectados que se quitaron a mano) quita los detectados que
 * caigan cerca de ellos. Ordenados por tiempo.
 */
export function conCorrecciones(
  detectados: readonly EventoMarcha[],
  manuales: readonly EventoMarcha[],
  quitados: readonly Omit<EventoMarcha, 'manual'>[] = [],
): EventoMarcha[] {
  const cerca = (a: Omit<EventoMarcha, 'manual'>, b: Omit<EventoMarcha, 'manual'>) => a.tipo === b.tipo && a.lado === b.lado && Math.abs(a.t - b.t) < MISMO_EVENTO_S
  const quedan = detectados.filter((d) => !manuales.some((m) => cerca(d, m)) && !quitados.some((q) => cerca(d, q)))
  return [...quedan, ...manuales.map((m) => ({ ...m, manual: true }))].sort((a, b) => a.t - b.t)
}

/**
 * La posición hacia delante (x canónico, px) de un punto en un instante, interpolada linealmente entre sus dos frames si los
 * dos son utilizables; NaN si no.
 */
export function adelanteEn(serie: readonly (Muestra2D | undefined)[], o: OrientacionVista): (t: number) => number {
  const frames = serie.flatMap((m, i) => (util(m) ? [{ i, t: m.t, x: aCanonico(m.x, m.y, o).x }] : []))
  return (t) => {
    const k = frames.findIndex((f) => f.t >= t - 1e-9)
    if (k < 0) return NaN
    const b = frames[k]!
    if (Math.abs(b.t - t) < 1e-9) return b.x
    const a = frames[k - 1]
    // Solo entre dos frames seguidos: nunca a través de un hueco.
    if (!a || a.i !== b.i - 1) return NaN
    return a.x + ((b.x - a.x) * (t - a.t)) / (b.t - a.t)
  }
}
