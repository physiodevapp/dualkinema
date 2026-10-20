import type { ReactNode, Ref } from 'react'

export interface Pestana {
  id: string
  nombre: string
  /** Algo que mirar en esta pestaña: se ve como un punto cuando no es la abierta. */
  aviso?: string | false
}

interface Props {
  pestanas: readonly Pestana[]
  activa: string
  onElegir: (id: string) => void
  className?: string
  /** Para saber desde fuera si la tira ya está pegada. */
  contenedorRef?: Ref<HTMLDivElement>
  /** Algo que cuelga justo debajo de la tira, pegado a ella (el botón de mostrar el vídeo). */
  debajo?: ReactNode
}

/**
 * Tira de pestañas del visor. Va pegada arriba (sticky) para cambiar de herramienta sin
 * volver al principio de la columna ni de la página. Un punto en el nombre avisa de lo que
 * pide atención en una pestaña que no se está viendo (huecos, escala a rehacer, cero que no
 * parece quieto).
 */
export default function Pestanas({ pestanas, activa, onElegir, className = '', contenedorRef, debajo }: Props) {
  return (
    // El contenedor es opaco y llega a los bordes: así no se ven por las esquinas ni por debajo las tarjetas que se
    // desplazan detrás. En el móvil, sin borde propio (queda la línea del vídeo de arriba) y con un degradado por debajo
    // para que el texto no se corte en seco; en pantalla ancha, con su caja.
    <div
      ref={contenedorRef}
      className={`sticky z-20 bg-fondo pb-1 max-lg:top-[max(0px,calc(var(--alto-fijo)-1px))] max-lg:-mx-4 max-lg:px-4 max-lg:pt-1.5 lg:top-0 ${className} after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-fondo after:to-transparent`}
    >
      <div role="tablist" aria-label="Herramientas" className="grid grid-cols-4 gap-1 bg-fondo p-0 lg:rounded-2xl lg:border lg:border-borde lg:p-1">
        {pestanas.map((p) => {
          const abierta = p.id === activa
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={abierta}
              aria-controls={`panel-${p.id}`}
              data-testid={`pestana-${p.id}`}
              onClick={() => onElegir(p.id)}
              className={`relative flex min-h-10 touch-manipulation items-center justify-center rounded-md px-1 text-sm select-none ${
                abierta ? 'bg-panel text-acento' : 'text-texto-2'
              }`}
            >
              {p.nombre}
              {!abierta && p.aviso && (
                <span
                  role="img"
                  aria-label={p.aviso}
                  title={p.aviso}
                  data-testid={`aviso-pestana-${p.id}`}
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-acento"
                />
              )}
            </button>
          )
        })}
      </div>
      {debajo}
    </div>
  )
}

/**
 * Contenido de una pestaña: sigue montado cuando no se ve, para no perder el estado de sus paneles. En pantalla ancha, sus paneles
 * van dentro de una sola tarjeta (la de `panel-herramientas`, que es la que se desplaza) y se separan con una línea.
 */
export function PanelPestana({ id, activa, children }: { id: string; activa: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`pestana-${id}`} hidden={!activa} className="flex flex-col gap-4 lg:gap-0">
      {children}
    </div>
  )
}
