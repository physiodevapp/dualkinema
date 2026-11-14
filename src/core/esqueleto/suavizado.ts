/*
 * El suavizado de toda la toma (fase 11, paso 3; D12 de docs/plan-fase-11.md). El ajuste frame a frame (fase 7) da en cada
 * frame una postura q̂ₜ y, de lo que ven las cámaras, cuánto la determinan (la información Hₜ = JᵀJ de la reproyección, por
 * px² de ruido). Aquí se busca la trayectoria de toda la toma que mejor casa con todas a la vez y con un movimiento
 * suave:
 *
 *   mín Σₜ (qₜ − q̂ₜ)ᵀ Hₜ (qₜ − q̂ₜ) / σₜ²  +  Σₜ Σₖ (q̈ₜₖ / σ_aₖ)²
 *
 * con σₜ el error de reproyección del frame (lo que se equivoca el detector ahí) y σ_a la aceleración típica de cada grado
 * de libertad (angular o lineal). Es un suavizador que pesa cada grado de libertad por lo bien que se ve: lo que las
 * cámaras ven bien se mueve poco; lo que apenas se ve (la rotación de la cadera con la rodilla recta, la anteversión, un
 * punto tapado) lo dictan sus vecinos en el tiempo. Para un grado de libertad aislado con ruido σ_q equivale a un paso bajo
 * de cuarto orden con corte ω_c ≈ √(σ_a / σ_q): con más ruido, corta más abajo.
 *
 * La aceleración usa los tiempos de verdad (fps variable): q̈ₜ ≈ 2[(qₜ₊₁ − qₜ)/h₊ − (qₜ − qₜ₋₁)/h₋]/(h₊ + h₋). Nunca a
 * través de un hueco ni de un salto en el tiempo (cada tramo por separado). Es un problema lineal de mínimos cuadrados con
 * matriz en banda (cada frame se acopla con los dos de cada lado): se resuelve por ventanas solapadas con Cholesky en
 * banda, sin pedir memoria de más con tomas largas.
 */
import { SALTO_MAX_PASOS } from '../filtros/tramos'
import { N_GRADOS } from './modelo'

/**
 * Aceleración típica de los ángulos (rad/s²) y de la posición de la pelvis (m/s²) para el previo de suavidad. Elegidas con
 * la persona sintética a través de las dos cámaras (6 y 10 px de ruido): con 10 y 1, la fuerza vertical dinámica de las
 * sentadillas queda a 0,2 N/kg de la verdad (2 % del peso) con el filtro a 4–6 Hz, frente a 0,7–1,1 sin suavizar; en la
 * marcha en el sitio (rodilla a ~33 rad/s²), el ángulo de la rodilla suavizado empeora poco (de 3,6° a 4,4° de error),
 * mientras que con 5 y 0,5 se iba a 7,1°. Por eso las posturas suavizadas solo las usa la cinética.
 */
export const ACELERACION_ANGULAR = 10
export const ACELERACION_LINEAL = 1
/** Error de reproyección mínimo con que se pesa un frame (px): uno casi perfecto no debe mandar del todo. */
const ERROR_MINIMO_PX = 0.5
/** Ancla débil a la postura del frame (en sus unidades²): que nada quede sin determinar. */
const ANCLA = 1e-4
/** Frames por ventana y solape a cada lado (más que el alcance del suavizado, unas décimas de segundo). */
const VENTANA = 240
const SOLAPE = 30

export interface EntradaSuavizado {
  readonly tiempos: readonly number[]
  readonly posturas: readonly (readonly number[] | null)[]
  /** La información de cada frame (N_GRADOS² valores, `ResultadoAjuste.informacion`), o null. */
  readonly informacion: readonly (Float64Array | null)[]
  /** El error de reproyección de cada frame (px). */
  readonly errores: readonly number[]
  /** fps de referencia (para cortar los tramos en los saltos). */
  readonly fs: number
  /** Metros por unidad de la posición de la pelvis (1 con escala). */
  readonly unidad: number
  /** Las aceleraciones típicas del previo (por defecto, `ACELERACION_ANGULAR` y `ACELERACION_LINEAL`). */
  readonly aceleracion?: { readonly angular: number; readonly lineal: number }
}

/** Cholesky en banda (A = L·Lᵀ) de una matriz simétrica de orden n y semiancho b, guardada por filas: a[i·(b+1) + (i − j)] = A[i][j]. */
function choleskyBanda(a: Float64Array, n: number, b: number): boolean {
  const w = b + 1
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - b); j <= i; j++) {
      let s = a[i * w + (i - j)]!
      for (let k = Math.max(0, i - b, j - b); k < j; k++) s -= a[i * w + (i - k)]! * a[j * w + (j - k)]!
      if (i === j) {
        if (!(s > 0)) return false
        a[i * w] = Math.sqrt(s)
      } else a[i * w + (i - j)] = s / a[j * w]!
    }
  }
  return true
}

