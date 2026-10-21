import type { IdMarcador } from '../../core/modelo/tipos'

export interface ErrorDeToque {
  texto: string
  detalle?: string
  /** Dónde se tocó, para ofrecer colocarlo ahí aunque no se reconozca el gomet. */
  aOjo?: { id: IdMarcador; i: number; x: number; y: number }
}

interface Props {
  error: ErrorDeToque
  /** En el vídeo grande el aviso es corto, con el detalle plegado y sus botones a la vista. */
  enVideo: boolean
  onColocarAOjo: (id: IdMarcador, i: number, x: number, y: number) => void
  onCerrar: () => void
}

const frasePrincipal = (texto: string) => `${texto.split(/[:.]/)[0]!.trim()}.`

/** Por qué no se ha podido marcar donde se tocó, con «Colocarlo aquí a ojo» y «Cerrar». */
export default function ErrorToque({ error, enVideo, onColocarAOjo, onCerrar }: Props) {
  return enVideo ? (
      <div data-testid="error-toque" role="alert" className="flex flex-col gap-1.5 rounded-md border border-red-400/60 bg-fondo p-2 text-sm text-red-200">
        <p>{frasePrincipal(error.texto)}</p>
        <div className="flex flex-wrap gap-2">
          {error.aOjo && (
            <button
              type="button"
              onClick={() => {
                const { id, i, x, y } = error.aOjo!
                onColocarAOjo(id, i, x, y)
              }}
              className="rounded-md border border-borde px-3 py-1.5 text-texto"
            >
              Colocarlo aquí a ojo
            </button>
          )}
          <button type="button" onClick={() => onCerrar()} className="rounded-md border border-borde px-3 py-1.5 text-texto-2">
            Cerrar
          </button>
        </div>
        <details className="text-xs text-texto-2">
          <summary className="cursor-pointer">Por qué</summary>
          <p className="mt-1">{error.texto}</p>
          {error.detalle && <p className="mt-1 font-mono">{error.detalle}</p>}
          {error.aOjo && <p className="mt-1">A ojo: queda como marcado a mano justo donde has soltado el dedo, sin ajustarlo a ningún gomet. Para varios frames seguidos, activa «Colocar a ojo».</p>}
        </details>
      </div>
  ) : (
            // Debajo del vídeo y no encima: un mensaje encima tapaba casi toda la
            // imagen en un móvil, y el siguiente toque (aunque fuera sobre el
            // gomet) caía en el mensaje en vez de marcar.
            <div data-testid="error-toque" role="alert" className={`flex flex-col gap-2 max-lg:order-2 rounded-md border border-red-400/60 bg-fondo p-2 text-sm text-red-200`}>
              <p>{error.texto}</p>
              {error.detalle && <p className="font-mono text-xs text-texto-2">{error.detalle}</p>}
              <div className="flex flex-wrap gap-2">
                {error.aOjo && (
                  <button
                    type="button"
                    onClick={() => {
                      const { id, i, x, y } = error.aOjo!
                      onColocarAOjo(id, i, x, y)
                    }}
                    className="rounded-md border border-borde px-3 py-2 text-texto"
                  >
                    Colocarlo aquí a ojo
                  </button>
                )}
                <button type="button" onClick={() => onCerrar()} className="rounded-md border border-borde px-3 py-2 text-texto-2">
                  Cerrar
                </button>
              </div>
              {error.aOjo && (
                <p className="text-xs text-texto-2">
                  A ojo: para un frame en que el gomet no se ve (tapado, movido). Queda como marcado a mano, justo donde has
                  soltado el dedo, sin ajustarlo al centro de ningún gomet.
                </p>
              )}
            </div>
  )
}
