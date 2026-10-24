import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResultadoAudio } from '../../core/sincronia/audio'
import type { AlWorkerAudio, DelWorkerAudio, FaltaAudio } from '../../workers/protocolo'

export type EstadoAudio =
  | { readonly fase: 'parado' }
  | { readonly fase: 'leyendo'; readonly progreso: number }
  /** El audio dio un desfase (fiable o no: `resultado.fiable`). */
  /** `segundos`: lo que tardó en leer los dos audios y correlacionarlos. */
  | { readonly fase: 'resultado'; readonly resultado: ResultadoAudio; readonly segundos: number }
  /** El audio no da nada: silencio, o los dos audios no se solapan en la ventana. */
  | { readonly fase: 'sinPico' }
  | { readonly fase: 'falta'; readonly faltas: readonly FaltaAudio[] }
  | { readonly fase: 'error'; readonly mensaje: string }

/**
 * La sincronía por audio con su worker (`workers/audio.worker.ts`): se crea al pedirla y se cierra al acabar, al
 * cancelar o al desmontar. Solo propone el desfase: aplicarlo es cosa de quien lo usa.
 */
export function useSincronizarAudio() {
  const [estado, setEstado] = useState<EstadoAudio>({ fase: 'parado' })
  const worker = useRef<Worker | null>(null)

  const cerrar = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
  }, [])
  useEffect(() => cerrar, [cerrar])

  const empezar = (referencia: File, vista: File) => {
    cerrar()
    const w = new Worker(new URL('../../workers/audio.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    setEstado({ fase: 'leyendo', progreso: 0 })
    const inicio = performance.now()
    w.onmessage = (e: MessageEvent<DelWorkerAudio>) => {
      const m = e.data
      if (m.tipo === 'progreso') {
        setEstado({ fase: 'leyendo', progreso: m.fraccion })
        return
      }
      if (m.tipo === 'resultado') setEstado(m.resultado ? { fase: 'resultado', resultado: m.resultado, segundos: (performance.now() - inicio) / 1000 } : { fase: 'sinPico' })
      else if (m.tipo === 'falta') setEstado({ fase: 'falta', faltas: m.faltas })
      else setEstado({ fase: 'error', mensaje: m.mensaje })
      cerrar()
    }
    // Si el worker no llega a cargar (una versión nueva publicada con la app abierta), no llegaría ningún mensaje.
    w.onerror = (ev) => {
      ev.preventDefault()
      setEstado({ fase: 'error', mensaje: ev.message || 'no se ha podido cargar el proceso del audio. Recarga la página.' })
      cerrar()
    }
    w.postMessage({ tipo: 'sincronizar', referencia, vista } satisfies AlWorkerAudio)
  }

  /** Para la lectura (se cierra el worker sin esperar) o descarta el resultado. */
  const descartar = () => {
    cerrar()
    setEstado({ fase: 'parado' })
  }

  return { estado, empezar, descartar }
}
