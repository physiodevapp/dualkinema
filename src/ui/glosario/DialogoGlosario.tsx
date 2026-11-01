import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAnchoMinimo } from '../visor/useAltura'
import { ENTRADAS, type EntradaGlosario } from './entradas'

/** Sin mayúsculas ni tildes, para buscar «angulo» y encontrar «Ángulo». */
const plano = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

const coincide = (e: EntradaGlosario, busqueda: string) => !busqueda || plano([e.titulo, ...e.texto].join(' ')).includes(busqueda)

/**
 * El panel del glosario, con un buscador (título y texto, sin tildes). Se cierra con la ✕ o con Escape; mientras está
 * abierto la página de debajo no se desplaza ni responde al teclado (las flechas no mueven el vídeo).
 *
 * - En el móvil, todas las entradas como desplegables, con la pedida abierta y a la vista.
 * - En pantalla ancha (desde `lg`), a dos columnas: la lista de entradas a la izquierda y el texto de la elegida a la
 *   derecha (la pedida o, sin pedir ninguna, la primera). Las flechas arriba y abajo recorren la lista.
 */
export default function DialogoGlosario({ id, onCerrar }: { id?: string; onCerrar: () => void }) {
  const ancho = useAnchoMinimo()
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set(id ? [id] : []))
  const [elegida, setElegida] = useState(id ?? ENTRADAS[0]!.id)
  const [busqueda, setBusqueda] = useState('')
  const destino = useRef<HTMLElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)

  const visibles = useMemo(() => ENTRADAS.filter((e) => coincide(e, plano(busqueda.trim()))), [busqueda])
  // En pantalla ancha se ve una entrada: la elegida si queda en la búsqueda; si no, la primera que queda.
  const mostrada = visibles.find((e) => e.id === elegida) ?? visibles[0]

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
    destino.current?.scrollIntoView({ block: ancho ? 'nearest' : 'start' })
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const moverEnLista = (paso: 1 | -1) => {
    if (!mostrada) return
    const i = visibles.indexOf(mostrada)
    const siguiente = visibles[Math.min(visibles.length - 1, Math.max(0, i + paso))]!
    setElegida(siguiente.id)
    lista.current?.querySelector<HTMLButtonElement>(`[data-entrada="${siguiente.id}"]`)?.focus()
  }

  const buscador = (
    <label className="flex items-center gap-2 rounded-md border border-borde bg-panel px-3 py-2">
      <MagnifyingGlassIcon className="size-5 shrink-0 text-texto-2" />
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar en el glosario"
        aria-label="Buscar en el glosario"
        data-testid="buscar-glosario"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-2"
      />
    </label>
  )
  const sinResultados = visibles.length === 0 && <p className="text-sm text-texto-2">Nada coincide con «{busqueda.trim()}».</p>

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
      <header className={`mx-auto flex w-full items-center justify-between gap-3 px-4 pt-4 pb-2 ${ancho ? 'max-w-5xl' : 'max-w-2xl'}`}>
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
      {ancho ? (
        <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-cols-[18rem_minmax(0,1fr)] gap-4 px-4 pb-6">
          <nav aria-label="Entradas del glosario" className="flex min-h-0 flex-col gap-3">
            {buscador}
            <ul
              ref={lista}
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  moverEnLista(e.key === 'ArrowDown' ? 1 : -1)
                }
              }}
            >
              {visibles.map((e) => {
                const actual = e === mostrada
                return (
                  <li key={e.id}>
                    <button
                      ref={actual ? (destino as React.RefObject<HTMLButtonElement>) : undefined}
                      type="button"
                      data-entrada={e.id}
                      data-testid={`glosario-entrada-${e.id}`}
                      aria-current={actual ? 'true' : undefined}
                      onClick={() => setElegida(e.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        actual ? 'border-acento bg-panel text-texto' : 'border-transparent text-texto-2 hover:border-borde hover:text-texto'
                      }`}
                    >
                      {e.titulo}
                    </button>
                  </li>
                )
              })}
            </ul>
            {sinResultados}
          </nav>
          {mostrada && (
            <article
              key={mostrada.id}
              data-testid={`glosario-${mostrada.id}`}
              data-abierta="true"
              aria-live="polite"
              className="flex max-h-full min-h-0 flex-col gap-3 self-start overflow-y-auto rounded-2xl border border-borde bg-panel p-6"
            >
              <h3 className="font-serif text-xl">{mostrada.titulo}</h3>
              {mostrada.texto.map((p) => (
                <p key={p} className="text-texto-2">
                  {p}
                </p>
              ))}
            </article>
          )}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-6">
          <p className="pb-3 text-sm text-texto-2">Qué significa cada valor y cada aviso de la app. Todo se calcula en este dispositivo.</p>
          <div className="pb-3">{buscador}</div>
          {sinResultados}
          <ul className="flex flex-col gap-2">
            {visibles.map((e) => (
              <li key={e.id}>
                <details
                  ref={e.id === id ? (destino as React.RefObject<HTMLDetailsElement>) : undefined}
                  open={abiertas.has(e.id)}
                  data-testid={`glosario-${e.id}`}
                  data-abierta={abiertas.has(e.id) ? 'true' : 'false'}
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
      )}
    </div>
  )
}
