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
    const colores: Hsv[] = []
    while (tope > 0) {
      const i = pila[--tope]!
      const px = i % ancho
      const py = (i - px) / ancho
      const d = dist[i]!
      // Peso 1 en el núcleo y decreciente hacia el borde (píxeles mezclados con el fondo).
      const w = d < umbral / 2 ? 1 : 2 - (2 * d) / umbral
      area++
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
    // +0,5: centro del píxel, para que el centroide sea subpíxel sin sesgo.
    resultado.push({ area, x: img.x0 + sx / sw + 0.5, y: img.y0 + sy / sw + 0.5, distanciaMedia: sd / area, colores })
  }
  return resultado
}
