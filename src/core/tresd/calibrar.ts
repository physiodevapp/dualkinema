/*
 * Calibración de dos cámaras con la propia persona (fase 6, D4 de docs/plan-fase-6.md): dónde está una cámara respecto a
 * la otra y la focal de cada una, a partir de los puntos del cuerpo que ven las dos a la vez y de la vertical del
 * acelerómetro de cada móvil.
 *
 * Mundo de la calibración: z hacia arriba (la gravedad), la cámara A en el origen mirando hacia +x (en horizontal), y la
 * cámara B a distancia 1 (la escala se pone después: `escala.ts`). Con la vertical conocida, la orientación de cada cámara
 * es su nivelación (de la gravedad) por un giro alrededor de la vertical: a A se le fija en 0 y a B le queda uno (ψ).
 *
 * 1. Arranque: se barre ψ de grado en grado; para cada uno, la dirección de B que mejor cumple la restricción epipolar
 *    (el autovector menor de Σ (rA × rB)(rA × rB)ᵀ) y su coste robusto (la mediana del error epipolar). El mejor ψ se afina
 *    y el sentido de la dirección se elige con los puntos delante de las dos cámaras.
 * 2. Ajuste de haces (Levenberg–Marquardt con el complemento de Schur: las 9 incógnitas de las cámaras —una corrección
 *    pequeña de la vertical de cada una, sus focales, ψ y la dirección de B— y un punto 3D por correspondencia), con pérdida
 *    de Huber (3 px) y un peso previo suave para las correcciones de la vertical (1°) y las focales (15 % de la previa).
 */
import { vec3, type Vec3 } from '../geometria/vector'
import { inversa3, menorAutovector, resolver } from './algebra'
import { aplicar, cruz, focalPrevia, IDENTIDAD, multiplicar, normalizar, rotacion, traspuesta, type Camara, type Mat3 } from './camara'
import { triangular } from './triangular'

export interface Correspondencia {
  /** De qué punto del cuerpo es (para el error por punto). */
  readonly id: string
  readonly a: { readonly u: number; readonly v: number }
  readonly b: { readonly u: number; readonly v: number }
}

export interface Imagen {
  readonly ancho: number
  readonly alto: number
}

export interface EntradaCalibracion {
  readonly correspondencias: readonly Correspondencia[]
  readonly imagenes: readonly [Imagen, Imagen]
  /** La gravedad (hacia abajo, en ejes de cada cámara: `core/sensores`). Sin sensores, null: se supone el móvil en vertical sin inclinar, y se avisa. */
  readonly verticales: readonly [Vec3 | null, Vec3 | null]
  /** Focal de partida de cada cámara (px); por defecto, `focalPrevia`. */
  readonly focales?: readonly [number, number]
}

export interface ResultadoCalibracion {
  readonly camaras: readonly [Camara, Camara]
  /** El punto 3D de cada correspondencia (NaN si no se pudo triangular). */
  readonly puntos: readonly Vec3[]
  /** Error de reproyección de cada correspondencia (px, raíz de la media de los cuadrados de las dos vistas). */
  readonly errores: readonly number[]
  /** Mediana del error de reproyección (px), en total y por punto del cuerpo. */
  readonly errorMediano: number
  readonly errorPorPunto: ReadonlyMap<string, number>
  /** Fracción de correspondencias con error por debajo de 3 px de Huber. */
  readonly fraccionBuenas: number
  /** Si faltaba la vertical de alguna cámara. */
  readonly sinVertical: readonly [boolean, boolean]
  /** Corrección que el ajuste ha hecho a la vertical de cada cámara (°). */
  readonly correccionVertical: readonly [number, number]
  readonly iteraciones: number
}

const HUBER_PX = 3
const SIGMA_PX = 2
const SIGMA_VERTICAL = (1 * Math.PI) / 180
const SIGMA_FOCAL = 0.15
const N_PARAMS = 9

/**
 * Nivelación de una cámara: el giro del mundo a la cámara con la gravedad `abajo` (en ejes de la cámara) y el eje óptico
 * proyectado en el suelo apuntando a +x del mundo.
 */
