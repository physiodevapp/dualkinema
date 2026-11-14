/*
 * GaitDynamics en el navegador (fase 11, paso 4; D9 de docs/plan-fase-11.md): de nuestro esqueleto a lo que espera el modelo
 * de refinado de GaitDynamics (Tan y col., Stanford, *Nat Biomed Eng* 2026; código y pesos con licencia MIT,
 * stanfordnmbl/GaitDynamics) y de su salida a la fuerza de cada pie. La red corre en un worker con ONNX Runtime Web
 * (`workers/gaitdynamics.worker.ts`); aquí, todo lo de antes y lo de después, en TypeScript puro.
 *
 * El modelo se entrenó con la cinemática de AddBiomechanics en el modelo de OpenSim de Rajagopal (sin brazos) a 100 Hz, en
 * ventanas de 1,5 s (150 muestras). Sus 51 entradas por muestra son: la velocidad de la pelvis entre la estatura; rodilla,
 * tobillo y subastragalina de cada lado y sus velocidades (por muestra); la orientación de la pelvis, de cada cadera y del
 * tronco respecto a la pelvis en «6D» (las dos primeras filas de la matriz de giro) y su velocidad angular. Todo con el
 * marco de OpenSim (x adelante, y arriba, z a la derecha) y la marcha alineada con x. Salida: la fuerza del suelo de cada
 * pie (N/kg) y su centro de presiones respecto al calcáneo.
 *
 * El preprocesado reproduce el suyo (`convert_addb_state_to_model_input`, `align_moving_direction`,
 * `guess_vel_and_replace_txtytz`) hasta los detalles: el Butterworth de orden 4 ida y vuelta de SciPy (`filtfilt` con su
 * relleno impar y su estado inicial), la derivada de la spline de FITPACK (interpolante con nudos «not-a-knot») y su
 * aproximación de la velocidad angular. Lo fija el caso de prueba generado con su código en Python (`caso.prueba.ts`).
 *
 * Las coordenadas de OpenSim salen de la geometría, no de igualar nombres: el giro de cada segmento respecto a su padre en
 * los ejes de OpenSim y su descomposición Z–X–Y (los ejes de las articulaciones del modelo de ejemplo del repositorio:
 * flexión alrededor de z, abducción-aducción de x, rotación de y; la cadera izquierda usa los mismos ejes que la derecha
 * con coeficiente −1 en la abducción-aducción y la rotación). Rodilla y tobillo, nuestros ángulos (flexión +, flexión dorsal +: los rangos del modelo lo confirman). La
 * subastragalina no la tenemos: va como columna que falta (a 0 ya normalizada, como hace GaitDynamics con lo que falta).
 */
import type { Lado } from '../../articulaciones/catalogo'
import { indiceGrado, orientaciones, type Medidas } from '../../esqueleto/modelo'
import { splineNatural } from '../../filtros/spline'
import { SALTO_MAX_PASOS } from '../../filtros/tramos'
import { vec3, type Vec3 } from '../../geometria/vector'
import { resolver } from '../../tresd/algebra'
import { multiplicar, traspuesta, type Mat3 } from '../../tresd/camara'
import type { ReaccionPie } from '../dinamica'
import { cuerpoDePostura, enMetros } from '../segmentos'
import { COLUMNAS, ENTRADA, ESCALA, FS_MODELO, MINIMO, SALIDA, VENTANA } from './normalizador'

/** Las 23 coordenadas de OpenSim, en el orden de GaitDynamics (`OSIM_DOF_ALL[:23]`). */
export const OSIM = [
  'pelvis_tilt', 'pelvis_list', 'pelvis_rotation', 'pelvis_tx', 'pelvis_ty', 'pelvis_tz', 'hip_flexion_r',
  'hip_adduction_r', 'hip_rotation_r', 'knee_angle_r', 'ankle_angle_r', 'subtalar_angle_r', 'mtp_angle_r',
  'hip_flexion_l', 'hip_adduction_l', 'hip_rotation_l', 'knee_angle_l', 'ankle_angle_l', 'subtalar_angle_l',
  'mtp_angle_l', 'lumbar_extension', 'lumbar_bending', 'lumbar_rotation',
] as const
const io = (c: (typeof OSIM)[number]) => OSIM.indexOf(c)
const J3 = {
  pelvis: ['pelvis_tilt', 'pelvis_list', 'pelvis_rotation'],
  hip_r: ['hip_flexion_r', 'hip_adduction_r', 'hip_rotation_r'],
  hip_l: ['hip_flexion_l', 'hip_adduction_l', 'hip_rotation_l'],
  lumbar: ['lumbar_extension', 'lumbar_bending', 'lumbar_rotation'],
} as const
const UNO_D = ['knee_angle_r', 'ankle_angle_r', 'subtalar_angle_r', 'knee_angle_l', 'ankle_angle_l', 'subtalar_angle_l'] as const

