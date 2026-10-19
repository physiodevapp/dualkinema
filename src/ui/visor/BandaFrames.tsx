import { useEffect, useRef } from 'react'

export type EstadoFrame = 'vacio' | 'seguido' | 'perdido' | 'manual' | 'interpolado'

const COLOR: Record<EstadoFrame, string> = {
  vacio: 'transparent',
  seguido: '#34d399',
  manual: '#f2a65a',
  interpolado: '#56b4e9',
  perdido: '#f87171',
}
// Si varios frames caen en el mismo píxel, se pinta el estado más importante.
const PRIORIDAD: Record<EstadoFrame, number> = { vacio: 0, seguido: 1, manual: 2, interpolado: 3, perdido: 4 }

/** Franja con el estado de cada frame (seguido, perdido, marcado a mano, interpolado): la pista del deslizador de frames. */
export default function BandaFrames({ estados, className = 'h-2' }: { estados: readonly EstadoFrame[]; className?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = lienzo.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    // Se dibuja con el ancho que tenga: oculta (una vista que no se ve) mide 0 y saldría una franja de un píxel
    // estirada de un solo color. Al mostrarse o cambiar de tamaño, se vuelve a dibujar.
    const dibujar = () => {
      if (c.clientWidth === 0) return
      const ancho = Math.max(1, Math.round(c.clientWidth * devicePixelRatio))
      c.width = ancho
      c.height = 1
      ctx.clearRect(0, 0, ancho, 1)
      const n = estados.length
      for (let px = 0; px < ancho; px++) {
        const desde = Math.floor((px / ancho) * n)
        const hasta = Math.max(desde + 1, Math.floor(((px + 1) / ancho) * n))
        let peor: EstadoFrame = 'vacio'
        for (let i = desde; i < hasta; i++) {
          const e = estados[i] ?? 'vacio'
          if (PRIORIDAD[e] > PRIORIDAD[peor]) peor = e
        }
        ctx.fillStyle = COLOR[peor]
        ctx.fillRect(px, 0, 1, 1)
      }
    }
    dibujar()
    const o = new ResizeObserver(dibujar)
    o.observe(c)
    return () => o.disconnect()
  }, [estados])

  return <canvas ref={lienzo} aria-hidden="true" className={`w-full rounded-full bg-borde/60 ${className}`} />
}
