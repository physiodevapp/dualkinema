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

/**
 * Resta a toda la serie el múltiplo de 360° que deja el centro de su recorrido
 * ((mín + máx) / 2) en [−180°, 180°]. `desenrollar` parte del primer valor, así
 * que una serie que empieza a 185° (un hombro arriba) y baja a 0° salía de
 * −175° a −360°; con esto sale de 185° a 0°, lo mismo que da cada frame por
 * separado donde no hay vuelta. Una serie cuyo centro ya está en ese intervalo
 * no se toca (de 170° a 190° sigue así). No cambia la forma ni las derivadas.
 */
export function centrarVueltas(grados: readonly number[]): number[] {
  let min = Infinity
  let max = -Infinity
  for (const g of grados) {
    if (!Number.isFinite(g)) continue
    if (g < min) min = g
    if (g > max) max = g
  }
  const centro = (min + max) / 2
  if (!Number.isFinite(centro) || Math.abs(centro) <= 180) return [...grados]
  const vueltas = 360 * Math.round(centro / 360)
  return grados.map((g) => g - vueltas)
}

/**
 * Salto entre dos valores válidos seguidos de una serie desenrollada a partir del cual no se cree que sea el mismo
 * movimiento: 45° de un frame al siguiente son 1350°/s a 30 fps. Pasa con puntos que se cruzan o se confunden (un
 * esqueleto mal detectado), y ahí `desenrollar` puede quedarse con una vuelta de más que arrastra todo lo que sigue.
 * Partir de más no cambia nada salvo en un trozo cuyo centro quede fuera de ±180°, que una articulación no tiene.
 */
export const SALTO_DE_VUELTA = 45

/**
 * `centrarVueltas` por trozos: parte la serie (ya desenrollada) donde dos valores válidos seguidos se separan más de
 * `salto` y centra cada trozo por su cuenta. Un trozo bueno después de unos frames mal detectados vuelve así a su
 * vuelta (a −10° y no a 350°). Sin saltos así es lo mismo que `centrarVueltas` (un hueco no parte la serie: la curva
 * sigue al otro lado si no salta).
 */
export function centrarVueltasPorTrozos(grados: readonly number[], salto = SALTO_DE_VUELTA): number[] {
  const salida: number[] = []
  let trozo: number[] = []
  let anterior = NaN
  const cerrar = () => {
    salida.push(...centrarVueltas(trozo))
    trozo = []
  }
  for (const g of grados) {
    if (Number.isFinite(g)) {
      if (Number.isFinite(anterior) && Math.abs(g - anterior) > salto) cerrar()
      anterior = g
    }
    trozo.push(g)
  }
  cerrar()
  return salida
}
