/// <reference lib="webworker" />
// Sin marcadores con RTMPose (fase 6, experimento `?rtmpose`): recorre el vídeo entero y, en cada frame, el detector de
// personas RTMDet-nano da la caja de la persona y RTMPose (s o m, 26 puntos Halpe26) sus puntos. Mismo protocolo que el
// worker de MediaPipe (`pose.worker.ts`), así que el visor no distingue uno de otro. Todo corre aquí, con ONNX Runtime
// Web (WebGPU si se puede; si no, WASM en CPU); el vídeo no sale del dispositivo.
//
// Los modelos se alojan en el propio sitio (`public/modelos/`, con el hash del original en el nombre). El de RTMPose-m
// (56 MB) va en trozos de 20 MB por el límite de 25 MiB por archivo de Cloudflare, y aquí se juntan. El WASM de ONNX
// Runtime (la variante «jsep», con WebGPU) lo copia Vite de node_modules con `?url`. En CPU usa varios hilos si la página
// está aislada (`crossOriginIsolated`, con las cabeceras COOP/COEP de `_headers`); si no, uno.
//
// El detector de personas no se pasa en cada frame: entre medias, la caja sale de los puntos del frame anterior
// (`cajaDePuntos`), y se vuelve a él cada `DETECTOR_CADA` frames o si se pierde a la persona.
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny'
// La variante sin el cargador del WASM dentro: lo carga de `wasmPaths` (la incluida no sobrevive al empaquetado de Vite:
// «e is not a function»).
import * as ort from '../../node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs'
import cargadorWasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'
import binarioWasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import {
  ALTO_POSE,
  ANCHO_POSE,
  cajaDePuntos,
  cajasDelDetector,
  decodificarSimcc,
  DESV_DETECTOR_BGR,
  DESV_POSE_RGB,
  DETECTOR_CADA,
  elegirPersona,
  escalaDetector,
  GRIS_RELLENO,
  LADO_DETECTOR,
  MEDIA_DETECTOR_BGR,
  MEDIA_POSE_RGB,
  PUNTOS_HALPE26,
  puntosDeHalpe26,
  recorteDeCaja,
  tensorDePixeles,
  type Caja,
} from '../core/pose/rtmpose'
import { crearTablaFrames, indiceDeFrame } from '../core/tiempo/tablaFrames'
import type { AlWorkerPose, DelWorkerPose, FramePoseWorker, TamanoModeloPose } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

/** Lado mayor de la imagen que se recorre: el detector trabaja a 320 y RTMPose a 192 × 256 del recorte de la persona. */
const LADO_MAXIMO = 1280

const enSitio = (ruta: string) => new URL(ruta, self.location.origin).href
const DETECTOR = '/modelos/rtmdet-nano-persona-05d8511e.onnx'
const MODELOS: Partial<Record<TamanoModeloPose, readonly string[]>> = {
  'rtmpose-s': ['/modelos/rtmpose-s-halpe26-7f134165.onnx'],
  'rtmpose-m': [0, 1, 2].map((k) => `/modelos/rtmpose-m-halpe26-4d3e73dd.onnx.parte${k}`),
}

/** Hilos del WASM en CPU: con la página aislada, los núcleos (hasta 4: más no ayuda con modelos tan pequeños); si no, uno. */
const HILOS = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1

let cancelado = false
const enviar = (m: DelWorkerPose) => self.postMessage(m)
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

self.onmessage = (e: MessageEvent<AlWorkerPose>) => {
  const m = e.data
  if (m.tipo === 'cancelar') cancelado = true
  else {
    cancelado = false
    detectar(m).catch((err: unknown) => enviar({ tipo: 'error', mensaje: mensaje(err) }))
  }
}

/** Un modelo, de uno o varios trozos, como bytes. */
async function bajar(rutas: readonly string[]): Promise<Uint8Array> {
  const trozos = await Promise.all(
    rutas.map(async (r) => {
      const res = await fetch(enSitio(r))
      if (!res.ok) throw new Error(`No se ha podido cargar el modelo (${res.status}).`)
      return new Uint8Array(await res.arrayBuffer())
    }),
  )
  const total = trozos.reduce((s, t) => s + t.length, 0)
  const r = new Uint8Array(total)
  let k = 0
  for (const t of trozos) {
    r.set(t, k)
    k += t.length
  }
  return r
}

/** Lo más que se espera a que se prepare cada modelo en la GPU antes de pasar a la CPU (ms). */
const ESPERA_GPU_MS = 30000