// ---- El Butterworth de SciPy (`butter` + `filtfilt`) ----

interface C {
  re: number
  im: number
}
const cm = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cd = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
/** Coeficientes de un polinomio con estas raíces (de mayor a menor grado), como `numpy.poly`. */
function poly(raices: readonly C[]): C[] {
  let p: C[] = [{ re: 1, im: 0 }]
  for (const r of raices) {
    const q: C[] = new Array(p.length + 1).fill(null).map(() => ({ re: 0, im: 0 }))
    p.forEach((c, k) => {
      q[k] = { re: q[k]!.re + c.re, im: q[k]!.im + c.im }
      const m = cm(c, r)
      q[k + 1] = { re: q[k + 1]!.re - m.re, im: q[k + 1]!.im - m.im }
    })
    p = q
  }
  return p
}

/** `scipy.signal.butter(orden, corte / (fs/2), 'lowpass')`: b y a (a₀ = 1). */
export function butterBajo(orden: number, corteHz: number, fs: number): { b: number[]; a: number[] } {
  const wn = corteHz / (fs / 2)
  const fs2 = 4 // bilineal con fs = 2 (frecuencias normalizadas a Nyquist)
  const w = fs2 * Math.tan((Math.PI * wn) / 2)
  // Polos del prototipo analógico, escalados a w, y su paso por la bilineal.
  const pz: C[] = []
  let k: C = { re: Math.pow(w, orden), im: 0 }
  for (let m = -orden + 1; m < orden; m += 2) {
    const ang = (Math.PI * m) / (2 * orden)
    const p: C = { re: -Math.cos(ang) * w, im: Math.sin(ang) * w }
    pz.push(cd({ re: fs2 + p.re, im: p.im }, { re: fs2 - p.re, im: -p.im }))
    k = cd(k, { re: fs2 - p.re, im: -p.im })
  }
  const b = poly(new Array(orden).fill({ re: -1, im: 0 })).map((c) => c.re * k.re)
  const a = poly(pz).map((c) => c.re)
  return { b, a }
}

/** El estado inicial de `lfilter` para una entrada constante de 1 (`scipy.signal.lfilter_zi`). */
function lfilterZi(b: readonly number[], a: readonly number[]): number[] {
  const n = a.length - 1
  // (I − companion(a)ᵀ) zi = b[1:] − a[1:]·b[0]
  const M: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // companion(a): primera fila −a[1:], subdiagonal de unos; su traspuesta: primera columna −a[1:], superdiagonal 1.
      const ct = j === 0 ? -a[i + 1]! : i + 1 === j ? 1 : 0
      M.push((i === j ? 1 : 0) - ct)
    }
  }
  return resolver(M, Array.from({ length: n }, (_, i) => b[i + 1]! - a[i + 1]! * b[0]!), n)!
}

function lfilter(b: readonly number[], a: readonly number[], x: ArrayLike<number>, zi: readonly number[]): Float64Array {
  const n = a.length - 1
  const z = [...zi]
  const y = new Float64Array(x.length)
  for (let t = 0; t < x.length; t++) {
    const xt = x[t]!
    const yt = b[0]! * xt + z[0]!
    for (let i = 0; i < n - 1; i++) z[i] = b[i + 1]! * xt + z[i + 1]! - a[i + 1]! * yt
    z[n - 1] = b[n]! * xt - a[n]! * yt
    y[t] = yt
  }
  return y
}

