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
import { bitrateDe } from './grabadora'
import type { ValorInforme } from './informe'
import { microExterno } from './microfono'
import { pasoDeReloj } from '../core/tiempo/relojes'

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

/** Lo que se descarta al principio de la medida (s): la cámara arranca y ajusta enfoque y exposición, y entrega menos fps. */
const ARRANQUE_CAMARA_S = 0.7

/**
 * Cuenta los frames que entrega una pista durante `ms` (por MediaStreamTrackProcessor: no depende de pintar), sin los
 * primeros ARRANQUE_CAMARA_S s. El fps de referencia es el mediano (el medio lo bajan unos pocos frames lentos).
 */
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
  const inicio = tiempos[0] ?? 0
  const tabla = crearTablaFrames(tiempos.filter((t) => t - inicio >= ARRANQUE_CAMARA_S))
  const est = estadisticas(tabla)
  const s = saltosDeFrames(tabla)
  return {
    frames: est.frames,
    fpsMediano: 1 / s.pasoMediano,
    fpsMedio: est.fpsMedio,
    pasoMedianoMs: s.pasoMediano * 1000,
    pasoMaxMs: s.pasoMax * 1000,
    saltos: s.saltos,
    framesPerdidos: s.framesPerdidos,
  }
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
 * Para cada cámara: lo que dice poder hacer (capacidades) y, modo a modo, lo que entrega de verdad medido 3 s (sin el arranque). Se pide con
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
            ...(await medirFrames(pista, 3000)),
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
        // Con los nombres se comprueba el aviso de auriculares o micrófono externo (`microfono.ts`).
        entradas: (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').map((d) => d.label || '(sin nombre)'),
        externo: (await microExterno(flujo)) ?? 'no',
      }
    } finally {
      flujo.getTracks().forEach((t) => t.stop())
    }
  })
  return r
}

// ── Grabación de prueba ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cómo se trata la exposición y el enfoque de la cámara al grabar (hipótesis del paso 1: con poca luz la exposición
 * automática se alarga y la cámara baja los fps):
 * - auto: como la app de cámara;
 * - bloqueada: tras 1 s de ajuste automático, se fijan exposición, ISO y enfoque en lo que la cámara eligió (sin que el
 *   enfoque «busque» ni la exposición cambie a mitad de la toma);
 * - corta: exposición manual de 1/100 s con ISO alto (menos desenfoque de movimiento y fps constantes si hay luz; la imagen
 *   sale más oscura).
 */
export type ModoExposicion = 'auto' | 'bloqueada' | 'corta'

/**
 * Exposición (en unidades de 100 µs que usa Chrome) de «corta»: 1/100 s. Con red de 50 Hz las bombillas parpadean a 100 Hz, y
 * una exposición que es múltiplo de ese ciclo da el mismo brillo en todos los frames (1/120 s lo haría pulsar).
 */
const EXPOSICION_CORTA = 100

