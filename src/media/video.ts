import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input, type WrappedCanvas } from 'mediabunny'
import { crearTablaFrames, indiceDeFrame, type TablaFrames } from '../core/tiempo/tablaFrames'
import { CacheFrames, capacidadCache, MEMORIA_CACHE } from './cacheFrames'
import { planificarLectura } from './planLectura'

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

/**
 * Cómo se consiguió el último frame, para diagnosticar en el móvil: de la
 * caché, siguiendo el decodificador hacia delante o volviendo al fotograma
 * clave. `frames`: cuántos frames entregó el decodificador para llegar.
 */
export interface UltimaLectura {
  readonly modo: 'cache' | 'seguido' | 'clave'
  readonly frames: number
}

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
  /** Últimos frames decodificados (el CanvasSink da un canvas nuevo por frame, así que se pueden guardar). */
  private cache: CacheFrames<WrappedCanvas>
  ultimaLectura: UltimaLectura | null = null

  private constructor(
    private readonly entrada: Input,
    private readonly sink: CanvasSink,
    /** El archivo original, para que el worker de seguimiento lo abra por su cuenta. */
    readonly archivo: File,
    readonly info: InfoVideo,
    readonly tabla: TablaFrames,
    /** Índices de los fotogramas clave en la tabla, ordenados. */
    readonly claves: readonly number[],
  ) {
    this.cache = new CacheFrames(capacidadCache(info.ancho, info.alto))
  }

  static async abrir(archivo: File): Promise<VideoAbierto> {
    const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
    try {
      const pista = await entrada.getPrimaryVideoTrack()
      if (!pista) throw new ErrorVideo('El archivo no tiene pista de vídeo.')
      const codec = pista.codec ?? 'desconocido'
      if (!(await pista.canDecode())) throw new ErrorVideo(mensajeSinCodec(codec))

      // Tabla de frames: el pts de cada paquete, sin leer los datos de imagen.
      // y los fotogramas clave, para saber cuándo conviene seguir decodificando
      // hacia delante y desde dónde empezar al retroceder.
      const pts: number[] = []
      const ptsClave: number[] = []
      for await (const paquete of new EncodedPacketSink(pista).packets(undefined, undefined, { metadataOnly: true })) {
        pts.push(paquete.timestamp)
        if (paquete.type === 'key') ptsClave.push(paquete.timestamp)
      }
      const tabla = crearTablaFrames(pts)
      if (tabla.tiempos.length === 0) throw new ErrorVideo('El vídeo no tiene frames.')
      const claves = [...new Set(ptsClave.map((t) => indiceDeFrame(tabla, t)))].sort((a, b) => a - b)

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
      return new VideoAbierto(entrada, new CanvasSink(pista), archivo, info, tabla, claves)
    } catch (e) {
      entrada.dispose()
      if (e instanceof ErrorVideo) throw e
      throw new ErrorVideo(`No se ha podido leer el vídeo: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * Imagen del frame `indice` de la tabla. Las peticiones se atienden de una en
   * una. Avanzar (de uno en uno o saltando unos pocos dentro del mismo grupo
   * de imágenes) sigue con el decodificador abierto; retroceder o saltar más
   * allá de un fotograma clave vuelve a decodificar desde el anterior. Los
   * frames que se entregan de paso van a la caché, de donde salen los
   * siguientes pasos atrás sin decodificar (ver `planLectura.ts`).
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
    const guardado = this.cache.obtener(indice)
    if (guardado) {
      this.ultimaLectura = { modo: 'cache', frames: 0 }
      return guardado
    }

    const plan = planificarLectura({
      indice,
      siguiente: this.iterador ? this.siguienteDelIterador : null,
      claves: this.claves,
      capacidad: this.cache.capacidad,
    })
    if (plan.modo === 'saltar' || !this.iterador) {
      await this.iterador?.return()
      // Mediabunny decodifica desde el fotograma clave anterior y entrega a
      // partir del frame visible en este instante: los de paso hasta el
      // pedido se guardan en la caché.
      this.iterador = this.sink.canvases(this.tabla.tiempos[plan.modo === 'saltar' ? plan.desde : indice])
    }
    const modo = plan.modo === 'saltar' ? 'clave' : 'seguido'
    let frames = 0
    for (;;) {
      const r = await this.iterador.next()
      frames++
      if (r.done) {
        this.iterador = null
        throw new ErrorVideo(`No se ha podido decodificar el frame ${indice}.`)
      }
      // Cada frame decodificado, también los de paso, va a la caché con su
      // índice en la tabla (el del frame visible en su instante).
      this.cache.guardar(indiceDeFrame(this.tabla, r.value.timestamp), r.value)
      // El decodificador siempre va hacia delante: el próximo es el siguiente
      // al que acaba de entregar.
      this.siguienteDelIterador = indiceDeFrame(this.tabla, r.value.timestamp) + 1
      if (r.value.timestamp >= objetivo - 1e-6) {
        this.ultimaLectura = { modo, frames }
        return r.value
      }
    }
  }

  /**
   * Con varias vistas abiertas la caché de frames se reparte la memoria: cada vista usa la parte que le toca (con una,
   * todo el presupuesto). Vacía la caché; los frames se vuelven a decodificar al pedirlos.
   */
  repartirMemoria(vistas: number): void {
    this.cache.vaciar()
    this.cache = new CacheFrames(capacidadCache(this.info.ancho, this.info.alto, MEMORIA_CACHE / Math.max(1, vistas)))
  }

  async cerrar(): Promise<void> {
    this.cerrado = true
    await this.cola
    await this.iterador?.return()
    this.iterador = null
    this.cache.vaciar()
    this.entrada.dispose()
  }
}
