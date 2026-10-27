/// <reference lib="webworker" />
// Sin marcadores (fase 5, paso 1): recorre el vídeo entero y pasa cada frame por MediaPipe Pose Landmarker, en modo
// vídeo y con el tiempo del vídeo de cada frame (nunca un reloj). El archivo no sale del dispositivo: se lee a trozos
// desde el File que manda el hilo principal y el modelo corre aquí.
//
// El WASM de MediaPipe se aloja en el propio sitio (lo copia Vite de node_modules con `?url`): la variante «module», que
// en un worker de módulo se carga con `import()`. El modelo (.task) se descarga de Google al empezar (D2 del plan:
// decidir en el paso 3 si se aloja también; el «heavy», 30 MB, no cabe en el límite por archivo de Cloudflare). Solo se
// descarga el modelo: no se envía nada.
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny'
import { PoseLandmarker } from '@mediapipe/tasks-vision'
import cargadorWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import binarioWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import { puntosDeLandmarks } from '../core/pose/puntos'
import { crearTablaFrames, indiceDeFrame } from '../core/tiempo/tablaFrames'
import type { AlWorkerPose, DelWorkerPose, FramePoseWorker, TamanoModeloPose } from './protocolo'

declare const self: DedicatedWorkerGlobalScope & { ModuleFactory?: unknown }

/** Lado mayor de la imagen que recibe el modelo: él la reduce a 256 px; pasarle 1080p o 4K solo cuesta más. */
const LADO_MAXIMO = 960

const urlModelo = (m: TamanoModeloPose) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`

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

const fileset = {
  wasmLoaderPath: new URL(cargadorWasm, self.location.href).href,
  wasmBinaryPath: new URL(binarioWasm, self.location.href).href,
}

/**
 * Crea el detector. MediaPipe toma el cargador del WASM de `self.ModuleFactory`, que el módulo deja al evaluarse la
 * primera vez y MediaPipe borra tras usarlo: para un segundo intento (GPU que falla → CPU) se vuelve a poner a mano.
 */
async function crearDetector(modelo: TamanoModeloPose, delegado: 'GPU' | 'CPU') {
  const modulo = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as { default?: unknown }
  self.ModuleFactory ??= modulo.default
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: urlModelo(modelo), delegate: delegado },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

async function detectar(m: Extract<AlWorkerPose, { tipo: 'detectar' }>) {
  const inicioCarga = performance.now()
  let detector: PoseLandmarker
  let delegado = m.delegado
  let avisoDelegado: string | undefined
  try {
    detector = await crearDetector(m.modelo, delegado)
  } catch (err) {
    if (delegado !== 'GPU') throw err
    avisoDelegado = `GPU no disponible: ${mensaje(err)}`
    delegado = 'CPU'
    detector = await crearDetector(m.modelo, delegado)
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
    // Tamaño del vídeo tal como se ve (rotación aplicada): el de las trayectorias de los gomets.
    const ancho = pista.displayWidth
    const alto = pista.displayHeight
    const k = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto))
    const sink = new CanvasSink(pista, { width: Math.round(ancho * k), height: Math.round(alto * k), fit: 'fill', poolSize: 2 })

    const t0 = tabla.tiempos[0] ?? 0
    let ultimoMs = -Infinity
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
        enviar({ tipo: 'fin', motivo: 'cancelado', procesados, msProceso: performance.now() - inicio })
        return
      }
      const t = tabla.tiempos[indice]!
      // Modo vídeo: el tiempo de cada frame tiene que crecer (en ms desde el primero; MediaPipe lo lleva a µs).
      let ms = (t - t0) * 1000
      if (!(ms > ultimoMs)) ms = ultimoMs + 0.001
      ultimoMs = ms
      let resultado: ReturnType<PoseLandmarker['detectForVideo']>
      try {
        resultado = detector.detectForVideo(frame.canvas, ms)
      } catch (err) {
        // La GPU puede fallar al primer frame aunque el detector se haya creado: se repite en CPU desde el principio.
        if (delegado !== 'GPU' || procesados > 0) throw err
        detector.close()
        avisoDelegado = `GPU falló al detectar: ${mensaje(err)}`
        delegado = 'CPU'
        detector = await crearDetector(m.modelo, delegado)
        enviar({ tipo: 'listo', delegado, avisoDelegado, msCarga: performance.now() - inicioCarga })
        resultado = detector.detectForVideo(frame.canvas, ms)
      }
      const puntos = resultado.landmarks[0]
      lote.push({ indice, t, puntos: puntos ? puntosDeLandmarks(puntos, ancho, alto) : null })
      resultado.close()
      procesados++
      if (performance.now() - ultimoEnvio > 150) {
        vaciar(indice)
        // Deja que llegue un posible «cancelar».
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vaciar(total - 1)
    enviar({ tipo: 'fin', motivo: 'final', procesados, msProceso: performance.now() - inicio })
  } finally {
    entrada.dispose()
    detector.close()
  }
}
