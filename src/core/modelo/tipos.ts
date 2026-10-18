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

export interface Vista {
  readonly id: string
  readonly nombre: string
  readonly archivo: ArchivoVista
  /** Segundos respecto a la vista de referencia (0 en la fase 1). */
  readonly desfase: number
  readonly orientacion: OrientacionVista
  /** Escala en el plano (fase 2); DLT o lente más adelante. null = sin escala. */
  readonly calibracion: CalibracionVista | null
  readonly trayectorias: Readonly<Record<IdMarcador, readonly Muestra2D[]>>
}

export interface Sesion {
  readonly id: string
  readonly nombre: string
  /** ISO 8601. */
  readonly creada: string
  readonly modelo: ModeloMarcadores
  readonly vistas: readonly Vista[]
}
