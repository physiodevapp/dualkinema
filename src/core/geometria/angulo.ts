import { escalar, norma, producto, restar, vectorial, type Vec3 } from './vector'

const GRADOS = 180 / Math.PI

/**
 * Ángulo con signo, en grados (−180, 180], que hay que girar `u` para llevarlo
 * a `v` alrededor del eje `n` (regla de la mano derecha: positivo = antihorario
 * visto desde la punta de `n`). Solo cuenta la parte de `u` y `v` perpendicular
 * a `n`, así que vale igual en 2D (n = eje z) que en 3D.
 *
 * Devuelve NaN si algún vector es nulo: un ángulo indefinido nunca es 0.
 */
export function anguloConSigno(u: Vec3, v: Vec3, n: Vec3): number {
  const nn = norma(n)
  if (nn === 0) return NaN
  const eje = escalar(n, 1 / nn)
  const up = proyectarEnPlano(u, eje)
  const vp = proyectarEnPlano(v, eje)
  if (norma(up) === 0 || norma(vp) === 0) return NaN // vector nulo o paralelo a n
  const seno = producto(vectorial(up, vp), eje)
  const coseno = producto(up, vp)
  return normalizarGrados(Math.atan2(seno, coseno) * GRADOS)
}

/** Componente de `v` perpendicular al eje unitario `eje`. */
function proyectarEnPlano(v: Vec3, eje: Vec3): Vec3 {
  return restar(v, escalar(eje, producto(v, eje)))
}

/** Lleva un ángulo en grados al intervalo (−180, 180]. */
export function normalizarGrados(grados: number): number {
  const r = grados - 360 * Math.floor((grados + 180) / 360)
  return r === -180 ? 180 : r + 0 // + 0 convierte −0 en 0
}

/**
 * Quita los saltos de ±360° de una serie de ángulos, para que una curva que
 * pasa de 179° a −179° siga por 181°. Los valores NaN se conservan (huecos)
 * y no rompen la continuidad: el siguiente valor válido se ajusta al último
 * valor válido anterior.
 */
export function desenrollar(grados: readonly number[]): number[] {
  const salida: number[] = []
  let anterior = NaN
  for (const g of grados) {
    if (Number.isNaN(g)) {
      salida.push(NaN)
      continue
    }
    const valor = Number.isNaN(anterior) ? g : anterior + normalizarGrados(g - anterior)
    salida.push(valor)
    anterior = valor
  }
  return salida
}
