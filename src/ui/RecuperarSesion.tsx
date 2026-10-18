import { ArrowUturnLeftIcon, PlusIcon } from '@heroicons/react/24/outline'
import type { CabeceraSesion } from '../core/persistencia/esquema'
import type { Coincidencia } from '../core/persistencia/huella'
import { fechaCorta, textoOrientacion, textoResumen } from './sesion'

export interface Candidata {
  readonly cabecera: CabeceraSesion
  readonly coincidencia: Exclude<Coincidencia, 'distinta'>
}

/** Al abrir un vídeo con trabajo guardado: recuperarlo o empezar de cero. */
export default function RecuperarSesion({
  nombre,
  candidatas,
  ocupado,
  error,
  onRecuperar,
  onNueva,
}: {
  nombre: string
  candidatas: readonly Candidata[]
  ocupado: boolean
  error?: string
  onRecuperar: (c: CabeceraSesion) => void
  onNueva: () => void
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4">
      <div>
        <h2 className="font-serif text-2xl">Ya has trabajado con este vídeo</h2>
        <p className="mt-1 text-texto-2">El marcado de «{nombre}» está guardado en este dispositivo.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {candidatas.map(({ cabecera, coincidencia }) => (
          <li key={cabecera.id} className="flex flex-col gap-2 rounded-md border border-borde p-3" data-testid="candidata">
            <p className="text-sm">
              Guardado el {fechaCorta(cabecera.actualizada)} · {textoOrientacion(cabecera.vistas[0]!.orientacion)}
            </p>
            <p className="font-mono text-xs text-texto-2">{textoResumen(cabecera)}</p>
            {coincidencia === 'otroNombre' && (
              <p className="text-xs text-acento">
                Se guardó como «{cabecera.vistas[0]!.huella.nombre}». El nombre cambia, pero tiene el mismo tamaño, duración y
                número de frames: es el mismo vídeo.
              </p>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onRecuperar(cabecera)}
              className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
            >
              <ArrowUturnLeftIcon className="size-5" /> Recuperar el trabajo
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        disabled={ocupado}
        onClick={onNueva}
        className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 disabled:opacity-40"
      >
        <PlusIcon className="size-5" /> Empezar de cero
      </button>
      <p className="text-xs text-texto-2">Empezar de cero no borra lo guardado: sigue en la lista de sesiones.</p>
    </section>
  )
}
