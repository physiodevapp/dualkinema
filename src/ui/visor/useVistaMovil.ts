import { useCallback, useEffect, useState } from 'react'
import type { ModoMiniGrafica } from './MiniGrafica'
import { useAnchoMinimo, useApaisado } from './useAltura'
import { CLAVE_REPARTO, leerReparto, repartoAlVolver, type Reparto } from './reparto'

export type Vista = 'mixta' | 'video' | 'graficas'

/**
 * Cómo se reparte la pantalla: ancho de escritorio o móvil, vista del móvil (la mixta de siempre, el vídeo grande para
 * marcar o solo las gráficas; en pantalla ancha no existe), reparto del alto entre el vídeo y la gráfica pequeña, el modo
 * de esa gráfica (aquí, porque se desmonta en las vistas ampliadas y no puede guardarlo ella) y lo que cuelga de ello en
 * la raíz (`--alto-barra`) y en la página (en el móvil no se desplaza: cada zona lo hace por dentro).
 *
 * El reparto entre el bloque de arriba y las herramientas (`useRepartoHerramientas`) se llama en el visor (depende de
 * refs que se crean allí) y de aquí solo toma `activo`.
 */
export function useVistaMovil({ altoBarra }: { altoBarra: number }) {
  const anchoLg = useAnchoMinimo()
  // Móvil girado: el vídeo grande pasa a dos columnas (el vídeo con todo el alto y, a su lado, marcado y barra fija).
  const girado = useApaisado()
  const apaisado = !anchoLg && girado
  // La página deja debajo el sitio de la barra fija (`--alto-barra`, en la raíz: el pie de página también va debajo y
  // cuelga de `main`, fuera de este componente; con el hueco dentro del visor, el pie quedaba tapado por la barra).
  useEffect(() => {
    document.documentElement.style.setProperty('--alto-barra', `${altoBarra}px`)
    return () => {
      document.documentElement.style.removeProperty('--alto-barra')
    }
  }, [altoBarra])
  // Vista en el móvil: la mixta de siempre, el vídeo grande para marcar o solo las gráficas. En pantalla ancha no existe.
  const [vista, setVista] = useState<Vista>('mixta')
  const enVideo = !anchoLg && vista === 'video'
  const enGraficas = !anchoLg && vista === 'graficas'
  const ampliada = enVideo || enGraficas
  // Reparto del alto entre el vídeo y la gráfica pequeña (móvil, vista mixta): un asa entre los dos lo cambia y la
  // gráfica grande llena lo que quede (ver `reparto.ts`). Se guarda en este dispositivo.
  const [reparto, setReparto] = useState<Reparto>(leerReparto)
  const [altoArrastre, setAltoArrastre] = useState<number | null>(null)
  // Modo de la gráfica pequeña (ángulo, velocidad o ambas): se conserva al ampliar el vídeo o las gráficas y volver.
  const [modoMini, setModoMini] = useState<ModoMiniGrafica>('angulo')
  // Volver de una vista ampliada a la mixta: aterriza en el extremo del que se viene (vídeo grande o gráfica grande) para
  // seguir viendo en grande lo que se estaba mirando. No se guarda: el reparto guardado sigue siendo el elegido a mano.
  const volverDe = useCallback((desde: 'video' | 'graficas') => {
    setReparto(repartoAlVolver(desde))
    setVista('mixta')
  }, [])
  const elegirReparto = useCallback((r: Reparto) => {
    setReparto(r)
    try {
      localStorage.setItem(CLAVE_REPARTO, r)
    } catch {
      // Sin almacenamiento (modo privado): se usa solo esta vez.
    }
  }, [])
  // En el móvil la página no se desplaza: en la mixta, el visor ocupa justo el alto entre la cabecera y la barra fija y
  // cada zona se desplaza por dentro; con una vista ampliada, la de debajo queda quieta.
  useEffect(() => {
    if (anchoLg) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [anchoLg])

  return {
    anchoLg,
    apaisado,
    vista,
    setVista,
    enVideo,
    enGraficas,
    ampliada,
    /** Móvil en vista mixta: cuándo se reparte el alto entre el bloque de arriba y las herramientas. */
    activo: !anchoLg && vista === 'mixta',
    reparto,
    altoArrastre,
    setAltoArrastre,
    modoMini,
    setModoMini,
    elegirReparto,
    volverDe,
  }
}
