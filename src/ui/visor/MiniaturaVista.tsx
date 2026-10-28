import { useEffect, useRef, useState } from 'react'
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
  /**
   * Al lado de la activa y del mismo tamaño (pantalla ancha y móvil girado), en vez de en pequeño sobre el vídeo. Con él,
   * el tope de alto del vídeo: la clase de pantalla ancha y, en el móvil, la longitud CSS (los mismos que el de la activa).
   */
  readonly lado?: { readonly topeLg: string; readonly topeMovil?: string }
}

/**
 * La otra vista, con sus marcadores, en el frame que toca según el cursor común: en pequeño sobre el vídeo (móvil en
 * vertical, vídeo grande) o al lado de la activa y del mismo tamaño. Tocarla la hace la activa. Copia el último frame que
 * decodificó su vista (que no tiene lienzo en pantalla mientras no es la activa).
 */
export default function MiniaturaVista({ vista, etiqueta, fuera, onElegir, lado }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { ancho, alto } = vista.info
  const { mostrado, dibujar, ultimoFrame } = vista
  // Ancho en pantalla, para que trazos y círculos midan lo mismo que en el vídeo activo.
  const [anchoPantalla, setAnchoPantalla] = useState(lado ? 0 : ANCHO_PX)
  useEffect(() => {
    const c = lienzo.current
    if (!lado || !c) return
    const obs = new ResizeObserver(() => setAnchoPantalla(c.clientWidth))
    obs.observe(c)
    return () => obs.disconnect()
  }, [lado])
  useEffect(() => {
    const ctx = lienzo.current?.getContext('2d')
    const frame = ultimoFrame.current
    if (!ctx || !frame || anchoPantalla === 0) return
    ctx.drawImage(frame, 0, 0)
    dibujar(ctx, ancho / anchoPantalla)
  }, [mostrado, dibujar, ancho, ultimoFrame, anchoPantalla])
  const nombre = `Cambiar a la vista ${etiqueta}`
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-label={nombre}
      title={nombre}
      data-testid="miniatura-vista"
      data-lado={lado ? 'true' : undefined}
      data-fuera={fuera}
      className={
        lado
          ? 'relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-borde bg-black hover:border-texto-2'
          : 'relative overflow-hidden rounded-md border-2 border-borde bg-black shadow-lg'
      }
      style={lado ? undefined : { width: ANCHO_PX }}
    >
      <canvas
        ref={lienzo}
        width={ancho}
        height={alto}
        className={`block ${lado ? `mx-auto max-w-full max-h-[30dvh] ${lado.topeLg}` : 'w-full'} ${fuera ? 'opacity-30' : ''}`}
        style={{ aspectRatio: `${ancho} / ${alto}`, maxHeight: lado?.topeMovil }}
      />
      <span className={`absolute top-0 left-0 bg-fondo/85 font-mono text-texto ${lado ? 'rounded-br-md px-2 py-0.5 text-sm' : 'rounded-br-md px-1.5 text-xs'}`}>
        {etiqueta}
      </span>
      {fuera && (
        <span className={`absolute inset-0 grid place-items-center bg-fondo/50 px-1 text-center leading-tight ${lado ? 'text-sm' : 'text-[0.65rem]'}`}>
          Fuera de este vídeo
        </span>
      )}
    </button>
  )
}
