import { TrashIcon } from '@heroicons/react/24/outline'
import type { IdMarcador, Marcador } from '../../core/modelo/tipos'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'

interface Props {
  /** Marcadores con una marca a mano en el frame mostrado, con su posición en el modelo (el color sale de ella). */
  marcas: readonly { mk: Marcador; k: number }[]
  siguiendo: boolean
  /** Frame mostrado (null mientras se decodifica el primero). */
  frame: number | null
  onQuitar: (id: IdMarcador, frame: number) => void
  claseExtra?: string
}

/** «Quitar la marca a mano: …», uno por marcador: se quita sin tener que elegirlo antes. */
export default function BotonesQuitarManual({ marcas, siguiendo, frame, onQuitar, claseExtra = '' }: Props) {
  if (siguiendo || frame === null) return null
  return (
    <>
      {marcas.map(({ mk, k }) => (
        <button
          key={mk.id}
          type="button"
          onClick={() => onQuitar(mk.id, frame)}
          data-testid={`quitar-manual-${mk.id}`}
          className={`flex items-center gap-2 rounded-md border border-borde px-3 py-2 text-sm text-texto-2 ${claseExtra}`}
        >
          <TrashIcon className="size-4" />
          <span className="size-2.5 rounded-full" style={{ background: COLORES_MARCADOR[k % COLORES_MARCADOR.length] }} />
          Quitar la marca a mano: {nombreCorto(mk.nombre)}
        </button>
      ))}
    </>
  )
}
