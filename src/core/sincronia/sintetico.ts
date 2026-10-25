/*
 * Sonidos sintéticos de instante conocido para probar la sincronía por audio (como `seguimiento/sintetico.ts` con
 * las imágenes).
 *
 * Una palmada es una ráfaga de banda ancha que decae en unos 20 ms. Se define en tiempo continuo (suma de senos de
 * frecuencias y fases fijas), así que el mismo golpe puede muestrearse a cualquier tasa y en cualquier instante sin
 * redondear al múltiplo de una muestra. Cada micrófono lo oye con su propio eco (respuesta distinta), su ganancia y su
 * ruido.
 */

/** Generador pseudoaleatorio con semilla (mulberry32): mismos números en cada ejecución. */
export function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido gaussiano (Box–Muller) de media 0 y desviación 1. */
export function gaussiano(azar: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar())
}

const DURACION_GOLPE_S = 0.12
const CAIDA_S = 0.02
const PARCIALES = (() => {
  const azar = aleatorio(7)
  return Array.from({ length: 60 }, () => ({ f: 300 + azar() * 6000, fase: azar() * 2 * Math.PI }))
})()

/** La palmada a τ s de su comienzo (0 fuera de ella). */
export function golpe(tau: number): number {
  if (tau < 0 || tau >= DURACION_GOLPE_S) return 0
  let s = 0
  for (const p of PARCIALES) s += Math.sin(2 * Math.PI * p.f * tau + p.fase)
  return (s / Math.sqrt(PARCIALES.length)) * Math.exp(-tau / CAIDA_S)
}

export interface Microfono {
  /** Muestras por segundo. */
  readonly tasa: number
  /** Duración de la grabación (s). */
  readonly duracion: number
  /** Instantes de cada golpe, medidos desde la primera muestra (s). */
  readonly golpes: readonly number[]
  /** Ganancia del micrófono. */
  readonly ganancia?: number
  /** Ecos: retardo (s) y amplitud relativa. Cambian la respuesta del micrófono. */
  readonly ecos?: readonly { readonly retardo: number; readonly amplitud: number }[]
  /** Desviación del ruido de fondo, en la escala de la palmada antes de la ganancia (la palmada llega a ~1). */
  readonly ruido?: number
  /** Componente continua (un micrófono con desviación). */
  readonly continua?: number
  readonly semilla?: number
}

/** Lo que graba un micrófono: Float64Array de tasa · duracion muestras. */
export function grabar(m: Microfono): Float64Array {
  const n = Math.round(m.tasa * m.duracion)
  const x = new Float64Array(n)
  const ganancia = m.ganancia ?? 1
  const camino = [{ retardo: 0, amplitud: 1 }, ...(m.ecos ?? [])]
  const ruido = gaussiano(aleatorio(m.semilla ?? 1))
  for (let i = 0; i < n; i++) {
    const t = i / m.tasa
    let s = 0
    for (const g of m.golpes) {
      if (t < g || t > g + DURACION_GOLPE_S + 0.1) continue
      for (const c of camino) s += c.amplitud * golpe(t - g - c.retardo)
    }
    x[i] = ganancia * (s + (m.ruido ?? 0) * ruido() + (m.continua ?? 0))
  }
  return x
}

export interface MicrofonoPitidos {
  readonly tasa: number
  readonly duracion: number
  /** Cada secuencia de pitidos que oye: cuándo empieza (s desde la primera muestra) y con qué amplitud. */
  readonly secuencias: readonly { readonly t: number; readonly amplitud: number }[]
  /** Palmadas que también oye (para que la búsqueda no las confunda con un pitido). */
  readonly golpes?: readonly number[]
  readonly ecos?: readonly { readonly retardo: number; readonly amplitud: number }[]
  readonly ruido?: number
  /** Recorta la señal a ±saturacion (un micrófono saturado por su propio pitido). */
  readonly saturacion?: number
  readonly semilla?: number
}

/** Lo que graba un micrófono que oye secuencias de pitidos (`pitido.ts`), con eco, ruido y palmadas. */
export function grabarPitidos(m: MicrofonoPitidos, secuencia: (t: number) => number, duracionSecuencia: number): Float64Array {
  const n = Math.round(m.tasa * m.duracion)
  const x = new Float64Array(n)
  const camino = [{ retardo: 0, amplitud: 1 }, ...(m.ecos ?? [])]
  const ruido = gaussiano(aleatorio(m.semilla ?? 1))
  const cola = Math.max(0, ...camino.map((c) => c.retardo))
  for (let i = 0; i < n; i++) {
    const t = i / m.tasa
    let s = 0
    for (const q of m.secuencias) {
      if (t < q.t || t > q.t + duracionSecuencia + cola) continue
      for (const c of camino) s += q.amplitud * c.amplitud * secuencia(t - q.t - c.retardo)
    }
    for (const g of m.golpes ?? []) if (t >= g && t < g + DURACION_GOLPE_S) s += golpe(t - g)
    s += (m.ruido ?? 0) * ruido()
    x[i] = m.saturacion === undefined ? s : Math.max(-m.saturacion, Math.min(m.saturacion, s))
  }
  return x
}
