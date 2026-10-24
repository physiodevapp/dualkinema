import { esValido, estimarDesfase, instanteDe, type Intercambio } from './desfase'

/*
 * Deriva entre los relojes de dos móviles (fase 4, paso 3; D7): cada uno cuenta con su cristal, que se desvía del
 * tiempo real 10–100 ppm. El desfase de `desfase.ts` cambia entonces poco a poco:
 *
 *   desfase(t) = desfase(t₀) + deriva · (t − t₀)        (deriva en ms por ms; en ppm, × 10⁶)
 *
 * Con intercambios a lo largo de un rato (uno por segundo durante la sesión), se reparten en ventanas de VENTANA_MS
 * (dentro de una, la deriva mueve menos de 0,5 ms), de cada una se toma el desfase de `estimarDesfase` (la intersección
 * de sus intervalos: junta la ida más rápida con la vuelta más rápida) y se ajusta una recta por mínimos cuadrados,
 * ponderando cada punto por 1/cota² (una ventana de red lenta dice menos). La precisión la pone la red: unos ms de
 * asimetría en cada punto, divididos por el tramo cubierto; por eso se da el error típico de la pendiente, y en
 * pocos minutos de una red móvil no se distinguen derivas de unas pocas decenas de ppm. Se mide y se muestra; no se
 * corrige en el modelo de tiempo del análisis (D7): en 30 s, 100 ppm son 3 ms.
 */

export const VENTANA_MS = 5000
/** Por debajo de este tramo (ms) no hay deriva que medir: 1 ms de error de desfase en 20 s ya serían 50 ppm. */
export const TRAMO_MINIMO_MS = 20_000
export const VENTANAS_MINIMAS = 3

export interface Deriva {
  /** ppm: cuánto adelanta el reloj remoto respecto al local por cada millón de unidades de tiempo. */
  readonly ppm: number
  /** Error típico de `ppm` (de la dispersión de los puntos alrededor de la recta). */
  readonly errorPpm: number
  /** Desfase en el instante `instante` (ms), según la recta. */
  readonly desfase: number
  readonly instante: number
  /** Desviación típica de los puntos respecto a la recta (ms). */
  readonly residuo: number
  /** Ventanas usadas y tramo cubierto (ms). */
  readonly ventanas: number
  readonly tramo: number
}

/** La deriva de una serie de intercambios; null si no cubren TRAMO_MINIMO_MS en al menos VENTANAS_MINIMAS ventanas. */
export function estimarDeriva(lista: readonly Intercambio[], ventana = VENTANA_MS): Deriva | null {
  const validos = lista.filter(esValido)
  if (validos.length === 0) return null
  const origen = Math.min(...validos.map(instanteDe))
  const grupos = new Map<number, Intercambio[]>()
  for (const i of validos) {
    const k = Math.floor((instanteDe(i) - origen) / ventana)
    grupos.set(k, [...(grupos.get(k) ?? []), i])
  }
  const puntos = [...grupos.values()].map((g) => {
    const e = estimarDesfase(g)!
    return { t: e.instante, y: e.desfase, w: 1 / Math.max(e.cota, 0.5) ** 2 }
  })
  const tramo = Math.max(...puntos.map((p) => p.t)) - Math.min(...puntos.map((p) => p.t))
  if (puntos.length < VENTANAS_MINIMAS || tramo < TRAMO_MINIMO_MS) return null
  const sw = puntos.reduce((s, p) => s + p.w, 0)
  const tm = puntos.reduce((s, p) => s + p.w * p.t, 0) / sw
  const ym = puntos.reduce((s, p) => s + p.w * p.y, 0) / sw
  const stt = puntos.reduce((s, p) => s + p.w * (p.t - tm) ** 2, 0)
  const sty = puntos.reduce((s, p) => s + p.w * (p.t - tm) * (p.y - ym), 0)
  const pendiente = sty / stt
  const resto = (p: { t: number; y: number }) => p.y - (ym + pendiente * (p.t - tm))
  const residuo = Math.sqrt(puntos.reduce((s, p) => s + resto(p) ** 2, 0) / puntos.length)
  // Error típico de la pendiente con la escala del ruido sacada de los propios residuos (n − 2 grados de libertad).
  const s2 = puntos.length > 2 ? puntos.reduce((s, p) => s + p.w * resto(p) ** 2, 0) / (puntos.length - 2) : NaN
  return { ppm: pendiente * 1e6, errorPpm: Math.sqrt(s2 / stt) * 1e6, desfase: ym, instante: tm, residuo, ventanas: puntos.length, tramo }
}

/** El desfase que da la recta en un instante local (ms). */
export const desfaseConDeriva = (d: Deriva, tLocal: number): number => d.desfase + (d.ppm / 1e6) * (tLocal - d.instante)
