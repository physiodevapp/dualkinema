export interface OpcionVista {
  readonly id: string
  /** «A», «B»… */
  readonly letra: string
  /** Cómo se ve a la persona, para el nombre accesible («de perfil», «de frente»). */
  readonly descripcion: string
}

interface Props {
  readonly vistas: readonly OpcionVista[]
  readonly activa: string
  readonly onElegir: (id: string) => void
}

/** A / B junto al vídeo: qué vista se marca y se sigue. La otra queda en la miniatura. */
export default function ConmutadorVista({ vistas, activa, onElegir }: Props) {
  return (
    <div role="group" aria-label="Vista que se marca" data-testid="conmutador-vista" className="flex overflow-hidden rounded-md border border-borde bg-fondo/85">
      {vistas.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={v.id === activa}
          aria-label={`Vista ${v.letra} (${v.descripcion})`}
          title={`Vista ${v.letra} (${v.descripcion})`}
          data-testid={`vista-${v.letra}`}
          onClick={() => onElegir(v.id)}
          className={`size-9 font-mono text-sm ${v.id === activa ? 'bg-acento text-fondo' : 'text-texto'}`}
        >
          {v.letra}
        </button>
      ))}
    </div>
  )
}
