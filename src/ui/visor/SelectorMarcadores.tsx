import type { IdMarcador, Marcador } from '../../core/modelo/tipos'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'

interface Props {
  marcadores: readonly Marcador[]
  /** Estado de cada marcador en el frame mostrado («seguido», «a mano», «interpolado», «perdido» o «—»), en el orden de `marcadores`. */
  estados: readonly string[]
  seleccionado: IdMarcador | null
  siguiendo: boolean
  onElegir: (id: IdMarcador | null) => void
  /** Versión de la tira del vídeo grande (botones más bajos); sin ella, la del panel «Marcar». */
  compacto?: boolean
}

/** Los marcadores del modelo como botones de radio: elegir el que se coloca al tocar el vídeo. */
export default function SelectorMarcadores({ marcadores, estados, seleccionado, siguiendo, onElegir, compacto }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Marcador a colocar">
      {marcadores.map((mk, k) => {
        const estado = estados[k]
        const activo = seleccionado === mk.id
        return (
          <button
            key={mk.id}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={siguiendo}
            onClick={() => onElegir(activo ? null : mk.id)}
            title={mk.nombre}
            className={`${compacto ? 'flex flex-col items-center rounded-md border px-1 py-1.5 text-sm' : 'flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-sm'} disabled:opacity-50 ${activo ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
          >
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: COLORES_MARCADOR[k % COLORES_MARCADOR.length] }} />
              {nombreCorto(mk.nombre)}
            </span>
            <span className={`font-mono text-xs ${estado === 'perdido' ? 'text-red-300' : ''}`}>{estado}</span>
          </button>
        )
      })}
    </div>
  )
}
