import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { anclar, ESTADO_INICIAL, mostrar, siguienteEstado, type EstadoOcultar } from './ocultarAlBajar'

interface Opciones {
  /** Solo en el móvil con la vista mixta; en otro caso el vídeo se ve siempre. */
  readonly activo: boolean
  /** Las tarjetas de la pestaña abierta, para saber si ya han subido hasta la tira de pestañas. */
  readonly tarjetas: RefObject<HTMLElement | null>
  /** Alto de la tira de pestañas con su aire (px): donde acaba cuando sube a lo más alto. */
  readonly altoTira: number
  /** Algo necesita el vídeo a la vista (calibrar tocando los extremos). */
  readonly forzarVisible: boolean
  /** Cambia cuando el vídeo debe volver a verse (otro frame, otra pestaña). */
  readonly reinicio: string
}

/**
 * Oculta el vídeo pegado al bajar por las tarjetas y lo trae al subir (ver `ocultarAlBajar.ts`).
 * Se oculta cuando las tarjetas ya han subido bajo la tira de pestañas (si no, quedaría un hueco vacío).
 *
 * Oculto, el vídeo sale del flujo de la página (el visor lo pone fuera de ella): las tarjetas ganarían su sitio
 * pero la página se acortaría y el contenido saltaría. Se compensa en el mismo fotograma, antes de pintar:
 * se mide cuánto se movió el borde de arriba de las tarjetas y se desplaza la página otro tanto, así lo que se
 * está mirando no se mueve y solo se descubre lo que tapaba el vídeo. Lo mismo al volver.
 *
 * Solo guarda en el estado de React si está oculto o no (cambia pocas veces); la posición de scroll y lo
 * acumulado van en una ref, para no volver a pintar el visor en cada evento de scroll.
 */
export function useOcultarAlBajar({ activo, tarjetas, altoTira, forzarVisible, reinicio }: Opciones) {
  const [oculto, setOculto] = useState(false)
  const estado = useRef<EstadoOcultar>(ESTADO_INICIAL)
  const ultimo = useRef({ altoTira, forzarVisible, oculto })
  useEffect(() => {
    ultimo.current = { altoTira, forzarVisible, oculto }
  }, [altoTira, forzarVisible, oculto])
  // Dónde estaban las tarjetas justo antes de cambiar, para compensar después.
  const antes = useRef<number | null>(null)

  const poner = useCallback(
    (nuevo: boolean) => {
      if (nuevo === ultimo.current.oculto) return
      ultimo.current = { ...ultimo.current, oculto: nuevo }
      antes.current = tarjetas.current?.getBoundingClientRect().top ?? null
      setOculto(nuevo)
    },
    [tarjetas],
  )

  useLayoutEffect(() => {
    if (antes.current === null) return
    const despues = tarjetas.current?.getBoundingClientRect().top
    if (despues !== undefined) window.scrollBy(0, despues - antes.current)
    antes.current = null
    // El salto es nuestro, no del dedo: no cuenta como bajar ni subir.
    estado.current = { ...estado.current, y: window.scrollY, acumulado: 0 }
  }, [oculto, tarjetas])

  useEffect(() => {
    if (!activo) return
    estado.current = { ...ESTADO_INICIAL, y: window.scrollY }
    const alDesplazar = () => {
      const arriba = (tarjetas.current?.getBoundingClientRect().top ?? Infinity) <= ultimo.current.altoTira + 4
      estado.current = siguienteEstado(estado.current, { y: window.scrollY, tarjetasArriba: arriba, forzarVisible: ultimo.current.forzarVisible })
      poner(estado.current.oculto)
    }
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => {
      window.removeEventListener('scroll', alDesplazar)
      // Al dejar de estar activo, el vídeo se ve.
      poner(false)
    }
  }, [activo, tarjetas, poner])

  // Otro frame u otra pestaña (o algo que pide el vídeo): vuelve a verse, sin perder la posición.
  useEffect(() => {
    estado.current = mostrar(estado.current)
    poner(false)
  }, [reinicio, forzarVisible, poner])

  const ver = useCallback(() => {
    estado.current = anclar(estado.current)
    poner(false)
  }, [poner])

  return { oculto: activo && oculto, ver }
}
