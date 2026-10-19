/*
 * Constancia de la longitud de un segmento (p. ej. rodilla–tobillo) a lo largo
 * del vídeo. Con marcadores rígidos en el plano de la cámara, su distancia en
 * la imagen no cambia. Si cambia, en esos frames el segmento sale del plano
 * (se ve más corto), los gomets se deslizan sobre la piel o el seguimiento
 * falla: la escala, las distancias y los ángulos son menos fiables ahí.
 */

/** Variación relativa respecto a la mediana a partir de la cual un frame se cuenta como «fuera». */
export const UMBRAL_CONSTANCIA = 0.03

export interface ConstanciaSegmento {
  /** Mediana de la longitud en la imagen, px. */
  readonly referenciaPx: number
  /** Frames con los dos extremos. */
  readonly muestras: number
  /** Variación relativa cuadrática media respecto a la mediana. */
  readonly rms: number
  /** Mayor variación relativa, con su signo (negativa = más corto). */
  readonly maxRel: number
  /** Frame de esa mayor variación. */
  readonly indiceMax: number
  /** Frames que se apartan más que `umbral`. */
  readonly fuera: number
  readonly umbral: number
  /**
   * Variación relativa de cada frame respecto a la mediana (negativa = más
   * corto); NaN donde falta un extremo. Para verla frente al tiempo.
   */
  readonly relativa: Float64Array
  /** 1 donde algún extremo está interpolado. */
  readonly interpolado: Uint8Array
}

type Punto = { readonly x: number; readonly y: number; readonly interpolado?: boolean }
const valido = (p: Punto | undefined | null): p is Punto => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * Longitud del segmento frente a su mediana: variación de cada frame (NaN
 * donde falta un extremo) y resumen. null si no hay ningún frame con los dos.
 */
export function constanciaSegmento(
  pa: ArrayLike<Punto | undefined | null>,
  pb: ArrayLike<Punto | undefined | null>,
  umbral = UMBRAL_CONSTANCIA,
): ConstanciaSegmento | null {
  const n = Math.min(pa.length, pb.length)
  const longitudes: number[] = []
  const indices: number[] = []
  const relativa = new Float64Array(Math.max(pa.length, pb.length)).fill(NaN)
  const interpolado = new Uint8Array(relativa.length)
  for (let i = 0; i < n; i++) {
    const a = pa[i]
    const b = pb[i]
    if (!valido(a) || !valido(b)) continue
    longitudes.push(Math.hypot(b.x - a.x, b.y - a.y))
    indices.push(i)
    if (a.interpolado || b.interpolado) interpolado[i] = 1
  }
  if (longitudes.length === 0) return null
  const orden = [...longitudes].sort((x, y) => x - y)
  const m = orden.length >> 1
  const referenciaPx = orden.length % 2 ? orden[m]! : (orden[m - 1]! + orden[m]!) / 2
  let suma = 0
  let maxRel = 0
  let indiceMax = indices[0]!
  let fuera = 0
  longitudes.forEach((l, k) => {
    const rel = l / referenciaPx - 1
    relativa[indices[k]!] = rel
    suma += rel * rel
    if (Math.abs(rel) > Math.abs(maxRel)) {
      maxRel = rel
      indiceMax = indices[k]!
    }
    if (Math.abs(rel) > umbral) fuera++
  })
  return { referenciaPx, muestras: longitudes.length, rms: Math.sqrt(suma / longitudes.length), maxRel, indiceMax, fuera, umbral, relativa, interpolado }
}
