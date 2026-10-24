import type { Envolvente } from './envolvente'
import { fft, siguientePotencia2 } from './fft'

/*
 * Correlación cruzada con ponderación de fase (GCC-PHAT) entre las envolventes de dos vídeos (fase 3, paso 5).
 *
 * La correlación r[d] = Σ a[n + d] · b[n] es máxima en el retardo d que lleva lo de la vista (b) sobre lo de la
 * referencia (a): un sonido en la muestra iA de a y en la iB de b da el pico en d = iA − iB. Con los instantes de la
 * primera muestra de cada una:
 *
 *   t_ref − t_vista = (inicio_a + iA / tasa) − (inicio_b + iB / tasa) = d / tasa + (inicio_a − inicio_b) = desfase
 *
 * (el convenio de `evento.ts`). Se calcula por FFT con ceros de relleno (correlación lineal, sin dar la vuelta):
 * R = A · conj(B). La ponderación de fase divide cada frecuencia por su módulo: queda solo la fase, el pico se
 * vuelve agudo y no importan la ganancia ni la respuesta de cada micrófono. Las frecuencias casi vacías (solo ruido)
 * no se amplifican: se divide como mucho por REGULARIZACION · el módulo máximo.
 *
 * El pico se refina con una parábola sobre las tres muestras de alrededor (con señales sintéticas, a menos de 0,1 ms
 * con muestras de 0,5 ms; la envolvente suavizada de `envolvente.ts` hace que el pico tenga varias muestras). La
 * calidad es el pico entre el segundo pico, buscado fuera de ±EXCLUSION_S del primero (la cola del mismo golpe no es
 * un segundo pico). Varias palmadas iguales, pasos o música dan picos parecidos: calidad baja.
 */

/** Desfase máximo que se busca (s): dos móviles arrancados a mano por una persona. */
export const VENTANA_S = 10

/** Solape mínimo de los dos audios para que un retardo cuente (s). */
export const SOLAPE_MINIMO_S = 1

/** Zona alrededor del pico donde no se busca el segundo (s). */
export const EXCLUSION_S = 0.05

/** Fracción del módulo máximo por debajo de la cual una frecuencia ya no se divide por su módulo. */
export const REGULARIZACION = 1e-3

/** Tope de la calidad (cuando no hay un segundo pico que se le parezca), para guardarla como un número finito. */
export const CALIDAD_MAX = 1000

export interface OpcionesCorrelacion {
  readonly ventana?: number
  readonly solapeMinimo?: number
  readonly exclusion?: number
  readonly regularizacion?: number
}

export interface Correlacion {
  /** t_ref − t_vista del sonido común (s). */
  readonly desfase: number
  /** Pico / segundo pico (≥ 1, como mucho CALIDAD_MAX). Si el desfase de verdad cae fuera de la ventana, es baja. */
  readonly calidad: number
}

/**
 * GCC-PHAT de la vista contra la referencia. null si no hay nada que correlacionar (sin señal, sin solape suficiente
 * dentro de la ventana).
 */
export function correlacionGccPhat(ref: Envolvente, vista: Envolvente, opciones: OpcionesCorrelacion = {}): Correlacion | null {
  if (ref.tasa !== vista.tasa) throw new Error('Las dos envolventes deben tener la misma tasa.')
  const tasa = ref.tasa
  const ventana = opciones.ventana ?? VENTANA_S
  const solape = Math.max(1, Math.round((opciones.solapeMinimo ?? SOLAPE_MINIMO_S) * tasa))
  const exclusion = Math.round((opciones.exclusion ?? EXCLUSION_S) * tasa)
  const regularizacion = opciones.regularizacion ?? REGULARIZACION
  const na = ref.senal.length
  const nb = vista.senal.length
  if (na === 0 || nb === 0) return null

  // Retardos d (en muestras) dentro de la ventana y con solape suficiente: n ∈ [max(0, −d), min(nb, na − d)).
  const base = ref.inicio - vista.inicio
  const dMin = Math.max(Math.ceil((-ventana - base) * tasa), solape - nb)
  const dMax = Math.min(Math.floor((ventana - base) * tasa), na - solape)
  if (dMin > dMax) return null

  const n = siguientePotencia2(na + nb - 1)
  const ar = new Float64Array(n)
  const ai = new Float64Array(n)
  const br = new Float64Array(n)
  const bi = new Float64Array(n)
  ar.set(ref.senal)
  br.set(vista.senal)
  fft(ar, ai)
  fft(br, bi)

  // R = A · conj(B), en ar / ai. Sin la componente continua: la media de las señales no dice nada del retardo.
  let maximo = 0
  for (let k = 0; k < n; k++) {
    const r = ar[k]! * br[k]! + ai[k]! * bi[k]!
    const i = ai[k]! * br[k]! - ar[k]! * bi[k]!
    ar[k] = r
    ai[k] = i
    maximo = Math.max(maximo, Math.hypot(r, i))
  }
  if (!(maximo > 0)) return null
  const suelo = regularizacion * maximo
  ar[0] = 0
  ai[0] = 0
  for (let k = 1; k < n; k++) {
    const m = Math.max(Math.hypot(ar[k]!, ai[k]!), suelo)
    ar[k] = ar[k]! / m
    ai[k] = ai[k]! / m
  }
  fft(ar, ai, true)
  const r = (d: number) => ar[(d + n) % n]!

  let dPico = dMin
  for (let d = dMin + 1; d <= dMax; d++) if (r(d) > r(dPico)) dPico = d
  const pico = r(dPico)
  if (!(pico > 0)) return null

  let segundo = 0
  for (let d = dMin; d <= dMax; d++) if (Math.abs(d - dPico) > exclusion) segundo = Math.max(segundo, r(d))
  const calidad = segundo > 0 ? Math.min(CALIDAD_MAX, pico / segundo) : CALIDAD_MAX

  let fino = 0
  if (dPico > dMin && dPico < dMax) {
    const izq = r(dPico - 1)
    const der = r(dPico + 1)
    const curvatura = izq - 2 * pico + der
    if (curvatura < 0) fino = Math.max(-0.5, Math.min(0.5, (izq - der) / (2 * curvatura)))
  }

  return { desfase: (dPico + fino) / tasa + base, calidad }
}
