/*
 * Triangulación de un punto visto por dos o más cámaras calibradas (fase 6, D6 de docs/plan-fase-6.md): lineal (DLT
 * homogénea, el autovector de menor autovalor de AᵀA) y unas iteraciones de Gauss–Newton sobre el error de reproyección.
 * Un punto que no ven al menos dos cámaras no se triangula: NaN (nunca se inventa).
 */
import { vec3, type Vec3 } from '../geometria/vector'
import { menorAutovector } from './algebra'
import { aCamara, proyectar, type Camara } from './camara'

export interface Observacion {
  readonly camara: Camara
  readonly u: number
  readonly v: number
}

export interface PuntoTriangulado {
  readonly X: Vec3
  /** Error de reproyección (px): la raíz de la media de los cuadrados en las cámaras que lo ven. NaN si no se triangula. */
  readonly error: number
}

const NADA: PuntoTriangulado = { X: vec3(NaN, NaN, NaN), error: NaN }

/** Triangulación lineal: cada observación da dos ecuaciones en el punto homogéneo (normalizadas por la focal). */
function lineal(obs: readonly Observacion[]): Vec3 {
  const ata = new Array<number>(16).fill(0)
  for (const { camara: c, u, v } of obs) {
    const { R, t, f } = c
    const x = (u - c.cx) / f
    const y = (v - c.cy) / f
    // Filas de la matriz de proyección normalizada [R | t].
    const p0 = [R[0], R[1], R[2], t.x]
    const p1 = [R[3], R[4], R[5], t.y]
    const p2 = [R[6], R[7], R[8], t.z]
    for (const fila of [p0.map((a, k) => x * p2[k]! - a), p1.map((a, k) => y * p2[k]! - a)]) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ata[i * 4 + j]! += fila[i]! * fila[j]!
    }
  }
  const h = menorAutovector(ata, 4).vector
  return Math.abs(h[3]!) > 1e-12 ? vec3(h[0]! / h[3]!, h[1]! / h[3]!, h[2]! / h[3]!) : vec3(NaN, NaN, NaN)
}

/** Error de reproyección (px, raíz de la media de los cuadrados) de un punto. */
export function errorReproyeccion(X: Vec3, obs: readonly Observacion[]): number {
  let s = 0
  for (const o of obs) {
    const p = proyectar(o.camara, X)
    s += (p.u - o.u) ** 2 + (p.v - o.v) ** 2
  }
  return Math.sqrt(s / obs.length)
}

/** Gauss–Newton sobre el error de reproyección, con el jacobiano analítico de la proyección. */
function refinar(X0: Vec3, obs: readonly Observacion[], iteraciones = 5): Vec3 {
  let X = X0
  for (let it = 0; it < iteraciones; it++) {
    const JtJ = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const Jtr = [0, 0, 0]
    for (const o of obs) {
      const { R, f } = o.camara
      const p = aCamara(o.camara, X)
      if (!(p.z > 1e-9)) return X
      const ru = o.camara.cx + (f * p.x) / p.z - o.u
      const rv = o.camara.cy + (f * p.y) / p.z - o.v
      const iz = 1 / p.z
      // d(u)/dX = f/z·(R0 − x/z·R2), d(v)/dX = f/z·(R1 − y/z·R2)
      const ju = [0, 1, 2].map((k) => f * iz * (R[k]! - p.x * iz * R[6 + k]!))
      const jv = [0, 1, 2].map((k) => f * iz * (R[3 + k]! - p.y * iz * R[6 + k]!))
      for (let i = 0; i < 3; i++) {
        Jtr[i]! += ju[i]! * ru + jv[i]! * rv
        for (let j = 0; j < 3; j++) JtJ[i * 3 + j]! += ju[i]! * ju[j]! + jv[i]! * jv[j]!
      }
    }
    const d = resolver3(JtJ, Jtr)
    if (!d) return X
    X = vec3(X.x - d[0]!, X.y - d[1]!, X.z - d[2]!)
    if (Math.hypot(d[0]!, d[1]!, d[2]!) < 1e-9) break
  }
  return X
}

/** Resuelve A·x = b (3×3) por Cramer; null si es singular. */
export function resolver3(A: readonly number[], b: readonly number[]): number[] | null {
  const det = (m: readonly number[]) => m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  const D = det(A)
  if (!(Math.abs(D) > 1e-18)) return null
  const conColumna = (k: number) => A.map((a, i) => (i % 3 === k ? b[Math.floor(i / 3)]! : a))
  return [det(conColumna(0)) / D, det(conColumna(1)) / D, det(conColumna(2)) / D]
}

/** Triangula un punto con las observaciones válidas (u, v finitos); con menos de dos, nada. */
export function triangular(observaciones: readonly Observacion[]): PuntoTriangulado {
  const obs = observaciones.filter((o) => Number.isFinite(o.u) && Number.isFinite(o.v))
  if (obs.length < 2) return NADA
  const X0 = lineal(obs)
  if (![X0.x, X0.y, X0.z].every(Number.isFinite)) return NADA
  const X = refinar(X0, obs)
  // Tiene que quedar delante de todas las cámaras que lo ven.
  if (obs.some((o) => !(aCamara(o.camara, X).z > 0))) return NADA
  return { X, error: errorReproyeccion(X, obs) }
}
