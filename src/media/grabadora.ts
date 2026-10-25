import {
  AudioSampleSource,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type StreamTargetChunk,
  type Target,
  VideoSampleSource,
} from 'mediabunny'
import { Captura, type Tiempos } from './captura'
import { FORMATO_METADATOS, textoMetadatos, type DatosDoble, type MetadatosGrabacion } from '../core/grabacion/metadatos'
import { abrirGrabacion, crearArchivoGrabacion } from './grabaciones'

/*
 * Grabar con la cámara del móvil dentro de la app (fase 4, paso 2; D1–D3 de docs/plan-fase-4.md).
 *
 * - Cámara trasera a la resolución elegida y 30 fps (60 no se consigue: el Pixel 8 da 40–44 aunque Chrome los conceda).
 * - Micrófono sin procesar: sin cancelación de eco (borraría el pitido del propio móvil, paso 6), sin supresión de ruido
 *   ni control de ganancia (cambiaría el nivel a mitad de la toma).
 * - Mediabunny codifica con WebCodecs (H.264 si el móvil lo codifica; si no, VP9, AV1 o HEVC) un frame por cada uno que
 *   entrega la cámara, cada uno en su instante de captura (`captura.ts`: no por cuándo llega, que dejaba el audio hasta
 *   87 ms desplazado de la imagen), y un fotograma clave cada segundo (el visor salta rápido a cualquier frame).
 * - Se escribe sobre la marcha en OPFS (`grabaciones.ts`); si el navegador no lo deja, en memoria con una duración máxima
 *   más corta.
 */

export interface Calidad {
  readonly id: '720p' | '1080p' | '4k'
  readonly etiqueta: string
  readonly ancho: number
  readonly alto: number
  readonly fps: number
}

export const CALIDADES: readonly Calidad[] = [
  { id: '720p', etiqueta: '1280×720', ancho: 1280, alto: 720, fps: 30 },
  { id: '1080p', etiqueta: '1920×1080', ancho: 1920, alto: 1080, fps: 30 },
  { id: '4k', etiqueta: '3840×2160', ancho: 3840, alto: 2160, fps: 30 },
]

export const CALIDAD_POR_DEFECTO: Calidad = CALIDADES[1]!

/** Cuánto se espera, como mucho, al paso entre los relojes del vídeo y de la página al empezar a grabar (ms). */
const ESPERA_PASO_MS = 800

/** Duración máxima (s) escribiendo en OPFS (D3) y escribiendo en memoria si OPFS falla. */
export const DURACION_MAXIMA_S = 300
export const DURACION_MAXIMA_MEMORIA_S = 60

/** Bitrate de partida: unos 0,12 bits por píxel y frame (1080p30: 7,5 Mb/s), entre 4 y 40 Mb/s. */
export const bitrateDe = (ancho: number, alto: number, fps: number): number =>
  Math.min(40_000_000, Math.max(4_000_000, Math.round(ancho * alto * fps * 0.12)))

/** Abre la cámara trasera y el micrófono sin procesar. */
export async function abrirCamara(calidad: Calidad): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: calidad.ancho }, height: { ideal: calidad.alto }, frameRate: { ideal: calidad.fps } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
  })
}

/** Lo que la cámara está dando (en vertical, ancho y alto van girados). */
export function datosCamara(flujo: MediaStream): { ancho: number; alto: number; fps: number; nombre: string } {
  const pista = flujo.getVideoTracks()[0]
  const s = pista?.getSettings() ?? {}
  return { ancho: s.width ?? 0, alto: s.height ?? 0, fps: s.frameRate ?? 0, nombre: pista?.label ?? '' }
}

export interface GrabacionTerminada {
  readonly archivo: File
  /** Se escribió en OPFS (está en la lista de grabaciones); si no, solo existe en memoria hasta guardarla. */
  readonly enAlmacen: boolean
}

export class Grabadora {
  private constructor(
    private readonly salida: Output,
    private readonly nombre: string,
    private readonly almacen: { quitar: () => Promise<void> } | null,
    private readonly destino: Target,
    /** Duración máxima (s) según dónde se escribe. */
    readonly duracionMaxima: number,
    /** Rechaza si el codificador falla a mitad. */
    readonly error: Promise<never>,
    private readonly captura: Captura,
  ) {}

  /** Cómo quedaron colocados los frames y el audio: por su captura o, si no se pudo, por su llegada. */
  get tiempos(): Tiempos {
    return this.captura.tiempos
  }

  /** Empieza a grabar el flujo de la cámara en un archivo `nombre`. */
  static async empezar(flujo: MediaStream, calidad: Calidad, nombre: string, id: string): Promise<Grabadora> {
    return (await Grabadora.preparar(flujo, calidad, nombre, id)).arrancar()
  }

