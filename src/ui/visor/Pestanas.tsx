import type { ReactNode } from 'react'

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
}

/**
 * Tira de pestañas del visor. Va pegada arriba (sticky) para cambiar de herramienta sin
 * volver al principio de la columna ni de la página. Un punto en el nombre avisa de lo que
 * pide atención en una pestaña que no se está viendo (huecos, escala a rehacer, cero que no
 * parece quieto).
 */
export default function Pestanas({ pestanas, activa, onElegir, className = '' }: Props) {
  return (
    // El contenedor es opaco y llega a los bordes: la tira es redondeada y, sola, dejaría ver por las
    // esquinas y por debajo las tarjetas que se desplazan detrás.
    <div className={`sticky z-20 bg-fondo pb-1.5 max-lg:top-[calc(var(--alto-fijo)-1px)] max-lg:-mx-4 max-lg:px-4 lg:top-0 ${className}`}>
      <div role="tablist" aria-label="Herramientas" className="grid grid-cols-4 gap-1 rounded-2xl border border-borde bg-fondo p-1">
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
    </div>
  )
}

/** Contenido de una pestaña: sigue montado cuando no se ve, para no perder el estado de sus paneles. */
export function PanelPestana({ id, activa, children }: { id: string; activa: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`pestana-${id}`} hidden={!activa} className="flex flex-col gap-4">
      {children}
    </div>
  )
}
