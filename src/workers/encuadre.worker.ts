/// <reference lib="webworker" />
// Comprobar el encuadre (fase 6, asistente de colocación): MediaPipe Pose (el modelo *full*, el que se aloja en el sitio)
// sobre la imagen de la vista previa que manda la sala unas veces por segundo, en modo imagen. La imagen no sale del
// dispositivo. Con la GPU si se puede; si no, en CPU.
import { PoseLandmarker } from '@mediapipe/tasks-vision'
import cargadorWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import binarioWasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import type { AlWorkerEncuadre, DelWorkerEncuadre } from './protocolo'

declare const self: DedicatedWorkerGlobalScope & { ModuleFactory?: unknown }

const fileset = {
  wasmLoaderPath: new URL(cargadorWasm, self.location.href).href,
  wasmBinaryPath: new URL(binarioWasm, self.location.href).href,
}
const MODELO = new URL('/modelos/pose_landmarker_full_float16_1.task', self.location.origin).href
const enviar = (m: DelWorkerEncuadre) => self.postMessage(m)

async function crear(delegate: 'GPU' | 'CPU') {
  const modulo = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as { default?: unknown }
  self.ModuleFactory ??= modulo.default
  return PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELO, delegate }, runningMode: 'IMAGE', numPoses: 1 })
}

const detector: Promise<PoseLandmarker> = crear('GPU').catch(() => crear('CPU'))
detector.then(
  () => enviar({ tipo: 'listo' }),
  (e: unknown) => enviar({ tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }),
)

self.onmessage = async (e: MessageEvent<AlWorkerEncuadre>) => {
  const { imagen } = e.data
  try {
    const d = await detector
    const r = d.detect(imagen)
    const p = r.landmarks[0]
    enviar({ tipo: 'puntos', puntos: p ? p.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility })) : null })
  } catch (err) {
    enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) })
  } finally {
    imagen.close()
  }
}
