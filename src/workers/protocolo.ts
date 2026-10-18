import type { IdMarcador } from '../core/modelo/tipos'
import type { Hueco } from '../core/seguimiento/huecos'

export type { Hueco }

/** Mensajes del hilo principal al worker de seguimiento. */
export type AlWorker =
  | {
      readonly tipo: 'seguir'
      readonly archivo: File
      /** Frame desde el que se sigue: los marcadores tienen posición conocida en él. */
      readonly desde: number
      readonly posiciones: readonly { readonly id: IdMarcador; readonly x: number; readonly y: number }[]
      /**
       * Posiciones marcadas a mano en frames posteriores a `desde`: al llegar a
       * cada una, el seguidor la toma como cierta y sigue desde ahí.
       */
      readonly anclas: readonly { readonly indice: number; readonly id: IdMarcador; readonly x: number; readonly y: number }[]
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
