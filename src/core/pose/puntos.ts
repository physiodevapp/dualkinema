/*
 * Los puntos del cuerpo que da un modelo sin marcadores (fase 5; MediaPipe Pose Landmarker, 33 puntos por persona) como
 * trayectorias de «marcadores virtuales» (D3 de docs/plan-fase-5.md): cada punto que interesa es un marcador más del
 * modelo de la sesión, con su id propio (`pose_<parte>_<lado>`, para no confundirlo con un gomet), y su trayectoria es
 * una `Muestra2D` por frame en px de la imagen tal como se ve. Así se le aplica todo lo que ya existe: huecos,
 * `CALIDAD_MINIMA`, filtro por tramos, ángulos, cero, gráficas y CSV.
 *
 * Calidad = visibilidad del modelo (0–1). Un frame en el que el modelo no encuentra a nadie da todos los puntos perdidos
 * (NaN, calidad 0): nunca se inventa una posición.
 *
 * Los puntos del modelo son centros articulares aproximados (lo que aprendió de anotaciones humanas), no referencias
 * óseas: la cadera del modelo no es el trocánter. Por eso sus ángulos son definiciones propias (`pose/catalogo.ts`).
 */
import type { Lado } from '../articulaciones/catalogo'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'

export type ParteCuerpo = 'hombro' | 'cadera' | 'rodilla' | 'tobillo' | 'talon' | 'punta'

/** Índice de cada parte en los 33 puntos de MediaPipe Pose («izquierda» = la de la persona). */
const INDICE_MEDIAPIPE: Record<ParteCuerpo, Record<Lado, number>> = {
  hombro: { izq: 11, der: 12 },
  cadera: { izq: 23, der: 24 },
  rodilla: { izq: 25, der: 26 },
  tobillo: { izq: 27, der: 28 },
  talon: { izq: 29, der: 30 },
  punta: { izq: 31, der: 32 },
}

export interface PuntoPose {
  readonly id: IdMarcador
  readonly parte: ParteCuerpo
  readonly lado: Lado
  /** Índice en la salida de MediaPipe Pose. */
  readonly indice: number
}

export const idPose = (parte: ParteCuerpo, lado: Lado): IdMarcador => `pose_${parte}_${lado}`

/** ¿Es un marcador virtual del modelo sin marcadores (un punto o un punto medio), y no un gomet? */
export const esIdPose = (id: IdMarcador): boolean => id.startsWith('pose_')

const PARTES: readonly ParteCuerpo[] = ['hombro', 'cadera', 'rodilla', 'tobillo', 'talon', 'punta']

/** Los 12 puntos que se guardan, en este orden (el de `FramePose.puntos`). */
export const PUNTOS_POSE: readonly PuntoPose[] = PARTES.flatMap((parte) =>
  (['izq', 'der'] as const).map((lado) => ({ id: idPose(parte, lado), parte, lado, indice: INDICE_MEDIAPIPE[parte][lado] })),
)

/** Valores por punto en `FramePose.puntos`: x, y (px) y visibilidad. */
export const VALORES_POR_PUNTO = 3

/**
 * Lo que da el modelo en un frame: `[x, y, visibilidad]` por cada punto de `PUNTOS_POSE`, en px de la imagen tal como se
 * ve. null = el modelo no encontró a nadie en ese frame.
 */
export interface FramePose {
  readonly indice: number
  readonly t: number
  readonly puntos: readonly number[] | null
}

/** Un punto de la salida del modelo: x, y normalizados a la imagen (0–1) y su visibilidad. */
export interface PuntoNormalizado {
  readonly x: number
  readonly y: number
  readonly visibility?: number
}

/**
 * Los puntos de `PUNTOS_POSE` a partir de la salida del modelo (normalizada a la imagen que recibió, que es la del
 * vídeo tal como se ve, a cualquier tamaño) y del tamaño del vídeo en px. Una visibilidad ausente o no finita cuenta como 0.
 */