export function nivelacion(abajo: Vec3): Mat3 {
  const d = normalizar(abajo)
  // Giro mínimo que lleva `d` (en la cámara) a −z (en el mundo): de la cámara al mundo.
  const destino = vec3(0, 0, -1)
  const eje = cruz(d, destino)
  const s = Math.hypot(eje.x, eje.y, eje.z)
  const c = d.x * destino.x + d.y * destino.y + d.z * destino.z
  let W: Mat3 = s < 1e-12 ? (c > 0 ? IDENTIDAD : rotacion(vec3(1, 0, 0), Math.PI)) : rotacion(eje, Math.atan2(s, c))
  // Rumbo del eje óptico (0, 0, 1) en el mundo: se lleva a +x.
  const z = aplicar(W, vec3(0, 0, 1))
  W = multiplicar(rotacion(vec3(0, 0, 1), -Math.atan2(z.y, z.x)), W)
  return traspuesta(W)
}

/** Las dos cámaras a partir de los parámetros: [δA1, δA2, fA, ψ, δB1, δB2, fB, θ, φ]. */
function camarasDe(p: readonly number[], M: readonly [Mat3, Mat3], img: readonly [Imagen, Imagen]): [Camara, Camara] {
  const giro = (d1: number, d2: number, psi: number): Mat3 =>
    multiplicar(multiplicar(rotacion(vec3(1, 0, 0), d1), rotacion(vec3(0, 1, 0), d2)), rotacion(vec3(0, 0, 1), psi))
  const RA = multiplicar(M[0], giro(p[0]!, p[1]!, 0))
  const RB = multiplicar(M[1], giro(p[4]!, p[5]!, p[3]!))
  const CB = vec3(Math.cos(p[7]!) * Math.cos(p[8]!), Math.sin(p[7]!) * Math.cos(p[8]!), Math.sin(p[8]!))
  const tB = aplicar(RB, CB)
  return [
    { f: p[2]!, cx: img[0].ancho / 2, cy: img[0].alto / 2, R: RA, t: vec3(0, 0, 0) },
    { f: p[6]!, cx: img[1].ancho / 2, cy: img[1].alto / 2, R: RB, t: vec3(-tB.x, -tB.y, -tB.z) },
  ]
}

/** Rayo (en el mundo, sin normalizar) de un píxel. */
const rayo = (c: Camara, u: number, v: number) => aplicar(traspuesta(c.R), vec3((u - c.cx) / c.f, (v - c.cy) / c.f, 1))

/** Proyección de X en la cámara y su derivada respecto a X (2×3), o null si queda detrás. */
function proyeccion(c: Camara, X: Vec3): { u: number; v: number; J: number[] } | null {
  const R = c.R
  const x = R[0] * X.x + R[1] * X.y + R[2] * X.z + c.t.x
  const y = R[3] * X.x + R[4] * X.y + R[5] * X.z + c.t.y
  const z = R[6] * X.x + R[7] * X.y + R[8] * X.z + c.t.z
  if (!(z > 1e-9)) return null
  const iz = 1 / z
  const J = [0, 1, 2].flatMap((k) => [c.f * iz * (R[k]! - x * iz * R[6 + k]!)])
  const Jv = [0, 1, 2].map((k) => c.f * iz * (R[3 + k]! - y * iz * R[6 + k]!))
  return { u: c.cx + c.f * x * iz, v: c.cy + c.f * y * iz, J: [...J, ...Jv] }
}

const huber = (e: number) => (e <= HUBER_PX ? 1 : HUBER_PX / e)

