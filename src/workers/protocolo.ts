import type { IdMarcador } from '../core/modelo/tipos'
import type { Hueco } from '../core/seguimiento/huecos'
import type { ResultadoAudio } from '../core/sincronia/audio'

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

/** Mensaje del hilo principal al worker del audio (sincronía, fase 3 paso 5). Para pararlo, se cierra el worker. */
export interface AlWorkerAudio {
  readonly tipo: 'sincronizar'
  /** El vídeo de la referencia (A) y el de la vista que se sincroniza (B). */
  readonly referencia: File
  readonly vista: File
}

/** Qué le falta al audio de un vídeo para poder usarlo. */
export interface FaltaAudio {
  readonly cual: 'referencia' | 'vista'
  /** 'sinAudio': no tiene pista de audio; 'sinCodec': este navegador no la decodifica. */
  readonly motivo: 'sinAudio' | 'sinCodec'
  readonly codec?: string
}

/** Mensajes del worker del audio al hilo principal. */
export type DelWorkerAudio =
  | { readonly tipo: 'progreso'; readonly fraccion: number }
  | {
      readonly tipo: 'resultado'
      /** null: no hay nada que correlacionar (silencio, o los audios no se solapan dentro de la ventana). */
      readonly resultado: ResultadoAudio | null
    }
  | { readonly tipo: 'falta'; readonly faltas: readonly FaltaAudio[] }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Tamaño del modelo de MediaPipe Pose Landmarker (fase 5, paso 1: el experimento compara los tres). */
export type TamanoModeloPose = 'lite' | 'full' | 'heavy'

/** Mensajes del hilo principal al worker sin marcadores (fase 5, paso 1). Para pararlo, `cancelar` o se cierra. */
export type AlWorkerPose =
  | {
      readonly tipo: 'detectar'
      readonly archivo: File
      readonly modelo: TamanoModeloPose
      /** Delegado pedido; si es 'GPU' y no se puede crear, se usa 'CPU' y se dice. */
      readonly delegado: 'GPU' | 'CPU'
    }
  | { readonly tipo: 'cancelar' }

/** Lo que da el modelo en un frame (ver `FramePose` en `core/pose/puntos.ts`). */
export interface FramePoseWorker {
  readonly indice: number
  readonly t: number
  /** `[x, y, visibilidad]` por punto de `PUNTOS_POSE`, en px del vídeo tal como se ve; null = nadie detectado. */
  readonly puntos: number[] | null
}

/** Mensajes del worker sin marcadores al hilo principal. */
export type DelWorkerPose =
  | { readonly tipo: 'listo'; readonly delegado: 'GPU' | 'CPU'; readonly avisoDelegado?: string; readonly msCarga: number }
  /** `atras`: los frames son de la segunda pasada (hacia atrás); `progreso` es entonces el de esa pasada. */
  | { readonly tipo: 'frames'; readonly lote: readonly FramePoseWorker[]; readonly progreso: number; readonly atras?: boolean }
  | {
      readonly tipo: 'fin'
      readonly motivo: 'final' | 'cancelado'
      /** Frames recorridos hacia delante y lo que tardó (ms). */
      readonly procesados: number
      readonly msProceso: number
      /** Frames sin persona que la segunda pasada, hacia atrás, recuperó, y lo que tardó (ms). */
      readonly recuperados: number
      readonly msAtras: number
    }
  | { readonly tipo: 'error'; readonly mensaje: string }
