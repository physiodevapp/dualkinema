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

/** Franja bajo el deslizador con el estado de cada frame: seguido, perdido, marcado a mano, interpolado. */
export default function BandaFrames({ estados }: { estados: readonly EstadoFrame[] }) {
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = lienzo.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
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
  }, [estados])

  return <canvas ref={lienzo} aria-hidden="true" className="h-2 w-full rounded-full bg-borde/60" />
}
