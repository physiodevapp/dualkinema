import { useEffect, useRef, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ENTRADAS } from './entradas'

/**
 * El panel del glosario: todas las entradas como desplegables, con la pedida abierta y a la vista. Se cierra con la ✕ o con
 * Escape; mientras está abierto la página de debajo no se desplaza ni responde al teclado (las flechas no mueven el vídeo).
 */
export default function DialogoGlosario({ id, onCerrar }: { id?: string; onCerrar: () => void }) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set(id ? [id] : []))
  const destino = useRef<HTMLDetailsElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)

  // Sin scroll de la página mientras está abierto.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])
  // Al abrir: el foco dentro del panel (si no, el teclado seguiría en lo de debajo) y la entrada pedida a la vista.
  useEffect(() => {
    cerrar.current?.focus({ preventScroll: true })
    destino.current?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-glosario"
      data-testid="glosario"
      className="fixed inset-0 z-50 flex flex-col bg-fondo"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
        // Las flechas, Inicio y Fin del glosario son suyos, no del vídeo de debajo.
        e.stopPropagation()
      }}
    >
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 id="titulo-glosario" className="font-serif text-2xl">
          Glosario
        </h2>
        <button
          ref={cerrar}
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el glosario"
          data-testid="cerrar-glosario"
          className="flex size-11 items-center justify-center rounded-md border border-borde text-texto"
        >
          <XMarkIcon className="size-5" />
        </button>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-6">
        <p className="pb-3 text-sm text-texto-2">Qué significa cada valor y cada aviso de la app. Todo se calcula en este dispositivo.</p>
        <ul className="flex flex-col gap-2">
          {ENTRADAS.map((e) => (
            <li key={e.id}>
              <details
                ref={e.id === id ? destino : undefined}
                open={abiertas.has(e.id)}
                data-testid={`glosario-${e.id}`}
                onToggle={(ev) => {
                  const abierta = ev.currentTarget.open
                  setAbiertas((a) => {
                    if (a.has(e.id) === abierta) return a
                    const n = new Set(a)
                    if (abierta) n.add(e.id)
                    else n.delete(e.id)
                    return n
                  })
                }}
                className="rounded-2xl border border-borde bg-panel"
              >
                <summary className="cursor-pointer list-none px-4 py-3 font-medium">{e.titulo}</summary>
                <div className="flex flex-col gap-2 px-4 pb-4 text-sm text-texto-2">
                  {e.texto.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
