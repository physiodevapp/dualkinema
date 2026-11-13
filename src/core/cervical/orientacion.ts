/*
 * La orientación de la cabeza y los ángulos cervicales (fase 10, D3–D7 de docs/plan-fase-10.md).
 *
 * Un giro es una matriz 3 × 3 (por filas) cuyas columnas son los ejes de la cabeza en el marco de la cámara. Ejes de la
 * cabeza (los de la cara canónica de Face Landmarker): x hacia la izquierda de la persona, y hacia arriba, z hacia delante
 * (sale de la cara). Marco de la cámara (el de Face Landmarker, como OpenGL): x a la derecha de la imagen, y arriba, z hacia
 * quien mira la pantalla. Con la persona de frente a la cámara, el giro es casi la identidad (su izquierda queda a la
 * derecha de la imagen).
 *
 * Los ángulos cervicales son el giro de la cabeza **respecto a la posición neutra** (el cero: la orientación media en un
 * tramo quieto), R₀ᵀ·R, descompuesto en la secuencia rotación (eje vertical) → flexo-extensión (eje de lado a lado) →
 * inclinación lateral (eje de delante atrás): R = R_y(rot)·R_x(flex)·R_z(incl). Convenciones (fijadas por los tests):
 * rotación a la izquierda +, flexión +, inclinación a la izquierda + (la oreja izquierda baja).
 */

/** Matriz 3 × 3 por filas. */
export type Giro = readonly [number, number, number, number, number, number, number, number, number]

export const IDENTIDAD: Giro = [1, 0, 0, 0, 1, 0, 0, 0, 1]

const g = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

export function multiplicar(a: Giro, b: Giro): Giro {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!
  return r as unknown as Giro
}

export const traspuesta = (a: Giro): Giro => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]

export const giroY = (d: number): Giro => {
  const c = Math.cos(rad(d))
  const s = Math.sin(rad(d))
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}
export const giroX = (d: number): Giro => {
  const c = Math.cos(rad(d))
  const s = Math.sin(rad(d))
  return [1, 0, 0, 0, c, -s, 0, s, c]
}
export const giroZ = (d: number): Giro => {
  const c = Math.cos(rad(d))
  const s = Math.sin(rad(d))
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

/** El giro de una postura cervical (grados, convenciones clínicas) respecto a la neutra: la inversa de `angulosCervicales`. */
export const giroDeAngulos = (rotacion: number, flexion: number, inclinacion: number): Giro => multiplicar(multiplicar(giroY(rotacion), giroX(flexion)), giroZ(-inclinacion))

export interface AngulosCervicales {
  /** + a la izquierda. */
  readonly rotacion: number
  /** + flexión. */
  readonly flexion: number
  /** + a la izquierda. */
  readonly inclinacion: number
}

/** Los ángulos cervicales (grados) del giro `r` respecto al neutro `cero`. */
export function angulosCervicales(cero: Giro, r: Giro): AngulosCervicales {
  const m = multiplicar(traspuesta(cero), r)
  // R_y(a)·R_x(b)·R_z(c): m[1][2] = −sen b, m[0][2] = sen a·cos b, m[2][2] = cos a·cos b, m[1][0] = cos b·sen c, m[1][1] = cos b·cos c.
  const b = Math.asin(Math.max(-1, Math.min(1, -m[5])))
  const a = Math.atan2(m[2], m[8])
  const c = Math.atan2(m[3], m[4])
  return { rotacion: g(a), flexion: g(b), inclinacion: -g(c) }
}

/**
 * La matriz de giro de una matriz de transformación 4 × 4 de Face Landmarker (`facialTransformationMatrixes[i].data`, 16
 * números **por columnas**, como las de OpenGL), ortonormalizada (la matriz puede traer escala).
 */
export function giroDeTransformacion(m: ArrayLike<number>): Giro | null {
  if (m.length < 16) return null
  // Por columnas: la columna j es m[4j..4j+2].
  const cols = [0, 1, 2].map((j) => [m[4 * j]!, m[4 * j + 1]!, m[4 * j + 2]!])
  if (!cols.flat().every(Number.isFinite)) return null
  return ortonormalizar([cols[0]![0]!, cols[1]![0]!, cols[2]![0]!, cols[0]![1]!, cols[1]![1]!, cols[2]![1]!, cols[0]![2]!, cols[1]![2]!, cols[2]![2]!])
}

/** El giro más cercano a una matriz casi de giro (Gram–Schmidt sobre las columnas: z, luego y, x = y × z); null si degenerada. */
export function ortonormalizar(a: readonly number[]): Giro | null {
  const col = (j: number) => [a[j]!, a[3 + j]!, a[6 + j]!]
  const norma = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!)
  const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!
  let z = col(2)
  const nz = norma(z)
  if (!(nz > 1e-9)) return null
  z = z.map((x) => x / nz)
  let y = col(1)
  const p = dot(y, z)
  y = y.map((x, k) => x - p * z[k]!)
  const ny = norma(y)
  if (!(ny > 1e-9)) return null
  y = y.map((x) => x / ny)
  const x = [y[1]! * z[2]! - y[2]! * z[1]!, y[2]! * z[0]! - y[0]! * z[2]!, y[0]! * z[1]! - y[1]! * z[0]!]
  return [x[0]!, y[0]!, z[0]!, x[1]!, y[1]!, z[1]!, x[2]!, y[2]!, z[2]!]
}

