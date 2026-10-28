import BandaFrames, { type EstadoFrame } from './BandaFrames'
import { fmt } from './formato'

interface Props {
  estados: readonly EstadoFrame[]
  total: number
  /** Frame pedido (0-based) y su tiempo en el vídeo (s). */
  deseado: number
  t: number
  onIr: (i: number) => void
  /** Se sigue o se detecta: el deslizador no se mueve (mirar otros frames frena al worker) y la franja sigue rellenándose. */
  deshabilitado?: boolean
}

/**
 * Deslizador de frames con la franja de estado. Una sola barra: la franja de cada frame es la pista del deslizador y el
 * tirador va encima (la franja se mete la mitad del tirador por cada lado, para que su centro coincida con el frame).
 */
export default function DeslizadorFrames({ estados, total, deseado, t, onIr, deshabilitado }: Props) {
  return (
    <div className="relative h-7">
      <div className="pointer-events-none absolute inset-x-[7px] top-1/2 -translate-y-1/2">
        <BandaFrames estados={estados} className="h-2.5" />
      </div>
      <input
        type="range"
        min={0}
        max={total - 1}
        step={1}
        value={deseado}
        disabled={deshabilitado}
        onChange={(e) => onIr(Number(e.target.value))}
        aria-label="Posición en el vídeo"
        aria-valuetext={`frame ${deseado + 1} de ${total}, ${fmt(t, 3)} s`}
        className="deslizador-frames relative"
      />
    </div>
  )
}
