import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline'
import type { IdMarcador } from '../../core/modelo/tipos'

interface Props {
  activa: boolean
  onActiva: (v: boolean) => void
  marcadores: readonly { readonly id: IdMarcador; readonly nombre: string; readonly color: string }[]
  /** Marcadores con trayectoria a la vista. */
  elegidos: ReadonlySet<IdMarcador>
  onElegir: (id: IdMarcador) => void
}

/** Interruptor de la trayectoria completa sobre el vídeo y qué marcadores la muestran. */
export default function ControlTrayectoria({ activa, onActiva, marcadores, elegidos, onElegir }: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-borde pt-3">
      <button
        type="button"
        aria-pressed={activa}
        onClick={() => onActiva(!activa)}
        className={`flex items-center gap-2 self-start rounded-md border px-3 py-2 text-sm ${activa ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
      >
        <ArrowTrendingUpIcon className="size-4" /> Trayectoria completa
      </button>
      {activa && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Marcadores con trayectoria">
            {marcadores.map((m) => {
              const elegido = elegidos.has(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={elegido}
                  data-testid={`trayectoria-${m.id}`}
                  onClick={() => onElegir(m.id)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${elegido ? 'border-borde text-texto' : 'border-borde/60 text-texto-2 opacity-60'}`}
                >
                  <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.nombre}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-texto-2">
            Con lo filtrado; cortada en los huecos y a trazos en lo interpolado. Es el recorrido en la imagen: solo equivale al
            recorrido real de lo que se mueve en el plano de la cámara.
          </p>
        </>
      )}
    </div>
  )
}
