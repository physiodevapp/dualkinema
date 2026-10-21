/* eslint-disable react-hooks/preserve-manual-memoization --
 * El compilador de React no puede conservar sus `useCallback` porque dependen de refs de elementos del DOM. Código
 * anterior al refactor. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ALTO_MINI_PX, EXTRA_MAXIMO_PX, extraParaLlenar, siguienteGrande } from './miniGrande'

interface Opciones {
  /** Solo en el móvil con la vista mixta y el vídeo a la vista. */
  readonly activo: boolean
  /** Caja de la gráfica pequeña (la que cambia de alto). */
  readonly caja: RefObject<HTMLElement | null>
  /** Tira de pestañas. */
  readonly tira: RefObject<HTMLElement | null>
  /** Barra fija de abajo. */
  readonly barra: RefObject<HTMLElement | null>
  /** El vídeo con su gráfica (pegado arriba). */
  readonly fijo: RefObject<HTMLElement | null>
  /** Lo más que puede crecer (px); por defecto `EXTRA_MAXIMO_PX`. */
  readonly extraMaximo?: number
}

/**
 * Alto de la minigráfica: grande con la página arriba del todo (llena lo que queda entre la tira de pestañas y la
 * barra fija, así en la primera pantalla no asoma ninguna tarjeta) y de reposo en cuanto se baja (ver `miniGrande.ts`).
 *
 * El alto objetivo se mide con la minigráfica **en reposo** (aunque se esté animando) y la página arriba del todo,
 * así no depende de en qué punto de la transición se mide. Cambiar de alto no mueve el scroll: el anclaje de scroll
 * del navegador lo desactiva el visor (`overflow-anchor`), porque si no «corregiría» el encogimiento y la página
 * volvería sola al principio.
 */
export function useMiniGrande({ activo, caja, tira, barra, fijo, extraMaximo = EXTRA_MAXIMO_PX }: Opciones) {
  const [grande, setGrande] = useState(() => activo && window.scrollY <= 2)
  const [extra, setExtra] = useState(0)
  // Las transiciones empiezan tras la primera medida: al abrir, la gráfica no «crece» desde su alto de reposo.
  const [animable, setAnimable] = useState(false)
  const vivo = useRef({ grande, extra })
  useEffect(() => {
    vivo.current = { grande, extra }
  })

  /** Lo que habría que crecer ahora, medido con la página arriba del todo; null si no se puede medir. */
  const objetivo = useCallback((): number | null => {
    const c = caja.current
    const t = tira.current
    const b = barra.current
    if (!c || !t || !b || window.scrollY > 6) return null
    // Con la gráfica a medio camino, se vuelve al reposo en la cuenta: lo que sobra de su alto actual se resta.
    const bordeTira = t.getBoundingClientRect().bottom + window.scrollY - (c.getBoundingClientRect().height - ALTO_MINI_PX)
    return extraParaLlenar(bordeTira, b.getBoundingClientRect().top, extraMaximo)
  }, [caja, tira, barra, extraMaximo])

  const medir = useCallback(() => {
    const e = objetivo()
    if (e !== null && e !== vivo.current.extra) setExtra(e)
  }, [objetivo])

  // Primera medida antes de pintar; después, al girar el móvil o cambiar el contenido de la página.
  useLayoutEffect(() => {
    if (!activo) return
    medir()
    const raiz = document.documentElement
    raiz.style.overflowAnchor = 'none'
    const id = requestAnimationFrame(() => setAnimable(true))
    window.addEventListener('resize', medir)
    const o = new ResizeObserver(medir)
    o.observe(document.body)
    return () => {
      raiz.style.removeProperty('overflow-anchor')
      cancelAnimationFrame(id)
      window.removeEventListener('resize', medir)
      o.disconnect()
    }
  }, [activo, medir])

  useEffect(() => {
    if (!activo) return
    const alDesplazar = () => {
      const y = window.scrollY
      const antes = vivo.current.grande
      const ahora = siguienteGrande(antes, y)
      if (ahora === antes) return
      // Al volver arriba, con el alto objetivo al día (pudo cambiar la ventana mientras tanto).
      if (ahora) medir()
      setGrande(ahora)
    }
    alDesplazar()
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => window.removeEventListener('scroll', alDesplazar)
  }, [activo, medir])

  const esGrande = activo && grande
  const alto = ALTO_MINI_PX + (esGrande ? extra : 0)

  /**
   * Desplaza la página hasta que la tira de pestañas queda pegada bajo el vídeo con la gráfica en reposo, con las
   * tarjetas debajo. Solo hace algo con la gráfica grande (si no, ya se está mirando lo de debajo).
   */
  const irALasTarjetas = useCallback(() => {
    if (!vivo.current.grande) return
    const c = caja.current
    const t = tira.current
    const f = fijo.current
    if (!c || !t || !f) return
    const sobra = c.getBoundingClientRect().height - ALTO_MINI_PX
    const tiraArriba = t.getBoundingClientRect().top + window.scrollY - sobra
    const altoFijoReposo = f.getBoundingClientRect().height - sobra
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: Math.max(0, tiraArriba - (altoFijoReposo - 1) + 2), behavior: reducido ? 'auto' : 'smooth' })
  }, [caja, tira, fijo])

  return { alto, grande: esGrande, animable, irALasTarjetas }
}
