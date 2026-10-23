interface Props {
  activo: boolean
  deshabilitado: boolean
  onCambiar: () => void
  /** Va en una fila con «Seguir desde aquí» (móvil girado): texto corto («A ojo») y sin ensancharse; el nombre accesible no cambia. */
  enFila?: boolean
}

/** «Colocar a ojo»: cada toque deja el marcador justo donde se suelta el dedo, sin buscar el gomet. */
export default function InterruptorAOjo({ activo, deshabilitado, onCambiar, enFila }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={onCambiar}
      aria-label={enFila ? 'Colocar a ojo' : undefined}
      data-testid="colocar-a-ojo"
      title="Cada toque deja el marcador justo donde sueltas el dedo, sin buscar el gomet (gomet tapado o movido)"
      className={`${enFila ? 'flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 text-sm' : 'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'} disabled:opacity-50 ${activo ? 'border-acento text-acento' : 'border-borde text-texto-2'}`}
    >
      <span>{enFila ? 'A ojo' : 'Colocar a ojo'}</span>
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full border ${activo ? 'border-acento bg-acento/30' : 'border-borde bg-fondo'}`}>
        <span className={`absolute top-0.5 size-3.5 rounded-full transition-[left] motion-reduce:transition-none ${activo ? 'left-[1.1rem] bg-acento' : 'left-0.5 bg-texto-2'}`} />
      </span>
    </button>
  )
}
