/// <reference lib="webworker" />
// GaitDynamics (fase 11, paso 4; D9 de docs/plan-fase-11.md): la red de refinado del modelo de Stanford (licencia MIT),
// exportada a ONNX y alojada en el sitio, recorre las ventanas de 1,5 s que prepara el núcleo
// (`core/cinetica/gaitdynamics/preparar.ts`) y devuelve la fuerza y el centro de presiones de cada pie. Todo aquí, con ONNX
// Runtime Web en CPU (la red es pequeña: 2 millones de parámetros); nada sale del dispositivo (la barrera de red va primero).
import '../privacidad/instalar'
import type * as Ort from 'onnxruntime-web'
import cargadorCpu from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import binarioCpu from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import { ENTRADA, SALIDA, VENTANA } from '../core/cinetica/gaitdynamics/normalizador'
import type { AlWorkerGaitDynamics, DelWorkerGaitDynamics } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

/** El modelo, con el comienzo de su sha256 en el nombre (caché larga en `_headers`). */
const MODELO = '/modelos/gaitdynamics-refinamiento-e5ec4e36.onnx'
const HILOS = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1

const enviar = (m: DelWorkerGaitDynamics) => self.postMessage(m)

self.onmessage = (e: MessageEvent<AlWorkerGaitDynamics>) => {
  inferir(e.data).catch((err: unknown) => enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) }))
}

async function inferir(m: AlWorkerGaitDynamics) {
  const inicio = performance.now()
  const ort: typeof Ort = await import('../../node_modules/onnxruntime-web/dist/ort.wasm.min.mjs')
  ort.env.wasm.wasmPaths = { mjs: new URL(cargadorCpu, self.location.href).href, wasm: new URL(binarioCpu, self.location.href).href }
  ort.env.wasm.numThreads = HILOS
  ort.env.logLevel = 'error'
  const res = await fetch(new URL(MODELO, self.location.origin).href)
  if (!res.ok) throw new Error(`No se ha podido cargar el modelo (${res.status}).`)
  const sesion = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'], logSeverityLevel: 3 })
  const nE = ENTRADA.length
  const nS = SALIDA.length
  const salida = new Float32Array(m.ventanas * VENTANA * nS)
  for (let v = 0; v < m.ventanas; v++) {
    const x = new ort.Tensor('float32', m.lote.slice(v * VENTANA * nE, (v + 1) * VENTANA * nE), [1, VENTANA, nE])
    const y = (await sesion.run({ entrada: x })).salida!
    salida.set(y.data as Float32Array, v * VENTANA * nS)
    enviar({ tipo: 'progreso', fraccion: (v + 1) / m.ventanas })
  }
  await sesion.release()
  enviar({ tipo: 'hecho', salida, ms: performance.now() - inicio })
}
