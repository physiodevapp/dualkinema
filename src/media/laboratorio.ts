import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  Input,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from 'mediabunny'
import { saltosDeFrames } from '../core/tiempo/saltos'
import { crearTablaFrames, estadisticas } from '../core/tiempo/tablaFrames'
import type { ValorInforme } from './informe'

/*
 * Laboratorio (fase 4, paso 1; §1–3 de docs/plan-fase-4.md): mide qué da cada móvil en Chrome antes de construir la
 * grabación con dos móviles encima: cámaras (resoluciones y fps que de verdad entrega), códecs que codifica (por
 * hardware o por software), micrófono sin procesar, almacenamiento (OPFS y espacio), pantalla encendida y compartir
 * archivos, y una grabación de prueba con Mediabunny que se puede abrir en el visor. Nada sale del dispositivo.
 *
 * Cada función devuelve un objeto para el informe de texto (`informe.ts`); un fallo de una medida se anota en el
 * informe («error: …») y no corta las demás.
 */

type Dato = { readonly [clave: string]: ValorInforme }

const mensaje = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

async function intentar<T>(f: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await f()
  } catch (e) {
    return { error: mensaje(e) }
  }
}

// ── Entorno ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface UserAgentData {
  readonly brands?: readonly { brand: string; version: string }[]
  readonly mobile?: boolean
  readonly platform?: string
  getHighEntropyValues?(claves: string[]): Promise<Record<string, unknown>>
}

export async function informeEntorno(): Promise<Dato> {
  const n = navigator as Navigator & { userAgentData?: UserAgentData; deviceMemory?: number }
  const alta = await intentar(async () =>
    n.userAgentData?.getHighEntropyValues
      ? await n.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'uaFullVersion', 'architecture', 'bitness'])
      : {},
  )
  const g = globalThis as unknown as Record<string, unknown>
  const compartirArchivos = (): boolean => {
    try {
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.mp4', { type: 'video/mp4' })] })
    } catch {
      return false
    }
  }
  return {
    userAgent: navigator.userAgent,
    modelo: 'model' in alta ? String(alta.model || '—') : '—',
    sistema: `${n.userAgentData?.platform ?? '—'} ${'platformVersion' in alta ? String(alta.platformVersion) : ''}`.trim(),
    chrome: 'uaFullVersion' in alta ? String(alta.uaFullVersion) : '—',
    arquitectura: 'architecture' in alta ? `${String(alta.architecture)} ${String(alta.bitness)} bits` : '—',
    pantalla: `${screen.width}×${screen.height} px, ratio ${window.devicePixelRatio}`,
    ventana: `${window.innerWidth}×${window.innerHeight} px`,
    nucleos: navigator.hardwareConcurrency,
    memoriaGB: n.deviceMemory ?? null,
    contextoSeguro: window.isSecureContext,
    aislamientoDeOrigen: window.crossOriginIsolated,
    apis: {
      VideoEncoder: typeof g.VideoEncoder === 'function',
      AudioEncoder: typeof g.AudioEncoder === 'function',
      VideoDecoder: typeof g.VideoDecoder === 'function',
      MediaStreamTrackProcessor: typeof g.MediaStreamTrackProcessor === 'function',
      MediaRecorder: typeof g.MediaRecorder === 'function',
      wakeLock: 'wakeLock' in navigator,
      compartir: typeof navigator.share === 'function',
      compartirArchivos: compartirArchivos(),
      opfs: typeof navigator.storage?.getDirectory === 'function',
      webSocket: typeof g.WebSocket === 'function',
    },
  }
}

// ── Almacenamiento, pantalla encendida ─────────────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024

