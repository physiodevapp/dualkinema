import { useCallback, useEffect, useRef, useState } from 'react'
import { limitarIndice } from '../../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../../media/video'

/** Frames que salta Mayús + flecha y los botones dobles. */
export const SALTO = 10

/**
 * Navegación por los frames del vídeo: el lienzo donde se pinta, el frame pedido (`pedido`, el último que se pidió),
 * el deseado (lo mismo, para React) y el mostrado (el que ya está en el lienzo), el pintado «el último gana» (si llegan
 * peticiones mientras se decodifica, se salta a la más reciente), lo que tardó y cómo se leyó el último frame, el sentido
 * de la última navegación y el teclado.
 *
 * `alIr(destino)` se llama en cada `ir`, antes de pintar (el visor quita ahí el error de un toque de otro frame). Debe
 * ser estable (`useCallback`): si cambia, cambian `ir` y `mover`.
 */
export function useNavegacionFrames(video: VideoAbierto, alIr: (destino: number) => void) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { tabla } = video
  const total = tabla.tiempos.length
  const [deseado, setDeseado] = useState(0)
  const [mostrado, setMostrado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msDecodificar, setMsDecodificar] = useState<number | null>(null)
  // Cómo se consiguió el frame: de la caché, siguiendo el decodificador o desde el fotograma clave.
  const [lectura, setLectura] = useState<string | null>(null)
  // El canvas del último frame pintado: de él se leen los píxeles al marcar.
  const ultimoFrame = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null)

  // Pintado «el último gana».
  const pedido = useRef(0)
  const ocupado = useRef(false)
  const pintar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      for (;;) {
        const i = pedido.current
        const inicio = performance.now()
        const frame = await video.frame(i)
        lienzo.current?.getContext('2d')?.drawImage(frame.canvas, 0, 0)
        ultimoFrame.current = frame.canvas
        setMsDecodificar(performance.now() - inicio)
        const l = video.ultimaLectura
        setLectura(!l ? null : l.modo === 'cache' ? 'caché' : l.modo === 'seguido' ? 'seguido' : 'clave')
        setMostrado(i)
        setError(null)
        if (pedido.current === i) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      ocupado.current = false
    }
  }, [video])

  // Primer frame al montar. pintar() solo cambia el estado tras decodificar
  // (asíncrono), no de forma síncrona dentro del efecto.
  useEffect(() => void pintar(), [pintar])

  // Sentido de la última navegación: la estela va por detrás del marcador, hacia los frames
  // de los que se viene (hacia atrás en el tiempo al avanzar, hacia delante al retroceder).
  const [sentido, setSentido] = useState<1 | -1>(1)
  const ir = useCallback(
    (i: number) => {
      const destino = limitarIndice(tabla, i)
      if (destino !== pedido.current) setSentido(destino > pedido.current ? 1 : -1)
      pedido.current = destino
      setDeseado(destino)
      alIr(destino)
      void pintar()
    },
    [tabla, pintar, alIr],
  )
  const mover = useCallback((d: number) => ir(pedido.current + d), [ir])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Las flechas de otro campo son suyas (el corte del filtro, los de texto); las del
      // deslizador de frames, de los botones y de las pestañas mueven el frame.
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('input, select, textarea') && el.getAttribute('aria-label') !== 'Posición en el vídeo') return
      const paso = e.shiftKey ? SALTO : 1
      if (e.key === 'ArrowRight') mover(paso)
      else if (e.key === 'ArrowLeft') mover(-paso)
      else if (e.key === 'Home') ir(0)
      else if (e.key === 'End') ir(total - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mover, ir, total])


  return { lienzo, deseado, mostrado, error, msDecodificar, lectura, ultimoFrame, sentido, ir, mover }
}