/** Lo de frente que ve la cámara la cara (D7): el coseno entre hacia dónde mira la cara y hacia la cámara (0 de perfil o de espaldas). */
export const frontalidad = (r: Giro): number => Math.max(0, r[8])

type Cuaternion = [number, number, number, number]

function aCuaternion(r: Giro): Cuaternion {
  const t = r[0] + r[4] + r[8]
  let q: Cuaternion
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2
    q = [0.25 * s, (r[7] - r[5]) / s, (r[2] - r[6]) / s, (r[3] - r[1]) / s]
  } else if (r[0] > r[4] && r[0] > r[8]) {
    const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2
    q = [(r[7] - r[5]) / s, 0.25 * s, (r[1] + r[3]) / s, (r[2] + r[6]) / s]
  } else if (r[4] > r[8]) {
    const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2
    q = [(r[2] - r[6]) / s, (r[1] + r[3]) / s, 0.25 * s, (r[5] + r[7]) / s]
  } else {
    const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2
    q = [(r[3] - r[1]) / s, (r[2] + r[6]) / s, (r[5] + r[7]) / s, 0.25 * s]
  }
  return q
}

function deCuaternion([w, x, y, z]: Cuaternion): Giro {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
}

/**
 * El giro medio de una lista (con pesos): la media de los cuaterniones, todos del mismo signo que el primero, normalizada.
 * Vale para giros parecidos (los de un tramo quieto, o el giro entre dos cámaras de varios frames). null si no hay.
 */
export function giroMedio(giros: readonly Giro[], pesos?: readonly number[]): Giro | null {
  if (giros.length === 0) return null
  const ref = aCuaternion(giros[0]!)
  const s: Cuaternion = [0, 0, 0, 0]
  giros.forEach((r, k) => {
    const q = aCuaternion(r)
    const w = pesos?.[k] ?? 1
    const signo = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1
    for (let i = 0; i < 4; i++) s[i] = s[i]! + signo * w * q[i]!
  })
  const n = Math.hypot(...s)
  return n > 1e-12 ? deCuaternion(s.map((x) => x / n) as Cuaternion) : null
}

/** El ángulo (grados) entre dos giros. */
export function anguloEntre(a: Giro, b: Giro): number {
  const m = multiplicar(traspuesta(a), b)
  return g(Math.acos(Math.max(-1, Math.min(1, (m[0] + m[4] + m[8] - 1) / 2))))
}

/** Una medida de la cabeza en un frame: su giro respecto a la cámara y su calidad (0–1). */
export interface MedidaCabeza {
  readonly giro: Giro
  readonly calidad: number
}

/**
 * El giro de la cámara B al marco de la cámara A (D6), de la propia cabeza: en cada frame que ven las dos, M = R_A·R_Bᵀ; la
 * media pesada por lo bien que la ven las dos (el producto de las calidades). null sin frames comunes.
 */
export function giroEntreCamaras(a: readonly (MedidaCabeza | null)[], b: readonly (MedidaCabeza | null)[], calidadMinima: number): Giro | null {
  const giros: Giro[] = []
  const pesos: number[] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (!x || !y || x.calidad < calidadMinima || y.calidad < calidadMinima) continue
    giros.push(multiplicar(x.giro, traspuesta(y.giro)))
    pesos.push(x.calidad * y.calidad)
  }
  return giroMedio(giros, pesos)
}

/**
 * La cabeza en el marco de A en un frame, con las dos cámaras (D6): la de B se pasa con `bEnA` (`giroEntreCamaras`); con las
 * dos por encima de `calidadMinima`, la media pesada por su calidad; con una, esa; sin ninguna, null (nunca se inventa).
 */
export function fusionar(a: MedidaCabeza | null, b: MedidaCabeza | null, bEnA: Giro, calidadMinima: number): MedidaCabeza | null {
  const va = a && a.calidad >= calidadMinima ? a : null
  const vb = b && b.calidad >= calidadMinima ? { giro: multiplicar(bEnA, b.giro), calidad: b.calidad } : null
  if (va && vb) return { giro: giroMedio([va.giro, vb.giro], [va.calidad, vb.calidad])!, calidad: Math.max(va.calidad, vb.calidad) }
  return va ?? vb
}
