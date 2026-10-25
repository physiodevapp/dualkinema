import { fft, siguientePotencia2 } from './fft'

/*
 * Pitido de referencia de ida y vuelta (fase 4, paso 6; §6 de docs/plan-fase-4.md, D9).
 *
 * Cada móvil de la grabación doble emite una secuencia de tres barridos (BARRIDO_F0 → BARRIDO_F1 en BARRIDO_S, con
 * ventana de Hann) separados de forma irregular (DESPLAZAMIENTOS_S): el de la vista de referencia (perfil) a
 * PITIDO_REFERENCIA_S del inicio y el otro a PITIDO_OTRA_S. Cada grabación oye las dos: la suya a pocos centímetros y
 * la del otro a la distancia D entre los móviles. Con el desfase de cada secuencia (t_ref − t_vista, el convenio de
 * `evento.ts`):
 *
 *   secuencia de la referencia: d₁ = Δ − D/c        secuencia de la otra vista: d₂ = Δ + D/c
 *   Δ = (d₁ + d₂) / 2                               D = c · (d₂ − d₁) / 2
 *
 * Δ no depende de la distancia ni de cuándo sale de verdad el sonido de cada altavoz (los dos micrófonos graban el
 * mismo sonido); D sirve de prueba (si sale negativa o de 40 m, algo ha ido mal).
 *
 * **Filtro adaptado.** Se busca la forma exacta del barrido, no cualquier subida de la energía (lo que hace la
 * envolvente de la fase 3 con una palmada): la correlación con el barrido en fase y en cuadratura da una envolvente
 * m(t) con un pico de ~1/(F1 − F0) = 0,3 ms de ancho donde empieza un barrido. Dividida por la energía de lo que cubre
 * el barrido queda el parecido (correlación normalizada, de 0 a ~1), que no depende de lo fuerte que suene: la voz,
 * los pasos o una palmada se parecen poco (otras frecuencias, otra forma) aunque suenen mucho más. La secuencia se
 * puntúa con la media geométrica del parecido en los tres instantes que marca su plantilla: si solo un barrido coincide (un sonido suelto, o la secuencia corrida lo que separa dos barridos),
 * los otros dos factores son ruido y la puntuación se hunde. La calidad es el pico entre el segundo pico de esa
 * puntuación dentro de la ventana (fuera de ±EXCLUSION_PITIDO_S: los ecos de la sala caen ahí, y son la misma secuencia más débil). El instante fino es la
 * media de los tres picos de m, cada uno afinado con una parábola.
 *
 * Solo se busca alrededor de donde debe estar (±VENTANA_PITIDO_S): el reloj común lo sitúa con ±50 ms y la latencia
 * del altavoz se descuenta al emitir (lo que queda, unas decenas de ms).
 */

/** Velocidad del sonido en el aire a unos 20 °C (m/s). */
export const VELOCIDAD_SONIDO = 343

export const BARRIDO_F0 = 2000
export const BARRIDO_F1 = 5000
export const BARRIDO_S = 0.04
/** Comienzo de cada barrido de la secuencia (s): separaciones de 130 y 190 ms, distintas, para que no casen corridas. */
export const DESPLAZAMIENTOS_S: readonly number[] = [0, 0.13, 0.32]
export const DURACION_SECUENCIA_S = DESPLAZAMIENTOS_S[DESPLAZAMIENTOS_S.length - 1]! + BARRIDO_S

/** Cuándo empieza la secuencia de cada móvil, en s desde el inicio de la grabación. */
export const PITIDO_REFERENCIA_S = 1.0
export const PITIDO_OTRA_S = 2.5

/** Cuánto antes o después de lo esperado se busca una secuencia (s). */
export const VENTANA_PITIDO_S = 0.3
/** Zona alrededor del pico donde no se busca el segundo (s): los ecos de la sala (un eco es la secuencia entera corrida y
 * más débil; 50 ms son 17 m de camino de más). Una secuencia corrida lo que separa dos barridos (≥ 130 ms) sí cuenta. */
export const EXCLUSION_PITIDO_S = 0.05
/** Suelo de la energía al calcular el parecido, como fracción de la energía media del trozo. */
export const SUELO_ENERGIA = 1e-3
/** Por debajo, la secuencia no se distingue bien de otra cosa: no se usa. */
export const CALIDAD_PITIDO_MINIMA = 3
/** Tope de la calidad, para guardarla como número finito. */
export const CALIDAD_PITIDO_MAX = 1000

/** Distancias entre los móviles que se dan por buenas (m); fuera, el resultado se marca como dudoso. */
export const DISTANCIA_MINIMA_M = 0.3
export const DISTANCIA_MAXIMA_M = 15

/** Fase del barrido a τ s de su comienzo. */
const fase = (tau: number) => 2 * Math.PI * (BARRIDO_F0 * tau + ((BARRIDO_F1 - BARRIDO_F0) * tau * tau) / (2 * BARRIDO_S))

