/*
 * RTMPose (OpenMMLab, Apache 2.0) como alternativa a MediaPipe para el modo sin marcadores (fase 6, experimento
 * `?rtmpose`; ver «RTMPose» en docs/plan-fase-6.md). Es «de arriba abajo»: un detector de personas (RTMDet-nano) da la
 * caja de la persona y RTMPose busca sus 26 puntos (Halpe26: cuerpo y pies) dentro de un recorte de 192 × 256. Lo que no
 * depende del navegador va aquí: la geometría del recorte, la decodificación SimCC, elegir a la persona de frame en frame y
 * el paso de los 26 puntos a los 12 que guarda la app (`PUNTOS_POSE`). Los números de preprocesado son los del
 * `pipeline.json` de cada modelo.
 */
import type { Lado } from '../articulaciones/catalogo'
import { PUNTOS_POSE, type ParteCuerpo } from './puntos'

/** Entrada del detector: 320 × 320, la imagen reducida sin deformar y el resto relleno de gris 114. */
export const LADO_DETECTOR = 320
export const GRIS_RELLENO = 114
/** Normalización del detector (en BGR, como lo entrenó MMDetection). */
export const MEDIA_DETECTOR_BGR = [103.53, 116.28, 123.675] as const
export const DESV_DETECTOR_BGR = [57.375, 57.12, 58.395] as const

/** Entrada de RTMPose: 192 de ancho × 256 de alto, en RGB. */
export const ANCHO_POSE = 192
export const ALTO_POSE = 256
export const MEDIA_POSE_RGB = [123.675, 116.28, 103.53] as const
export const DESV_POSE_RGB = [58.395, 57.12, 57.375] as const
/** La caja de la persona se agranda un 25 % antes de recortar (`TopDownGetBboxCenterScale`). */
export const RELLENO_CAJA = 1.25
/** SimCC: cada eje se divide en el doble de posiciones que píxeles tiene la entrada. */
export const DIVISION_SIMCC = 2
/** Puntuación mínima de una caja del detector para tenerla en cuenta. */
export const UMBRAL_PERSONA = 0.3

export const PUNTOS_HALPE26 = 26

export interface Caja {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly puntuacion: number
}

/** Cuánto se reduce la imagen para el detector (la caja de 320 la contiene entera, arriba a la izquierda). */
export const escalaDetector = (ancho: number, alto: number): number => Math.min(LADO_DETECTOR / ancho, LADO_DETECTOR / alto)

/** Las cajas del detector (`dets`: [x1, y1, x2, y2, puntuación] por fila, en px de la entrada de 320) en px de la imagen. */
export function cajasDelDetector(dets: ArrayLike<number>, filas: number, escala: number, umbral = UMBRAL_PERSONA): Caja[] {
  const r: Caja[] = []
  for (let i = 0; i < filas; i++) {
    const [x1, y1, x2, y2, s] = [0, 1, 2, 3, 4].map((k) => dets[i * 5 + k]!) as [number, number, number, number, number]
    if (!(s >= umbral) || !(x2 > x1) || !(y2 > y1)) continue
    r.push({ x1: x1 / escala, y1: y1 / escala, x2: x2 / escala, y2: y2 / escala, puntuacion: s })
  }
  return r
}

const area = (c: Caja) => Math.max(0, c.x2 - c.x1) * Math.max(0, c.y2 - c.y1)

/** Intersección sobre unión de dos cajas. */
export function iou(a: Caja, b: Caja): number {
  const i = area({ x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2), puntuacion: 0 })
  const u = area(a) + area(b) - i
  return u > 0 ? i / u : 0
}

/** Solapamiento mínimo con la caja del frame anterior para seguir siendo «la misma persona». */
export const SOLAPE_MISMA_PERSONA = 0.3

/**
 * La persona que se analiza en este frame: la que más se solapa con la del frame anterior (si se solapa al menos
 * `SOLAPE_MISMA_PERSONA`); si no, la más grande, ponderada por su puntuación (la que está delante y entera). null sin
 * ninguna caja.
 */
export function elegirPersona(cajas: readonly Caja[], anterior: Caja | null): Caja | null {
  if (!cajas.length) return null
  if (anterior) {
    let mejor: Caja | null = null
    let solape = SOLAPE_MISMA_PERSONA
    for (const c of cajas) {
      const s = iou(c, anterior)
      if (s >= solape) {
        solape = s
        mejor = c
      }
    }
    if (mejor) return mejor
  }
  return cajas.reduce((a, b) => (area(b) * b.puntuacion > area(a) * a.puntuacion ? b : a))
}

/**
 * Buscar a la persona con el detector solo de vez en cuando (como en el modo de vídeo de RTMPose): entre medias, su caja
 * sale de los puntos del frame anterior. El detector se vuelve a pasar cada `DETECTOR_CADA` frames procesados, o antes si
 * el frame anterior no dio bastantes puntos fiables.
 */
export const DETECTOR_CADA = 15
/** Puntos de Halpe26 con puntuación de al menos `UMBRAL_PUNTO_CAJA` que hacen falta para fiarse de la caja de los puntos. */
export const PUNTOS_MINIMOS_CAJA = 10
export const UMBRAL_PUNTO_CAJA = 0.3
/** Margen de la caja de los puntos (fracción de su alto) a cada lado: la del detector abarca la cabeza y la ropa, no solo los puntos. */
export const MARGEN_CAJA_PUNTOS = 0.1

