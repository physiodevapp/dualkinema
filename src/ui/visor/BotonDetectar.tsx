import { StopIcon, UserIcon } from '@heroicons/react/24/outline'
import type { ProgresoDeteccion } from './useDeteccionPose'

interface Props {
  /** Mientras se detecta: cargando el modelo, o el avance de cada pasada. null = parado. */
  progreso: ProgresoDeteccion | null
  /** Otra cosa ocupa el vídeo (se sigue esta vista u otra, o se detecta en la otra). */
  deshabilitado: boolean
  /** Es lo principal de la vista (sin gomets): botón en ámbar; con gomets, secundario. */
  principal: boolean
  /** Ya hay una detección: el botón dice «Volver a detectar». */
  hecha: boolean
  onDetectar: () => void
  onParar: () => void
  /** Versión de la tira del vídeo grande (más baja); sin ella, la del panel «Marcar». */
  compacto?: boolean
  /** En una fila con otro botón (móvil girado): ocupa lo que queda y el texto no se parte. */
  enFila?: boolean
  /** Texto corto («Detectar»): en la fila del móvil girado, junto a «A ojo» y «Seguir». */
  corto?: boolean
}

/**
 * «Detectar el cuerpo» (sin marcadores, fase 5) o, mientras se detecta, «Parar» con lo que va haciendo (de ancho fijo
 * para que no cambie de tamaño): cargando el modelo, el porcentaje del vídeo y, al final, la pasada hacia atrás.
 */
export default function BotonDetectar({ progreso, deshabilitado, principal, hecha, onDetectar, onParar, compacto, enFila, corto }: Props) {
  const fila = enFila ? 'min-w-0 flex-1 px-3 text-sm whitespace-nowrap' : 'px-4'
  return progreso ? (
    <button type="button" onClick={onParar} className={`flex items-center justify-center gap-2 rounded-md border border-borde ${fila} ${compacto ? 'py-2' : 'py-3'}`}>
      <StopIcon className="size-5" /> Parar
      <span className={`inline-block ${corto ? 'w-[5ch]' : 'w-[10ch]'} text-right font-mono text-sm text-texto-2`} data-testid="progreso-deteccion">
        {progreso.fase === 'cargando' ? (corto ? '…' : 'cargando…') : `${progreso.fase === 'atras' && !corto ? 'atrás ' : ''}${Math.round(progreso.fraccion * 100)} %`}
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={onDetectar}
      disabled={deshabilitado}
      className={`flex items-center justify-center gap-2 rounded-md ${principal ? 'bg-acento font-medium text-fondo' : 'border border-borde text-texto'} ${fila} ${compacto ? 'py-2.5' : 'py-3'} disabled:opacity-40`}
    >
      <UserIcon className="size-5" /> {corto ? 'Detectar' : hecha ? 'Volver a detectar' : 'Detectar el cuerpo'}
    </button>
  )
}
