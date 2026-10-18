/*
 * Butterworth paso bajo de 2.º orden aplicado ida y vuelta (decisión D1 de la
 * fase 2): fase cero, sin retraso, equivalente a un 4.º orden en atenuación.
 *
 * Corrección de Winter. Al pasar dos veces, la atenuación se multiplica y el
 * corte real (−3 dB) baja: un 2.º orden diseñado a 6 Hz y pasado dos veces
 * cortaría hacia 4,8 Hz. Se diseña cada pasada con el corte dividido por
 *   C = (2^(1/pasadas) − 1)^(1/(2·orden)) = (√2 − 1)^(1/4) ≈ 0,802
 * para que el corte que se elige sea el corte real de la señal filtrada
 * (Winter, Biomechanics and Motor Control of Human Movement, cap. 3).
 *
 * La corrección se aplica sobre la frecuencia ya deformada por la
 * transformación bilineal (K = tan(π·fc/fs) / C) y no antes de deformarla
 * (tan(π·(fc/C)/fs)), como en el libro. A cortes bajos frente a los fps las
 * dos son iguales; cerca de Nyquist solo la primera deja el −3 dB exactamente
 * en el corte (lo fija un test).
 *
 * Este módulo trabaja con muestras equiespaciadas. El remuestreo de fps
 * variable y el corte en tramos están en `tramos.ts`.
 */

/** Corrección de Winter para un 2.º orden pasado dos veces. */
export const CORRECCION_WINTER = Math.pow(Math.SQRT2 - 1, 1 / 4)

/**
 * Corte máximo frente a la frecuencia de muestreo. Por encima de unos 0,4·fs
 * el filtro deja de ser útil (a 0,5·fs, Nyquist, ni siquiera existe).
 */
export const CORTE_MAX_RELATIVO = 0.4

/**
 * Muestras mínimas para filtrar bien un tramo: más de 3 veces la longitud del
 * filtro (3 coeficientes), la regla habitual (scipy.signal.filtfilt). Con
 * menos, los bordes se deforman y no se derivan (paso 5).
 */
export const MUESTRAS_MINIMAS = 3 * 3 + 1

export interface Coeficientes {
  readonly b0: number
  readonly b1: number
  readonly b2: number
  readonly a1: number
  readonly a2: number
}

/** Corte efectivo: el pedido, limitado a CORTE_MAX_RELATIVO · fs. */
export function corteEfectivo(corteHz: number, fs: number): number {
  return Math.min(corteHz, CORTE_MAX_RELATIVO * fs)
}

/**
 * Coeficientes de una pasada (bilineal), ya con la corrección de Winter para
 * que las dos pasadas juntas tengan −3 dB en `corteHz`.
 */
export function coeficientes(corteHz: number, fs: number): Coeficientes {
  if (!(fs > 0) || !(corteHz > 0)) throw new Error('Frecuencias no válidas.')
  if (corteHz >= fs / 2) throw new Error(`Corte de ${corteHz} Hz por encima de Nyquist (${fs / 2} Hz).`)
  const k = Math.tan((Math.PI * corteHz) / fs) / CORRECCION_WINTER
  const k2 = k * k
  const n = 1 / (1 + Math.SQRT2 * k + k2)
  const b0 = k2 * n
  return { b0, b1: 2 * b0, b2: b0, a1: 2 * (k2 - 1) * n, a2: (1 - Math.SQRT2 * k + k2) * n }
}

/**
 * Ganancia (amplitud, 0–1) del filtro ida y vuelta a la frecuencia f: el
 * cuadrado del módulo de una pasada. Sirve para los tests y para explicar
 * el filtro en la interfaz.
 */
export function ganancia(f: number, c: Coeficientes, fs: number): number {
  const w = (2 * Math.PI * f) / fs
  const re = (b0: number, b1: number, b2: number) => b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w)
  const im = (b1: number, b2: number) => -(b1 * Math.sin(w) + b2 * Math.sin(2 * w))
  const num = Math.hypot(re(c.b0, c.b1, c.b2), im(c.b1, c.b2))
  const den = Math.hypot(re(1, c.a1, c.a2), im(c.a1, c.a2))
  return (num / den) ** 2
}

/**
 * Una pasada (forma directa II transpuesta), empezando en estado
 * estacionario con el primer valor: una señal constante sale igual desde la
 * primera muestra, sin transitorio de arranque.
 */
function pasada(x: Float64Array, c: Coeficientes): Float64Array {
  const y = new Float64Array(x.length)
  if (x.length === 0) return y
  const x0 = x[0]!
  let z1 = (1 - c.b0) * x0
  let z2 = (c.b2 - c.a2) * x0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!
    const yi = c.b0 * xi + z1
    z1 = c.b1 * xi - c.a1 * yi + z2
    z2 = c.b2 * xi - c.a2 * yi
    y[i] = yi
  }
  return y
}

/**
 * Muestras de relleno por cada extremo: una vez el periodo del corte (lo que
 * tarda en asentarse el filtro), al menos 3 veces su longitud y nunca más de
 * lo que la señal permite reflejar.
 */
export function longitudRelleno(n: number, corteHz: number, fs: number): number {
  return Math.max(0, Math.min(n - 1, Math.max(9, Math.ceil(fs / corteHz))))
}

/**
 * Filtra una señal equiespaciada ida y vuelta. Los extremos se rellenan por
 * reflexión impar (2·x0 − x[k]): continúa el valor y la pendiente del borde,
 * lo estándar para que los bordes no se deformen. `corteHz` debe ser menor
 * que fs/2; usa `corteEfectivo` para limitarlo.
 */
export function filtrarEquiespaciado(x: ArrayLike<number>, fs: number, corteHz: number): Float64Array {
  const n = x.length
  if (n === 0) return new Float64Array(0)
  if (n === 1) return Float64Array.from([x[0]!])
  const c = coeficientes(corteHz, fs)
  const r = longitudRelleno(n, corteHz, fs)
  const ext = new Float64Array(n + 2 * r)
  const x0 = x[0]!
  const xn = x[n - 1]!
  for (let k = 0; k < r; k++) ext[k] = 2 * x0 - x[r - k]!
  for (let i = 0; i < n; i++) ext[r + i] = x[i]!
  for (let k = 0; k < r; k++) ext[r + n + k] = 2 * xn - x[n - 2 - k]!
  const ida = pasada(ext, c)
  ida.reverse()
  const vuelta = pasada(ida, c)
  vuelta.reverse()
  return vuelta.slice(r, r + n)
}
