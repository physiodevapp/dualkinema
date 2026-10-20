import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { anclar, ESTADO_INICIAL, mostrar, siguienteEstado, type EstadoOcultar } from './ocultarAlBajar'

/** Lo que dura el deslizamiento de las pestañas y el fundido del vídeo (el vídeo lo hace con CSS: `duration-200`). */
const DURACION_MS = 200

interface Opciones {
  /** Solo en el móvil con la vista mixta; en otro caso el vídeo se ve siempre. */
  readonly activo: boolean
  /** Las tarjetas de la pestaña abierta, para saber si ya han subido hasta la tira de pestañas. */
  readonly tarjetas: RefObject<HTMLElement | null>
  /** La tira de pestañas: al ocultar o volver el vídeo cambia de sitio y se desliza en vez de saltar. */
  readonly tira: RefObject<HTMLElement | null>
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
export function useOcultarAlBajar({ activo, tarjetas, tira, altoTira, forzarVisible, reinicio }: Opciones) {
  const [oculto, setOculto] = useState(false)
  const estado = useRef<EstadoOcultar>(ESTADO_INICIAL)
  const ultimo = useRef({ altoTira, forzarVisible, oculto })
  useEffect(() => {
    ultimo.current = { altoTira, forzarVisible, oculto }
  }, [altoTira, forzarVisible, oculto])
  // Dónde estaban las tarjetas y la tira justo antes de cambiar, para compensar y deslizar después.
  const antes = useRef<{ tarjetas: number; tira: number } | null>(null)

  const poner = useCallback(
    (nuevo: boolean) => {
      if (nuevo === ultimo.current.oculto) return
      ultimo.current = { ...ultimo.current, oculto: nuevo }
      const t = tarjetas.current?.getBoundingClientRect().top
      antes.current = t === undefined ? null : { tarjetas: t, tira: tira.current?.getBoundingClientRect().top ?? 0 }
      setOculto(nuevo)
    },
    [tarjetas, tira],
  )

  useLayoutEffect(() => {
    if (antes.current === null) return
    const despues = tarjetas.current?.getBoundingClientRect().top
    if (despues !== undefined) window.scrollBy(0, despues - antes.current.tarjetas)
    // El salto es nuestro, no del dedo: no cuenta como bajar ni subir.
    estado.current = { ...estado.current, y: window.scrollY, acumulado: 0 }
    // La tira de pestañas cambia de sitio (sube a lo más alto o baja bajo el vídeo): en vez de saltar, parte de
    // donde estaba y se desliza (FLIP). Las tarjetas ya no se mueven: se compensó arriba.
    const el = tira.current
    const desde = antes.current.tira
    antes.current = null
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const delta = desde - el.getBoundingClientRect().top
    if (Math.abs(delta) > 1) el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: DURACION_MS, easing: 'ease-out' })
  }, [oculto, tarjetas, tira])

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