/** `scipy.signal.filtfilt(b, a, x)` con sus valores por defecto (relleno impar de 3·max(len(a), len(b)) muestras). */
export function filtfilt(b: readonly number[], a: readonly number[], x: ArrayLike<number>): Float64Array {
  const pad = 3 * Math.max(a.length, b.length)
  const n = x.length
  if (n <= pad) throw new Error(`filtfilt: hacen falta más de ${pad} muestras`)
  const ext = new Float64Array(n + 2 * pad)
  for (let i = 0; i < pad; i++) ext[i] = 2 * x[0]! - x[pad - i]!
  for (let i = 0; i < n; i++) ext[pad + i] = x[i]!
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1]! - x[n - 2 - i]!
  const zi = lfilterZi(b, a)
  const ida = lfilter(b, a, ext, zi.map((z) => z * ext[0]!))
  ida.reverse()
  const vuelta = lfilter(b, a, ida, zi.map((z) => z * ida[0]!))
  vuelta.reverse()
  return vuelta.slice(pad, pad + n)
}

/**
 * La derivada, en cada muestra, de la spline cúbica interpolante con nudos «not-a-knot» respecto al índice (la de
 * `scipy.interpolate.splprep(u=range(n), s=0)` y `splev(der=1)`): por muestra, no por segundo.
 */
export function derivadaSpline(y: ArrayLike<number>): Float64Array {
  const n = y.length
  const d = new Float64Array(n)
  if (n < 4) {
    for (let i = 0; i < n; i++) d[i] = i + 1 < n ? y[i + 1]! - y[i]! : y[i]! - y[i - 1]!
    return d
  }
  // Segundas derivadas M con h = 1: Mᵢ₋₁ + 4Mᵢ + Mᵢ₊₁ = 6(yᵢ₊₁ − 2yᵢ + yᵢ₋₁); not-a-knot: M₀ = 2M₁ − M₂ y su simétrica.
  const r = (i: number) => 6 * (y[i + 1]! - 2 * y[i]! + y[i - 1]!)
  const M = new Float64Array(n)
  // Incógnitas M₁…M_{n−2}: la primera y la última ecuación quedan 6M₁ = r₁ y 6M_{n−2} = r_{n−2}.
  const m = n - 2
  const diag = new Float64Array(m).fill(4)
  const sup = new Float64Array(m).fill(1)
  const inf = new Float64Array(m).fill(1)
  const rhs = new Float64Array(m)
  for (let k = 0; k < m; k++) rhs[k] = r(k + 1)
  diag[0] = 6
  sup[0] = 0
  diag[m - 1] = 6
  inf[m - 1] = 0
  // Thomas.
  for (let k = 1; k < m; k++) {
    const f = inf[k]! / diag[k - 1]!
    diag[k]! -= f * sup[k - 1]!
    rhs[k]! -= f * rhs[k - 1]!
  }
  M[m] = rhs[m - 1]! / diag[m - 1]!
  for (let k = m - 2; k >= 0; k--) M[k + 1] = (rhs[k]! - sup[k]! * M[k + 2]!) / diag[k]!
  M[0] = 2 * M[1]! - M[2]!
  M[n - 1] = 2 * M[n - 2]! - M[n - 3]!
  for (let i = 0; i < n - 1; i++) d[i] = y[i + 1]! - y[i]! - (2 * M[i]! + M[i + 1]!) / 6
  d[n - 1] = y[n - 1]! - y[n - 2]! + (M[n - 2]! + 2 * M[n - 1]!) / 6
  return d
}

// ---- Giros ----

const rx = (t: number): Mat3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)]
const ry = (t: number): Mat3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)]
const rz = (t: number): Mat3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1]
/** Rz(a)·Rx(b)·Ry(c): la secuencia «ZXY» de GaitDynamics y de las articulaciones del modelo. */
export const zxy = (a: number, b: number, c: number): Mat3 => multiplicar(multiplicar(rz(a), rx(b)), ry(c))
/** Los tres ángulos de `zxy`. */
export function aZxy(R: Mat3): [number, number, number] {
  const x = Math.asin(Math.max(-1, Math.min(1, R[7])))
  return [Math.atan2(-R[1], R[4]), x, Math.atan2(-R[6], R[8])]
}
/** De nuestro marco (x adelante, y izquierda, z arriba) al de OpenSim (x adelante, y arriba, z derecha). */
const C: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0]
const Ct = traspuesta(C)
const aOsim = (R: Mat3): Mat3 => multiplicar(multiplicar(C, R), Ct)

