import { ExclamationTriangleIcon, FilmIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { VistaCabecera } from '../core/persistencia/esquema'
import { textoOrientacion } from './sesion'

interface Props {
  readonly nombreSesion: string
  /** Vídeos ya abiertos (nombres). */
  readonly abiertos: readonly string[]
  readonly faltan: readonly VistaCabecera[]
  readonly ocupado: boolean
  readonly error?: string
  readonly onElegir: () => void
  readonly onCancelar: () => void
}

/** Una sesión de varias vistas pide todos sus vídeos: el navegador no puede reabrirlos solo, hay que elegirlos otra vez. */
export default function FaltanVideos({ nombreSesion, abiertos, faltan, ocupado, error, onElegir, onCancelar }: Props) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4" data-testid="faltan-videos">
      <div>
        <h2 className="font-serif text-2xl">Faltan vídeos de esta sesión</h2>
        <p className="mt-1 text-texto-2">
          «{nombreSesion}» tiene {abiertos.length + faltan.length} vistas. El navegador no puede reabrir los vídeos por sí solo: elige también
          {faltan.length === 1 ? ' el que falta' : ' los que faltan'}.
        </p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {abiertos.map((n) => (
          <li key={n} className="text-texto-2">
            ✓ «{n}» abierto
          </li>
        ))}
        {faltan.map((v) => (
          <li key={v.id} className="flex items-center gap-2" data-testid="falta-video">
            <ExclamationTriangleIcon className="size-4 shrink-0 text-acento" />
            <span>
              «{v.huella.nombre}» · {textoOrientacion(v.orientacion)}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        disabled={ocupado}
        onClick={onElegir}
        className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
      >
        <FilmIcon className="size-5" /> Elegir el vídeo que falta
      </button>
      <button type="button" disabled={ocupado} onClick={onCancelar} className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 disabled:opacity-40">
        <XMarkIcon className="size-5" /> Cancelar
      </button>
    </section>
  )
}