export async function informeAlmacenamiento(): Promise<Dato> {
  const cuota = await intentar(async () => {
    const e = await navigator.storage.estimate()
    return { usadoMB: (e.usage ?? 0) / MB, cuotaMB: (e.quota ?? 0) / MB }
  })
  const persistente = await intentar(() => navigator.storage.persisted())
  // Escribe y vuelve a leer 16 MB en el almacenamiento privado del origen (OPFS) y lo borra: velocidad y que funcione.
  const opfs = await intentar(async () => {
    const raiz = await navigator.storage.getDirectory()
    const nombre = `laboratorio-${Date.now()}.bin`
    const trozo = new Uint8Array(MB)
    crypto.getRandomValues(trozo.subarray(0, 65536))
    const t0 = performance.now()
    const archivo = await raiz.getFileHandle(nombre, { create: true })
    const escritor = await archivo.createWritable()
    for (let i = 0; i < 16; i++) await escritor.write(trozo)
    await escritor.close()
    const t1 = performance.now()
    const leido = (await archivo.getFile()).size
    await raiz.removeEntry(nombre)
    return { escritosMB: leido / MB, escrituraMBs: 16 / ((t1 - t0) / 1000) }
  })
  const pantalla = await intentar(async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
    if (!wl) return { disponible: false }
    const cerrojo = await wl.request('screen')
    await cerrojo.release()
    return { disponible: true, concedida: true }
  })
  return { cuota, persistente: typeof persistente === 'object' ? persistente : persistente, opfs, pantallaEncendida: pantalla }
}

// ── Códecs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Cadena de códec por nivel: el de 1080p30 no sirve para 1080p60 ni para 4K. */
const CASOS_CODEC = [
  { codec: 'H.264', c1080p30: 'avc1.640028', c1080p60: 'avc1.64002A', c4k30: 'avc1.640033' },
  { codec: 'HEVC', c1080p30: 'hvc1.1.6.L120.B0', c1080p60: 'hvc1.1.6.L123.B0', c4k30: 'hvc1.1.6.L150.B0' },
  { codec: 'VP9', c1080p30: 'vp09.00.40.08', c1080p60: 'vp09.00.41.08', c4k30: 'vp09.00.50.08' },
  { codec: 'AV1', c1080p30: 'av01.0.08M.08', c1080p60: 'av01.0.09M.08', c4k30: 'av01.0.12M.08' },
] as const

const MODOS_CODEC = [
  { clave: 'c1080p30', ancho: 1920, alto: 1080, fps: 30, bitrate: 10_000_000 },
  { clave: 'c1080p60', ancho: 1920, alto: 1080, fps: 60, bitrate: 16_000_000 },
  { clave: 'c4k30', ancho: 3840, alto: 2160, fps: 30, bitrate: 30_000_000 },
] as const

async function codifica(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true
  } catch {
    return false
  }
}

/** Qué codifica este móvil, por hardware y por software, a 1080p30, 1080p60 y 4K30; y el audio. */
export async function informeCodecs(): Promise<Dato> {
  if (typeof globalThis.VideoEncoder !== 'function') return { error: 'Este navegador no tiene VideoEncoder (WebCodecs).' }
  const filas: Record<string, ValorInforme>[] = []
  for (const caso of CASOS_CODEC) {
    const fila: Record<string, ValorInforme> = { codec: caso.codec }
    for (const m of MODOS_CODEC) {
      const base = { codec: caso[m.clave], width: m.ancho, height: m.alto, framerate: m.fps, bitrate: m.bitrate, latencyMode: 'realtime' as const }
      const hw = await codifica({ ...base, hardwareAcceleration: 'prefer-hardware' })
      const sw = await codifica({ ...base, hardwareAcceleration: 'prefer-software' })
      fila[`${m.ancho}×${m.alto} a ${m.fps}`] = hw ? 'hardware' : sw ? 'software' : 'no'
    }
    filas.push(fila)
  }
  const audio: Record<string, ValorInforme> = {}
  if (typeof globalThis.AudioEncoder === 'function') {
    for (const [nombre, codec] of [['AAC', 'mp4a.40.2'], ['Opus', 'opus']] as const) {
      try {
        audio[nombre] = (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 1, bitrate: 128000 })).supported === true
      } catch {
        audio[nombre] = false
      }
    }
  }
  return { vídeo: filas, audio }
}

// ── Cámaras ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CamaraListada {
  readonly id: string
  readonly nombre: string
}

/** Las cámaras de vídeo (con su nombre: hace falta haber dado permiso). */
export async function listarCamaras(): Promise<CamaraListada[]> {
  const prueba = await navigator.mediaDevices.getUserMedia({ video: true })
  prueba.getTracks().forEach((t) => t.stop())
  const dispositivos = await navigator.mediaDevices.enumerateDevices()
  return dispositivos.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, nombre: d.label || `Cámara ${i + 1}` }))
}

interface ProcesadorDePista {
  readable: ReadableStream<VideoFrame>
}

