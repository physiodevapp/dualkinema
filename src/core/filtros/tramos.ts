import type { Muestra2D } from '../modelo/tipos'
import { esUtil } from '../seguimiento/interpolar'
import { corteEfectivo, filtrarEquiespaciado, MUESTRAS_MINIMAS } from './butterworth'
import { splineNatural } from './spline'

/*
 * Filtrado de las trayectorias de los marcadores (decisiones D1 y D2 de la
 * fase 2). Se filtran las coordenadas (x e y por separado); ángulos y
 * derivadas se calculan después, con lo filtrado.
 *
 * Un Butterworth necesita muestras equiespaciadas y los móviles graban con
 * fps variable. Por eso cada tramo:
 *   1. se remuestrea con spline cúbico a una rejilla uniforme, de paso lo más
 *      cercano posible al de la mediana de los fps del vídeo, que empieza y
 *      acaba justo en el primer y el último frame del tramo (nada de
 *      extrapolar);
 *   2. se filtra a esa frecuencia;
 *   3. se vuelve con spline a los tiempos reales de cada frame.
 * No inventa datos: solo reparte en el tiempo lo que ya está medido. Si los
 * frames ya están equiespaciados, la rejilla coincide con ellos y el
 * resultado es el del filtro sin remuestrear.
 *
 * Tramos: frames consecutivos con posición utilizable (la misma regla que el
 * ángulo: calidad ≥ CALIDAD_MINIMA; lo marcado a mano y lo interpolado a
 * petición entran y conservan su marca). Nunca se filtra a través de un
 * hueco. Un tramo con menos de MUESTRAS_MINIMAS se filtra igual (con la
 * reflexión que permite su longitud) pero queda marcado `corto`: sus bordes
 * no son fiables y no se derivan.
 */

export const CORTE_DEFECTO_HZ = 6
export const CORTE_MIN_HZ = 2
export const CORTE_MAX_HZ = 15

/** Ajustes del filtro que se guardan con la sesión (null en la sesión = los de por defecto). */
export interface AjustesFiltro {
  readonly corteHz: number
}

export const AJUSTES_FILTRO_DEFECTO: AjustesFiltro = { corteHz: CORTE_DEFECTO_HZ }

export function esAjustesFiltro(v: unknown): v is AjustesFiltro {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = (v as Record<string, unknown>).corteHz
  return typeof c === 'number' && Number.isFinite(c) && c >= CORTE_MIN_HZ && c <= CORTE_MAX_HZ && Object.keys(v).length === 1
}

export interface Tramo {
  /** Primer y último frame del tramo (índices de la tabla de frames). */
  readonly primero: number
  readonly ultimo: number
  readonly muestras: number
  /** Menos de MUESTRAS_MINIMAS: filtrado, pero sin derivadas. */
  readonly corto: boolean
}

export interface PosicionFiltrada {
  readonly t: number
  readonly x: number
  readonly y: number
  /** Pertenece a un tramo corto. */
  readonly corto: boolean
  /** La posición de partida estaba interpolada a petición: sigue marcada. */
  readonly interpolado: boolean
  readonly editadoManual: boolean
}

export interface TrayectoriaFiltrada {
  /** Una por frame, o undefined donde no había posición utilizable. */
  readonly posiciones: readonly (PosicionFiltrada | undefined)[]
  readonly tramos: readonly Tramo[]
}

/** Tramos de frames consecutivos con posición utilizable. */
export function tramosUtiles(serie: readonly (Muestra2D | undefined)[]): Tramo[] {
  const r: Tramo[] = []
  let inicio = -1
  for (let i = 0; i <= serie.length; i++) {
    const util = i < serie.length && esUtil(serie[i])
    if (util && inicio < 0) inicio = i
    if (!util && inicio >= 0) {
      const muestras = i - inicio
      r.push({ primero: inicio, ultimo: i - 1, muestras, corto: muestras < MUESTRAS_MINIMAS })
      inicio = -1
    }
  }
  return r
}

/**
 * Filtra varias señales que comparten tiempos (x e y de un tramo). `ts`
 * estrictamente creciente; `fs` es la frecuencia de muestreo de referencia
 * (mediana de los fps del vídeo).
 */
export function filtrarTramo(
  ts: readonly number[],
  canales: readonly (readonly number[])[],
  fs: number,
  corteHz: number,
): Float64Array[] {
  const n = ts.length
  if (n <= 1) return canales.map((c) => Float64Array.from(c))
  const t0 = ts[0]!
  const duracion = ts[n - 1]! - t0
  // Rejilla uniforme de paso ≈ 1/fs que encaja justo en [t0, tn].
  const pasos = Math.max(1, Math.round(duracion * fs))
  const h = duracion / pasos
  const fsTramo = 1 / h
  const corte = corteEfectivo(corteHz, fsTramo)
  const tiemposRejilla = new Float64Array(pasos + 1)
  for (let k = 0; k <= pasos; k++) tiemposRejilla[k] = k === pasos ? ts[n - 1]! : t0 + k * h
  return canales.map((valores) => {
    const ida = splineNatural(ts, valores)
    const rejilla = tiemposRejilla.map((t) => ida(t))
    const filtrada = filtrarEquiespaciado(rejilla, fsTramo, corte)
    const vuelta = splineNatural(tiemposRejilla, filtrada)
    const r = new Float64Array(n)
    for (let i = 0; i < n; i++) r[i] = vuelta(ts[i]!)
    return r
  })
}

/**
 * Filtra la trayectoria de un marcador (una muestra o nada por frame), tramo
 * a tramo. `fs`: mediana de los fps del vídeo (`fpsMediano`).
 */
export function filtrarTrayectoria(
  serie: readonly (Muestra2D | undefined)[],
  fs: number,
  ajustes: AjustesFiltro = AJUSTES_FILTRO_DEFECTO,
): TrayectoriaFiltrada {
  const posiciones: (PosicionFiltrada | undefined)[] = new Array(serie.length)
  const tramos = tramosUtiles(serie)
  for (const tramo of tramos) {
    const ms: Muestra2D[] = []
    for (let i = tramo.primero; i <= tramo.ultimo; i++) ms.push(serie[i]!)
    const ts = ms.map((m) => m.t)
    const [xs, ys] = filtrarTramo(ts, [ms.map((m) => m.x), ms.map((m) => m.y)], fs, ajustes.corteHz)
    ms.forEach((m, k) => {
      posiciones[tramo.primero + k] = {
        t: m.t,
        x: xs![k]!,
        y: ys![k]!,
        corto: tramo.corto,
        interpolado: !!m.interpolado,
        editadoManual: m.editadoManual,
      }
    })
  }
  return { posiciones, tramos }
}

/**
 * Lo filtrado como muestras, para pasarlo a los cálculos que trabajan con
 * Muestra2D (el ángulo). Calidad 1: es utilizable; las marcas de origen
 * (a mano, interpolado) se conservan.
 */
export function comoMuestras(f: TrayectoriaFiltrada): Muestra2D[] {
  const r: Muestra2D[] = []
  for (const p of f.posiciones) {
    if (p) r.push({ t: p.t, x: p.x, y: p.y, calidad: 1, editadoManual: p.editadoManual, interpolado: p.interpolado })
  }
  return r
}
