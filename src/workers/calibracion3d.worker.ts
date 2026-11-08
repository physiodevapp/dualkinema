/// <reference lib="webworker" />
// Calibrar en 3D (fase 6, paso 3): el ajuste de haces con unos cientos de instantes son unos miles de incógnitas y tarda
// unos segundos; aquí no bloquea la página. Recibe las correspondencias ya emparejadas (`core/tresd/correspondencias.ts`).
import { calibrar3D } from '../core/tresd/calibracion3d'
import type { AlWorkerCalibracion3D, DelWorkerCalibracion3D } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<AlWorkerCalibracion3D>) => {
  const inicio = performance.now()
  let r: DelWorkerCalibracion3D
  try {
    r = { tipo: 'hecho', calibracion: calibrar3D(e.data.entrada), ms: performance.now() - inicio }
  } catch (err) {
    r = { tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(r)
}