/** Cuenta los frames que entrega una pista durante `ms` (por MediaStreamTrackProcessor: no depende de pintar). */
async function medirFrames(pista: MediaStreamTrack, ms: number): Promise<Dato> {
  const Procesador = (globalThis as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => ProcesadorDePista })
    .MediaStreamTrackProcessor
  if (!Procesador) return { medida: 'sin MediaStreamTrackProcessor' }
  const lector = new Procesador({ track: pista }).readable.getReader()
  const tiempos: number[] = []
  const fin = performance.now() + ms
  try {
    while (performance.now() < fin) {
      const { done, value } = await lector.read()
      if (done) break
      tiempos.push(value.timestamp / 1e6)
      value.close()
    }
  } finally {
    await lector.cancel().catch(() => {})
  }
  const tabla = crearTablaFrames(tiempos)
  const est = estadisticas(tabla)
  const s = saltosDeFrames(tabla)
  return { frames: est.frames, fpsMedido: est.fpsMedio, pasoMaxMs: s.pasoMax * 1000, saltos: s.saltos, framesPerdidos: s.framesPerdidos }
}

const MODOS_CAMARA = [
  { ancho: 1280, alto: 720, fps: 30 },
  { ancho: 1920, alto: 1080, fps: 30 },
  { ancho: 1920, alto: 1080, fps: 60 },
  { ancho: 3840, alto: 2160, fps: 30 },
] as const

const subconjunto = (o: object, claves: readonly string[]): Dato => {
  const r: Record<string, ValorInforme> = {}
  for (const k of claves) {
    const v = (o as Record<string, unknown>)[k]
    if (v !== undefined) r[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as ValorInforme)
  }
  return r
}

/**
 * Para cada cámara: lo que dice poder hacer (capacidades) y, modo a modo, lo que entrega de verdad medido 1,5 s. Se pide con
 * `ideal` (con `exact`, una combinación que la cámara no tiene solo da un error y no dice qué da en su lugar).
 */
export async function informeCamaras(alProgreso?: (texto: string) => void): Promise<Dato> {
  const camaras = await listarCamaras()
  const soportadas = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>
  const lista: Record<string, ValorInforme>[] = []
  for (const camara of camaras.slice(0, 4)) {
    alProgreso?.(`Cámara «${camara.nombre}»…`)
    const entrada: Record<string, ValorInforme> = { nombre: camara.nombre }
    const capacidades = await intentar(async () => {
      const flujo = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: camara.id } } })
      try {
        const pista = flujo.getVideoTracks()[0]!
        const cap = pista.getCapabilities() as unknown as Record<string, unknown>
        const rango = (k: string) => {
          const r = cap[k] as { min?: number; max?: number } | undefined
          return r ? `${r.min}–${r.max}` : '—'
        }
        return {
          porDefecto: subconjunto(pista.getSettings(), ['width', 'height', 'frameRate', 'facingMode', 'resizeMode']),
          ancho: rango('width'),
          alto: rango('height'),
          fps: rango('frameRate'),
          ...subconjunto(cap, ['facingMode', 'focusMode', 'exposureMode', 'whiteBalanceMode', 'zoom', 'torch', 'exposureCompensation', 'resizeMode']),
        }
      } finally {
        flujo.getTracks().forEach((t) => t.stop())
      }
    })
    entrada.capacidades = capacidades
    const modos: Record<string, ValorInforme>[] = []
    for (const m of MODOS_CAMARA) {
      alProgreso?.(`«${camara.nombre}» a ${m.ancho}×${m.alto}, ${m.fps} fps…`)
      const r = await intentar(async () => {
        const flujo = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: camara.id }, width: { ideal: m.ancho }, height: { ideal: m.alto }, frameRate: { ideal: m.fps } },
        })
        try {
          const pista = flujo.getVideoTracks()[0]!
          const s = pista.getSettings()
          // Con `ideal` Chrome da lo más parecido que tenga: se anota si es lo pedido (en vertical, ancho y alto van girados).
          const girado = s.width === m.alto && s.height === m.ancho
          const exacto = (s.width === m.ancho && s.height === m.alto) || girado
          return {
            concedido: `${s.width}×${s.height} a ${s.frameRate}`,
            esLoPedido: exacto && Math.round(s.frameRate ?? 0) === m.fps,
            ...(await medirFrames(pista, 1500)),
          }
        } finally {
          flujo.getTracks().forEach((t) => t.stop())
        }
      })
      modos.push({ pedido: `${m.ancho}×${m.alto} a ${m.fps}`, ...r })
    }
    entrada.modos = modos
    lista.push(entrada)
  }
  return { restriccionesSoportadas: Object.keys(soportadas).filter((k) => soportadas[k]), camaras: lista }
}

