import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, FilmIcon } from '@heroicons/react/24/outline'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { VideoAbierto } from '../media/video'
import Compatibilidad from './compatibilidad'
import ElegirOrientacion from './ElegirOrientacion'
import Visor from './Visor'

type Estado =
  | { fase: 'inicio'; error?: string }
  | { fase: 'cargando'; nombre: string }
  | { fase: 'orientacion'; video: VideoAbierto }
  | { fase: 'visor'; video: VideoAbierto; orientacion: OrientacionVista }

export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' })
  const selector = useRef<HTMLInputElement>(null)
  const videoActual = estado.fase === 'orientacion' || estado.fase === 'visor' ? estado.video : null

  // Cierra el vídeo anterior al cambiar de vídeo o al salir.
  useEffect(() => {
    return () => void videoActual?.cerrar()
  }, [videoActual])

  const cargar = useCallback(async (archivo: File) => {
    setEstado({ fase: 'cargando', nombre: archivo.name })
    try {
      // Mediabunny solo se descarga al abrir el primer vídeo: la portada carga rápido.
      const { VideoAbierto } = await import('../media/video')
      const video = await VideoAbierto.abrir(archivo)
      setEstado({ fase: 'orientacion', video })
    } catch (e) {
      setEstado({ fase: 'inicio', error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const botonCargar = (
    <button
      type="button"
      onClick={() => selector.current?.click()}
      disabled={estado.fase === 'cargando'}
      className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
    >
      {videoActual ? <ArrowPathIcon className="size-5" /> : <FilmIcon className="size-5" />}
      {videoActual ? 'Cambiar vídeo' : 'Cargar vídeo'}
    </button>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">
          dual<span className="text-acento">kinema</span>
        </h1>
        {videoActual && botonCargar}
      </header>

      <input
        ref={selector}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (archivo) void cargar(archivo)
        }}
      />

      {(estado.fase === 'inicio' || estado.fase === 'cargando') && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <p className="text-texto-2">
            Análisis cinemático diferido a partir de vídeo con marcadores. Todo se procesa en este dispositivo: los
            vídeos nunca salen de él.
          </p>
          {botonCargar}
          {estado.fase === 'cargando' && <p className="text-texto-2">Leyendo «{estado.nombre}»…</p>}
          {estado.fase === 'inicio' && estado.error && (
            <p className="rounded-md border border-red-400/50 p-3 text-red-300">{estado.error}</p>
          )}
          <Compatibilidad />
        </div>
      )}

      {estado.fase === 'orientacion' && (
        <div className="mx-auto w-full max-w-xl">
          <ElegirOrientacion onElegir={(orientacion) => setEstado({ fase: 'visor', video: estado.video, orientacion })} />
        </div>
      )}

      {estado.fase === 'visor' && <Visor key={estado.video.info.nombre} video={estado.video} orientacion={estado.orientacion} />}

      <footer className="mt-auto font-mono text-xs text-texto-2">
        {__RAMA__} · {__COMMIT__}
      </footer>
    </main>
  )
}