/** Un barrido a τ s de su comienzo, con ventana de Hann (0 fuera). `cuadratura`: el mismo desplazado 90° (seno). */
export function barrido(tau: number, cuadratura = false): number {
  if (tau < 0 || tau > BARRIDO_S) return 0
  const w = 0.5 * (1 - Math.cos((2 * Math.PI * tau) / BARRIDO_S))
  return w * (cuadratura ? Math.sin(fase(tau)) : Math.cos(fase(tau)))
}

/** La secuencia de tres barridos a t s de su comienzo. */
export const secuencia = (t: number): number => DESPLAZAMIENTOS_S.reduce((s, o) => s + barrido(t - o), 0)

/** La secuencia muestreada a `tasa` (para emitirla con Web Audio), con amplitud máxima 1. */
export function muestrasSecuencia(tasa: number): Float32Array {
  const n = Math.ceil(DURACION_SECUENCIA_S * tasa) + 1
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = secuencia(i / tasa)
  return x
}

/** Audio mono decodificado: `muestras[i]` está en `inicio + i / tasa` (s de vídeo). */
export interface AudioMono {
  readonly inicio: number
  readonly tasa: number
  readonly muestras: ArrayLike<number>
}

export interface Deteccion {
  /** Comienzo de la secuencia (s de vídeo). */
  readonly t: number
  /** Pico / segundo pico (≥ 1, como mucho CALIDAD_PITIDO_MAX). */
  readonly calidad: number
  /** ± (s): una muestra del audio. */
  readonly incertidumbre: number
}

export interface OpcionesPitido {
  readonly ventana?: number
  readonly exclusion?: number
}

/**
 * Busca la secuencia que debería empezar hacia `esperado` (s de vídeo), dentro de ±ventana. null si el audio no cubre
 * la búsqueda o no hay señal.
 */
export function localizarSecuencia(audio: AudioMono, esperado: number, opciones: OpcionesPitido = {}): Deteccion | null {
  const { tasa, inicio, muestras } = audio
  const ventana = opciones.ventana ?? VENTANA_PITIDO_S
  const exclusion = Math.max(1, Math.round((opciones.exclusion ?? EXCLUSION_PITIDO_S) * tasa))
  const m = Math.round(BARRIDO_S * tasa) + 1
  const desp = DESPLAZAMIENTOS_S.map((o) => Math.round(o * tasa))
  const ultimo = desp[desp.length - 1]!

  // Trozo que cubre todos los comienzos posibles más la secuencia entera.
  const i0 = Math.max(0, Math.floor((esperado - ventana - inicio) * tasa))
  const i1 = Math.min(muestras.length, Math.ceil((esperado + ventana + DURACION_SECUENCIA_S - inicio) * tasa) + 2)
  const largo = i1 - i0
  // Comienzos j (relativos al trozo) con la secuencia entera dentro y dentro de la ventana.
  const jMin = Math.max(0, Math.ceil((esperado - ventana - inicio) * tasa) - i0)
  const jMax = Math.min(largo - m - ultimo, Math.floor((esperado + ventana - inicio) * tasa) - i0)
  if (jMax - jMin < 2) return null

  // Envolvente del filtro adaptado: |Σ x[j + n] · (h_c[n] − i·h_s[n])|, por FFT.
  const n = siguientePotencia2(largo + m)
  const xr = new Float64Array(n)
  const xi = new Float64Array(n)
  let media = 0
  for (let i = 0; i < largo; i++) media += muestras[i0 + i]!
  media /= largo
  for (let i = 0; i < largo; i++) xr[i] = muestras[i0 + i]! - media
  const hr = new Float64Array(n)
  const hi = new Float64Array(n)
  for (let k = 0; k < m; k++) {
    hr[k] = barrido(k / tasa)
    hi[k] = barrido(k / tasa, true)
  }
  fft(xr, xi)
  fft(hr, hi)
  // X · conj(H), H = FFT(h_c + i·h_s): r[j] = Σ x[n + j] · conj(h[n]).
  for (let k = 0; k < n; k++) {
    const a = xr[k]! * hr[k]! + xi[k]! * hi[k]!
    const b = xi[k]! * hr[k]! - xr[k]! * hi[k]!
    xr[k] = a
    xi[k] = b
  }
  fft(xr, xi, true)
  const env = new Float64Array(largo)
  for (let j = 0; j < largo; j++) env[j] = Math.hypot(xr[j]!, xi[j]!)

  // Parecido con el barrido sin que cuente lo fuerte que suena: la envolvente entre la energía de lo que cubre el
  // barrido (correlación normalizada, de 0 a ~1). Una palmada fuerte tiene mucha energía pero poco parecido. Con un
  // suelo de energía, para que el silencio digital no dé parecidos de la nada.
  const acumulada = new Float64Array(largo + 1)
  for (let i = 0; i < largo; i++) acumulada[i + 1] = acumulada[i]! + (muestras[i0 + i]! - media) ** 2
  let energiaH = 0
  for (let k = 0; k < m; k++) energiaH += barrido(k / tasa) ** 2
  const suelo = (SUELO_ENERGIA * acumulada[largo]! * m) / largo
  const parecido = new Float64Array(largo)
  for (let j = 0; j + m <= largo; j++) parecido[j] = env[j]! / Math.sqrt((acumulada[j + m]! - acumulada[j]! + suelo) * energiaH)

  // Puntuación de la secuencia: media geométrica del parecido en sus tres barridos.
  const puntuacion = (j: number) => Math.cbrt(desp.reduce((p, d) => p * parecido[j + d]!, 1))
  let jPico = jMin
  let pico = -1
  for (let j = jMin; j <= jMax; j++) {
    const s = puntuacion(j)
    if (s > pico) {
      pico = s
      jPico = j
    }
  }
  if (!(pico > 0)) return null
  let segundo = 0
  for (let j = jMin; j <= jMax; j++) if (Math.abs(j - jPico) > exclusion) segundo = Math.max(segundo, puntuacion(j))
  const calidad = segundo > 0 ? Math.min(CALIDAD_PITIDO_MAX, pico / segundo) : CALIDAD_PITIDO_MAX

  // Instante fino: el pico de la envolvente de cada barrido (±2 muestras de donde lo dejó la puntuación), con su
  // parábola (sobre la envolvente y no sobre el parecido: la energía de la ventana también cambia y movería el pico).
  let suma = 0
  for (const d of desp) {
    const c = jPico + d
    let k = c
    for (let q = Math.max(1, c - 2); q <= Math.min(largo - 2, c + 2); q++) if (env[q]! > env[k]!) k = q
    let fino = 0
    if (k > 0 && k < largo - 1) {
      const izq = env[k - 1]!
      const der = env[k + 1]!
      const curv = izq - 2 * env[k]! + der
      if (curv < 0) fino = Math.max(-0.5, Math.min(0.5, (izq - der) / (2 * curv)))
    }
    suma += k + fino - d
  }
  const j = suma / desp.length
  return { t: inicio + (i0 + j) / tasa, calidad, incertidumbre: 1 / tasa }
}

