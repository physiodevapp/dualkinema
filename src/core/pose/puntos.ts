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
 * óseas: la cadera del modelo no es el trocánter. Por eso sus ángulos son definiciones propias (aquí, la rodilla de
 * perfil, con la misma convención que la de los gomets).
 */
import { articulacionesSagitales, type Lado } from '../articulaciones/catalogo'
import type { DefinicionArticulacion } from '../articulaciones/definicion'
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
    PUNTOS_POSE.forEach((p, k) => {
      const serie = r.get(p.id)!
      if (!f.puntos) {
        serie[f.indice] = { t: f.t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
        return
      }
      const x = f.puntos[k * VALORES_POR_PUNTO]!
      const y = f.puntos[k * VALORES_POR_PUNTO + 1]!
      const v = f.puntos[k * VALORES_POR_PUNTO + 2]!
      serie[f.indice] =
        Number.isFinite(x) && Number.isFinite(y)
          ? { t: f.t, x, y, calidad: v, editadoManual: false }
          : { t: f.t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
    })
  }
  return r
}

/**
 * La rodilla de perfil con los puntos del modelo: muslo (cadera → rodilla) y pierna (rodilla → tobillo), con el signo y
 * el cero de la de los gomets (`rodilla_sagital_*`): flexión +, extendida 0°.
 */
export function rodillaSagitalPose(l: Lado): DefinicionArticulacion {
  const gomets = articulacionesSagitales(l).find((a) => a.id === `rodilla_sagital_${l}`)!
  return {
    ...gomets,
    id: `pose_rodilla_sagital_${l}`,
    nombre: `${gomets.nombre} sin marcadores`,
    proximal: { desde: idPose('cadera', l), hasta: idPose('rodilla', l) },
    distal: { desde: idPose('rodilla', l), hasta: idPose('tobillo', l) },
  }
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
