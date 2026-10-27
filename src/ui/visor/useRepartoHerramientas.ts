import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { altosBloque, guardarPosicionHerramientas, leerPosicionHerramientas, type PosicionHerramientas } from './repartoHerramientas'

/** Hueco entre el final del visor y la barra fija (px). */
const MARGEN_BARRA_PX = 8

interface Opciones {
  /** Móvil con la vista mixta: solo entonces el visor ocupa un alto fijo y se reparte. */
  readonly activo: boolean
  /** La raíz del visor: su borde de arriba (bajo la cabecera) es donde empieza lo disponible. */
  readonly raiz: RefObject<HTMLElement | null>
  readonly altoBarra: number
  readonly altoTira: number
}

/**
 * Reparto del móvil entre el bloque de arriba (vídeo y gráfica pequeña) y las herramientas (ver
 * `repartoHerramientas.ts`): el alto disponible (de bajo la cabecera hasta la barra fija; la página no se desplaza), la
 * posición del asa (guardada en este dispositivo), el alto del bloque mientras se arrastra y el que toca en cada momento.
 *
 * `mostrar` cambia la posición sin guardarla: lo usa el visor para desplegar lo que hace falta ver (las tarjetas al tocar
 * una pestaña con las herramientas plegadas, el vídeo cuando hay que tocarlo).
 */
export function useRepartoHerramientas({ activo, raiz, altoBarra, altoTira }: Opciones) {
  const [posicion, setPosicion] = useState<PosicionHerramientas>(leerPosicionHerramientas)
  const [arrastre, setArrastre] = useState<number | null>(null)
  const [disponible, setDisponible] = useState(0)

  // Lo disponible: de la raíz del visor a la barra fija. Se mide antes de pintar y al cambiar la ventana (girar el móvil,
  // la barra del navegador). La página no se desplaza en el móvil (`useVistaMovil`): se vuelve arriba por si lo estaba.
  useLayoutEffect(() => {
    if (!activo) return
    const medir = () => {
      const r = raiz.current
      if (!r) return
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      const arriba = r.getBoundingClientRect().top
      setDisponible(Math.max(0, Math.floor(window.innerHeight - altoBarra - MARGEN_BARRA_PX - arriba)))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [activo, raiz, altoBarra])

  const altos = useMemo(() => altosBloque(disponible, altoTira), [disponible, altoTira])
  const elegir = useCallback((p: PosicionHerramientas) => {
    setPosicion(p)
    guardarPosicionHerramientas(p)
  }, [])

  return {
    disponible,
    posicion,
    altos,
    /** Alto del bloque de arriba ahora (px): el arrastrado o el de la posición. */
    altoBloque: arrastre ?? altos[posicion],
    arrastrando: arrastre !== null,
    setArrastre,
    elegir,
    mostrar: setPosicion,
  }
}
