import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { Muestra2D } from '../modelo/tipos'

/*
 * Relleno de huecos cortos, solo a petición del usuario (decisión D5 de la
 * fase 2). El seguidor nunca interpola por su cuenta: un hueco es un hueco
 * hasta que alguien decide rellenarlo, y lo rellenado queda marcado como
 * `interpolado` para siempre (franja, gráfica, exportación).
 *
 * Solo se rellena un hueco entre dos posiciones fiables (nunca se extrapola
 * en los extremos de un tramo) y de HUECO_MAX_S como mucho: en 0,2 s un
 * segmento corporal en una sentadilla o en la marcha apenas cambia de
 * curvatura, así que un polinomio cúbico lo sigue bien; más largo, el
 * relleno empezaría a inventar el movimiento.
 */

/** Duración máxima de lo que se rellena: de la última posición fiable antes del hueco a la primera después. */
export const HUECO_MAX_S = 0.2

/** Muestra que el análisis puede usar (la misma regla que el ángulo, la franja y la gráfica). */
export const esUtil = (m: Muestra2D | undefined): m is Muestra2D =>
  !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x) && Number.isFinite(m.y)

export interface HuecoInterpolable {
  /** Frame con la última posición fiable antes del hueco. */
  readonly antes: number
  /** Frame con la primera posición fiable después del hueco. */
  readonly despues: number
}

/**
 * Huecos de una serie (una muestra o nada por frame) que se pueden rellenar:
 * rodeados de posiciones fiables y de `maximo` segundos o menos entre ellas.
 * `tiempos` es la tabla de frames (el tiempo de los frames sin muestra).
 */
export function huecosInterpolables(
  serie: readonly (Muestra2D | undefined)[],
  tiempos: readonly number[],
  maximo = HUECO_MAX_S,
): HuecoInterpolable[] {
  const r: HuecoInterpolable[] = []
  let anterior = -1
  for (let i = 0; i < serie.length; i++) {
    if (!esUtil(serie[i])) continue
    // Margen de 1 µs: 6 frames a 30 fps son 0,2 s salvo por el redondeo de los pts.
    if (anterior >= 0 && i > anterior + 1 && tiempos[i]! - tiempos[anterior]! <= maximo + 1e-6) {
      r.push({ antes: anterior, despues: i })
    }
    anterior = i
  }
  return r
}

/**
 * Pendiente (px/s) en el borde de un hueco, con las posiciones fiables del
 * otro lado del borde (`paso` = −1 antes del hueco, +1 después):
 * - con dos, la derivada de la parábola que pasa por las tres (segundo orden,
 *   con espaciado desigual: fps variable);
 * - con una, la de la recta entre las dos (va medio frame retrasada);
 * - sin ninguna, la de la recta que cruza el hueco (así un hueco entre dos
 *   muestras sueltas se rellena en línea recta, sin oscilar).
 */
function pendiente(
  serie: readonly (Muestra2D | undefined)[],
  borde: number,
  paso: -1 | 1,
  secante: { x: number; y: number },
): { x: number; y: number } {
  const a = serie[borde]!
  const b = serie[borde + paso]
  if (!esUtil(b) || b.t === a.t) return secante
  const c = serie[borde + 2 * paso]
  if (!esUtil(c) || c.t === b.t) return { x: (a.x - b.x) / (a.t - b.t), y: (a.y - b.y) / (a.t - b.t) }
  // Derivada en a del polinomio de Lagrange por a, b y c.
  const ka = 1 / (a.t - b.t) + 1 / (a.t - c.t)
  const kb = (a.t - c.t) / ((b.t - a.t) * (b.t - c.t))
  const kc = (a.t - b.t) / ((c.t - a.t) * (c.t - b.t))
  return { x: ka * a.x + kb * b.x + kc * c.x, y: ka * a.y + kb * b.y + kc * c.y }
}

/**
 * Rellena el hueco con un polinomio cúbico de Hermite en el tiempo real de
 * cada frame (fps variable): pasa por las dos posiciones fiables con la
 * pendiente que traía el marcador a cada lado. Exacto para un movimiento a
 * velocidad constante. Devuelve las muestras de los frames `antes + 1` a
 * `despues − 1`, marcadas como interpoladas y con lo que sustituyen
 * (`sustituida`), para poder deshacerlo.
 */
export function interpolarHueco(
  serie: readonly (Muestra2D | undefined)[],
  tiempos: readonly number[],
  { antes, despues }: HuecoInterpolable,
): { indice: number; muestra: Muestra2D }[] {
  const a = serie[antes]
  const b = serie[despues]
  if (!esUtil(a) || !esUtil(b)) throw new Error('Un hueco solo se rellena entre dos posiciones fiables.')
  const h = b.t - a.t
  if (!(h > 0)) throw new Error('Tiempos del hueco no válidos.')
  const secante = { x: (b.x - a.x) / h, y: (b.y - a.y) / h }
  const m0 = pendiente(serie, antes, -1, secante)
  const m1 = pendiente(serie, despues, 1, secante)
  const r: { indice: number; muestra: Muestra2D }[] = []
  for (let i = antes + 1; i < despues; i++) {
    const t = tiempos[i]!
    const s = (t - a.t) / h
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1
    const h10 = s ** 3 - 2 * s ** 2 + s
    const h01 = -2 * s ** 3 + 3 * s ** 2
    const h11 = s ** 3 - s ** 2
    r.push({
      indice: i,
      muestra: {
        t,
        x: h00 * a.x + h10 * h * m0.x + h01 * b.x + h11 * h * m1.x,
        y: h00 * a.y + h10 * h * m0.y + h01 * b.y + h11 * h * m1.y,
        // No es una detección: la calidad no aplica. Se pone 1 para que el
        // análisis la use; lo que la distingue es `interpolado`.
        calidad: 1,
        editadoManual: false,
        interpolado: true,
        sustituida: serie[i] ?? null,
      },
    })
  }
  return r
}

/**
 * «Quitar lo interpolado»: cada frame rellenado vuelve a lo que había antes
 * (la detección perdida o dudosa, o nada). Si no se sabe (rellenado en una
 * sesión guardada antes de apuntarlo), vuelve como perdido. Cambia las
 * series en su sitio y devuelve cuántas muestras ha devuelto.
 */
export function quitarInterpolados(series: Iterable<(Muestra2D | undefined)[]>): number {
  let n = 0
  for (const serie of series) {
    serie.forEach((m, i) => {
      if (!m?.interpolado) return
      serie[i] = m.sustituida === undefined ? { t: m.t, x: NaN, y: NaN, calidad: 0, editadoManual: false } : (m.sustituida ?? undefined)
      n++
    })
  }
  return n
}