/** Arranque: el giro ψ de B y la dirección hacia B que mejor cumplen la restricción epipolar. */
function arranque(entrada: EntradaCalibracion, M: readonly [Mat3, Mat3], f: readonly [number, number]): number[] {
  const corr = entrada.correspondencias
  const base = [0, 0, f[0], 0, 0, 0, f[1], 0, 0]
  const coste = (psi: number) => {
    const [A, B] = camarasDe([0, 0, f[0], psi, 0, 0, f[1], 0, 0], M, entrada.imagenes)
    const cruces = corr.map((c) => {
      const n = cruz(normalizar(rayo(A, c.a.u, c.a.v)), normalizar(rayo(B, c.b.u, c.b.v)))
      return n
    })
    const m = new Array<number>(9).fill(0)
    for (const n of cruces) {
      const v = [n.x, n.y, n.z]
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j]! += v[i]! * v[j]!
    }
    const b = menorAutovector(m, 3).vector
    const errores = cruces.map((n) => Math.abs(n.x * b[0]! + n.y * b[1]! + n.z * b[2]!)).sort((x, y) => x - y)
    return { coste: errores[Math.floor(errores.length / 2)] ?? Infinity, b }
  }
  let mejor = { psi: 0, coste: Infinity }
  for (let g = 0; g < 360; g++) {
    const psi = (g * Math.PI) / 180
    const c = coste(psi).coste
    if (c < mejor.coste) mejor = { psi, coste: c }
  }
  for (const paso of [0.1, 0.01]) {
    const centro = mejor.psi
    for (let k = -10; k <= 10; k++) {
      const psi = centro + (k * paso * Math.PI) / 180
      const c = coste(psi).coste
      if (c < mejor.coste) mejor = { psi, coste: c }
    }
  }
  const b = coste(mejor.psi).b
  // Los dos sentidos de la dirección: el que deja más puntos delante de las dos cámaras.
  let elegido = base
  let mejorDelante = -1
  for (const s of [1, -1]) {
    const [x, y, z] = [s * b[0]!, s * b[1]!, s * b[2]!]
    const p = [0, 0, f[0], mejor.psi, 0, 0, f[1], Math.atan2(y, x), Math.asin(Math.max(-1, Math.min(1, z)))]
    const [A, B] = camarasDe(p, M, entrada.imagenes)
    const muestra = corr.filter((_, k) => k % Math.max(1, Math.floor(corr.length / 50)) === 0)
    const delante = muestra.filter((c) => Number.isFinite(triangular([{ camara: A, ...c.a }, { camara: B, ...c.b }]).error)).length
    if (delante > mejorDelante) {
      mejorDelante = delante
      elegido = p
    }
  }
  return elegido
}

