/*
 * Cámara estenopeica (fase 6, D3 de docs/plan-fase-6.md): punto principal en el centro de la imagen, sin distorsión y una
 * focal en px. Marco de la cámara: x hacia la derecha de la imagen, y hacia abajo, z hacia donde mira (el de
 * `core/sensores`). Un punto del mundo X pasa a la cámara con Xc = R·X + t y se ve en (cx + f·Xc.x/Xc.z, cy + f·Xc.y/Xc.z).
 */
import { vec3, type Vec3 } from '../geometria/vector'

/** Matriz 3×3 por filas. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export interface Camara {
  /** Focal (px). */
  readonly f: number
  /** Punto principal (px): el centro de la imagen. */
  readonly cx: number
  readonly cy: number
  /** Del mundo a la cámara. */
  readonly R: Mat3
  readonly t: Vec3
}

export const IDENTIDAD: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export const aplicar = (m: Mat3, v: Vec3): Vec3 =>
  vec3(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z)

export const traspuesta = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

export function multiplicar(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!
  return r as unknown as Mat3
}

/** Giro de `angulo` rad alrededor del eje unitario `e` (Rodrigues). */
export function rotacion(e: Vec3, angulo: number): Mat3 {
  const n = Math.hypot(e.x, e.y, e.z)
  if (n === 0 || angulo === 0) return IDENTIDAD
  const [x, y, z] = [e.x / n, e.y / n, e.z / n]
  const c = Math.cos(angulo)
  const s = Math.sin(angulo)
  const k = 1 - c
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]
}

/** Giro de un vector de rotación (eje · ángulo, rad). */
export const deVectorRotacion = (w: Vec3): Mat3 => rotacion(w, Math.hypot(w.x, w.y, w.z))

/** El centro de la cámara en el mundo: C = −Rᵀ·t. */
export function centro(c: Camara): Vec3 {
  const p = aplicar(traspuesta(c.R), c.t)
  return vec3(-p.x, -p.y, -p.z)
}

/** Un punto del mundo en el marco de la cámara. */
export const aCamara = (c: Camara, X: Vec3): Vec3 => {
  const p = aplicar(c.R, X)
  return vec3(p.x + c.t.x, p.y + c.t.y, p.z + c.t.z)
}

/** Dónde se ve un punto del mundo (px); NaN si queda detrás de la cámara. */
export function proyectar(c: Camara, X: Vec3): { readonly u: number; readonly v: number } {
  const p = aCamara(c, X)
  if (!(p.z > 1e-9)) return { u: NaN, v: NaN }
  return { u: c.cx + (c.f * p.x) / p.z, v: c.cy + (c.f * p.y) / p.z }
}

/**
 * Una cámara colocada en `posicion` que mira hacia `objetivo`, con el «arriba» del mundo `arriba` (la imagen sin girar
 * respecto a él), y luego girada `alabeo` rad alrededor de su eje óptico. Para construir cámaras virtuales de pruebas.
 */
export function camaraMirando(posicion: Vec3, objetivo: Vec3, arriba: Vec3, f: number, ancho: number, alto: number, alabeo = 0): Camara {
  const z = normalizar(vec3(objetivo.x - posicion.x, objetivo.y - posicion.y, objetivo.z - posicion.z))
  // x de la imagen: hacia la derecha; y: hacia abajo (= −arriba quitando lo que tenga de z).
  const abajo = vec3(-arriba.x, -arriba.y, -arriba.z)
  const x = normalizar(cruz(abajo, z))
  const y = cruz(z, x)
  let R: Mat3 = [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z]
  if (alabeo) R = multiplicar(rotacion(vec3(0, 0, 1), alabeo), R)
  const Rc = aplicar(R, posicion)
  return { f, cx: ancho / 2, cy: alto / 2, R, t: vec3(-Rc.x, -Rc.y, -Rc.z) }
}

export const cruz = (a: Vec3, b: Vec3): Vec3 => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export function normalizar(a: Vec3): Vec3 {
  const n = Math.hypot(a.x, a.y, a.z)
  return n > 0 ? vec3(a.x / n, a.y / n, a.z / n) : vec3(NaN, NaN, NaN)
}

/** La focal de partida (px): un campo de visión horizontal de unos 65° sobre el lado largo de la imagen (D3). */
export const FOV_PREVIO_GRADOS = 65
export const focalPrevia = (ancho: number, alto: number): number => Math.max(ancho, alto) / 2 / Math.tan((FOV_PREVIO_GRADOS * Math.PI) / 360)