/**
 * Las 23 coordenadas de OpenSim (rad y m) de una postura del esqueleto (en metros). La subastragalina y la
 * metatarsofalángica, 0 (no las tenemos).
 */
export function coordenadasOsim(q: readonly number[], m: Medidas): number[] {
  const o = orientaciones(q)
  const P = aOsim(o.pelvis)
  const Pt = traspuesta(P)
  const r = new Array<number>(OSIM.length).fill(0)
  const poner = (cs: readonly (typeof OSIM)[number][], v: readonly number[]) => cs.forEach((c, k) => (r[io(c)] = v[k]!))
  poner(J3.pelvis, aZxy(P))
  poner(['pelvis_tx', 'pelvis_ty', 'pelvis_tz'], [q[0]!, q[2]!, -q[1]!])
  poner(J3.hip_r, aZxy(multiplicar(Pt, aOsim(o.muslo.der))))
  // En el modelo, la abducción-aducción y la rotación de la cadera izquierda tienen los ejes de la derecha pero coeficiente
  // −1 (`<coefficients> -1 0` en su CustomJoint): la coordenada es el giro geométrico cambiado de signo (así la aducción y
  // la rotación interna son + en las dos piernas).
  const [fl, ab, ro] = aZxy(multiplicar(Pt, aOsim(o.muslo.izq)))
  poner(J3.hip_l, [fl, -ab, -ro])
  poner(J3.lumbar, aZxy(multiplicar(Pt, aOsim(o.tronco))))
  r[io('knee_angle_r')] = q[indiceGrado('rodillaDer')]!
  r[io('knee_angle_l')] = q[indiceGrado('rodillaIzq')]!
  r[io('ankle_angle_r')] = q[indiceGrado('tobilloDorsalDer')]!
  r[io('ankle_angle_l')] = q[indiceGrado('tobilloDorsalIzq')]!
  void m
  return r
}

/** Desenrolla una serie de ángulos (sin saltos de más de π de una muestra a la siguiente). */
function desenrollar(v: number[]): number[] {
  for (let i = 1; i < v.length; i++) {
    let d = v[i]! - v[i - 1]!
    while (d > Math.PI) {
      v[i]! -= 2 * Math.PI
      d -= 2 * Math.PI
    }
    while (d < -Math.PI) {
      v[i]! += 2 * Math.PI
      d += 2 * Math.PI
    }
  }
  return v
}

/** Lo que se le quitó a la marcha para alinearla con x (para devolver las fuerzas a nuestro marco). */
export interface Alineacion {
  /** El giro aplicado (v_alineado = giro · v, en el marco de OpenSim). */
  readonly giro: Mat3
}

/**
 * Las 51 entradas normalizadas de cada muestra (n × 51, por filas) a partir de las coordenadas de OpenSim a 100 Hz (n × 23)
 * y la estatura (m): lo que hace GaitDynamics antes de su red. n > 15 (el relleno del filtro).
 */