/** Las cuatro detecciones de una grabación doble: cada secuencia (de la referencia, de la otra vista) en cada vídeo. */
export interface DeteccionesIdaVuelta {
  readonly referenciaEnReferencia: Deteccion
  readonly referenciaEnVista: Deteccion
  readonly vistaEnReferencia: Deteccion
  readonly vistaEnVista: Deteccion
}

export interface IdaVuelta {
  /** t_ref − t_vista (s), sin el sesgo de la distancia. */
  readonly desfase: number
  /** Distancia entre los dos móviles (m). */
  readonly distancia: number
  /** La peor de las cuatro calidades. */
  readonly calidad: number
  /** ± (s): la suma de las incertidumbres de las cuatro detecciones, a la mitad. No incluye el retardo audio–imagen. */
  readonly incertidumbre: number
  /** La distancia sale entre DISTANCIA_MINIMA_M y DISTANCIA_MAXIMA_M. */
  readonly distanciaRazonable: boolean
  /** Calidad ≥ CALIDAD_PITIDO_MINIMA y distancia razonable. */
  readonly fiable: boolean
}

export function combinarIdaVuelta(d: DeteccionesIdaVuelta): IdaVuelta {
  const d1 = d.referenciaEnReferencia.t - d.referenciaEnVista.t
  const d2 = d.vistaEnReferencia.t - d.vistaEnVista.t
  const distancia = (VELOCIDAD_SONIDO * (d2 - d1)) / 2
  const todas = [d.referenciaEnReferencia, d.referenciaEnVista, d.vistaEnReferencia, d.vistaEnVista]
  const calidad = Math.min(...todas.map((x) => x.calidad))
  const distanciaRazonable = distancia >= DISTANCIA_MINIMA_M && distancia <= DISTANCIA_MAXIMA_M
  return {
    desfase: (d1 + d2) / 2,
    distancia,
    calidad,
    incertidumbre: todas.reduce((s, x) => s + x.incertidumbre, 0) / 2,
    distanciaRazonable,
    fiable: calidad >= CALIDAD_PITIDO_MINIMA && distanciaRazonable,
  }
}

/** Cuándo pita cada móvil (s desde el inicio): primero el de la vista de referencia (perfil), luego el otro. */
export const instantePitido = (esReferencia: boolean): number => (esReferencia ? PITIDO_REFERENCIA_S : PITIDO_OTRA_S)
