/// <reference lib="webworker" />
// La cara (fase 10, modo «Cervical»): recorre el vídeo entero y pasa cada frame por MediaPipe Face Landmarker, en modo
// vídeo y con el tiempo del vídeo de cada frame. De cada frame se manda solo la matriz de transformación de la cara (su
// giro y posición respecto a la cámara); los 478 puntos no salen del worker. El archivo no sale del dispositivo y el
// modelo se aloja en el sitio (`public/modelos/`, con la versión en el nombre). Barrera de red antes que nada (D1).
import '../privacidad/instalar'
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import cargadorWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import binarioWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import { crearTablaFrames, indiceDeFrame } from '../core/tiempo/tablaFrames'
import type { AlWorkerCara, DelWorkerCara, FrameCaraWorker } from './protocolo'

declare const self: DedicatedWorkerGlobalScope & { ModuleFactory?: unknown }

/** Lado mayor de la imagen que recibe el modelo: el detector de caras la reduce, pero la cara tiene que ocupar algo. */
const LADO_MAXIMO = 1280
const MODELO = new URL('/modelos/face_landmarker_float16_1.task', self.location.origin).href

let cancelado = false
const enviar = (m: DelWorkerCara) => self.postMessage(m)
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

self.onmessage = (e: MessageEvent<AlWorkerCara>) => {
  const m = e.data
  if (m.tipo === 'cancelar') cancelado = true
  else {
    cancelado = false
    detectar(m).catch((err: unknown) => enviar({ tipo: 'error', mensaje: mensaje(err) }))
  }
}

const fileset = {
  wasmLoaderPath: new URL(cargadorWasm, self.location.href).href,
  wasmBinaryPath: new URL(binarioWasm, self.location.href).href,
}

/** Como en el worker sin marcadores: el cargador del WASM se vuelve a poner a mano para un segundo intento. */
async function crearDetector(delegado: 'GPU' | 'CPU') {
  const modulo = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as { default?: unknown }
  self.ModuleFactory ??= modulo.default
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODELO, delegate: delegado },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  })
}

async function detectar(m: Extract<AlWorkerCara, { tipo: 'detectar' }>) {
  const inicioCarga = performance.now()
  let delegado = m.delegado
  let avisoDelegado: string | undefined
  let detector: FaceLandmarker
  try {
    detector = await crearDetector(delegado)
  } catch (err) {
    if (delegado !== 'GPU') throw err
    avisoDelegado = `GPU no disponible: ${mensaje(err)}`
    delegado = 'CPU'
    detector = await crearDetector(delegado)
  }
  enviar({ tipo: 'listo', delegado, avisoDelegado, msCarga: performance.now() - inicioCarga })
  const entrada = new Input({ source: new BlobSource(m.archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryVideoTrack()
    if (!pista) throw new Error('El archivo no tiene pista de vídeo.')
    const pts: number[] = []
    for await (const p of new EncodedPacketSink(pista).packets(undefined, undefined, { metadataOnly: true })) pts.push(p.timestamp)
    const tabla = crearTablaFrames(pts)
    const total = tabla.tiempos.length
    const k = Math.min(1, LADO_MAXIMO / Math.max(pista.displayWidth, pista.displayHeight))
    const sink = new CanvasSink(pista, { width: Math.round(pista.displayWidth * k), height: Math.round(pista.displayHeight * k), fit: 'fill', poolSize: 2 })
    const t0 = tabla.tiempos[0] ?? 0
    let ultimoMs = -Infinity
    let lote: FrameCaraWorker[] = []
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
        enviar({ tipo: 'fin', motivo: 'cancelado', procesados, msProceso: performance.now() - inicio })
        return
      }
      if (indice < 0) continue
      const t = tabla.tiempos[indice]!
      let ms = (t - t0) * 1000
      if (!(ms > ultimoMs)) ms = ultimoMs + 0.001
      ultimoMs = ms
      let resultado: ReturnType<FaceLandmarker['detectForVideo']>
      try {
        resultado = detector.detectForVideo(frame.canvas, ms)
      } catch (err) {
        if (delegado !== 'GPU' || procesados > 0) throw err
        detector.close()
        avisoDelegado = `GPU falló al detectar: ${mensaje(err)}`
        delegado = 'CPU'
        detector = await crearDetector(delegado)
        enviar({ tipo: 'listo', delegado, avisoDelegado, msCarga: performance.now() - inicioCarga })
        resultado = detector.detectForVideo(frame.canvas, ms)
      }
      const matriz = resultado.facialTransformationMatrixes?.[0]?.data
      lote.push({ indice, t, matriz: matriz && resultado.faceLandmarks.length ? Array.from(matriz) : null })
      procesados++
      if (performance.now() - ultimoEnvio > 150) {
        vaciar(indice)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vaciar(total - 1)
    enviar({ tipo: 'fin', motivo: 'final', procesados, msProceso: performance.now() - inicio })
  } finally {
    detector.close()
    entrada.dispose()
  }
}