/** Resuelve L·Lᵀ x = y en sitio con el factor de `choleskyBanda`. */
function resolverBanda(l: Float64Array, n: number, b: number, y: Float64Array): void {
  const w = b + 1
  for (let i = 0; i < n; i++) {
    let s = y[i]!
    for (let k = Math.max(0, i - b); k < i; k++) s -= l[i * w + (i - k)]! * y[k]!
    y[i] = s / l[i * w]!
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!
    for (let k = i + 1; k <= Math.min(n - 1, i + b); k++) s -= l[k * w + (k - i)]! * y[k]!
    y[i] = s / l[i * w]!
  }
}

/** Suaviza un tramo de frames seguidos [i0, i1] y escribe el resultado en `salida`. */
function suavizarTramo(e: EntradaSuavizado, i0: number, i1: number, salida: (number[] | null)[]): void {
  const n = i1 - i0 + 1
  const D = N_GRADOS
  const N = n * D
  const b = 2 * D + D - 1 // un frame se acopla con los dos de cada lado
  const w = b + 1
  const A = new Float64Array(N * w)
  const y = new Float64Array(N)
  const sumar = (i: number, j: number, v: number) => {
    // Solo el triángulo inferior.
    if (j > i) [i, j] = [j, i]
    A[i * w + (i - j)]! += v
  }
  for (let t = 0; t < n; t++) {
    const q = e.posturas[i0 + t]!
    const H = e.informacion[i0 + t]
    const err = Math.max(ERROR_MINIMO_PX, Number.isFinite(e.errores[i0 + t]!) ? e.errores[i0 + t]! : ERROR_MINIMO_PX)
    const k = 1 / (err * err)
    for (let a = 0; a < D; a++) {
      let fila = 0
      for (let c = 0; c <= a; c++) {
        const v = (H ? H[a * D + c]! * k : 0) + (a === c ? ANCLA : 0)
        if (v !== 0) sumar(t * D + a, t * D + c, v)
      }
      for (let c = 0; c < D; c++) fila += ((H ? H[a * D + c]! * k : 0) + (a === c ? ANCLA : 0)) * q[c]!
      y[t * D + a] = fila
    }
  }
  // El previo de suavidad: la aceleración de cada grado de libertad en cada frame interior.
  for (let t = 1; t < n - 1; t++) {
    const hm = e.tiempos[i0 + t]! - e.tiempos[i0 + t - 1]!
    const hp = e.tiempos[i0 + t + 1]! - e.tiempos[i0 + t]!
    const c = [2 / (hm * (hm + hp)), -2 / (hm * hp), 2 / (hp * (hm + hp))]
    for (let k = 0; k < D; k++) {
      const sa = k < 3 ? (e.aceleracion?.lineal ?? ACELERACION_LINEAL) / e.unidad : (e.aceleracion?.angular ?? ACELERACION_ANGULAR)
      const peso = 1 / (sa * sa)
      for (let p = 0; p < 3; p++) for (let r = 0; r < 3; r++) if (r <= p) sumar((t - 1 + p) * D + k, (t - 1 + r) * D + k, peso * c[p]! * c[r]!)
    }
  }
  // Cada pareja (p, r) del previo va una vez en el triángulo inferior: es la entrada simétrica de las dos.
  if (!choleskyBanda(A, N, b)) {
    for (let t = 0; t < n; t++) salida[i0 + t] = [...e.posturas[i0 + t]!]
    return
  }
  resolverBanda(A, N, b, y)
  for (let t = 0; t < n; t++) salida[i0 + t] = Array.from(y.subarray(t * D, (t + 1) * D))
}

/**
 * Las posturas suavizadas de toda la toma (D12). Un frame sin postura sigue sin ella; un tramo de menos de 3 frames se
 * queda como estaba. Las ventanas largas se resuelven por trozos solapados y se pega el centro de cada uno.
 */
export function suavizarPosturas(e: EntradaSuavizado): (number[] | null)[] {
  const n = e.tiempos.length
  const salida: (number[] | null)[] = new Array(n).fill(null)
  const pasoMax = SALTO_MAX_PASOS / e.fs
  let i = 0
  while (i < n) {
    if (!e.posturas[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < n && e.posturas[j + 1] && e.tiempos[j + 1]! - e.tiempos[j]! <= pasoMax) j++
    if (j - i + 1 < 3) {
      for (let k = i; k <= j; k++) salida[k] = [...e.posturas[k]!]
    } else {
      // Ventanas de VENTANA frames útiles con SOLAPE a cada lado.
      for (let desde = i; desde <= j; desde += VENTANA) {
        const hasta = Math.min(j, desde + VENTANA - 1)
        const a = Math.max(i, desde - SOLAPE)
        const z = Math.min(j, hasta + SOLAPE)
        const parcial: (number[] | null)[] = []
        suavizarTramo(e, a, z, parcial)
        for (let k = desde; k <= hasta; k++) salida[k] = parcial[k]!
      }
    }
    i = j + 1
  }
  return salida
}
