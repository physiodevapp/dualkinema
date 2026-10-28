import { anguloArticular } from '../articulaciones/calculo'
import { marcadoresDeArticulacion, type DefinicionArticulacion } from '../articulaciones/definicion'
import { desenrollar } from '../geometria/angulo'
import { aCanonico, type OrientacionVista } from '../geometria/canonico'
import type { Vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { splineNatural } from './spline'
import { rejillaUniforme, type TrayectoriaFiltrada } from './tramos'

/*
 * Velocidades y aceleraciones (paso 5 de la fase 2). Se derivan señales ya
 * filtradas (D1), tramo a tramo, sobre la rejilla uniforme del filtrado:
 *   1. diferencias centrales en la rejilla:
 *        v[k] = (x[k+1] − x[k−1]) / 2h      a[k] = (x[k+1] − 2x[k] + x[k−1]) / h²
 *      (error del orden de h²; exactas con una parábola);
 *   2. vuelta a los tiempos reales de cada frame con spline cúbico, usando
 *      solo los nodos con derivada.
 * El primer y el último nodo de la rejilla no tienen vecinos a los dos lados:
 * sin derivada. Por eso el primer y el último frame de cada tramo quedan sin
 * valor (NaN, nunca 0), y también un frame que caiga fuera de los nodos
 * interiores (con fps variable, a veces el segundo o el penúltimo). Los
 * tramos `corto` (paso 4) no se derivan.
 */

export interface Derivadas {
  /** Primera y segunda derivada en cada tiempo pedido (NaN = sin valor). */
  readonly velocidad: Float64Array
  readonly aceleracion: Float64Array
}

/**
 * Diferencias centrales en una rejilla uniforme de paso h. Los dos extremos
 * (y los vecinos de un NaN) quedan en NaN.
 */
export function derivarRejilla(v: ArrayLike<number>, h: number): Derivadas {
  const n = v.length
  const velocidad = new Float64Array(n).fill(NaN)
  const aceleracion = new Float64Array(n).fill(NaN)
  for (let k = 1; k < n - 1; k++) {
    velocidad[k] = (v[k + 1]! - v[k - 1]!) / (2 * h)
    aceleracion[k] = (v[k + 1]! - 2 * v[k]! + v[k - 1]!) / (h * h)
  }
  return { velocidad, aceleracion }
}

/**
 * Lleva valores definidos en los nodos de una rejilla a los tiempos `ts`.
 * Cada racha de nodos consecutivos con valor se une con un spline; un tiempo
 * fuera de toda racha queda en NaN (nunca se extrapola).
 */
export function aTiemposReales(rejilla: ArrayLike<number>, valores: ArrayLike<number>, ts: ArrayLike<number>): Float64Array {
  const r = new Float64Array(ts.length).fill(NaN)
  let k = 0
  while (k < valores.length) {
    if (!Number.isFinite(valores[k]!)) {
      k++
      continue
    }
    let fin = k
    while (fin + 1 < valores.length && Number.isFinite(valores[fin + 1]!)) fin++
    const nodosT = Array.prototype.slice.call(rejilla, k, fin + 1) as number[]
    const nodosV = Array.prototype.slice.call(valores, k, fin + 1) as number[]
    const s = splineNatural(nodosT, nodosV)
    const desde = nodosT[0]!
    const hasta = nodosT[nodosT.length - 1]!
    // Un nodo de la rejilla (t0 + k·h) puede salir un pelo por encima o por debajo del
    // tiempo del frame que le corresponde: con fps constantes, el segundo o el penúltimo
    // frame se quedaban sin derivada. Margen de una millonésima del paso, sin extrapolar.
    const margen = 1e-6 * (rejilla.length > 1 ? Math.abs(rejilla[1]! - rejilla[0]!) : 0)
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!
      if (t >= desde - margen && t <= hasta + margen) r[i] = s(Math.min(hasta, Math.max(desde, t)))
    }
    k = fin + 1
  }
  return r
}

/**
 * Deriva una señal dada en una rejilla uniforme y devuelve las derivadas en
 * los tiempos reales `ts` (dentro de la rejilla).
 */
export function derivarTramo(rejilla: ArrayLike<number>, valores: ArrayLike<number>, ts: ArrayLike<number>): Derivadas {
  const n = rejilla.length
  if (n < 3) return { velocidad: new Float64Array(ts.length).fill(NaN), aceleracion: new Float64Array(ts.length).fill(NaN) }
  const h = (rejilla[n - 1]! - rejilla[0]!) / (n - 1)
  const d = derivarRejilla(valores, h)
  return { velocidad: aTiemposReales(rejilla, d.velocidad, ts), aceleracion: aTiemposReales(rejilla, d.aceleracion, ts) }
}

// ---- Velocidad lineal de un marcador ----

export type UnidadVelocidad = 'px/s' | 'm/s'

