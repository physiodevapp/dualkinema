import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input, type WrappedCanvas } from 'mediabunny'
import { crearTablaFrames, type TablaFrames } from '../core/tiempo/tablaFrames'

export interface InfoVideo {
  readonly nombre: string
  readonly tamano: number
  readonly formato: string
  readonly codec: string
  /** Tamaño en px tal como se ve (rotación ya aplicada). Es el sistema de coordenadas de las trayectorias. */
  readonly ancho: number
  readonly alto: number
  /** Rotación guardada en el archivo, en grados horarios; ya aplicada al dibujar. */
  readonly rotacion: 0 | 90 | 180 | 270
  readonly duracion: number
}

export class ErrorVideo extends Error {}

function mensajeSinCodec(codec: string): string {
  const base = `Este navegador no puede decodificar el vídeo (códec ${codec}).`
  if (codec === 'avc') return `${base} Ábrelo en Chrome: en Android decodifica H.264.`
  if (codec === 'hevc') {
    return `${base} Graba en H.264: en los ajustes de la cámara, formato «Más compatible» (iPhone) o desactiva «HEVC/H.265» (Android).`
  }
  return `${base} Graba con la cámara del móvil en H.264 (MP4).`
}

/**
 * Vídeo abierto para avanzar frame a frame con tiempos exactos. Lee el archivo
 * a trozos desde el dispositivo (nunca lo sube a ningún sitio) y decodifica con
 * WebCodecs a través de Mediabunny.
 */
export class VideoAbierto {
  private iterador: AsyncGenerator<WrappedCanvas, void, unknown> | null = null
  private siguienteDelIterador = -1
  private cola: Promise<unknown> = Promise.resolve()
  private cerrado = false

  private constructor(
    private readonly entrada: Input,
    private readonly sink: CanvasSink,
    readonly info: InfoVideo,
    readonly tabla: TablaFrames,
  ) {}

  static async abrir(archivo: File): Promise<VideoAbierto> {
    const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
    try {
      const pista = await entrada.getPrimaryVideoTrack()
      if (!pista) throw new ErrorVideo('El archivo no tiene pista de vídeo.')
      const codec = pista.codec ?? 'desconocido'
      if (!(await pista.canDecode())) throw new ErrorVideo(mensajeSinCodec(codec))

      // Tabla de frames: el pts de cada paquete, sin leer los datos de imagen.
      const pts: number[] = []
      for await (const paquete of new EncodedPacketSink(pista).packets(undefined, undefined, { metadataOnly: true })) {
        pts.push(paquete.timestamp)
      }
      const tabla = crearTablaFrames(pts)
      if (tabla.tiempos.length === 0) throw new ErrorVideo('El vídeo no tiene frames.')

      const formato = await entrada.getFormat()
      const info: InfoVideo = {
        nombre: archivo.name,
        tamano: archivo.size,
        formato: formato.name,
        codec,
        ancho: pista.displayWidth,
        alto: pista.displayHeight,
        rotacion: pista.rotation,
        duracion: await pista.computeDuration(),
      }
      return new VideoAbierto(entrada, new CanvasSink(pista), info, tabla)
    } catch (e) {
      entrada.dispose()
      if (e instanceof ErrorVideo) throw e
      throw new ErrorVideo(`No se ha podido leer el vídeo: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * Imagen del frame `indice` de la tabla. Las peticiones se atienden de una en
   * una. Avanzar de uno en uno reutiliza el decodificador (rápido); saltar o
   * retroceder vuelve a decodificar desde el fotograma clave anterior.
   */
  frame(indice: number): Promise<WrappedCanvas> {
    const resultado = this.cola.then(() => this.leer(indice))
    this.cola = resultado.catch(() => undefined)
    return resultado
  }

  private async leer(indice: number): Promise<WrappedCanvas> {
    if (this.cerrado) throw new ErrorVideo('El vídeo está cerrado.')
    const objetivo = this.tabla.tiempos[indice]
    if (objetivo === undefined) throw new RangeError(`No hay frame ${indice}.`)

    if (!this.iterador || indice !== this.siguienteDelIterador) {
      await this.iterador?.return()
      this.iterador = this.sink.canvases(objetivo)
    }
    // El iterador empieza en el frame visible en `objetivo`; si devolviera
    // alguno anterior, se descarta hasta llegar.
    for (;;) {
      const r = await this.iterador.next()
      if (r.done) {
        this.iterador = null
        throw new ErrorVideo(`No se ha podido decodificar el frame ${indice}.`)
      }
      if (r.value.timestamp >= objetivo - 1e-6) {
        this.siguienteDelIterador = indice + 1
        return r.value
      }
    }
  }

  async cerrar(): Promise<void> {
    this.cerrado = true
    await this.cola
    await this.iterador?.return()
    this.iterador = null
    this.entrada.dispose()
  }
}
