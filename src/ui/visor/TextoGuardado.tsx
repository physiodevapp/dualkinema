import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { hora } from './formato'
import type { EstadoGuardado } from './useGuardado'

export default function TextoGuardado({ g }: { g: EstadoGuardado }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-texto-2" data-testid="guardado" aria-live="polite">
      {(g.estado === 'guardado' || g.estado === 'recuperado') && <CheckIcon className="size-4 text-acento" />}
      {g.estado === 'error' && <ExclamationTriangleIcon className="size-4 text-red-300" />}
      {g.estado === 'nada' && 'Se guarda solo en este dispositivo en cuanto marques algo.'}
      {g.estado === 'recuperado' && 'Guardado en este dispositivo. Lo que cambies se guarda solo.'}
      {g.estado === 'pendiente' && 'Guardando en este dispositivo…'}
      {g.estado === 'guardado' && `Guardado en este dispositivo a las ${hora(g.hora)}`}
      {g.estado === 'error' && <span className="text-red-300">No se ha podido guardar: {g.mensaje}</span>}
    </p>
  )
}