// ── Micrófono ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** El micrófono sin procesar (sin cancelación de eco, supresión de ruido ni control de ganancia): qué concede Chrome. */
export async function informeAudio(): Promise<Dato> {
  const r = await intentar(async () => {
    const flujo = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } },
    })
    try {
      const pista = flujo.getAudioTracks()[0]!
      const s = pista.getSettings() as MediaTrackSettings & { latency?: number }
      return {
        nombre: pista.label,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
        canales: s.channelCount,
        sampleRate: s.sampleRate,
        latenciaS: s.latency,
      }
    } finally {
      flujo.getTracks().forEach((t) => t.stop())
    }
  })
  return r
}

// ── Grabación de prueba ────────────────────────────────────────────────────────────────────────────────────────────

export interface OpcionesGrabacion {
  readonly ancho: number
  readonly alto: number
  readonly fps: number
  /** Códec de vídeo; 'auto' elige el primero que codifique (H.264, VP9, AV1, HEVC). */
  readonly codec: 'auto' | VideoCodec
  /** Duración (s). */
  readonly duracion: number
  /** Cámara concreta; sin ella, la trasera. */
  readonly camaraId?: string
  readonly senal?: AbortSignal
  readonly alProgreso?: (segundos: number) => void
  /** Se llama con el flujo de la cámara para enseñar la vista previa (y con null al acabar). */
  readonly alFlujo?: (flujo: MediaStream | null) => void
}

export interface ResultadoGrabacion {
  readonly archivo: File
  readonly informe: Dato
}

/** Bitrate de partida: unos 0,12 bits por píxel y frame (1080p30: 7,5 Mb/s), entre 4 y 40 Mb/s. */
export const bitrateDe = (ancho: number, alto: number, fps: number): number =>
  Math.min(40_000_000, Math.max(4_000_000, Math.round(ancho * alto * fps * 0.12)))