/** Calibra las dos cámaras. Necesita correspondencias repartidas (unos cientos de instantes de los 12 puntos). */
export function calibrarDosCamaras(entrada: EntradaCalibracion): ResultadoCalibracion {
  const { imagenes } = entrada
  const sinVertical: [boolean, boolean] = [entrada.verticales[0] === null, entrada.verticales[1] === null]
  // Sin sensores, el móvil de pie, en vertical y sin inclinar.
  const M: [Mat3, Mat3] = [nivelacion(entrada.verticales[0] ?? vec3(0, 1, 0)), nivelacion(entrada.verticales[1] ?? vec3(0, 1, 0))]
  const f0: [number, number] = [entrada.focales?.[0] ?? focalPrevia(imagenes[0].ancho, imagenes[0].alto), entrada.focales?.[1] ?? focalPrevia(imagenes[1].ancho, imagenes[1].alto)]
  const corr = entrada.correspondencias.filter((c) => [c.a.u, c.a.v, c.b.u, c.b.v].every(Number.isFinite))
  let p = arranque({ ...entrada, correspondencias: corr }, M, f0)

  // Puntos iniciales.
  let [A, B] = camarasDe(p, M, imagenes)
  let X: Vec3[] = corr.map((c) => triangular([{ camara: A, ...c.a }, { camara: B, ...c.b }]).X)

  const previos = (q: readonly number[]) => [
    { i: 0, r: q[0]! / SIGMA_VERTICAL },
    { i: 1, r: q[1]! / SIGMA_VERTICAL },
    { i: 2, r: (q[2]! - f0[0]) / (SIGMA_FOCAL * f0[0]) },
    { i: 4, r: q[4]! / SIGMA_VERTICAL },
    { i: 5, r: q[5]! / SIGMA_VERTICAL },
    { i: 6, r: (q[6]! - f0[1]) / (SIGMA_FOCAL * f0[1]) },
  ]
  const escalaPrevio = [1 / SIGMA_VERTICAL, 1 / SIGMA_VERTICAL, 1 / (SIGMA_FOCAL * f0[0]), 0, 1 / SIGMA_VERTICAL, 1 / SIGMA_VERTICAL, 1 / (SIGMA_FOCAL * f0[1]), 0, 0]

  /** Coste robusto total (px², con los pesos de Huber) y los errores de cada correspondencia. */
  const evaluar = (q: readonly number[], puntos: readonly Vec3[]) => {
    const [ca, cb] = camarasDe(q, M, imagenes)
    let total = 0
    for (let k = 0; k < corr.length; k++) {
      const Xk = puntos[k]!
      if (!Number.isFinite(Xk.x)) continue
      for (const [c, o] of [
        [ca, corr[k]!.a],
        [cb, corr[k]!.b],
      ] as const) {
        const pr = proyeccion(c, Xk)
        const e = pr ? Math.hypot(pr.u - o.u, pr.v - o.v) : 1e3
        total += e <= HUBER_PX ? e * e : 2 * HUBER_PX * e - HUBER_PX * HUBER_PX
      }
    }
    for (const { r } of previos(q)) total += (SIGMA_PX * r) ** 2
    return total
  }

  let lambda = 1e-3
  let coste = evaluar(p, X)
  let iteraciones = 0
  let convergido = false
  const EPS = [1e-6, 1e-6, 1e-3, 1e-6, 1e-6, 1e-6, 1e-3, 1e-6, 1e-6]
  for (; iteraciones < 60; iteraciones++) {
    ;[A, B] = camarasDe(p, M, imagenes)
    const perturbadas = EPS.map((e, i) => camarasDe(p.map((v, j) => (j === i ? v + e : v)), M, imagenes))
    const Hcc = new Array<number>(N_PARAMS * N_PARAMS).fill(0)
    const gc = new Array<number>(N_PARAMS).fill(0)
    const bloques: { Hpp: number[]; Hcp: number[]; gp: number[] }[] = []
    for (let k = 0; k < corr.length; k++) {
      const Xk = X[k]!
      const Hpp = new Array<number>(9).fill(0)
      const Hcp = new Array<number>(N_PARAMS * 3).fill(0)
      const gp = [0, 0, 0]
      bloques.push({ Hpp, Hcp, gp })
      if (!Number.isFinite(Xk.x)) continue
      for (const cual of [0, 1] as const) {
        const camara = cual === 0 ? A : B
        const o = cual === 0 ? corr[k]!.a : corr[k]!.b
        const pr = proyeccion(camara, Xk)
        if (!pr) continue
        const ru = pr.u - o.u
        const rv = pr.v - o.v
        const w = huber(Math.hypot(ru, rv))
        // Derivadas respecto a los parámetros de cámara (solo los de esta cámara no son nulos).
        const indices = cual === 0 ? [0, 1, 2] : [3, 4, 5, 6, 7, 8]
        const Jc = indices.map((i) => {
          const q = proyeccion(perturbadas[i]![cual], Xk)
          return q ? [(q.u - pr.u) / EPS[i]!, (q.v - pr.v) / EPS[i]!] : [0, 0]
        })
        const Ju = pr.J.slice(0, 3)
        const Jv = pr.J.slice(3, 6)
        for (let a = 0; a < indices.length; a++) {
          const ia = indices[a]!
          gc[ia]! += w * (Jc[a]![0]! * ru + Jc[a]![1]! * rv)
          for (let b = 0; b < indices.length; b++) Hcc[ia * N_PARAMS + indices[b]!]! += w * (Jc[a]![0]! * Jc[b]![0]! + Jc[a]![1]! * Jc[b]![1]!)
          for (let j = 0; j < 3; j++) Hcp[ia * 3 + j]! += w * (Jc[a]![0]! * Ju[j]! + Jc[a]![1]! * Jv[j]!)
        }
        for (let i = 0; i < 3; i++) {
          gp[i]! += w * (Ju[i]! * ru + Jv[i]! * rv)
          for (let j = 0; j < 3; j++) Hpp[i * 3 + j]! += w * (Ju[i]! * Ju[j]! + Jv[i]! * Jv[j]!)
        }
      }
    }
    // Previos (residuos SIGMA_PX · r, con derivada SIGMA_PX · escala).
    for (const { i, r } of previos(p)) {
      const d = SIGMA_PX * escalaPrevio[i]!
      Hcc[i * N_PARAMS + i]! += d * d
      gc[i]! += d * SIGMA_PX * r
    }

    let aceptado = false
    for (let intento = 0; intento < 10 && !aceptado; intento++) {
      // Complemento de Schur con el amortiguamiento de Marquardt.
      const S = Hcc.map((v, idx) => (idx % (N_PARAMS + 1) === 0 ? v * (1 + lambda) + 1e-12 : v))
      const rhs = [...gc]
      const inversas: (number[] | null)[] = []
      for (const { Hpp, Hcp, gp } of bloques) {
        const Hd = Hpp.map((v, idx) => (idx % 4 === 0 ? v * (1 + lambda) + 1e-12 : v))
        const inv = inversa3(Hd)
        inversas.push(inv)
        if (!inv) continue
        // Hcp · inv (9×3)
        const HI = new Array<number>(N_PARAMS * 3).fill(0)
        for (let a = 0; a < N_PARAMS; a++) for (let j = 0; j < 3; j++) for (let l = 0; l < 3; l++) HI[a * 3 + j]! += Hcp[a * 3 + l]! * inv[l * 3 + j]!
        for (let a = 0; a < N_PARAMS; a++) {
          for (let b = 0; b < N_PARAMS; b++) {
            let s = 0
            for (let j = 0; j < 3; j++) s += HI[a * 3 + j]! * Hcp[b * 3 + j]!
            S[a * N_PARAMS + b]! -= s
          }
          for (let j = 0; j < 3; j++) rhs[a]! -= HI[a * 3 + j]! * gp[j]!
        }
      }
      const dc = resolver(S, rhs, N_PARAMS)
      if (!dc) {
        lambda *= 10
        continue
      }
      const q = p.map((v, i) => v - dc[i]!)
      const Xq = X.map((Xk, k) => {
        const inv = inversas[k]
        if (!inv || !Number.isFinite(Xk.x)) return Xk
        const { Hcp, gp } = bloques[k]!
        // Δp = inv · (gp − Hcpᵀ · Δc)
        const r = [0, 1, 2].map((j) => gp[j]! - [...Array(N_PARAMS).keys()].reduce((s, a) => s + Hcp[a * 3 + j]! * dc[a]!, 0))
        const d = [0, 1, 2].map((i) => inv[i * 3]! * r[0]! + inv[i * 3 + 1]! * r[1]! + inv[i * 3 + 2]! * r[2]!)
        return vec3(Xk.x - d[0]!, Xk.y - d[1]!, Xk.z - d[2]!)
      })
      const nuevo = evaluar(q, Xq)
      if (nuevo < coste) {
        const mejora = (coste - nuevo) / coste
        p = q
        X = Xq
        coste = nuevo
        lambda = Math.max(1e-9, lambda / 3)
        aceptado = true
        if (mejora < 1e-10) convergido = true
      } else {
        lambda *= 4
      }
    }
    if (!aceptado || convergido) break
  }

  ;[A, B] = camarasDe(p, M, imagenes)
  // Los puntos, retriangulados con las cámaras finales (un punto que el ajuste dejó detrás, NaN).
  const finales = corr.map((c) => triangular([{ camara: A, ...c.a }, { camara: B, ...c.b }]))
  const errores = finales.map((t) => t.error)
  const porId = new Map<string, number[]>()
  corr.forEach((c, k) => {
    if (!Number.isFinite(errores[k]!)) return
    const l = porId.get(c.id) ?? []
    l.push(errores[k]!)
    porId.set(c.id, l)
  })
  const validos = errores.filter(Number.isFinite)
  return {
    camaras: [A, B],
    puntos: finales.map((t) => t.X),
    errores,
    errorMediano: mediana(validos),
    errorPorPunto: new Map([...porId].map(([id, l]) => [id, mediana(l)])),
    fraccionBuenas: validos.length ? validos.filter((e) => e <= HUBER_PX).length / corr.length : 0,
    sinVertical,
    correccionVertical: [(Math.hypot(p[0]!, p[1]!) * 180) / Math.PI, (Math.hypot(p[4]!, p[5]!) * 180) / Math.PI],
    iteraciones,
  }
}

export function mediana(xs: readonly number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
