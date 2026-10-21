import { TrashIcon } from '@heroicons/react/24/outline'

interface Props {
  /** Frames (0-based) con una marca a mano posterior al mostrado. */
  frames: readonly number[]
  siguiendo: boolean
  onQuitar: () => void
  /** Texto corto de la tira del vídeo grande; sin ello, el del panel «Marcar». */
  compacto?: boolean
}

/**
 * Marcas a mano más adelante: «Seguir desde aquí» las toma como anclas y sigue desde ellas. Una marca de prueba o puesta
 * «a ojo» lejos del gomet hace que el seguimiento lo pierda desde ahí (frames en rojo hasta el final): se avisa antes.
 */
export default function AvisoAnclas({ frames, siguiendo, onQuitar, compacto }: Props) {
  if (siguiendo || frames.length === 0) return null
  const lista = frames.slice(0, 3).map((i) => i + 1).join(', ') + (frames.length > 3 ? ` y ${frames.length - 3} más` : '')
  return (
    <div className="flex flex-col gap-2 rounded-md border border-acento/50 p-2 text-xs" data-testid="aviso-anclas">
      <p>
        {compacto
          ? `Hay marcas a mano más adelante (frames ${lista}): se usan como anclas.`
          : `Hay marcas a mano más adelante (frames ${lista}). «Seguir desde aquí» las toma como ciertas y sigue desde ellas: si eran de prueba o están lejos del gomet, el seguimiento lo puede perder desde ahí.`}
      </p>
      <button
        type="button"
        onClick={onQuitar}
        className="flex items-center justify-center gap-2 self-start rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
      >
        <TrashIcon className="size-4" /> Quitar las marcas a mano posteriores
      </button>
    </div>
  )
}
