import { CheckCircleIcon, FilmIcon, XCircleIcon } from '@heroicons/react/24/outline'

// Lo que necesitarán los próximos PR: decodificar vídeo frame a frame
// (WebCodecs), dibujar fuera del hilo principal y workers de módulo.
const comprobaciones = [
  { nombre: 'WebCodecs (VideoDecoder)', ok: typeof globalThis.VideoDecoder === 'function' },
  { nombre: 'OffscreenCanvas', ok: typeof globalThis.OffscreenCanvas === 'function' },
  { nombre: 'Web Workers', ok: typeof globalThis.Worker === 'function' },
  { nombre: 'IndexedDB', ok: typeof globalThis.indexedDB === 'object' },
]

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-serif text-4xl">
          dual<span className="text-acento">kinema</span>
        </h1>
        <p className="mt-2 text-texto-2">
          Análisis cinemático diferido a partir de vídeo con marcadores. Todo se procesa en este
          dispositivo: los vídeos nunca salen de él.
        </p>
      </header>

      <button
        type="button"
        disabled
        className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
      >
        <FilmIcon className="size-5" />
        Cargar vídeo
        <span className="text-sm font-normal">(próximamente)</span>
      </button>

      <section className="rounded-2xl border border-borde bg-panel p-4">
        <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">
          Compatibilidad de este navegador
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {comprobaciones.map(({ nombre, ok }) => (
            <li key={nombre} className="flex items-center gap-2">
              {ok ? (
                <CheckCircleIcon className="size-5 text-emerald-400" aria-label="disponible" />
              ) : (
                <XCircleIcon className="size-5 text-red-400" aria-label="no disponible" />
              )}
              {nombre}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto font-mono text-xs text-texto-2">
        {__RAMA__} · {__COMMIT__}
      </footer>
    </main>
  )
}