export async function grabarPrueba(op: OpcionesGrabacion): Promise<ResultadoGrabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({
    video: {
      ...(op.camaraId ? { deviceId: { exact: op.camaraId } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: op.ancho },
      height: { ideal: op.alto },
      frameRate: { ideal: op.fps },
    },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
  })
  op.alFlujo?.(flujo)
  let salida: Output | null = null
  try {
    const pistaVideo = flujo.getVideoTracks()[0]!
    const pistaAudio = flujo.getAudioTracks()[0]
    const ajustes = pistaVideo.getSettings()
    const ancho = ajustes.width ?? op.ancho
    const alto = ajustes.height ?? op.alto
    const fps = Math.round(ajustes.frameRate ?? op.fps)
    const bitrate = bitrateDe(ancho, alto, fps)

    const codec = op.codec === 'auto' ? await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'hevc'], { width: ancho, height: alto, frameRate: fps, bitrate }) : op.codec
    if (!codec) throw new Error('Este móvil no codifica ningún códec de vídeo a esa resolución.')
    const codecAudio = pistaAudio ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: 48000 }) : null

    let configVideo: VideoEncoderConfig | null = null
    const destino = new BufferTarget()
    salida = new Output({ format: new Mp4OutputFormat(), target: destino })
    // `frameRate: null`: un frame por cada que entrega la cámara, con su instante real (con el fps de la pista Mediabunny
    // repetiría o saltaría frames para llegar a él, y esta prueba mide justo lo que la cámara entrega).
    const fuenteVideo = new MediaStreamVideoTrackSource(
      pistaVideo,
      { codec, bitrate, keyFrameInterval: 1, latencyMode: 'realtime', onEncoderConfig: (c) => (configVideo = c) },
      { frameRate: null },
    )
    salida.addVideoTrack(fuenteVideo)
    let fuenteAudio: MediaStreamAudioTrackSource | null = null
    if (pistaAudio && codecAudio) {
      fuenteAudio = new MediaStreamAudioTrackSource(pistaAudio, { codec: codecAudio, bitrate: 128_000 })
      salida.addAudioTrack(fuenteAudio)
    }

    const t0 = performance.now()
    await salida.start()
    const arranqueMs = performance.now() - t0
    const inicio = performance.now()
    let cancelada = false
    while (performance.now() - inicio < op.duracion * 1000) {
      if (op.senal?.aborted) {
        cancelada = true
        break
      }
      op.alProgreso?.((performance.now() - inicio) / 1000)
      await Promise.race([new Promise((r) => setTimeout(r, 200)), fuenteVideo.errorPromise])
    }
    const grabadoS = (performance.now() - inicio) / 1000
    if (cancelada) {
      await salida.cancel()
      throw new Error('Grabación cancelada.')
    }
    const t1 = performance.now()
    await salida.finalize()
    const cierreMs = performance.now() - t1
    op.alProgreso?.(op.duracion)

    const buffer = destino.buffer
    if (!buffer) throw new Error('La grabación no ha producido ningún archivo.')
    const archivo = new File([buffer], `prueba-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`, { type: 'video/mp4' })
    const cfg = configVideo as VideoEncoderConfig | null
    const analisis = await analizarArchivo(archivo)
    return {
      archivo,
      informe: {
        pedido: `${op.ancho}×${op.alto} a ${op.fps}, códec ${op.codec}`,
        camara: { concedido: `${ancho}×${alto} a ${ajustes.frameRate}`, nombre: pistaVideo.label },
        codificador: {
          codec,
          cadena: cfg?.codec ?? '—',
          aceleracion: cfg?.hardwareAcceleration ?? '—',
          bitrateMbs: bitrate / 1e6,
          audio: codecAudio ?? 'sin audio',
        },
        tiempos: { arranqueMs, grabadoS, cierreMs },
        archivo: { tamanoMB: archivo.size / MB, bitrateRealMbs: (archivo.size * 8) / grabadoS / 1e6 },
        ...analisis,
      },
    }
  } finally {
    op.alFlujo?.(null)
    flujo.getTracks().forEach((t) => t.stop())
    if (salida && salida.state !== 'finalized' && salida.state !== 'canceled') await salida.cancel().catch(() => {})
  }
}

/** Lo que de verdad hay en el archivo: frames, saltos, fps, duración y dónde empieza el sonido respecto a la imagen. */
async function analizarArchivo(archivo: File): Promise<Dato> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    const pv = await entrada.getPrimaryVideoTrack()
    if (!pv) return { vídeo: 'el archivo no tiene pista de vídeo' }
    const pts: number[] = []
    let claves = 0
    for await (const p of new EncodedPacketSink(pv).packets(undefined, undefined, { metadataOnly: true })) {
      pts.push(p.timestamp)
      if (p.type === 'key') claves++
    }
    const tabla = crearTablaFrames(pts)
    const est = estadisticas(tabla)
    const s = saltosDeFrames(tabla)
    const pa = await entrada.getPrimaryAudioTrack()
    const inicioVideo = await pv.getFirstTimestamp()
    return {
      vídeoGrabado: {
        codec: pv.codec ?? '—',
        tamano: `${pv.displayWidth}×${pv.displayHeight}`,
        frames: est.frames,
        fotogramasClave: claves,
        fpsMedio: est.fpsMedio,
        fpsMediano: s.pasoMediano ? 1 / s.pasoMediano : NaN,
        pasoMinMs: est.pasoMin * 1000,
        pasoMaxMs: est.pasoMax * 1000,
        saltos: s.saltos,
        framesPerdidos: s.framesPerdidos,
        duracionS: await pv.computeDuration(),
        inicioS: inicioVideo,
      },
      audioGrabado: pa
        ? {
            codec: pa.codec ?? '—',
            canales: await pa.getNumberOfChannels(),
            sampleRate: await pa.getSampleRate(),
            duracionS: await pa.computeDuration(),
            inicioS: await pa.getFirstTimestamp(),
            // El sonido empieza esto después (positivo) o antes (negativo) que la imagen dentro del archivo.
            inicioAudioMenosVideoMs: ((await pa.getFirstTimestamp()) - inicioVideo) * 1000,
          }
        : 'sin pista de audio',
    }
  } finally {
    entrada.dispose()
  }
}
