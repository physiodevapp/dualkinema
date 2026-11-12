import { useEffect, useRef, useState, type RefObject } from 'react'
import { igual, revisarEncuadre, VECES, type Encuadre } from '../core/grabacion/encuadre'
import type { AlWorkerEncuadre, DelWorkerEncuadre } from '../workers/protocolo'

/** Cada cuánto se mira la vista previa (ms) y a qué tamaño (lado mayor, px: el modelo la reduce a 256). */
const CADA_MS = 600
const LADO = 480

/**
 * Si la cámara ve a la persona entera (fase 6, asistente de colocación): mientras `activo`, la imagen de la vista previa
 * (`video`) pasa por MediaPipe en un worker (`workers/encuadre.worker.ts`) unas veces por segundo, y el resultado
 * (`core/grabacion/encuadre.ts`) se da por bueno cuando se repite. null mientras no se sabe o sin comprobar.
 */
export function useEncuadre(video: RefObject<HTMLVideoElement | null>, activo: boolean): { readonly encuadre: Encuadre | null; readonly error: string | null } {
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ultimos = useRef<Encuadre[]>([])

  useEffect(() => {
    if (!activo) return
    let ocupado = true // hasta que el modelo esté listo
    let vivo = true
    let w: Worker
    // Con la GPU primero; si el worker se cae al arrancar (no un error normal: eso ya lo resuelve el worker pasando a la
    // CPU), se vuelve a crear una vez directo en CPU.
    const arrancar = (cpu: boolean) => {
      w = new Worker(new URL('../workers/encuadre.worker.ts', import.meta.url), { ...(cpu ? { name: 'cpu' } : {}), type: 'module' })
      ocupado = true
      w.onmessage = (e: MessageEvent<DelWorkerEncuadre>) => {
        if (!vivo) return
        const m = e.data
        ocupado = false
        if (m.tipo === 'error') return setError(m.mensaje)
        if (m.tipo === 'listo') return setError(null)
        if (m.tipo !== 'puntos') return
        setError(null)
        const r = revisarEncuadre(m.puntos)
        const lista = [...ultimos.current, r].slice(-VECES)
        ultimos.current = lista
        if (lista.length === VECES && lista.every((x) => igual(x, r))) setEncuadre((antes) => (igual(antes, r) ? antes : r))
      }
      w.onerror = (ev) => {
        ev.preventDefault()
        if (!vivo) return
        if (!cpu) {
          w.terminate()
          return arrancar(true)
        }
        const donde = ev.filename ? ` (${ev.filename.split('/').pop()}:${ev.lineno})` : ''
        setError(`${ev.message || 'no se ha podido cargar el detector'}${donde}. Recarga la página; si sigue, este móvil no puede comprobarlo`)
      }
    }
    arrancar(false)
    const id = setInterval(() => {
      const v = video.current
      if (ocupado || !v || v.readyState < 2 || !v.videoWidth) return
      const k = Math.min(1, LADO / Math.max(v.videoWidth, v.videoHeight))
      ocupado = true
      createImageBitmap(v, { resizeWidth: Math.round(v.videoWidth * k), resizeHeight: Math.round(v.videoHeight * k) }).then(
        (imagen) => (vivo ? w.postMessage({ tipo: 'imagen', imagen } satisfies AlWorkerEncuadre, [imagen]) : imagen.close()),
        () => {
          ocupado = false
        },
      )
    }, CADA_MS)
    return () => {
      vivo = false
      clearInterval(id)
      w.terminate()
      ultimos.current = []
      setEncuadre(null)
      setError(null)
    }
  }, [activo, video])

  return { encuadre: activo ? encuadre : null, error: activo ? error : null }
}
