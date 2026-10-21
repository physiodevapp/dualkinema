import { useRef, useState } from 'react'
import { desplazamientoAsa, pasaParaVolver } from './reparto'

interface Props {
  /** Hacia dónde hay que tirar: arriba en el vídeo grande, abajo en solo gráficas (lo contrario de lo que se hizo para entrar). */
  readonly sentido: 'arriba' | 'abajo'
  /** Texto del aviso y nombre accesible, p. ej. «volver a la vista con gráfica». */
  readonly destino: string
  readonly onVolver: () => void
  readonly testid: string
}

/**
 * Asa de una vista ampliada (móvil): tirar de ella `VOLVER_PX` en el sentido contrario al de entrar y soltar vuelve a la
 * vista mixta. Va aparte (no sobre el vídeo ni las gráficas) porque en el vídeo grande los toques sirven para marcar. Solo
 * el asa lleva `touch-action: none`. Un toque no hace nada: el botón de la esquina y Intro/Espacio siguen ahí.
 */
export default function AsaVolver({ sentido, destino, onVolver, testid }: Props) {
  const arrastre = useRef<{ id: number; y0: number } | null>(null)
  const [dy, setDy] = useState(0)
  const listo = pasaParaVolver(dy, sentido)

  const soltar = () => {
    arrastre.current = null
    setDy(0)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Tira para ${destino}`}
      data-testid={testid}
      data-listo={listo || undefined}
      className="relative flex h-6 shrink-0 cursor-row-resize items-center justify-center rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-acento"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        arrastre.current = { id: e.pointerId, y0: e.clientY }
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        const nuevo = e.clientY - a.y0
        const ya = pasaParaVolver(dy, sentido)
        setDy(nuevo)
        // Un toque corto al pasar el margen, donde se pueda (Chrome para Android).
        if (!ya && pasaParaVolver(nuevo, sentido)) navigator.vibrate?.(10)
      }}
      onPointerUp={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        const vuelve = pasaParaVolver(e.clientY - a.y0, sentido)
        soltar()
        if (vuelve) onVolver()
      }}
      onPointerCancel={soltar}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onVolver()
      }}
    >
      <span
        aria-hidden="true"
        className={`h-1 w-10 rounded-full ${listo ? 'bg-acento' : 'bg-texto-2/60'}`}
        style={{ transform: `translateY(${desplazamientoAsa(dy, sentido)}px)` }}
      />
      {listo && (
        <span
          role="status"
          data-testid={`${testid}-aviso`}
          className="aparece pointer-events-none absolute top-full left-1/2 z-20 mt-1 -translate-x-1/2 rounded-md border border-acento bg-fondo/90 px-2 py-1 text-xs whitespace-nowrap text-texto"
        >
          Suelta para {destino}
        </span>
      )}
    </div>
  )
}
