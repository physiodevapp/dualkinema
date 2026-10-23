import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Altura de un elemento en px, al día cuando cambia de tamaño. La usan las piezas fijas del
 * móvil (la barra de abajo y el vídeo con su gráfica de arriba) para que el resto de la página
 * deje sitio o se pegue justo a su lado. En pantalla ancha, donde no son cajas propias, da 0
 * o lo que mida su contenido: se usa solo bajo `max-lg:`.
 */
export function useAltura<T extends HTMLElement>(externa?: RefObject<T | null>) {
  const propia = useRef<T>(null)
  const ref = externa ?? propia
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAlto(Math.ceil(el.getBoundingClientRect().height))
    medir()
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [ref])
  return [ref, alto] as const
}

/** `true` mientras se cumple la consulta de medios (se actualiza al girar o redimensionar la ventana). */
function useConsulta(consulta: string) {
  const [cumple, setCumple] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const cambiar = () => setCumple(m.matches)
    cambiar()
    m.addEventListener('change', cambiar)
    return () => m.removeEventListener('change', cambiar)
  }, [consulta])
  return cumple
}

/** `true` mientras la ventana tiene al menos `px` de ancho (por defecto 1024, el `lg` de Tailwind). */
export function useAnchoMinimo(px = 1024) {
  return useConsulta(`(min-width: ${px}px)`)
}

/**
 * `true` con el móvil girado: horizontal, de poca altura y con ancho para dos columnas. Alto de hasta 500 px: un móvil
 * girado mide entre 360 y 430; una tablet en horizontal o una ventana de escritorio no entran.
 */
export function useApaisado() {
  return useConsulta('(orientation: landscape) and (max-height: 500px) and (min-width: 600px)')
}