async function sesiones(
  modelo: TamanoModeloPose,
  delegado: 'GPU' | 'CPU',
): Promise<{ s: [ort.InferenceSession, ort.InferenceSession]; delegado: 'GPU' | 'CPU'; hilos: number; aviso?: string }> {
  ort.env.wasm.wasmPaths = { mjs: new URL(cargadorWasm, self.location.href).href, wasm: new URL(binarioWasm, self.location.href).href }
  // Solo errores: el aviso de «CPU desconocida» del WASM sale por console.error en cada carga.
  ort.env.logLevel = 'error'
  const rutas = MODELOS[modelo]
  if (!rutas) throw new Error(`Modelo desconocido: ${modelo}`)
  enviar({ tipo: 'cargando', texto: 'descargando los modelos' })
  const [bytesDetector, bytesPose] = await Promise.all([bajar([DETECTOR]), bajar(rutas)])
  const crear = (proveedor: 'webgpu' | 'wasm') =>
    Promise.all([
      ort.InferenceSession.create(bytesDetector, { executionProviders: [proveedor] }),
      ort.InferenceSession.create(bytesPose, { executionProviders: [proveedor] }),
    ])
  // Sin un adaptador de verdad (o si pedirlo no contesta en 3 s, como en un navegador sin GPU), ni se intenta WebGPU.
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  const adaptador = delegado === 'GPU' && gpu ? await Promise.race([gpu.requestAdapter().catch(() => null), new Promise((ok) => setTimeout(() => ok(null), 3000))]) : null
  // Los hilos se fijan antes de arrancar el WASM y no se pueden cambiar después. Con la GPU, uno: WebGPU con varios hilos
  // se quedaba colgado al prepararse en Chrome Android (09-11); si la GPU falla, la CPU va con ese hilo.
  const hilos = adaptador ? 1 : HILOS
  ort.env.wasm.numThreads = hilos
  if (adaptador) {
    enviar({ tipo: 'cargando', texto: 'preparando la GPU' })
    try {
      const s = await Promise.race([
        crear('webgpu'),
        new Promise<never>((_, mal) => setTimeout(() => mal(new Error(`no se ha preparado en ${ESPERA_GPU_MS / 1000} s`)), ESPERA_GPU_MS)),
      ])
      return { s, delegado: 'GPU', hilos }
    } catch (err) {
      enviar({ tipo: 'cargando', texto: 'la GPU no responde: preparando la CPU' })
      return { s: await crear('wasm'), delegado: 'CPU', hilos, aviso: `GPU no disponible: ${mensaje(err)}` }
    }
  }
  enviar({ tipo: 'cargando', texto: `preparando la CPU (${hilos} ${hilos === 1 ? 'hilo' : 'hilos'})` })
  return {
    s: await crear('wasm'),
    delegado: 'CPU',
    hilos,
    ...(delegado === 'GPU' ? { aviso: 'Este navegador no da WebGPU en un worker: va en CPU.' } : {}),
  }
}

