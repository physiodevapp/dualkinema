/*
 * Trayectoria completa de un marcador sobre el vídeo, como polilíneas listas
 * para dibujar: cortadas en los huecos (nunca se unen) y separadas en lo medido
 * y lo interpolado, que se dibuja a trazos.
 */

type Posicion = { readonly x: number; readonly y: number; readonly interpolado?: boolean }

export interface Polilinea {
  readonly puntos: readonly { readonly x: number; readonly y: number }[]
  /** Algún extremo de cada tramo está interpolado: a trazos. */
  readonly interpolado: boolean
}

const valida = (p: Posicion | undefined | null): p is Posicion => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * Une las posiciones de frames consecutivos. Un frame sin posición corta la
 * línea. El tramo entre dos frames es interpolado si lo es alguno de los dos
 * (como en la gráfica), así que la línea continua y la de trazos comparten el
 * punto donde se juntan. Una posición sin vecinos queda como polilínea de un
 * punto, para que no desaparezca.
 */
export function polilineasTrayectoria(posiciones: ArrayLike<Posicion | undefined | null>): Polilinea[] {
  const r: { puntos: { x: number; y: number }[]; interpolado: boolean }[] = []
  let actual: (typeof r)[number] | null = null
  const n = posiciones.length
  for (let i = 0; i < n; i++) {
    const p = posiciones[i]
    if (!valida(p)) {
      actual = null
      continue
    }
    const previa = i > 0 ? posiciones[i - 1] : undefined
    if (!valida(previa)) {
      if (!valida(i + 1 < n ? posiciones[i + 1] : undefined)) r.push({ puntos: [{ x: p.x, y: p.y }], interpolado: !!p.interpolado })
      actual = null
      continue
    }
    const interpolado = !!previa.interpolado || !!p.interpolado
    if (!actual || actual.interpolado !== interpolado) {
      actual = { puntos: [{ x: previa.x, y: previa.y }], interpolado }
      r.push(actual)
    }
    actual.puntos.push({ x: p.x, y: p.y })
  }
  return r
}