export interface OpcionesGrabacion {
  readonly exposicion?: ModoExposicion
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

const CLAVES_AJUSTES = ['exposureMode', 'exposureTime', 'iso', 'focusMode', 'focusDistance', 'whiteBalanceMode', 'zoom', 'frameRate'] as const

/** Lo que la cámara está usando ahora (null → «—»: esa cámara no lo da). */
function ajustesDeCamara(pista: MediaStreamTrack): Dato {
  const s = pista.getSettings() as Record<string, unknown>
  const r: Record<string, ValorInforme> = {}
  for (const k of CLAVES_AJUSTES) r[k] = (s[k] as ValorInforme) ?? null
  return r
}

/** Aplica el modo de exposición pedido. Devuelve qué se aplicó (o por qué no) para el informe. */
async function aplicarExposicion(pista: MediaStreamTrack, modo: ModoExposicion): Promise<Dato> {
  if (modo === 'auto') return { modo }
  const cap = pista.getCapabilities() as unknown as Record<string, { min?: number; max?: number } | readonly string[] | undefined>
  const rango = (k: string) => cap[k] as { min?: number; max?: number } | undefined
  try {
    let avanzado: Record<string, unknown>
    if (modo === 'corta') {
      const t = rango('exposureTime')
      const iso = rango('iso')
      avanzado = {
        exposureMode: 'manual',
        ...(t ? { exposureTime: Math.min(Math.max(EXPOSICION_CORTA, t.min ?? 0), t.max ?? EXPOSICION_CORTA) } : {}),
        ...(iso ? { iso: Math.min(iso.max ?? 800, 800) } : {}),
      }
    } else {
      await new Promise((r) => setTimeout(r, 1000))
      const s = pista.getSettings() as Record<string, unknown>
      avanzado = { exposureMode: 'manual', focusMode: 'manual' }
      for (const k of ['exposureTime', 'iso', 'focusDistance']) if (typeof s[k] === 'number') avanzado[k] = s[k]
    }
    await pista.applyConstraints({ advanced: [avanzado as MediaTrackConstraintSet] })
    return { modo, pedido: JSON.stringify(avanzado) }
  } catch (e) {
    return { modo, error: mensaje(e) }
  }
}

export interface ResultadoGrabacion {
  readonly archivo: File
  readonly informe: Dato
}

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
    const ajustesAntes = ajustesDeCamara(pistaVideo)
    const exposicion = await aplicarExposicion(pistaVideo, op.exposicion ?? 'auto')

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
    const ajustesDespues = ajustesDeCamara(pistaVideo)
    const cfg = configVideo as VideoEncoderConfig | null
    const analisis = await analizarArchivo(archivo)
    return {
      archivo,
      informe: {
        pedido: `${op.ancho}×${op.alto} a ${op.fps}, códec ${op.codec}`,
        camara: { concedido: `${ancho}×${alto} a ${ajustes.frameRate}`, nombre: pistaVideo.label, ajustesAntes, exposicion, ajustesAlAcabar: ajustesDespues },
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

// ── Marcas de tiempo de captura ───────────────────────────────────────────────────────────────────────────────────

/** Resumen de las marcas de una pista: en qué reloj están y cuánto antes de llegar se capturó cada trozo. */
function resumenMarcas(marcas: readonly (readonly [number, number])[], metadatos: Record<string, number> | null) {
  const retrasos = marcas.map(([ts, llegada]) => (llegada - ts) / 1000).sort((a, b) => a - b)
  const mediana = retrasos[Math.floor(retrasos.length / 2)] ?? NaN
  return {
    trozos: marcas.length,
    // Con el reloj de la página, la marca va unos ms por detrás de la llegada; con otro reloj, miles de segundos.
    mismoRelojQuePerformanceNow: Math.abs(mediana) < 1000,
    retrasoMedianoMs: Math.round(mediana * 10) / 10,
    retrasoMinMs: Math.round(retrasos[0]! * 10) / 10,
    retrasoMaxMs: Math.round(retrasos[retrasos.length - 1]! * 10) / 10,
    ...(metadatos ? { metadatosDelFrame: metadatos } : {}),
  }
}

/**
 * En qué reloj pone Chrome las marcas de captura del vídeo y del audio (fase 4, paso 8). Mediabunny coloca cada pista
 * por cuándo le llega su primer trozo, no por cuándo se capturó: si el primer trozo de audio llega 80 ms tarde, todo el
 * audio queda 80 ms desplazado de la imagen. Para usar las marcas de captura, las dos tienen que poder pasarse a un
 * mismo reloj: aquí se ve, durante 2 s, cada marca frente a `performance.now()` al llegar.
 */
export async function informeMarcas(): Promise<Dato> {
  return intentar(async () => {
    const flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
    })
    try {
      const hasta = performance.now() + 2000
      let primeraLlegada: { video: number | null; audio: number | null } = { video: null, audio: null }
      let metadatos: Record<string, number> | null = null
      const leer = async (pista: MediaStreamTrack, clase: 'video' | 'audio') => {
        const lector = new MediaStreamTrackProcessor({ track: pista }).readable.getReader()
        const marcas: [number, number][] = []
        try {
          while (performance.now() < hasta) {
            const { value, done } = await lector.read()
            if (done || !value) break
            const llegada = performance.now() * 1000
            primeraLlegada = { ...primeraLlegada, [clase]: primeraLlegada[clase] ?? llegada / 1000 }
            marcas.push([value.timestamp, llegada])
            if (clase === 'video' && !metadatos) {
              const m = (value as VideoFrame & { metadata?: () => Record<string, unknown> }).metadata?.()
              if (m) metadatos = Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.round((v as number) * 1000) / 1000]))
              metadatos ??= {}
              metadatos.llegadaMs = Math.round(llegada / 10) / 100
            }
            value.close()
          }
        } finally {
          await lector.cancel().catch(() => {})
        }
        return marcas
      }
      // El aviso de cada frame pintado da su captura en el reloj de la página (si el navegador la da).
      const visor = document.createElement('video')
      visor.muted = true
      visor.playsInline = true
      visor.srcObject = new MediaStream([flujo.getVideoTracks()[0]!.clone()])
      const capturas: number[] = []
      const conAviso = 'requestVideoFrameCallback' in visor
      if (conAviso) {
        const aviso = (_: number, m: VideoFrameCallbackMetadata) => {
          if (typeof m.captureTime === 'number') capturas.push(m.captureTime)
          if (performance.now() < hasta) visor.requestVideoFrameCallback(aviso)
        }
        visor.requestVideoFrameCallback(aviso)
        await visor.play().catch(() => {})
      }
      const [v, a] = await Promise.all([leer(flujo.getVideoTracks()[0]!, 'video'), leer(flujo.getAudioTracks()[0]!, 'audio')])
      visor.pause()
      ;(visor.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      const paso = pasoDeReloj(
        v.map(([ts]) => ts / 1000),
        capturas,
        v.map(([, llegada]) => llegada / 1000),
      )
      // Con el paso, cuánto antes de llegar se capturó cada frame; el audio, si va en el reloj del vídeo (como en la tablet).
      const retraso = (marcas: readonly (readonly [number, number])[]) => {
        if (!paso) return '—'
        const r = marcas.map(([ts, llegada]) => llegada / 1000 - (ts / 1000 - paso.diferenciaMs)).sort((x, y) => x - y)
        return Math.round(r[Math.floor(r.length / 2)]! * 10) / 10
      }
      const audioEnPagina = resumenMarcas(a, null).mismoRelojQuePerformanceNow
      return {
        video: resumenMarcas(v, metadatos),
        audio: resumenMarcas(a, null),
        avisoDeFrame: {
          disponible: conAviso,
          capturas: capturas.length,
          pasoAlRelojDeLaPaginaMs: paso ? Math.round(paso.diferenciaMs * 10) / 10 : '—',
          votos: paso?.votos ?? 0,
          retrasoVideoMs: retraso(v),
          retrasoAudioMs: audioEnPagina ? resumenMarcas(a, null).retrasoMedianoMs : retraso(a),
        },
        primerAudioMenosPrimerVideoAlLlegarMs:
          primeraLlegada.audio !== null && primeraLlegada.video !== null ? Math.round((primeraLlegada.audio - primeraLlegada.video) * 10) / 10 : '—',
      }
    } finally {
      flujo.getTracks().forEach((t) => t.stop())
    }
  })
}
