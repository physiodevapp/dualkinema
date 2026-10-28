import { useLayoutEffect, useState, type RefObject } from 'react'

/** Hueco entre el final del visor y la barra fija (px). */
const MARGEN_BARRA_PX = 8

interface Opciones {
  /** Móvil con la vista mixta: solo entonces el visor ocupa un alto fijo. */
  readonly activo: boolean
  /** La raíz del visor: su borde de arriba (bajo la cabecera) es donde empieza lo disponible. */
  readonly raiz: RefObject<HTMLElement | null>
  readonly altoBarra: number
}

/**
 * Alto disponible para el visor del móvil (px): de bajo la cabecera hasta la barra fija. La página no se desplaza
 * (`useVistaMovil`): el visor ocupa justo ese alto y cada zona se desplaza por dentro. Se mide antes de pintar y al cambiar
 * la ventana (girar el móvil, la barra del navegador); se vuelve arriba por si la página estaba desplazada.
 */
export function useAltoDisponible({ activo, raiz, altoBarra }: Opciones): number {
  const [disponible, setDisponible] = useState(0)
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
  return disponible
}
