import { useEffect, useRef } from 'react'
import type { VistaViva } from './vistas'

/** Ancho en pantalla de la miniatura (px). */
const ANCHO_PX = 104

interface Props {
  /** La otra vista (la que no se está marcando). */
  readonly vista: VistaViva
  /** Letra de la vista («A», «B»). */
  readonly etiqueta: string
  /** Su vídeo no tiene imagen en el instante del cursor. */
  readonly fuera: boolean
  readonly onElegir: () => void
}

/**
 * La otra vista en pequeño, con sus marcadores, en el frame que toca según el cursor común. Tocarla la hace la activa.
 * Copia el último frame que decodificó su vista (que no tiene lienzo en pantalla mientras no es la activa).
 */
export default function MiniaturaVista({ vista, etiqueta, fuera, onElegir }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { ancho, alto } = vista.info
  const { mostrado, dibujar, ultimoFrame } = vista
  useEffect(() => {
    const ctx = lienzo.current?.getContext('2d')
    const frame = ultimoFrame.current
    if (!ctx || !frame) return
    ctx.drawImage(frame, 0, 0)
    dibujar(ctx, ancho / ANCHO_PX)
  }, [mostrado, dibujar, ancho, ultimoFrame])
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-label={`Cambiar a la vista ${etiqueta}`}
      title={`Cambiar a la vista ${etiqueta}`}
      data-testid="miniatura-vista"
      data-fuera={fuera}
      className="relative overflow-hidden rounded-md border-2 border-borde bg-black shadow-lg"
      style={{ width: ANCHO_PX }}
    >
      <canvas ref={lienzo} width={ancho} height={alto} className={`block w-full ${fuera ? 'opacity-30' : ''}`} style={{ aspectRatio: `${ancho} / ${alto}` }} />
      <span className="absolute top-0 left-0 rounded-br-md bg-fondo/85 px-1.5 font-mono text-xs text-texto">{etiqueta}</span>
      {fuera && <span className="absolute inset-0 grid place-items-center bg-fondo/50 px-1 text-center text-[0.65rem] leading-tight">Fuera de este vídeo</span>}
    </button>
  )
}
