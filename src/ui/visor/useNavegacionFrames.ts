import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
 *
 * Con varias vistas solo la `activa` responde al teclado. Y cada vez que un lienzo nuevo se monta (al pasar a ser la
 * activa, o al volver a montarse el visor con otra vista más) recibe el último frame: un canvas nace en blanco, y mientras
 * esta vista no tenía lienzo en pantalla los frames solo se guardaban en `ultimoFrame`.
 */
export function useNavegacionFrames(video: VideoAbierto, alIr: (destino: number) => void, activa = true) {
  // El último frame pintado: de él se leen los píxeles al marcar, y con él se pinta un lienzo recién montado.
  const ultimoFrame = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null)
  // `ref` del canvas del visor. Al engancharse uno nuevo (el visor lo vuelve a montar al cambiar de vista o de número de
  // vistas) se le pinta el último frame, que si no quedaría en blanco hasta el siguiente cambio de frame.
  const elemento = useRef<HTMLCanvasElement | null>(null)
  const lienzo = useMemo(
    () => ({
      get current() {
        return elemento.current
      },
      set current(c: HTMLCanvasElement | null) {
        elemento.current = c
        if (c && ultimoFrame.current) c.getContext('2d')?.drawImage(ultimoFrame.current, 0, 0)
      },
    }),
    [],
  )
  const { tabla } = video
  const total = tabla.tiempos.length
  const [deseado, setDeseado] = useState(0)
  const [mostrado, setMostrado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msDecodificar, setMsDecodificar] = useState<number | null>(null)
  // Cómo se consiguió el frame: de la caché, siguiendo el decodificador o desde el fotograma clave.
  const [lectura, setLectura] = useState<string | null>(null)

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
  }, [video, lienzo])

  // Primer frame al montar. pintar() solo cambia el estado tras decodificar
  // (asíncrono), no de forma síncrona dentro del efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Mientras se sigue o se detecta (fase 5), la navegación del usuario queda en pausa: pintar frames para mirarlos compite
  // con el worker por el decodificador y lo frena. Aquí solo el teclado; el resto de controles los deshabilita el visor.
  const bloqueo = useRef(false)
  const bloquear = useCallback((b: boolean) => {
    bloqueo.current = b
  }, [])

  useEffect(() => {
    if (!activa) return
    const tecla = (e: KeyboardEvent) => {
      if (bloqueo.current) return
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
  }, [mover, ir, total, activa])


  return { lienzo, deseado, mostrado, error, msDecodificar, lectura, ultimoFrame, sentido, ir, mover, bloquear }
}
