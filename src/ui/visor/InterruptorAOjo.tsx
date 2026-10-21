interface Props {
  activo: boolean
  deshabilitado: boolean
  onCambiar: () => void
}

/** «Colocar a ojo»: cada toque deja el marcador justo donde se suelta el dedo, sin buscar el gomet. */
export default function InterruptorAOjo({ activo, deshabilitado, onCambiar }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={onCambiar}
      data-testid="colocar-a-ojo"
      title="Cada toque deja el marcador justo donde sueltas el dedo, sin buscar el gomet (gomet tapado o movido)"
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50 ${activo ? 'border-acento text-acento' : 'border-borde text-texto-2'}`}
    >
      <span>Colocar a ojo</span>
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full border ${activo ? 'border-acento bg-acento/30' : 'border-borde bg-fondo'}`}>
        <span className={`absolute top-0.5 size-3.5 rounded-full transition-[left] motion-reduce:transition-none ${activo ? 'left-[1.1rem] bg-acento' : 'left-0.5 bg-texto-2'}`} />
      </span>
    </button>
  )
}
