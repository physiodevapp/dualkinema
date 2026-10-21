import { useRef, useState, type RefObject } from 'react'
import { ALTO_VIDEO_DVH, altoArrastrado, altosVideo, desbordeArrastre, DOBLE_TOQUE_MS, MOVER_PX, repartoMasCercano, repartoVecino, type Reparto } from './reparto'

interface Props {
  readonly reparto: Reparto
  /** Posición al soltar (o con el teclado, o con dos toques: «normal»). */
  readonly onReparto: (r: Reparto) => void
  /** Alto del vídeo mientras se arrastra (px), o null al soltar. */
  readonly onArrastre: (alto: number | null) => void
  /** El lienzo del vídeo, para medir su alto al empezar a arrastrar. */
  readonly lienzo: RefObject<HTMLCanvasElement | null>
  /** Alto / ancho del vídeo: lo más alto que puede verse con el ancho disponible. */
  readonly proporcion: number
  /** Al soltar tras tirar más allá de un extremo: pasa a la vista ampliada (el reparto no cambia). */
  readonly onAmpliar: (vista: 'video' | 'graficas') => void
}

const NOMBRES: Readonly<Record<Reparto, string>> = { grafica: 'gráfica grande', normal: 'reparto de siempre', video: 'vídeo grande' }

/**
 * Asa entre el vídeo y la gráfica pequeña (móvil, vista mixta). Arrastrarla hacia abajo agranda el vídeo y hacia arriba
 * la gráfica (ver `reparto.ts`); al soltar encaja en la posición más cercana y dos toques vuelven al reparto de siempre.
 * Tirando más allá de un extremo, el asa se pone en ámbar con un aviso y, al soltar ahí, se pasa a la vista ampliada
 * (el vídeo grande o solo las gráficas); volviendo atrás sin soltar, no.
 * Solo el asa bloquea el desplazamiento de la página (`touch-action: none`): fuera de ella, arrastrar sigue desplazando.
 */
export default function SeparadorVideo({ reparto, onReparto, onArrastre, lienzo, proporcion, onAmpliar }: Props) {
  const arrastre = useRef<{ id: number; y0: number; inicio: number; altos: Record<Reparto, number>; movido: boolean } | null>(null)
  const ultimoToque = useRef(0)
  const [desborde, setDesborde] = useState<'video' | 'graficas' | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Repartir el alto entre el vídeo y la gráfica"
      // Valor: tope de alto del vídeo en % de la ventana.
      aria-valuenow={ALTO_VIDEO_DVH[reparto]}
      aria-valuemin={ALTO_VIDEO_DVH.grafica}
      aria-valuemax={ALTO_VIDEO_DVH.video}
      aria-valuetext={NOMBRES[reparto]}
      tabIndex={0}
      data-testid="separador-video"
      data-reparto={reparto}
      data-desborde={desborde ?? undefined}
      // Ocupa el hueco entre el vídeo y la gráfica (márgenes negativos): crece la zona que se toca, no la separación.
      className="relative -my-2 flex h-6 shrink-0 cursor-row-resize items-center justify-center rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-acento"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const c = lienzo.current
        if (!c) return
        e.currentTarget.setPointerCapture(e.pointerId)
        // Lo más alto que cabe por el ancho: el del recuadro del vídeo (el lienzo se ajusta dentro) por la proporción.
        const ancho = c.parentElement?.parentElement?.clientWidth ?? c.clientWidth
        arrastre.current = {
          id: e.pointerId,
          y0: e.clientY,
          inicio: c.getBoundingClientRect().height,
          altos: altosVideo(window.innerHeight, ancho * proporcion),
          movido: false,
        }
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        const dy = e.clientY - a.y0
        if (!a.movido && Math.abs(dy) < MOVER_PX) return
        a.movido = true
        onArrastre(altoArrastrado(a.inicio, dy, a.altos))
        const d = desbordeArrastre(a.inicio, dy, a.altos)
        if (d !== desborde) {
          setDesborde(d)
          // Un toque corto al pasar el margen, donde se pueda (Chrome para Android).
          if (d) navigator.vibrate?.(10)
        }
      }}
      onPointerUp={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        arrastre.current = null
        if (a.movido) {
          ultimoToque.current = 0
          setDesborde(null)
          const d = desbordeArrastre(a.inicio, e.clientY - a.y0, a.altos)
          if (d) {
            onArrastre(null)
            onAmpliar(d)
            return
          }
          onReparto(repartoMasCercano(altoArrastrado(a.inicio, e.clientY - a.y0, a.altos), a.altos))
          onArrastre(null)
          return
        }
        // Un toque: dos seguidos vuelven al reparto de siempre.
        if (e.timeStamp - ultimoToque.current < DOBLE_TOQUE_MS) {
          ultimoToque.current = 0
          onReparto('normal')
        } else ultimoToque.current = e.timeStamp
      }}
      onPointerCancel={() => {
        arrastre.current = null
        setDesborde(null)
        onArrastre(null)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        onReparto(repartoVecino(reparto, e.key === 'ArrowDown' ? 1 : -1))
      }}
    >
      <span aria-hidden="true" className={`h-1 w-10 rounded-full ${desborde ? 'bg-acento' : 'bg-texto-2/60'}`} />
      {desborde && (
        // Sobre la gráfica al tirar hacia abajo y sobre el vídeo al tirar hacia arriba: donde va el dedo, no debajo de él.
        <span
          role="status"
          data-testid="aviso-ampliar"
          className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-md border border-acento bg-fondo/90 px-2 py-1 text-xs whitespace-nowrap text-texto ${
            desborde === 'video' ? 'top-full mt-1' : 'bottom-full mb-1'
          }`}
        >
          {desborde === 'video' ? 'Suelta para ampliar el vídeo' : 'Suelta para ver solo las gráficas'}
        </span>
      )}
    </div>
  )
}