  /**
   * Lo que tarda (códec, archivo, metadatos), sin empezar a grabar: la grabación doble lo hace antes del instante
   * programado y arranca justo entonces (`arrancar`). Los metadatos van ya escritos (Mediabunny no deja cambiarlos
   * después de empezar), así que `doble.inicio` es el instante programado. Si no se llega a arrancar, `descartar`.
   * `arrancar(origen)`: el tiempo 0 del archivo en el reloj de la página (ms); sin él, cuando arranca.
   */
  static async preparar(
    flujo: MediaStream,
    calidad: Calidad,
    nombre: string,
    id: string,
    doble?: DatosDoble,
  ): Promise<{ arrancar: (origen?: number) => Promise<Grabadora>; descartar: () => Promise<void> }> {
    const pistaVideo = flujo.getVideoTracks()[0]
    if (!pistaVideo) throw new Error('La cámara no da imagen.')
    const pistaAudio = flujo.getAudioTracks()[0]
    const { ancho, alto, fps } = datosCamara(flujo)
    const fpsCodif = Math.round(fps || calidad.fps)
    const bitrate = bitrateDe(ancho || calidad.ancho, alto || calidad.alto, fpsCodif)

    const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'hevc'], { width: ancho, height: alto, frameRate: fpsCodif, bitrate })
    if (!codec) throw new Error('Este móvil no puede codificar vídeo a esa resolución. Prueba con una menor.')
    const codecAudio = pistaAudio ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: 48000 }) : null

    // OPFS si se puede; si no, en memoria (con menos duración).
    const almacen = await crearArchivoGrabacion(nombre).catch(() => null)
    const destino: Target = almacen
      ? new StreamTarget(almacen.escritor as unknown as WritableStream<StreamTargetChunk>, { chunked: true })
      : new BufferTarget()
    const salida = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: destino })
    const metadatos: MetadatosGrabacion = {
      app: 'dualkinema',
      formato: FORMATO_METADATOS,
      id,
      creada: new Date().toISOString(),
      pedido: { ancho: calidad.ancho, alto: calidad.alto, fps: calidad.fps },
      ...(doble ? { doble } : {}),
    }
    salida.setMetadataTags({ comment: textoMetadatos(metadatos) })

    const fuenteVideo = new VideoSampleSource({ codec, bitrate, keyFrameInterval: 1, latencyMode: 'realtime' })
    salida.addVideoTrack(fuenteVideo)
    const fuenteAudio = pistaAudio && codecAudio ? new AudioSampleSource({ codec: codecAudio, bitrate: 128_000 }) : null
    if (fuenteAudio) salida.addAudioTrack(fuenteAudio)
    // Se empieza a leer ya (para tener el paso entre relojes al arrancar); hasta entonces, nada entra en el archivo.
    const captura = new Captura(pistaVideo, fuenteAudio ? pistaAudio! : null, fuenteVideo, fuenteAudio)
    const descartar = async () => {
      await captura.detener()
      if (salida.state !== 'finalized' && salida.state !== 'canceled') await salida.cancel().catch(() => {})
      await almacen?.quitar()
    }
    return {
      arrancar: async (origen?: number) => {
        try {
          await salida.start()
          // Grabando con un móvil, se espera un poco al paso entre relojes; en la grabación doble ya ha dado tiempo.
          if (origen === undefined) await captura.esperarPaso(ESPERA_PASO_MS)
          captura.empezar(origen ?? performance.now())
        } catch (e) {
          await descartar()
          throw e
        }
        return new Grabadora(salida, nombre, almacen, destino, almacen ? DURACION_MAXIMA_S : DURACION_MAXIMA_MEMORIA_S, captura.error, captura)
      },
      descartar,
    }
  }

  /** Termina el archivo y lo devuelve. */
  async parar(): Promise<GrabacionTerminada> {
    try {
      await this.captura.detener()
      await this.salida.finalize()
    } catch (e) {
      await this.almacen?.quitar()
      throw e
    }
    if (this.almacen) {
      return { archivo: await abrirGrabacion(this.nombre), enAlmacen: true }
    }
    const buffer = (this.destino as BufferTarget).buffer
    if (!buffer) throw new Error('La grabación no ha producido ningún archivo.')
    return { archivo: new File([buffer], this.nombre, { type: 'video/mp4' }), enAlmacen: false }
  }

  /** Descarta la grabación (no queda nada en el almacén). */
  async cancelar(): Promise<void> {
    await this.captura.detener()
    if (this.salida.state !== 'finalized' && this.salida.state !== 'canceled') await this.salida.cancel().catch(() => {})
    await this.almacen?.quitar()
  }
}
