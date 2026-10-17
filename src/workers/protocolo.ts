import type { IdMarcador } from '../core/modelo/tipos'
import type { MotivoPerdido } from '../core/seguimiento/seguidor'

/** Frames sin encontrar un marcador, con el motivo de cada uno (diagnóstico). */
export interface Hueco {
  readonly id: IdMarcador
  readonly primero: number
  readonly frames: number
  readonly motivos: Readonly<Partial<Record<MotivoPerdido, number>>>
  /** Con motivo 'tamano': rango de área (mancha / gomet) observado. */
  readonly areaMin?: number
  readonly areaMax?: number
}

/** Mensajes del hilo principal al worker de seguimiento. */
export type AlWorker =
  | {
      readonly tipo: 'seguir'
      readonly archivo: File
      /** Frame desde el que se sigue: los marcadores tienen posición conocida en él. */
      readonly desde: number
      readonly posiciones: readonly { readonly id: IdMarcador; readonly x: number; readonly y: number }[]
    }
  | { readonly tipo: 'cancelar' }

export interface MuestraFrame {
  readonly indice: number
  readonly t: number
  readonly marcadores: readonly { readonly id: IdMarcador; readonly x: number; readonly y: number; readonly calidad: number }[]
}

/** Mensajes del worker al hilo principal. */
export type DelWorker =
  | { readonly tipo: 'muestras'; readonly lote: readonly MuestraFrame[]; readonly progreso: number }
  | {
      readonly tipo: 'fin'
      /**
       * 'final': recorrido hasta el final (con `huecos` si algún marcador no se
       * encontró en algunos frames). 'inicio': no se pudo aprender algún
       * gomet en el frame de partida. 'cancelado': parado por el usuario.
       */
      readonly motivo: 'final' | 'inicio' | 'cancelado'
      /** Con 'inicio': marcadores que no se reconocen en el frame de partida. */
      readonly sinReconocer: readonly IdMarcador[]
      /** Frames sin encontrar cada marcador: primero y total. */
      readonly huecos: readonly Hueco[]
    }
  | { readonly tipo: 'error'; readonly mensaje: string }
