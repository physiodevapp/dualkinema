import type { IdMarcador, TamanoModeloPose } from '../core/modelo/tipos'
import type { Hueco } from '../core/seguimiento/huecos'
import type { ResultadoAudio } from '../core/sincronia/audio'
import type { Calibracion3D, EntradaCalibrar3D } from '../core/tresd/calibracion3d'
import type { VistaParaEmparejar } from '../core/tresd/correspondencias'
import type { Trayectorias3D } from '../core/tresd/puntos3d'
import type { ResultadoEsqueleto } from '../core/esqueleto/sesion'

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

export type { TamanoModeloPose }

/** Mensajes del hilo principal al worker sin marcadores (fase 5). Para pararlo, `cancelar` o se cierra. */
export type AlWorkerPose =
  | {
      readonly tipo: 'detectar'
      readonly archivo: File
      readonly modelo: TamanoModeloPose
      /** Delegado pedido; si es 'GPU' y no se puede crear, se usa 'CPU' y se dice. */
      readonly delegado: 'GPU' | 'CPU'
      /** Procesar solo 1 de cada `paso` frames (RTMPose, para comparar deprisa; sin él, todos). */
      readonly paso?: number
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
  /** `libreria`: la librería del modelo con su versión, si no es MediaPipe (RTMPose: ONNX Runtime Web). */
  /** Mientras se prepara (RTMPose): en qué paso va, para saber dónde se para si tarda. */
  | { readonly tipo: 'cargando'; readonly texto: string }
  | { readonly tipo: 'listo'; readonly delegado: 'GPU' | 'CPU'; readonly avisoDelegado?: string; readonly msCarga: number; readonly libreria?: string; readonly hilos?: number }
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

/** Calibrar en 3D (fase 6, paso 3; `workers/calibracion3d.worker.ts`): las correspondencias ya emparejadas, y el resultado. */
export interface AlWorkerCalibracion3D {
  readonly tipo: 'calibrar'
  readonly entrada: EntradaCalibrar3D
}

export type DelWorkerCalibracion3D =
  /** null: no había instantes bastantes con las dos vistas. */
  | { readonly tipo: 'hecho'; readonly calibracion: Calibracion3D | null; readonly ms: number }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Ajustar el esqueleto (fase 7, paso 3; `workers/esqueleto.worker.ts`). */
export interface AlWorkerEsqueleto {
  readonly tipo: 'ajustar'
  readonly calibracion: Calibracion3D
  readonly a: VistaParaEmparejar
  readonly b: VistaParaEmparejar
  readonly tr: Trayectorias3D
  readonly ids: readonly IdMarcador[]
}

export type DelWorkerEsqueleto =
  | { readonly tipo: 'progreso'; readonly fraccion: number }
  /** null: no hay bastantes puntos 3D para medir a la persona. */
  | { readonly tipo: 'hecho'; readonly resultado: ResultadoEsqueleto | null; readonly ms: number }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** GaitDynamics (fase 11, paso 4; `workers/gaitdynamics.worker.ts`): las ventanas ya preparadas, en un lote. */
export interface AlWorkerGaitDynamics {
  readonly tipo: 'inferir'
  /** ventanas × 150 × 51 (`core/cinetica/gaitdynamics/preparar.ts`). */
  readonly lote: Float32Array
  readonly ventanas: number
}

export type DelWorkerGaitDynamics =
  | { readonly tipo: 'progreso'; readonly fraccion: number }
  /** ventanas × 150 × 12, normalizado (lo deshace `decodificar`). */
  | { readonly tipo: 'hecho'; readonly salida: Float32Array; readonly ms: number }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Comprobar el encuadre de la vista previa (fase 6, asistente de colocación; `workers/encuadre.worker.ts`). */
export type AlWorkerEncuadre = { readonly tipo: 'imagen'; readonly imagen: ImageBitmap }
export type DelWorkerEncuadre =
  | { readonly tipo: 'listo' }
  /** Los 33 puntos normalizados de MediaPipe, o null si no hay nadie. */
  | { readonly tipo: 'puntos'; readonly puntos: readonly { readonly x: number; readonly y: number; readonly visibility?: number }[] | null }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Mensajes del hilo principal al worker de la cara (fase 10, modo «Cervical»). */
export type AlWorkerCara = { readonly tipo: 'detectar'; readonly archivo: File; readonly delegado: 'GPU' | 'CPU' } | { readonly tipo: 'cancelar' }

/** Lo que da Face Landmarker en un frame: la matriz de transformación de la cara (16 números por columnas) o null sin cara. */
export interface FrameCaraWorker {
  readonly indice: number
  readonly t: number
  readonly matriz: number[] | null
}

/** Mensajes del worker de la cara al hilo principal. */
export type DelWorkerCara =
  | { readonly tipo: 'listo'; readonly delegado: 'GPU' | 'CPU'; readonly avisoDelegado?: string; readonly msCarga: number }
  | { readonly tipo: 'frames'; readonly lote: readonly FrameCaraWorker[]; readonly progreso: number }
  | { readonly tipo: 'fin'; readonly motivo: 'final' | 'cancelado'; readonly procesados: number; readonly msProceso: number }
  | { readonly tipo: 'error'; readonly mensaje: string }
