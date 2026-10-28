import type { OrientacionVista } from '../geometria/canonico'
import type { DefinicionArticulacion } from '../articulaciones/definicion'
import type { CalibracionVista } from '../calibracion/escala'

/** Identificador de marcador, común a todas las vistas de una sesión. */
export type IdMarcador = string

/**
 * Posición de un marcador en un frame. `t` en segundos de vídeo (nunca número
 * de frame ni Date.now(): los móviles graban con fps variable). x, y en px de
 * la imagen tal como se ve (rotación del vídeo ya aplicada), y hacia abajo.
 */
export interface Muestra2D {
  readonly t: number
  readonly x: number
  readonly y: number
  /** 0–1. 0 = perdido: la posición no es fiable y no se usa. */
  readonly calidad: number
  readonly editadoManual: boolean
  /**
   * Rellenado por interpolación a petición del usuario (hueco corto entre dos
   * posiciones fiables). Nunca lo hace el seguidor por su cuenta. Se muestra
   * aparte en la franja, la gráfica y la exportación.
   */
  readonly interpolado?: boolean
  /**
   * Solo en lo interpolado: lo que había en ese frame antes de rellenarlo
   * (una detección perdida o dudosa; null = no había muestra). «Quitar lo
   * interpolado» lo devuelve tal cual. Ausente en lo rellenado antes de
   * guardarlo (sesiones antiguas): vuelve como perdido.
   */
  readonly sustituida?: Muestra2D | null
}

export interface Marcador {
  readonly id: IdMarcador
  readonly nombre: string
  /** Color esperado del gomet, como pista para el seguimiento. */
  readonly color?: string
}

export interface ModeloMarcadores {
  readonly marcadores: readonly Marcador[]
  readonly articulaciones: readonly DefinicionArticulacion[]
}

export interface ArchivoVista {
  readonly nombre: string
  readonly tamano: number
  readonly duracion: number
  readonly ancho: number
  readonly alto: number
  readonly rotacion: 0 | 90 | 180 | 270
}

/**
 * Cómo se halló el desfase de una vista respecto a la de referencia (fase 3), para poder decir de dónde sale.
 * - ninguna: la vista de referencia, o una sin sincronizar (desfase 0).
 * - evento: el mismo evento visto en las dos; `evento` guarda su instante en cada una (s de vídeo).
 * - audio: por la correlación del audio; `audio` guarda la calidad del pico (pico / segundo pico) y el desfase que dio,
 *   antes del ajuste fino (la diferencia con `desfase` es lo que se movió a mano).
 * - manual: puesto o ajustado a mano sin evento ni audio.
 * - pitido (fase 4): el pitido de ida y vuelta de una grabación doble; `pitido` guarda el desfase que dio, la peor
 *   calidad de sus cuatro detecciones y la distancia entre los móviles.
 * - reloj (fase 4): el reloj común de una grabación doble (cuándo empezó cada una); `reloj` guarda el desfase y su
 *   cota (s).
 */
export type MetodoSincronia = 'ninguna' | 'evento' | 'audio' | 'manual' | 'pitido' | 'reloj'

export interface Sincronia {
  readonly metodo: MetodoSincronia
  readonly evento?: { readonly referencia: number; readonly vista: number }
  readonly audio?: { readonly calidad: number; readonly desfase: number }
  readonly pitido?: { readonly desfase: number; readonly calidad: number; readonly distancia: number }
  readonly reloj?: { readonly desfase: number; readonly cota: number }
}

/** Tamaño del modelo de MediaPipe Pose Landmarker (fase 5). */
export type TamanoModeloPose = 'lite' | 'full' | 'heavy'

/**
 * Cómo se detectaron los puntos sin marcadores de una vista (fase 5, D7), para saber de dónde salen y poder repetir el
 * análisis. Solo lo de la última detección; nada del paciente.
 */
export interface DeteccionPose {
  readonly modelo: TamanoModeloPose
  /** Librería y versión con que se detectó (p. ej. «@mediapipe/tasks-vision 1.1.0»). */
  readonly libreria: string
  /** Dónde corrió de verdad. */
  readonly delegado: 'GPU' | 'CPU'
  /** ISO 8601. */
  readonly fecha: string
  /** Frames con alguien detectado. */
  readonly conPersona: number
  /** Frames con las piernas intercambiadas que se corrigieron, y frames con las piernas dudosas (ver core/pose/cambiosLado.ts). */
  readonly intercambiados: number
  readonly dudosos: number
}

export interface Vista {
  readonly id: string
  readonly nombre: string
  readonly archivo: ArchivoVista
  /**
   * Segundos respecto a la vista de referencia: tiempo común = tiempo del vídeo + desfase. La referencia tiene 0.
   * Un evento visto en t en esta vista ocurre en el tiempo común t + desfase.
   */
  readonly desfase: number
  readonly sincronia: Sincronia
  /** Marcadores del modelo que se siguen en esta vista (no todos se ven desde todas). */
  readonly marcadores: readonly IdMarcador[]
  readonly orientacion: OrientacionVista
  /** Escala en el plano (fase 2); DLT o lente más adelante. null = sin escala. */
  readonly calibracion: CalibracionVista | null
  readonly trayectorias: Readonly<Record<IdMarcador, readonly Muestra2D[]>>
  /** La última detección sin marcadores de la vista (fase 5); null si no se ha detectado. */
  readonly deteccion?: DeteccionPose | null
}

export interface Sesion {
  readonly id: string
  readonly nombre: string
  /** ISO 8601. */
  readonly creada: string
  readonly modelo: ModeloMarcadores
  readonly vistas: readonly Vista[]
  /** Id de la vista de referencia (desfase 0): su tiempo es el tiempo común. */
  readonly referencia: string
}
