import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

// Los textos solo se descargan al abrir el glosario por primera vez.
const DialogoGlosario = lazy(() => import('./DialogoGlosario'))

interface Contexto {
  /** Abre el glosario, en la entrada `id` si se da. */
  readonly abrir: (id?: string) => void
}

const Glosario = createContext<Contexto>({ abrir: () => {} })

/** Da el glosario a toda la app: un solo panel que se abre desde cualquier icono de información. */
export function GlosarioProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ id?: string } | null>(null)
  // Quien lo abrió, para devolverle el foco al cerrar.
  const origen = useRef<Element | null>(null)
  const abrir = useCallback((id?: string) => {
    origen.current = document.activeElement
    setEstado({ id })
  }, [])
  const cerrar = useCallback(() => {
    setEstado(null)
    if (origen.current instanceof HTMLElement) origen.current.focus()
  }, [])
  const valor = useMemo(() => ({ abrir }), [abrir])
  return (
    <Glosario.Provider value={valor}>
      {children}
      {estado && (
        <Suspense fallback={null}>
          <DialogoGlosario id={estado.id} onCerrar={cerrar} />
        </Suspense>
      )}
    </Glosario.Provider>
  )
}

export const useGlosario = () => useContext(Glosario)

/**
 * Icono de información junto a un valor o un aviso: abre el glosario en su entrada. `tema` es lo que se explica
 * («el filtro»), para el nombre accesible del botón.
 */
export function InfoGlosario({ id, tema, className = '' }: { id: string; tema: string; className?: string }) {
  const { abrir } = useGlosario()
  return (
    <button
      type="button"
      onClick={() => abrir(id)}
      aria-label={`Qué es ${tema}`}
      title={`Qué es ${tema}`}
      data-testid={`info-${id}`}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-texto-2 hover:text-acento focus-visible:text-acento ${className}`}
    >
      <InformationCircleIcon className="size-5" />
    </button>
  )
}