async function detectar(m: Extract<AlWorkerPose, { tipo: 'detectar' }>) {
  const inicioCarga = performance.now()
  const { s, delegado, hilos, aviso } = await sesiones(m.modelo, m.delegado)
  const [detector, pose] = s
  enviar({
    tipo: 'listo',
    delegado,
    ...(aviso ? { avisoDelegado: aviso } : {}),
    msCarga: performance.now() - inicioCarga,
    libreria: `onnxruntime-web ${ort.env.versions.web ?? ''}`.trim(),
    ...(delegado === 'CPU' ? { hilos } : {}),
  })
  const paso = Math.max(1, Math.round(m.paso ?? 1))

  const entrada = new Input({ source: new BlobSource(m.archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryVideoTrack()
    if (!pista) throw new Error('El archivo no tiene pista de vídeo.')
    const pts: number[] = []
    for await (const p of new EncodedPacketSink(pista).packets(undefined, undefined, { metadataOnly: true })) pts.push(p.timestamp)
    const tabla = crearTablaFrames(pts)
    const total = tabla.tiempos.length
    // Tamaño del vídeo tal como se ve (rotación aplicada): el de las trayectorias de los gomets.
    const ancho = pista.displayWidth
    const alto = pista.displayHeight
    const k = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto))
    const w = Math.round(ancho * k)
    const h = Math.round(alto * k)
    const sink = new CanvasSink(pista, { width: w, height: h, fit: 'fill', poolSize: 2 })

    const lienzoDet = new OffscreenCanvas(LADO_DETECTOR, LADO_DETECTOR)
    const ctxDet = lienzoDet.getContext('2d', { willReadFrequently: true })!
    const lienzoPose = new OffscreenCanvas(ANCHO_POSE, ALTO_POSE)
    const ctxPose = lienzoPose.getContext('2d', { willReadFrequently: true })!
    const esc = escalaDetector(w, h)

    /** 1. Detector: la imagen reducida sin deformar, arriba a la izquierda, sobre gris; la persona de antes si sigue ahí. */
    const buscarPersona = async (lienzo: OffscreenCanvas | HTMLCanvasElement): Promise<Caja | null> => {
      ctxDet.setTransform(1, 0, 0, 1, 0, 0)
      ctxDet.fillStyle = `rgb(${GRIS_RELLENO},${GRIS_RELLENO},${GRIS_RELLENO})`
      ctxDet.fillRect(0, 0, LADO_DETECTOR, LADO_DETECTOR)
      ctxDet.drawImage(lienzo, 0, 0, w * esc, h * esc)
      const pd = ctxDet.getImageData(0, 0, LADO_DETECTOR, LADO_DETECTOR).data
      const td = new ort.Tensor('float32', tensorDePixeles(pd, LADO_DETECTOR, LADO_DETECTOR, MEDIA_DETECTOR_BGR, DESV_DETECTOR_BGR, true), [1, 3, LADO_DETECTOR, LADO_DETECTOR])
      const rd = await detector.run({ input: td })
      const dets = rd.dets!
      const cajas = cajasDelDetector(dets.data as Float32Array, dets.dims[1] ?? 0, esc)
      for (const v of Object.values(rd)) v.dispose()
      td.dispose()
      return elegirPersona(cajas, anterior)
    }

    let anterior: Caja | null = null
    // La caja que sale de los puntos del frame anterior y cuántos frames se han procesado sin pasar el detector.
    let porPuntos: Caja | null = null
    let sinDetector = 0
    let lote: FramePoseWorker[] = []
    let ultimoEnvio = performance.now()
    let procesados = 0
    const inicio = performance.now()
    const vaciar = (indice: number) => {
      if (lote.length) enviar({ tipo: 'frames', lote, progreso: total > 1 ? indice / (total - 1) : 1 })
      lote = []
      ultimoEnvio = performance.now()
    }

    for await (const frame of sink.canvases()) {
      const indice = indiceDeFrame(tabla, frame.timestamp)
      if (cancelado) {
        vaciar(indice)
        enviar({ tipo: 'fin', motivo: 'cancelado', procesados, msProceso: performance.now() - inicio, recuperados: 0, msAtras: 0 })
        return
      }
      if (indice < 0 || indice % paso !== 0) continue
      const t = tabla.tiempos[indice]!

      let persona: Caja | null
      if (porPuntos && sinDetector < DETECTOR_CADA - 1) {
        persona = porPuntos
        sinDetector++
      } else {
        persona = await buscarPersona(frame.canvas)
        sinDetector = 0
      }
      anterior = persona ?? anterior

      let puntos: number[] | null = null
      porPuntos = null
      if (persona) {
        // 2. RTMPose: el recorte de la persona (fuera de la imagen, negro), en RGB.
        const r = recorteDeCaja(persona)
        ctxPose.setTransform(1, 0, 0, 1, 0, 0)
        ctxPose.fillStyle = '#000'
        ctxPose.fillRect(0, 0, ANCHO_POSE, ALTO_POSE)
        ctxPose.setTransform(1 / r.ax, 0, 0, 1 / r.ay, -r.x0 / r.ax, -r.y0 / r.ay)
        ctxPose.drawImage(frame.canvas, 0, 0)
        const pp = ctxPose.getImageData(0, 0, ANCHO_POSE, ALTO_POSE).data
        const tp = new ort.Tensor('float32', tensorDePixeles(pp, ANCHO_POSE, ALTO_POSE, MEDIA_POSE_RGB, DESV_POSE_RGB, false), [1, 3, ALTO_POSE, ANCHO_POSE])
        const rp = await pose.run({ input: tp })
        const kp = decodificarSimcc(rp.simcc_x!.data as Float32Array, rp.simcc_y!.data as Float32Array, PUNTOS_HALPE26, r)
        for (const v of Object.values(rp)) v.dispose()
        tp.dispose()
        // La caja del frame siguiente, en px del lienzo reducido (antes de pasar los puntos a px del vídeo).
        porPuntos = cajaDePuntos(kp)
        for (let i = 0; i < kp.length; i += 3) {
          kp[i] = kp[i]! / k
          kp[i + 1] = kp[i + 1]! / k
        }
        puntos = puntosDeHalpe26(kp)
      }
      lote.push({ indice, t, puntos })
      procesados++
      if (performance.now() - ultimoEnvio > 100) vaciar(indice)
    }
    vaciar(total - 1)
    enviar({ tipo: 'fin', motivo: 'final', procesados, msProceso: performance.now() - inicio, recuperados: 0, msAtras: 0 })
  } finally {
    entrada.dispose()
    await Promise.all([detector.release(), pose.release()]).catch(() => {})
  }

}