export function puntosDeLandmarks(landmarks: readonly PuntoNormalizado[], ancho: number, alto: number): number[] {
  const r: number[] = []
  for (const p of PUNTOS_POSE) {
    const l = landmarks[p.indice]
    if (!l) {
      r.push(NaN, NaN, 0)
      continue
    }
    const v = l.visibility
    r.push(l.x * ancho, l.y * alto, typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
  }
  return r
}

/**
 * Trayectorias de los puntos del modelo, una muestra (o nada) por frame de la tabla, como las de los gomets. Un frame
 * sin nadie detectado deja cada punto perdido (NaN, calidad 0); uno que el modelo no llegó a procesar, sin muestra.
 */
export function trayectoriasPose(frames: Iterable<FramePose>, total: number): Map<IdMarcador, (Muestra2D | undefined)[]> {
  const r = new Map<IdMarcador, (Muestra2D | undefined)[]>(PUNTOS_POSE.map((p) => [p.id, new Array<Muestra2D | undefined>(total)]))
  for (const f of frames) {
    if (f.indice < 0 || f.indice >= total) continue
    muestrasDeFrame(f).forEach((m, k) => (r.get(PUNTOS_POSE[k]!.id)![f.indice] = m))
  }
  return r
}

/**
 * La muestra de cada punto de `PUNTOS_POSE` (en ese orden) en un frame: sin nadie detectado, o un punto sin posición,
 * perdido (NaN, calidad 0); si no, su posición con calidad = visibilidad.
 */
export function muestrasDeFrame(f: FramePose): Muestra2D[] {
  return PUNTOS_POSE.map((_, k) => {
    const x = f.puntos?.[k * VALORES_POR_PUNTO] ?? NaN
    const y = f.puntos?.[k * VALORES_POR_PUNTO + 1] ?? NaN
    const v = f.puntos?.[k * VALORES_POR_PUNTO + 2] ?? 0
    return Number.isFinite(x) && Number.isFinite(y) ? { t: f.t, x, y, calidad: v, editadoManual: false } : { t: f.t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
  })
}

/** Líneas del esqueleto que se dibujan sobre el vídeo: cada pierna y el tronco, y las que unen los dos lados. */
export const LINEAS_ESQUELETO: readonly (readonly [IdMarcador, IdMarcador])[] = [
  ...(['izq', 'der'] as const).flatMap((l) =>
    (
      [
        ['hombro', 'cadera'],
        ['cadera', 'rodilla'],
        ['rodilla', 'tobillo'],
        ['tobillo', 'talon'],
        ['talon', 'punta'],
        ['tobillo', 'punta'],
      ] as const
    ).map(([a, b]) => [idPose(a, l), idPose(b, l)] as const),
  ),
  [idPose('hombro', 'izq'), idPose('hombro', 'der')],
  [idPose('cadera', 'izq'), idPose('cadera', 'der')],
]

/** Partes con un punto medio entre los dos lados (el tronco de frente va del medio de las caderas al de los hombros). */
export type ParteMedia = 'hombro' | 'cadera'

export const idMedio = (parte: ParteMedia): IdMarcador => `pose_${parte}_medio`

/** Los puntos medios: no los da el modelo ni se guardan ni se editan; salen siempre de los dos lados (`conPuntosMedios`). */
export const PUNTOS_MEDIOS: readonly { readonly id: IdMarcador; readonly parte: ParteMedia }[] = (['hombro', 'cadera'] as const).map((parte) => ({
  id: idMedio(parte),
  parte,
}))

export const esPuntoMedio = (id: IdMarcador): boolean => PUNTOS_MEDIOS.some((p) => p.id === id)

/**
 * El punto medio de dos muestras del mismo frame: sin muestra si falta alguna; perdido (NaN, calidad 0) si alguna lo
 * está; si no, la media de las posiciones con la peor de las dos calidades, e interpolado si lo es alguna.
 */
export function puntoMedio(a: Muestra2D | undefined, b: Muestra2D | undefined): Muestra2D | undefined {
  if (!a || !b) return undefined
  if (!(a.calidad > 0 && b.calidad > 0 && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y))) {
    return { t: a.t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
  }
  const m: Muestra2D = { t: a.t, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, calidad: Math.min(a.calidad, b.calidad), editadoManual: false }
  return a.interpolado || b.interpolado ? { ...m, interpolado: true } : m
}

/**
 * Las trayectorias con los puntos medios añadidos, calculados frame a frame a partir de los dos lados. Se recalculan cada
 * vez (no se guardan): así una corrección a mano de un lado llega al punto medio. Las demás series son las mismas.
 */
export function conPuntosMedios(series: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>): Map<IdMarcador, (Muestra2D | undefined)[]> {
  const r = new Map(series as ReadonlyMap<IdMarcador, (Muestra2D | undefined)[]>)
  for (const { id, parte } of PUNTOS_MEDIOS) {
    const izq = series.get(idPose(parte, 'izq')) ?? []
    const der = series.get(idPose(parte, 'der')) ?? []
    const n = Math.max(izq.length, der.length)
    const medio = new Array<Muestra2D | undefined>(n)
    for (let i = 0; i < n; i++) medio[i] = puntoMedio(izq[i], der[i])
    r.set(id, medio)
  }
  return r
}

/**
 * Junta una detección nueva con las trayectorias que ya había (D3: volver a detectar no sobrescribe lo marcado a mano,
 * como «Seguir» con los gomets). Por frame: lo marcado a mano se queda; si no, manda lo detectado, y donde la detección
 * no llegó (sin muestra: un recorrido cancelado) se queda lo de antes. Las series que la detección no trae no cambian.
 * Devuelve copias.
 */
export function fusionarDeteccion(
  previas: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>,
  nuevas: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>,
): Map<IdMarcador, (Muestra2D | undefined)[]> {
  const r = new Map<IdMarcador, (Muestra2D | undefined)[]>([...previas].map(([id, s]) => [id, [...s]]))
  for (const [id, nueva] of nuevas) {
    const antes = previas.get(id) ?? []
    const serie = new Array<Muestra2D | undefined>(Math.max(antes.length, nueva.length))
    for (let i = 0; i < serie.length; i++) {
      const a = antes[i]
      serie[i] = a?.editadoManual ? a : (nueva[i] ?? a)
    }
    r.set(id, serie)
  }
  return r
}
