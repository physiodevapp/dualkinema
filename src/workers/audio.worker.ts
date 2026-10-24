/// <reference lib="webworker" />
// Sincronía por audio (fase 3, paso 5): decodifica el audio de los dos vídeos, calcula su envolvente y correlaciona
// (GCC-PHAT). Decodificar un minuto de audio de cada uno es trabajo pesado: por eso va aquí y no en el hilo de la
// interfaz. Cada archivo se lee a trozos desde el File que manda el hilo principal: no sale del dispositivo.
import { desfaseDeAudio } from '../core/sincronia/audio'
import { leerEnvolvente } from '../media/audio'
import type { AlWorkerAudio, DelWorkerAudio, FaltaAudio } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

const enviar = (m: DelWorkerAudio) => self.postMessage(m)

// Para pararlo, el hilo principal cierra el worker (no hay nada a medias que deshacer).
self.onmessage = (e: MessageEvent<AlWorkerAudio>) => {
  sincronizar(e.data).catch((err: unknown) => enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) }))
}

async function sincronizar(m: AlWorkerAudio) {
  // La mitad del progreso para cada vídeo.
  const progreso = (desde: number) => (f: number) => enviar({ tipo: 'progreso', fraccion: desde + f / 2 })
  const ref = await leerEnvolvente(m.referencia, progreso(0))
  const vista = await leerEnvolvente(m.vista, progreso(0.5))

  const faltas: FaltaAudio[] = []
  for (const [cual, l] of [['referencia', ref], ['vista', vista]] as const) {
    if (l.tipo !== 'ok') faltas.push({ cual, motivo: l.tipo, ...(l.tipo === 'sinCodec' ? { codec: l.codec } : {}) })
  }
  if (ref.tipo !== 'ok' || vista.tipo !== 'ok') return enviar({ tipo: 'falta', faltas })
  enviar({ tipo: 'resultado', resultado: desfaseDeAudio(ref.envolvente, vista.envolvente) })
}
