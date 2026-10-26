import { AudioSample, VideoSample, type AudioSampleSource, type VideoSampleSource } from 'mediabunny'
import { pasoDeReloj, type PasoDeReloj } from '../core/tiempo/relojes'

/*
 * Cada frame y cada trozo de audio en el instante en que se capturó (fase 4, paso 8).
 *
 * Mediabunny (`MediaStreamVideoTrackSource` y `MediaStreamAudioTrackSource`) coloca cada pista por cuándo le llega su
 * primer trozo. En el Pixel 8 un frame llega 7 ms después de capturarse y un trozo de audio 82: el audio quedaba unos
 * 75 ms tarde respecto a la imagen, y cuánto dependía de cómo llegara el primero (en las grabaciones del usuario, de 0
 * a 87 ms). Aquí se leen las pistas a mano y cada trozo va a su marca de captura, pasada al reloj de la página
 * (`performance.now()`):
 *
 * - **Vídeo:** Chrome marca cada frame en un reloj propio. El aviso de cada frame pintado en un `<video>`
 *   (`requestVideoFrameCallback`) da su captura en el reloj de la página: con los dos, `pasoDeReloj` halla la
 *   diferencia. Sin ese aviso, se supone que llegan al momento (como Mediabunny, pero con la mediana y no con el primero).
 * - **Audio:** según el móvil, en el reloj de la página (Pixel 8, Chrome 156) o en el mismo que el vídeo (tablet,
 *   Chrome 138): se mira con los primeros trozos.
 *
 * El tiempo 0 del archivo es `origen` (ms del reloj de la página): en la grabación doble, el instante programado, así
 * que el vídeo empieza justo ahí (lo que se capturó antes no entra) y el reloj común ya no tiene que suponerlo.
 */

/** Frames y trozos de audio pendientes de codificar a partir de los cuales se descartan (el codificador no da abasto). */
export const PENDIENTES_MAXIMOS = 8
/** Marcas recientes con que se calcula el paso entre relojes. */
const MARCAS = 120
/** Una marca a menos de esto de su llegada está en el reloj de la página (ms); en otro reloj, la diferencia es enorme. */
const MISMO_RELOJ_MS = 1000

export type Tiempos = 'captura' | 'llegada'

/** El paso del reloj de los frames al de la página, con el aviso de cada frame pintado. */
class EstimadorPaso {
  private readonly capturas: number[] = []
  private readonly marcas: number[] = []
  private readonly llegadas: number[] = []
  private readonly visor: HTMLVideoElement | null
  private vivo = true
  private cache: { n: number; paso: PasoDeReloj | null } = { n: -1, paso: null }

  constructor(pista: MediaStreamTrack) {
    const visor = document.createElement('video')
    if (!('requestVideoFrameCallback' in visor)) {
      this.visor = null
      return
    }
    visor.muted = true
    visor.playsInline = true
    visor.srcObject = new MediaStream([pista.clone()])
    const aviso = (_: number, m: VideoFrameCallbackMetadata) => {
      if (!this.vivo) return
      if (typeof m.captureTime === 'number') recortar(this.capturas, m.captureTime)
      visor.requestVideoFrameCallback(aviso)
    }
    visor.requestVideoFrameCallback(aviso)
    void visor.play().catch(() => {})
    this.visor = visor
  }

  anotar(marcaMs: number, llegadaMs: number) {
    recortar(this.marcas, marcaMs)
    recortar(this.llegadas, llegadaMs)
  }

  paso(): PasoDeReloj | null {
    const n = this.capturas.length + this.marcas.length
    if (n !== this.cache.n) this.cache = { n, paso: pasoDeReloj(this.marcas, this.capturas, this.llegadas) }
    return this.cache.paso
  }

  /** marca − llegada mediana (ms): el paso suponiendo que los frames llegan al momento. */
  pasoPorLlegada(): number | null {
    if (!this.marcas.length) return null
    const o = this.marcas.map((m, i) => m - this.llegadas[i]!).sort((a, b) => a - b)
    return o[Math.floor(o.length / 2)]!
  }

  cerrar() {
    this.vivo = false
    if (!this.visor) return
    this.visor.pause()
    ;(this.visor.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
    this.visor.srcObject = null
  }
}

function recortar(lista: number[], valor: number) {
  lista.push(valor)
  if (lista.length > MARCAS) lista.shift()
}

export class Captura {
  private readonly estimador: EstimadorPaso
  private readonly lectores: ReadableStreamDefaultReader<VideoFrame | AudioData>[] = []
  private readonly pendientes = new Set<Promise<unknown>>()
  private origen: number | null = null
  /** Fijados al empezar: el paso del reloj del vídeo y cómo se colocan los trozos. */
  private pasoVideo = 0
  private audioEnPagina: boolean | null = null
  private modo: Tiempos = 'llegada'
  private enCola = { video: 0, audio: 0 }
  private rechazar: (e: unknown) => void = () => {}
  /** Rechaza si el codificador falla a mitad. */
  readonly error: Promise<never>

