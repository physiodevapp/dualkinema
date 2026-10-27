import { useRef } from 'react'
import { bloqueArrastrado, POSICION_DEFECTO, posicionMasCercana, posicionVecina, type PosicionHerramientas } from './repartoHerramientas'
import { DOBLE_TOQUE_MS, MOVER_PX } from './reparto'

interface Props {
  readonly posicion: PosicionHerramientas
  /** Alto del bloque de arriba en cada posición (px). */
  readonly altos: Record<PosicionHerramientas, number>
  /** Posición al soltar (o con el teclado, o con dos toques: la de partida). */
  readonly onPosicion: (p: PosicionHerramientas) => void
  /** Alto del bloque de arriba mientras se arrastra (px), o null al soltar. */
  readonly onArrastre: (alto: number | null) => void
}

const NOMBRES: Readonly<Record<PosicionHerramientas, string>> = {
  plegadas: 'solo las pestañas',
  media: 'herramientas en un 40 %',
  alta: 'herramientas en un 65 %',
  todo: 'solo herramientas',
}

/**
 * Asa entre la gráfica pequeña y las pestañas (móvil, vista mixta). Arrastrarla hacia arriba da más sitio a las
 * herramientas y hacia abajo al vídeo con su gráfica (ver `repartoHerramientas.ts`); al soltar encaja en la posición más
 * cercana y dos toques vuelven a la de partida. Solo el asa bloquea el gesto (`touch-action: none`): dentro de las
 * tarjetas, arrastrar las desplaza.
 */
export default function SeparadorHerramientas({ posicion, altos, onPosicion, onArrastre }: Props) {
  const arrastre = useRef<{ id: number; y0: number; inicio: number; movido: boolean } | null>(null)
  const ultimoToque = useRef(0)

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Repartir el alto entre el vídeo con su gráfica y las herramientas"
      aria-valuetext={NOMBRES[posicion]}
      tabIndex={0}
      data-testid="separador-herramientas"
      data-posicion={posicion}
      className="flex h-6 shrink-0 cursor-row-resize items-center justify-center rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-acento max-lg:order-4"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        arrastre.current = { id: e.pointerId, y0: e.clientY, inicio: altos[posicion], movido: false }
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        const dy = e.clientY - a.y0
        if (!a.movido && Math.abs(dy) < MOVER_PX) return
        a.movido = true
        onArrastre(bloqueArrastrado(a.inicio, dy, altos))
      }}
      onPointerUp={(e) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        arrastre.current = null
        if (a.movido) {
          ultimoToque.current = 0
          onPosicion(posicionMasCercana(bloqueArrastrado(a.inicio, e.clientY - a.y0, altos), altos))
          onArrastre(null)
          return
        }
        // Un toque: dos seguidos vuelven a la posición de partida.
        if (e.timeStamp - ultimoToque.current < DOBLE_TOQUE_MS) {
          ultimoToque.current = 0
          onPosicion(POSICION_DEFECTO)
        } else ultimoToque.current = e.timeStamp
      }}
      onPointerCancel={() => {
        arrastre.current = null
        onArrastre(null)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        onPosicion(posicionVecina(posicion, e.key === 'ArrowUp' ? 1 : -1))
      }}
    >
      <span aria-hidden="true" className="h-1 w-10 rounded-full bg-texto-2/60" />
    </div>
  )
}