/**
 * La caja de la persona a partir de sus puntos `[x, y, puntuación]` (los 26 de Halpe26, en px): la que los abarca, con un
 * margen de `MARGEN_CAJA_PUNTOS` de su alto a cada lado. null si no hay `PUNTOS_MINIMOS_CAJA` fiables.
 */
export function cajaDePuntos(kp: readonly number[]): Caja | null {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  let n = 0
  let suma = 0
  for (let i = 0; i + 2 < kp.length; i += 3) {
    const s = kp[i + 2]!
    if (!(s >= UMBRAL_PUNTO_CAJA) || !Number.isFinite(kp[i]!) || !Number.isFinite(kp[i + 1]!)) continue
    x1 = Math.min(x1, kp[i]!)
    x2 = Math.max(x2, kp[i]!)
    y1 = Math.min(y1, kp[i + 1]!)
    y2 = Math.max(y2, kp[i + 1]!)
    n++
    suma += s
  }
  if (n < PUNTOS_MINIMOS_CAJA || y2 <= y1) return null
  const m = MARGEN_CAJA_PUNTOS * (y2 - y1)
  return { x1: x1 - m, y1: y1 - m, x2: x2 + m, y2: y2 + m, puntuacion: suma / n }
}

/** El recorte de la entrada de RTMPose: el punto (u, v) de la entrada es (x0 + u·ax, y0 + v·ay) de la imagen. */
export interface Recorte {
  readonly x0: number
  readonly y0: number
  readonly ax: number
  readonly ay: number
}

/** La caja agrandada un 25 % y ajustada a la proporción 3:4 de la entrada, centrada en la persona. */
export function recorteDeCaja(c: Caja): Recorte {
  const cx = (c.x1 + c.x2) / 2
  const cy = (c.y1 + c.y2) / 2
  let w = (c.x2 - c.x1) * RELLENO_CAJA
  let h = (c.y2 - c.y1) * RELLENO_CAJA
  if (w > (h * ANCHO_POSE) / ALTO_POSE) h = (w * ALTO_POSE) / ANCHO_POSE
  else w = (h * ANCHO_POSE) / ALTO_POSE
  return { x0: cx - w / 2, y0: cy - h / 2, ax: w / ANCHO_POSE, ay: h / ALTO_POSE }
}

/**
 * Decodifica la salida SimCC (`simccX`: puntos × 2·192; `simccY`: puntos × 2·256): la posición de cada punto es la del
 * máximo en cada eje, dividida por `DIVISION_SIMCC`, y su puntuación el menor de los dos máximos. Devuelve
 * `[x, y, puntuación]` por punto, en px de la imagen.
 */
export function decodificarSimcc(simccX: ArrayLike<number>, simccY: ArrayLike<number>, puntos: number, r: Recorte): number[] {
  const nx = ANCHO_POSE * DIVISION_SIMCC
  const ny = ALTO_POSE * DIVISION_SIMCC
  const res: number[] = []
  for (let k = 0; k < puntos; k++) {
    let ix = 0
    let vx = -Infinity
    for (let i = 0; i < nx; i++) {
      const v = simccX[k * nx + i]!
      if (v > vx) {
        vx = v
        ix = i
      }
    }
    let iy = 0
    let vy = -Infinity
    for (let i = 0; i < ny; i++) {
      const v = simccY[k * ny + i]!
      if (v > vy) {
        vy = v
        iy = i
      }
    }
    res.push(r.x0 + (ix / DIVISION_SIMCC) * r.ax, r.y0 + (iy / DIVISION_SIMCC) * r.ay, Math.min(vx, vy))
  }
  return res
}

/** Índice de cada parte en Halpe26 («izquierda» = la de la persona). La punta del pie es el dedo gordo. */
export const INDICE_HALPE26: Record<ParteCuerpo, Record<Lado, number>> = {
  hombro: { izq: 5, der: 6 },
  cadera: { izq: 11, der: 12 },
  rodilla: { izq: 13, der: 14 },
  tobillo: { izq: 15, der: 16 },
  talon: { izq: 24, der: 25 },
  punta: { izq: 20, der: 21 },
}

/**
 * Los 12 puntos de la app (`PUNTOS_POSE`, `[x, y, calidad]` por punto) a partir de los 26 de Halpe26. La calidad es la
 * puntuación de RTMPose limitada a 0–1 (no es una probabilidad: un punto bien visto suele dar 0,6–0,9; **pendiente de
 * validar con vídeos** que el umbral común, `CALIDAD_MINIMA`, le sirva).
 */
export function puntosDeHalpe26(kp: readonly number[]): number[] {
  const r: number[] = []
  for (const p of PUNTOS_POSE) {
    const i = INDICE_HALPE26[p.parte][p.lado]
    const s = kp[i * 3 + 2]
    r.push(kp[i * 3]!, kp[i * 3 + 1]!, typeof s === 'number' && Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0)
  }
  return r
}

/**
 * Píxeles RGBA de un lienzo a un tensor CHW de 3 canales normalizado (`(v − media) / desv`), en el orden de canales
 * pedido (`bgr`: azul, verde, rojo, el del detector).
 */
export function tensorDePixeles(rgba: ArrayLike<number>, ancho: number, alto: number, media: readonly number[], desv: readonly number[], bgr: boolean): Float32Array {
  const n = ancho * alto
  const t = new Float32Array(3 * n)
  const orden = bgr ? [2, 1, 0] : [0, 1, 2]
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) t[c * n + i] = (rgba[i * 4 + orden[c]!]! - media[c]!) / desv[c]!
  }
  return t
}