export interface VelocidadMarcador {
  /** Componentes y módulo por frame (NaN = sin valor), en `unidad`. */
  readonly vx: Float64Array
  readonly vy: Float64Array
  readonly modulo: Float64Array
  readonly unidad: UnidadVelocidad
}

/**
 * Velocidad de un marcador en la imagen, por frame. Sin escala, en px/s (y
 * hacia abajo, como la imagen). Con `metrosPorPx` (calibración 2D del paso
 * 6), en m/s: la escala es la misma en x y en y, así que basta multiplicar.
 */
export function velocidadMarcador(f: TrayectoriaFiltrada, metrosPorPx: number | null = null): VelocidadMarcador {
  const n = f.posiciones.length
  const vx = new Float64Array(n).fill(NaN)
  const vy = new Float64Array(n).fill(NaN)
  const modulo = new Float64Array(n).fill(NaN)
  const k = metrosPorPx ?? 1
  f.tramos.forEach((tramo, j) => {
    if (tramo.corto) return
    const rej = f.rejillas[j]!
    const ts: number[] = []
    for (let i = tramo.primero; i <= tramo.ultimo; i++) ts.push(f.posiciones[i]!.t)
    const dx = derivarTramo(rej.t, rej.x, ts).velocidad
    const dy = derivarTramo(rej.t, rej.y, ts).velocidad
    for (let q = 0; q < ts.length; q++) {
      const i = tramo.primero + q
      vx[i] = dx[q]! * k
      vy[i] = dy[q]! * k
      modulo[i] = Math.hypot(dx[q]!, dy[q]!) * k
    }
  })
  return { vx, vy, modulo, unidad: metrosPorPx === null ? 'px/s' : 'm/s' }
}

// ---- Velocidad y aceleración angulares ----

/**
 * Velocidad (°/s) y aceleración (°/s²) de una articulación, por frame, a
 * partir de las coordenadas filtradas de sus marcadores.
 *
 * Un tramo del ángulo son frames consecutivos en los que todos sus
 * marcadores tienen posición filtrada de un tramo no corto (la intersección
 * de sus tramos). En una rejilla uniforme de ese tramo se evalúa la posición
 * filtrada de cada marcador (spline por su rejilla del filtrado: si los
 * tramos coinciden, son los mismos valores), se calcula el ángulo, se
 * desenrolla y se deriva.
 */
export function derivadasAngulares(
  def: DefinicionArticulacion,
  porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>,
  orientacion: OrientacionVista,
  fs: number,
): Derivadas {
  const ids = marcadoresDeArticulacion(def)
  const trayectorias = ids.map((id) => porMarcador.get(id))
  const n = Math.max(0, ...[...porMarcador.values()].map((f) => f.posiciones.length))
  const velocidad = new Float64Array(n).fill(NaN)
  const aceleracion = new Float64Array(n).fill(NaN)
  if (trayectorias.some((f) => !f) || !Number.isFinite(fs)) return { velocidad, aceleracion }
  const fs_ = trayectorias as TrayectoriaFiltrada[]

  // Tramo (índice en `tramos`) de cada marcador en cada frame; −1 si no tiene o es corto.
  const tramoDe = fs_.map((f) => {
    const r = new Int32Array(n).fill(-1)
    f.tramos.forEach((t, j) => {
      if (!t.corto) for (let i = t.primero; i <= t.ultimo; i++) r[i] = j
    })
    return r
  })
  const splines = new Map<string, { x: (t: number) => number; y: (t: number) => number }>()
  const spline = (m: number, j: number) => {
    const clave = `${m}:${j}`
    let s = splines.get(clave)
    if (!s) {
      const rej = fs_[m]!.rejillas[j]!
      s = { x: splineNatural(rej.t, rej.x), y: splineNatural(rej.t, rej.y) }
      splines.set(clave, s)
    }
    return s
  }

  let i = 0
  while (i < n) {
    if (tramoDe.some((r) => r[i]! < 0)) {
      i++
      continue
    }
    let fin = i
    while (fin + 1 < n && tramoDe.every((r) => r[fin + 1]! >= 0)) fin++
    if (fin - i >= 2) {
      const ts: number[] = []
      for (let q = i; q <= fin; q++) ts.push(fs_[0]!.posiciones[q]!.t)
      const rejilla = rejillaUniforme(ts[0]!, ts[ts.length - 1]!, fs)
      const ss = ids.map((_, m) => spline(m, tramoDe[m]![i]!))
      const angulos = desenrollar(
        Array.from(rejilla, (t) => {
          const puntos = new Map<IdMarcador, Vec3>()
          ids.forEach((id, m) => puntos.set(id, aCanonico(ss[m]!.x(t), ss[m]!.y(t), orientacion)))
          return anguloArticular(def, puntos)
        }),
      )
      const d = derivarTramo(rejilla, angulos, ts)
      velocidad.set(d.velocidad, i)
      aceleracion.set(d.aceleracion, i)
    }
    i = fin + 1
  }
  return { velocidad, aceleracion }
}
