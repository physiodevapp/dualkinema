import { distanciaColor, rgbAHsv, type Hsv, type ModeloColor } from './color'
import type { Imagen } from './imagen'

/** Zona conectada de píxeles parecidos al color del gomet. */
export interface Mancha {
  /** Número de píxeles. */
  readonly area: number
  /** Centroide ponderado (los píxeles más parecidos pesan más), en px del frame completo. */
  readonly x: number
  readonly y: number
  /** Distancia de color media de sus píxeles (0 = idéntico al modelo). */
  readonly distanciaMedia: number
  /** Colores de sus píxeles, para readaptar el modelo. */
  readonly colores: readonly Hsv[]
  /** Rectángulo que la contiene, en px de la imagen (no del frame): [x0, y0, x1, y1] inclusive. */
  readonly caja: readonly [number, number, number, number]
  /**
   * Forma, a partir de los momentos de segundo orden (no depende del giro):
   * alargamiento = eje mayor / eje menor de la elipse equivalente (1 = redonda
   * o cuadrada); relleno = área / área de esa elipse (≈ 1 para un círculo o un
   * cuadrado, menor para formas irregulares o con huecos).
   */
  readonly alargamiento: number
  readonly relleno: number
}

/** Umbral de distancia de color: un píxel es «del gomet» por debajo de esto. */
export const UMBRAL_COLOR = 3
const AREA_MINIMA = 4

/**
 * Busca en la imagen las zonas conectadas (8 vecinos) de píxeles cuyo color se
 * parece al modelo. Devuelve también las pequeñas salvo el ruido de 1–3 px.
 */
export function buscarManchas(img: Imagen, modelo: ModeloColor, umbral = UMBRAL_COLOR): Mancha[] {
  const { ancho, alto, datos } = img
  const n = ancho * alto
  const dist = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const k = i * 4
    dist[i] = distanciaColor(rgbAHsv(datos[k]!, datos[k + 1]!, datos[k + 2]!), modelo)
  }

  const visto = new Uint8Array(n)
  const pila = new Int32Array(n)
  const resultado: Mancha[] = []
  for (let inicio = 0; inicio < n; inicio++) {
    if (visto[inicio] || !(dist[inicio]! < umbral)) continue
    let tope = 0
    pila[tope++] = inicio
    visto[inicio] = 1
    let area = 0
    let sw = 0
    let sx = 0
    let sy = 0
    let sd = 0
    let mx = 0
    let my = 0
    let mxx = 0
    let myy = 0
    let mxy = 0
    let cx0 = ancho
    let cy0 = alto
    let cx1 = 0
    let cy1 = 0
    const colores: Hsv[] = []
    while (tope > 0) {
      const i = pila[--tope]!
      const px = i % ancho
      const py = (i - px) / ancho
      const d = dist[i]!
      // Peso 1 en el núcleo y decreciente hacia el borde (píxeles mezclados con el fondo).
      const w = d < umbral / 2 ? 1 : 2 - (2 * d) / umbral
      area++
      mx += px
      my += py
      mxx += px * px
      myy += py * py
      mxy += px * py
      if (px < cx0) cx0 = px
      if (px > cx1) cx1 = px
      if (py < cy0) cy0 = py
      if (py > cy1) cy1 = py
      sw += w
      sx += w * px
      sy += w * py
      sd += d
      const k = i * 4
      colores.push(rgbAHsv(datos[k]!, datos[k + 1]!, datos[k + 2]!))
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= alto) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= ancho) continue
          const j = ny * ancho + nx
          if (!visto[j] && dist[j]! < umbral) {
            visto[j] = 1
            pila[tope++] = j
          }
        }
      }
    }
    if (area < AREA_MINIMA) continue
    const ux = mx / area
    const uy = my / area
    // Covarianza de las coordenadas (+1/12: cada píxel es un cuadrado de lado 1, no un punto).
    const cxx = mxx / area - ux * ux + 1 / 12
    const cyy = myy / area - uy * uy + 1 / 12
    const cxy = mxy / area - ux * uy
    const tr = (cxx + cyy) / 2
    const raiz = Math.sqrt(Math.max(0, tr * tr - (cxx * cyy - cxy * cxy)))
    const l1 = tr + raiz
    const l2 = Math.max(tr - raiz, 1e-9)
    const alargamiento = Math.sqrt(l1 / l2)
    const relleno = area / (4 * Math.PI * Math.sqrt(l1 * l2))
    // +0,5: centro del píxel, para que el centroide sea subpíxel sin sesgo.
    resultado.push({ area, x: img.x0 + sx / sw + 0.5, y: img.y0 + sy / sw + 0.5, distanciaMedia: sd / area, colores, caja: [cx0, cy0, cx1, cy1], alargamiento, relleno })
  }
  return resultado
}
