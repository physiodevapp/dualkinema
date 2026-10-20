import { useEffect, useRef, useState } from 'react'

/**
 * Altura de un elemento en px, al día cuando cambia de tamaño. La usan las piezas fijas del
 * móvil (la barra de abajo y el vídeo con su gráfica de arriba) para que el resto de la página
 * deje sitio o se pegue justo a su lado. En pantalla ancha, donde no son cajas propias, da 0
 * o lo que mida su contenido: se usa solo bajo `max-lg:`.
 */
export function useAltura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAlto(Math.ceil(el.getBoundingClientRect().height))
    medir()
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return [ref, alto] as const
}

/** `true` mientras la ventana tiene al menos `px` de ancho (por defecto 1024, el `lg` de Tailwind). */
export function useAnchoMinimo(px = 1024) {
  const consulta = `(min-width: ${px}px)`
  const [ancho, setAncho] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const cambiar = () => setAncho(m.matches)
    cambiar()
    m.addEventListener('change', cambiar)
    return () => m.removeEventListener('change', cambiar)
  }, [consulta])
  return ancho
}
