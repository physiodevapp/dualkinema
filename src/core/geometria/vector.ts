/** Vector o punto en 3D. En 2D se usa z = 0. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const vec3 = (x: number, y: number, z = 0): Vec3 => ({ x, y, z })

export const restar = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z)

export const escalar = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k)

export const producto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const vectorial = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export const norma = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

/** Vector que va de `desde` a `hasta`. */
export const segmento = (desde: Vec3, hasta: Vec3): Vec3 => restar(hasta, desde)
