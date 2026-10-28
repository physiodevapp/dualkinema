import { createContext, useContext } from 'react'

/** Lo que ofrece el botón de volver de la cabecera: su texto y qué hace. */
export interface Volver {
  readonly texto: string
  readonly onVolver: () => void
}

const Contexto = createContext<(v: Volver | null) => void>(() => {})

/** Lo provee la app (su cabecera pinta el botón en lugar del título) y lo usa el visor, que sabe a dónde se vuelve. */
export const ProveedorVolver = Contexto.Provider
export const usePonerVolver = () => useContext(Contexto)
