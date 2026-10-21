interface Props {
  /** Primer frame (0-based) con hueco. */
  frame: number
  onIr: (frame: number) => void
  /** Versión de la tira del vídeo grande; sin ella, la del aviso del panel «Marcar». */
  compacto?: boolean
}

/** «Ir al primer frame con hueco (N)». */
export default function BotonIrAlHueco({ frame, onIr, compacto }: Props) {
  return (
    <button
      type="button"
      onClick={() => onIr(frame)}
      className={compacto ? 'rounded-md border border-borde px-3 py-2 text-sm' : 'self-start rounded-md border border-borde px-3 py-2'}
    >
      Ir al primer frame con hueco ({frame + 1})
    </button>
  )
}
