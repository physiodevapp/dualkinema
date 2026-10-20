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
 * hueco, tampoco de uno en el tiempo: si el móvil se salta frames y dos
 * seguidos se separan más de SALTO_MAX_PASOS veces el paso de referencia, el
 * tramo se corta ahí (el spline cruzaría el salto inventando el movimiento). Un tramo con menos de MUESTRAS_MINIMAS se filtra igual (con la
 * reflexión que permite su longitud) pero queda marcado `corto`: sus bordes
 * no son fiables y no se derivan.
 */

export const CORTE_DEFECTO_HZ = 6
/**
 * Separación máxima entre dos frames de un mismo tramo, en pasos de 1/fs.
 * Un frame saltado (2 pasos) no corta; dos o más seguidos (3 pasos), sí.
 */
export const SALTO_MAX_PASOS = 2.5
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

/**
 * Señal filtrada de un tramo en su rejilla uniforme (antes de volver a los
 * tiempos reales). Sobre ella se derivan las velocidades (paso 5).
 */
export interface RejillaTramo {
  /** Tiempos de la rejilla: paso constante, primero y último = los del tramo. */
  readonly t: Float64Array
  readonly x: Float64Array
  readonly y: Float64Array
}

export interface TrayectoriaFiltrada {
  /** Una por frame, o undefined donde no había posición utilizable. */
  readonly posiciones: readonly (PosicionFiltrada | undefined)[]
  readonly tramos: readonly Tramo[]
  /** La rejilla filtrada de cada tramo, en el mismo orden que `tramos`. */
  readonly rejillas: readonly RejillaTramo[]
}

/**
 * Tramos de frames consecutivos con posición utilizable, cortados también
 * donde dos frames seguidos se separan más de `saltoMax` segundos.
 */
export function tramosUtiles(serie: readonly (Muestra2D | undefined)[], saltoMax = Infinity): Tramo[] {
  const r: Tramo[] = []
  let inicio = -1
  const cerrar = (fin: number) => {
    const muestras = fin - inicio
    r.push({ primero: inicio, ultimo: fin - 1, muestras, corto: muestras < MUESTRAS_MINIMAS })
    inicio = -1
  }
  for (let i = 0; i <= serie.length; i++) {
    const util = i < serie.length && esUtil(serie[i])
    if (util && inicio >= 0 && serie[i]!.t - serie[i - 1]!.t > saltoMax) cerrar(i)
    if (util && inicio < 0) inicio = i
    if (!util && inicio >= 0) cerrar(i)
  }
  return r
}

export interface TramoFiltrado {
  /** Tiempos de la rejilla uniforme (paso ≈ 1/fs, encajada en el tramo). */
  readonly rejilla: Float64Array
  /** Cada canal filtrado en la rejilla. */
  readonly enRejilla: Float64Array[]
  /** Cada canal filtrado en los tiempos reales `ts`. */
  readonly enTiempos: Float64Array[]
}

/**
 * Rejilla uniforme de paso lo más cercano posible a 1/fs que empieza y acaba
 * justo en t0 y tn (sin extrapolar). Con t0 = tn, un solo punto.
 */
export function rejillaUniforme(t0: number, tn: number, fs: number): Float64Array {
  const duracion = tn - t0
  if (!(duracion > 0)) return Float64Array.of(t0)
  const pasos = Math.max(1, Math.round(duracion * fs))
  const h = duracion / pasos
  const r = new Float64Array(pasos + 1)
  for (let k = 0; k <= pasos; k++) r[k] = k === pasos ? tn : t0 + k * h
  return r
}

/**
 * Filtra varias señales que comparten tiempos (x e y de un tramo) y devuelve
 * lo filtrado en la rejilla y en los tiempos reales. `ts` estrictamente
 * creciente; `fs` es la frecuencia de muestreo de referencia (mediana de los
 * fps del vídeo).
 */
export function filtrarTramoConRejilla(
  ts: readonly number[],
  canales: readonly (readonly number[])[],
  fs: number,
  corteHz: number,
): TramoFiltrado {
  const n = ts.length
  if (n <= 1) {
    const copia = canales.map((c) => Float64Array.from(c))
    return { rejilla: Float64Array.from(ts), enRejilla: copia, enTiempos: copia.map((c) => Float64Array.from(c)) }
  }
  const rejilla = rejillaUniforme(ts[0]!, ts[n - 1]!, fs)
  const fsTramo = (rejilla.length - 1) / (ts[n - 1]! - ts[0]!)
  const corte = corteEfectivo(corteHz, fsTramo)
  const enRejilla: Float64Array[] = []
  const enTiempos = canales.map((valores) => {
    const ida = splineNatural(ts, valores)
    const filtrada = filtrarEquiespaciado(rejilla.map((t) => ida(t)), fsTramo, corte)
    enRejilla.push(filtrada)
    const vuelta = splineNatural(rejilla, filtrada)
    const r = new Float64Array(n)
    for (let i = 0; i < n; i++) r[i] = vuelta(ts[i]!)
    return r
  })
  return { rejilla, enRejilla, enTiempos }
}

/** Como filtrarTramoConRejilla, solo lo filtrado en los tiempos reales. */
export function filtrarTramo(
  ts: readonly number[],
  canales: readonly (readonly number[])[],
  fs: number,
  corteHz: number,
): Float64Array[] {
  return filtrarTramoConRejilla(ts, canales, fs, corteHz).enTiempos
}

/**
 * Filtra la trayectoria de un marcador (una muestra o nada por frame), tramo
 * a tramo. `fs`: mediana de los fps del vídeo (`fpsMediano`); también fija
 * el salto en el tiempo que corta un tramo.
 */
export function filtrarTrayectoria(
  serie: readonly (Muestra2D | undefined)[],
  fs: number,
  ajustes: AjustesFiltro = AJUSTES_FILTRO_DEFECTO,
): TrayectoriaFiltrada {
  const posiciones: (PosicionFiltrada | undefined)[] = new Array(serie.length)
  const tramos = tramosUtiles(serie, SALTO_MAX_PASOS / fs)
  const rejillas: RejillaTramo[] = []
  for (const tramo of tramos) {
    const ms: Muestra2D[] = []
    for (let i = tramo.primero; i <= tramo.ultimo; i++) ms.push(serie[i]!)
    const ts = ms.map((m) => m.t)
    const f = filtrarTramoConRejilla(ts, [ms.map((m) => m.x), ms.map((m) => m.y)], fs, ajustes.corteHz)
    const [xs, ys] = f.enTiempos
    rejillas.push({ t: f.rejilla, x: f.enRejilla[0]!, y: f.enRejilla[1]! })
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
  return { posiciones, tramos, rejillas }
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