export function entradasDeCoordenadas(q: readonly (readonly number[])[], altura: number, fs = FS_MODELO): { entradas: Float32Array; alineacion: Alineacion } {
  const n = q.length
  const col = (c: (typeof OSIM)[number]) => q.map((f) => f[io(c)]!)
  // Alinear con x: la mediana del rumbo de la pelvis, girada alrededor de la vertical.
  const Rp = q.map((f) => zxy(f[io('pelvis_tilt')]!, f[io('pelvis_list')]!, f[io('pelvis_rotation')]!))
  const rumbos = Rp.map((R) => Math.atan2(-R[2], R[8])).sort((a, b) => a - b)
  // La mediana de torch (la de abajo con un número par).
  const ang = rumbos[Math.floor((n - 1) / 2)]!
  const giro: Mat3 = [Math.cos(ang), 0, Math.sin(ang), 0, 1, 0, -Math.sin(ang), 0, Math.cos(ang)]
  const RpA = Rp.map((R) => multiplicar(giro, R))
  const pos = q.map((f) => {
    const x = f[io('pelvis_tx')]!
    const y = f[io('pelvis_ty')]!
    const z = f[io('pelvis_tz')]!
    return [giro[0] * x + giro[1] * y + giro[2] * z, giro[3] * x + giro[4] * y + giro[5] * z, giro[6] * x + giro[7] * y + giro[8] * z]
  })
  const valores = new Map<string, Float64Array>()
  const matrices: Record<keyof typeof J3, Mat3[]> = {
    pelvis: RpA,
    hip_r: q.map((f) => zxy(...(J3.hip_r.map((c) => f[io(c)]!) as [number, number, number]))),
    hip_l: q.map((f) => zxy(...(J3.hip_l.map((c) => f[io(c)]!) as [number, number, number]))),
    lumbar: q.map((f) => zxy(...(J3.lumbar.map((c) => f[io(c)]!) as [number, number, number]))),
  }
  const f15 = butterBajo(4, 15, fs)
  for (const j of Object.keys(J3) as (keyof typeof J3)[]) {
    const M = matrices[j]
    for (let k = 0; k < 6; k++) valores.set(`${j}_${k}`, Float64Array.from(M, (R) => R[k]!))
    // Su velocidad angular aproximada: (Rₜ − Rₜ₊₁), la parte antisimétrica, por fs / 2; filtrada a 15 Hz.
    const w = [0, 1, 2].map(() => new Float64Array(n))
    for (let t = 0; t < n; t++) {
      const a = t < n - 1 ? t : n - 2
      const D = M[a]!.map((v, i) => v - M[a + 1]![i]!)
      w[0]![t] = (D[7]! - D[5]!) * fs * 0.5
      w[1]![t] = (D[2]! - D[6]!) * fs * 0.5
      w[2]![t] = (D[3]! - D[1]!) * fs * 0.5
    }
    ;['x', 'y', 'z'].forEach((e, k) => valores.set(`${j}_${e}_angular_vel`, filtfilt(f15.b, f15.a, w[k]!)))
  }
  for (const c of UNO_D) {
    const v = Float64Array.from(col(c))
    valores.set(c, v)
    valores.set(`${c}_vel`, derivadaSpline(filtfilt(f15.b, f15.a, v)))
  }
  // La velocidad del centro: la posición de la pelvis (desde la primera muestra) a 10 Hz, derivada, entre la estatura.
  const f10 = butterBajo(4, 10, fs)
  ;['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].forEach((c, k) => {
    const p = filtfilt(f10.b, f10.a, pos.map((x) => x[k]! - pos[0]![k]!))
    const v = new Float64Array(n)
    for (let t = 0; t < n - 1; t++) v[t] = ((p[t + 1]! - p[t]!) * fs) / altura
    v[n - 1] = v[n - 2]!
    valores.set(c, v)
  })
  const entradas = new Float32Array(n * ENTRADA.length)
  ENTRADA.forEach((ic, k) => {
    const nombre = COLUMNAS[ic]!
    const v = valores.get(nombre)!
    // Lo que no tenemos (la subastragalina) va como columna que falta: 0 ya normalizada.
    const falta = nombre.includes('subtalar')
    for (let t = 0; t < n; t++) entradas[t * ENTRADA.length + k] = falta ? 0 : v[t]! * ESCALA[ic]! + MINIMO[ic]!
  })
  return { entradas, alineacion: { giro } }
}

// ---- Toda la toma ----

/** Lo más que puede cambiar el rumbo de la pelvis dentro de un trozo que se alinea de una vez (GaitDynamics: 45°). */
export const RUMBO_MAX = Math.PI / 4

/** Paso de las ventanas (muestras): se solapan la mitad y en cada muestra se promedia lo que dan. */
export const PASO_VENTANA = VENTANA / 2

export interface TramoPreparado {
  /** Frames de la toma que abarca [i0, i1] y la rejilla de 100 Hz. */
  readonly i0: number
  readonly i1: number
  readonly rejilla: Float64Array
  readonly alineacion: Alineacion
  /** Primera muestra de cada ventana (en la rejilla). */
  readonly inicios: readonly number[]
}

export interface TomaPreparada {
  readonly tramos: readonly TramoPreparado[]
  /** Todas las ventanas seguidas: (número de ventanas) × 150 × 51. */
  readonly lote: Float32Array
  readonly ventanas: number
}

