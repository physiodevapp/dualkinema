import { PlayIcon, StopIcon } from '@heroicons/react/24/outline'

interface Props {
  siguiendo: boolean
  /** Avance del seguimiento (0–1), mientras se sigue. */
  progreso: number
  /** «Seguir desde aquí» solo se puede pulsar con los marcadores colocados en el frame. */
  listo: boolean
  onSeguir: () => void
  onParar: () => void
  /** Versión de la tira del vídeo grande (más baja); sin ella, la del panel «Marcar». */
  compacto?: boolean
  /** En una fila junto a «Colocar a ojo» (móvil girado): ocupa lo que queda y el texto no se parte. */
  enFila?: boolean
}

/**
 * «Seguir desde aquí» o, mientras se sigue, «Parar» con el porcentaje (de ancho fijo para que no cambie de tamaño).
 * El avance se ve además en la franja del deslizador, que se va poniendo verde.
 */
export default function BotonSeguir({ siguiendo, progreso, listo, onSeguir, onParar, compacto, enFila }: Props) {
  const fila = enFila ? 'min-w-0 flex-1 px-3 text-sm whitespace-nowrap' : 'px-4'
  return siguiendo ? (
    <button
      type="button"
      onClick={onParar}
      className={`flex items-center justify-center gap-2 rounded-md border border-borde ${fila} ${compacto ? 'py-2' : 'py-3'}`}
    >
      <StopIcon className="size-5" /> Parar
      {siguiendo && (
        <span className="inline-block w-[5ch] text-right font-mono text-sm text-texto-2" data-testid="progreso-seguimiento">
          {Math.round(progreso * 100)} %
        </span>
      )}
    </button>
  ) : (
    <button
      type="button"
      onClick={onSeguir}
      disabled={!listo}
      className={`flex items-center justify-center gap-2 rounded-md bg-acento ${fila} ${compacto ? 'py-2.5' : 'py-3'} font-medium text-fondo disabled:opacity-40`}
    >
      <PlayIcon className="size-5" /> Seguir desde aquí
    </button>
  )
}