  constructor(
    pistaVideo: MediaStreamTrack,
    pistaAudio: MediaStreamTrack | null,
    private readonly fuenteVideo: VideoSampleSource,
    private readonly fuenteAudio: AudioSampleSource | null,
    /**
     * Retraso de la cámara de este móvil (ms; `core/grabacion/calibracion.ts`): la «captura» que da Chrome no incluye
     * lo que tarda la cámara, así que se adelanta cada frame esto. Solo cuando los frames van por su captura.
     */
    private readonly retrasoCamaraMs = 0,
  ) {
    this.error = new Promise<never>((_, rechazar) => (this.rechazar = rechazar))
    this.error.catch(() => {})
    this.estimador = new EstimadorPaso(pistaVideo)
    void this.leer(pistaVideo, 'video')
    if (pistaAudio && fuenteAudio) void this.leer(pistaAudio, 'audio')
  }

  /** Cómo se colocan los trozos: por su captura o, si el navegador no da con qué pasarla de reloj, por su llegada. */
  get tiempos(): Tiempos {
    return this.modo
  }

  /** Espera a tener el paso entre relojes (como mucho `ms`). */
  async esperarPaso(ms: number): Promise<void> {
    const hasta = performance.now() + ms
    while (!this.estimador.paso() && performance.now() < hasta) await new Promise((ok) => setTimeout(ok, 50))
  }

  /** Desde aquí entra lo capturado a partir de `origen` (ms del reloj de la página), que es el tiempo 0 del archivo. */
  empezar(origen: number) {
    const paso = this.estimador.paso()
    const porLlegada = this.estimador.pasoPorLlegada()
    this.modo = paso ? 'captura' : 'llegada'
    this.pasoVideo = paso?.diferenciaMs ?? porLlegada ?? 0
    this.origen = origen
    // El paso es fijo durante la grabación: el `<video>` del aviso ya no hace falta, y en un aparato lento le quitaba
    // potencia al codificador (la tablet bajó a 6 fps con él abierto).
    this.estimador.cerrar()
  }

  /** Para de leer y espera a que se codifique lo pendiente. */
  async detener(): Promise<void> {
    this.origen = null
    for (const l of this.lectores) await l.cancel().catch(() => {})
    await Promise.allSettled([...this.pendientes])
    this.estimador.cerrar()
  }

  /** La marca de un trozo en el reloj de la página (ms). */
  private aPagina(marcaMs: number, clase: 'video' | 'audio'): number {
    if (clase === 'audio') return this.audioEnPagina ? marcaMs : marcaMs - this.pasoVideo
    return marcaMs - this.pasoVideo - (this.modo === 'captura' ? this.retrasoCamaraMs : 0)
  }

  /** El retraso de la cámara descontado (ms): 0 sin calibrar o si los frames van por su llegada. */
  get retrasoAplicadoMs(): number {
    return this.modo === 'captura' ? this.retrasoCamaraMs : 0
  }

  private async leer(pista: MediaStreamTrack, clase: 'video' | 'audio') {
    const lector = new MediaStreamTrackProcessor({ track: pista }).readable.getReader() as ReadableStreamDefaultReader<VideoFrame | AudioData>
    this.lectores.push(lector)
    try {
      for (;;) {
        const { value, done } = await lector.read()
        if (done || !value) break
        const llegada = performance.now()
        const marca = value.timestamp / 1000
        if (clase === 'video') this.estimador.anotar(marca, llegada)
        else this.audioEnPagina ??= Math.abs(llegada - marca) < MISMO_RELOJ_MS
        const t = this.origen === null ? -1 : (this.aPagina(marca, clase) - this.origen) / 1000
        if (t < 0 || this.enCola[clase] >= PENDIENTES_MAXIMOS) {
          value.close()
          continue
        }
        this.enviar(value, t, clase)
      }
    } catch (e) {
      if (this.origen !== null) this.rechazar(e)
    }
  }

  private enviar(trozo: VideoFrame | AudioData, t: number, clase: 'video' | 'audio') {
    let muestra: VideoSample | AudioSample
    let envio: Promise<void>
    if (clase === 'video') {
      const m = new VideoSample(trozo as VideoFrame, { timestamp: t })
      muestra = m
      envio = this.fuenteVideo.add(m)
    } else {
      const m = new AudioSample(trozo as AudioData)
      m.setTimestamp(t)
      muestra = m
      envio = this.fuenteAudio!.add(m)
    }
    this.enCola[clase]++
    const p = envio.catch((e: unknown) => this.rechazar(e)).finally(() => {
      muestra.close()
      this.enCola[clase]--
      this.pendientes.delete(p)
    })
    this.pendientes.add(p)
  }
}