/** La estatura aproximada de las medidas del esqueleto: del tobillo al hombro es el 77,9 % (Winter). */
export const alturaDeMedidas = (m: Medidas): number => (m.muslo + m.pierna + m.tronco) / 0.779

/**
 * Prepara la toma para el modelo: por tramos de frames con postura (sin cruzar huecos ni saltos) de 1,5 s o más, las
 * coordenadas de OpenSim de cada frame remuestreadas a 100 Hz, sus entradas y las ventanas.
 */
export function prepararToma(tiempos: readonly number[], posturas: readonly (readonly number[] | null)[], medidas: Medidas, metrosPorUnidad: number, fs: number): TomaPreparada {
  const altura = alturaDeMedidas(medidas) * metrosPorUnidad
  const tramos: TramoPreparado[] = []
  const lotes: Float32Array[] = []
  const pasoMax = SALTO_MAX_PASOS / fs
  let i = 0
  while (i < tiempos.length) {
    if (!posturas[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < tiempos.length && posturas[j + 1] && tiempos[j + 1]! - tiempos[j]! <= pasoMax) j++
    // GaitDynamics no alinea un ensayo cuyo rumbo cambia más de 45° (lo da por no fiable): aquí el tramo se parte en trozos
    // con el rumbo dentro de 45° (una ida y una vuelta van por separado) y se prepara cada uno.
    const todas = posturas.slice(i, j + 1).map((q) => {
      const e = enMetros(q!, medidas, metrosPorUnidad)
      return coordenadasOsim(e.q, e.m)
    })
    const rumbo = desenrollar(todas.map((c) => c[io('pelvis_rotation')]!))
    let a = 0
    while (a < todas.length) {
      let b = a
      let lo = rumbo[a]!
      let hi = rumbo[a]!
      while (b + 1 < todas.length && Math.max(hi, rumbo[b + 1]!) - Math.min(lo, rumbo[b + 1]!) <= RUMBO_MAX) {
        b++
        lo = Math.min(lo, rumbo[b]!)
        hi = Math.max(hi, rumbo[b]!)
      }
      prepararTrozo(i + a, i + b, todas.slice(a, b + 1))
      a = b + 1
    }
    i = j + 1
  }

  function prepararTrozo(i: number, j: number, coords: number[][]) {
    const t0 = tiempos[i]!
    const n = Math.floor((tiempos[j]! - t0) * FS_MODELO) + 1
    if (n >= VENTANA) {
      const ts = tiempos.slice(i, j + 1)
      // Cada coordenada, desenrollada (las de giro) y llevada a la rejilla de 100 Hz con una spline.
      const rejilla = Float64Array.from({ length: n }, (_, k) => t0 + k / FS_MODELO)
      const columnas = OSIM.map((c, k) => {
        const v = coords.map((f) => f[k]!)
        const s = splineNatural(ts, c.startsWith('pelvis_t') ? v : desenrollar(v))
        return Array.from(rejilla, (t) => s(Math.min(t, ts[ts.length - 1]!)))
      })
      const q100 = Array.from({ length: n }, (_, t) => columnas.map((c) => c[t]!))
      const { entradas, alineacion } = entradasDeCoordenadas(q100, altura)
      const inicios: number[] = []
      for (let s = 0; s + VENTANA <= n; s += PASO_VENTANA) inicios.push(s)
      if (inicios[inicios.length - 1]! + VENTANA < n) inicios.push(n - VENTANA)
      for (const s of inicios) lotes.push(entradas.subarray(s * ENTRADA.length, (s + VENTANA) * ENTRADA.length))
      tramos.push({ i0: i, i1: j, rejilla, alineacion, inicios })
    }
  }
  const lote = new Float32Array(lotes.length * VENTANA * ENTRADA.length)
  lotes.forEach((l, k) => lote.set(l, k * VENTANA * ENTRADA.length))
  return { tramos, lote, ventanas: lotes.length }
}

/** Por debajo de esta fuerza vertical (N/kg) un pie no apoya: sin centro de presiones (GaitDynamics usa 20 N). */
export const FUERZA_APOYO_GD = 0.3

/**
 * De lo que da la red (ventanas × 150 × 12, normalizado) a la fuerza y el centro de presiones de cada pie en cada frame de
 * la toma, en nuestro marco (N/kg y m). El centro de presiones se da respecto al calcáneo, que aquí es nuestro talón. Fuera
 * de los tramos preparados, null.
 */
export function decodificar(
  prep: TomaPreparada,
  salida: Float32Array,
  tiempos: readonly number[],
  posturas: readonly (readonly number[] | null)[],
  medidas: Medidas,
  metrosPorUnidad: number,
  suelo: number,
): (Readonly<Record<Lado, ReaccionPie | null>> | null)[] {
  const altura = alturaDeMedidas(medidas) * metrosPorUnidad
  const r: (Record<Lado, ReaccionPie | null> | null)[] = tiempos.map(() => null)
  const nS = SALIDA.length
  let v = 0
  for (const tr of prep.tramos) {
    const n = tr.rejilla.length
    const suma = new Float64Array(n * nS)
    const cuenta = new Float64Array(n)
    for (const s of tr.inicios) {
      for (let t = 0; t < VENTANA; t++) {
        for (let k = 0; k < nS; k++) suma[(s + t) * nS + k]! += salida[(v * VENTANA + t) * nS + k]!
        cuenta[s + t]!++
      }
      v++
    }
    // Sin normalizar: x = (x_n − mínimo) / escala.
    const des = (t: number, k: number) => (suma[t * nS + k]! / cuenta[t]! - MINIMO[SALIDA[k]!]!) / ESCALA[SALIDA[k]!]!
    const Gt = traspuesta(tr.alineacion.giro)
    const aNuestro = (x: number, y: number, z: number): Vec3 => {
      const a = [Gt[0] * x + Gt[1] * y + Gt[2] * z, Gt[3] * x + Gt[4] * y + Gt[5] * z, Gt[6] * x + Gt[7] * y + Gt[8] * z]
      // De OpenSim (x, y arriba, z derecha) al nuestro (x, y izquierda, z arriba).
      return vec3(a[0]!, -a[2]!, a[1]!)
    }
    const porMuestra = Array.from({ length: n }, (_, t) =>
      (['der', 'izq'] as const).map((_, p) => {
        const F = aNuestro(des(t, 6 * p), des(t, 6 * p + 1), des(t, 6 * p + 2))
        const fy = des(t, 6 * p + 1)
        const c = fy > 1e-6 ? aNuestro((des(t, 6 * p + 3) / fy) * altura, (des(t, 6 * p + 4) / fy) * altura, (des(t, 6 * p + 5) / fy) * altura) : vec3(0, 0, 0)
        return { F, c }
      }),
    )
    for (let i = tr.i0; i <= tr.i1; i++) {
      const u = (tiempos[i]! - tr.rejilla[0]!) * FS_MODELO
      const a = Math.max(0, Math.min(n - 1, Math.floor(u)))
      const b = Math.min(n - 1, a + 1)
      const f = Math.max(0, Math.min(1, u - a))
      const mezcla = (x: Vec3, y: Vec3) => vec3(x.x + f * (y.x - x.x), x.y + f * (y.y - x.y), x.z + f * (y.z - x.z))
      const e = enMetros(posturas[i]!, medidas, metrosPorUnidad)
      const cuerpo = cuerpoDePostura(e.q, e.m)
      const pie = {} as Record<Lado, ReaccionPie | null>
      ;(['der', 'izq'] as const).forEach((l, p) => {
        const F = mezcla(porMuestra[a]![p]!.F, porMuestra[b]![p]!.F)
        const talon = cuerpo.puntos.talon[l]
        // Un pie en el aire no apoya (null: sin fuerza ni centro de presiones; su momento sale de la inercia de la pierna).
        if (!(F.z >= FUERZA_APOYO_GD)) {
          pie[l] = null
          return
        }
        const c = mezcla(porMuestra[a]![p]!.c, porMuestra[b]![p]!.c)
        // El momento libre de cada pie no lo da la red: sin valor.
        pie[l] = { F, cop: vec3(talon.x + c.x, talon.y + c.y, suelo), libre: NaN }
      })
      r[i] = pie
    }
  }
  return r
}
