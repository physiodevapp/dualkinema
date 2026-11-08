/// <reference lib="webworker" />
// Ajustar el esqueleto a toda la toma (fase 7, paso 3): unos 20–30 ms por frame (Levenberg–Marquardt con 21 incógnitas);
// con unos minutos de vídeo, decenas de segundos. Aquí no bloquea la página y avisa de lo que lleva.
import { ajustarSesion } from '../core/esqueleto/sesion'
import type { AlWorkerEsqueleto, DelWorkerEsqueleto } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<AlWorkerEsqueleto>) => {
  const m = e.data
  const inicio = performance.now()
  const enviar = (r: DelWorkerEsqueleto) => self.postMessage(r)
  try {
    let ultimo = 0
    const resultado = ajustarSesion(m.calibracion, m.a, m.b, m.tr, m.ids, (fraccion) => {
      if (performance.now() - ultimo > 200) {
        ultimo = performance.now()
        enviar({ tipo: 'progreso', fraccion })
      }
      return true
    })
    enviar({ tipo: 'hecho', resultado, ms: performance.now() - inicio })
  } catch (err) {
    enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) })
  }
}
