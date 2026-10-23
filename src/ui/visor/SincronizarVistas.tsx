import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Sincronia } from '../../core/modelo/tipos'
import { ajustarDesfase, ajusteManual, desfaseDeEvento, incertidumbreEvento, pasoTipico, sincroniaTrasAjuste, type EventoVisual } from '../../core/sincronia/evento'
import { fmt } from './formato'
import type { VistaViva } from './vistas'

/** Instante del evento marcado en cada vista (s de vídeo); lo que falta, sin marcar. */
export type MarcaEvento = { readonly referencia?: number; readonly vista?: number }

interface Props {
  /** La vista de referencia (A) y la que se sincroniza con ella (B). */
  readonly referencia: VistaViva
  readonly vista: VistaViva
  readonly onSincronia: (id: string, desfase: number, sincronia: Sincronia) => void
  /** Se está marcando el evento y lo marcado hasta ahora (lo lleva el visor: el botón de marcar también va sobre el vídeo). */
  readonly marcando: boolean
  readonly marca: MarcaEvento
  readonly onEmpezar: () => void
  /** Sale de marcar el evento (aplicado o cancelado). */
  readonly onTerminar: () => void
  readonly onMarcar: (clave: keyof MarcaEvento, t: number) => void
}

/** Segundos con signo y tres decimales («+0,480 s»). */
const segundos = (s: number) => `${s < 0 ? '−' : '+'}${fmt(Math.abs(s), 3)} s`
/** Milisegundos con signo, sin decimales («+40 ms»). */
const milis = (s: number) => `${s < 0 ? '−' : '+'}${fmt(Math.abs(s) * 1000, 0)} ms`

const TEXTO_METODO = { ninguna: 'Sin sincronizar', evento: 'Por evento visual', audio: 'Por audio', manual: 'Puesta a mano' } as const

/**
 * Pestaña «Vídeo», con dos vistas: sincronizarlas por un evento visual. Se lleva cada vista al frame de un mismo
 * evento (una palmada, el pie que toca el suelo) y se marca; el desfase de B es la diferencia de los dos instantes
 * (`core/sincronia/evento.ts`). Mientras se marca, el cursor común está desenlazado: cada vista se mueve sola. Después se
 * puede ajustar a mano de a un frame de B.
 */
export default function SincronizarVistas({ referencia, vista, onSincronia, marcando, marca, onEmpezar, onTerminar, onMarcar }: Props) {
  const pasoRef = pasoTipico(referencia.tabla)
  const pasoVista = pasoTipico(vista.tabla)
  const evento: EventoVisual | null = marca.referencia !== undefined && marca.vista !== undefined ? { referencia: marca.referencia, vista: marca.vista } : null

  const aplicar = () => {
    if (!evento) return
    onSincronia(vista.id, desfaseDeEvento(evento), { metodo: 'evento', evento })
    onTerminar()
  }
  const ajustar = (frames: number) => onSincronia(vista.id, ajustarDesfase(vista.desfaseS, frames, pasoVista), sincroniaTrasAjuste(vista.sincronia))

  const sinSincronia = vista.sincronia.metodo === 'ninguna' && vista.desfaseS === 0
  const ajuste = ajusteManual(vista.desfaseS, vista.sincronia)
  const filas = [
    { letra: 'A', v: referencia, clave: 'referencia' as const },
    { letra: 'B', v: vista, clave: 'vista' as const },
  ]

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="sincronizar-vistas">
      <h2 className="text-xs tracking-wider text-texto-2 uppercase">Sincronizar las vistas</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
        <dt className="text-texto-2">Desfase de B</dt>
        <dd data-testid="desfase-sincronia">{segundos(vista.desfaseS)}</dd>
        <dt className="text-texto-2">Cómo</dt>
        <dd data-testid="metodo-sincronia">
          {TEXTO_METODO[vista.sincronia.metodo]}
          {ajuste !== null && Math.abs(ajuste) > 1e-9 && <span className="text-acento"> · ajustada {milis(ajuste)}</span>}
        </dd>
        {vista.sincronia.metodo === 'evento' && (
          <>
            <dt className="text-texto-2">Precisión</dt>
            <dd data-testid="incertidumbre-sincronia">± {fmt(incertidumbreEvento(pasoRef, pasoVista) * 1000, 0)} ms</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-texto-2">
        El desfase se halla con un evento que se vea en las dos vistas (una palmada, el pie que toca el suelo). Cada vídeo sitúa el evento con un error de hasta medio frame: eso es la precisión.
      </p>

      {!marcando ? (
        <button type="button" onClick={onEmpezar} className="flex items-center justify-center gap-2 rounded-md border border-acento px-4 py-3 text-acento">
          Marcar el evento en las dos vistas
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-borde p-3" data-testid="marcando-evento">
          <p className="text-sm">
            Lleva cada vista al frame del evento (con A / B del vídeo) y pulsa «Es el evento» sobre el vídeo, o su botón de aquí. Las vistas se mueven por separado mientras tanto.
          </p>
          {filas.map(({ letra, v, clave }) => {
            const marcada = marca[clave]
            const listo = v.mostrado !== null && v.mostrado === v.deseado
            return (
              <div key={letra} className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={!listo}
                  onClick={() => onMarcar(clave, v.tabla.tiempos[v.mostrado!]!)}
                  className="flex items-center justify-center gap-2 rounded-md border border-borde px-3 py-2 disabled:opacity-40"
                >
                  Este es el evento en {letra}
                </button>
                <p className="font-mono text-xs text-texto-2" data-testid={`evento-${letra}`}>
                  {marcada === undefined ? `${letra}: sin marcar` : `${letra}: evento en ${fmt(marcada, 3)} s (frame ${v.tabla.tiempos.findIndex((t) => t === marcada) + 1})`}
                </p>
              </div>
            )
          })}
          {evento && (
            <p className="font-mono text-sm" data-testid="desfase-propuesto">
              Desfase de B: {segundos(desfaseDeEvento(evento))} (± {fmt(incertidumbreEvento(pasoRef, pasoVista) * 1000, 0)} ms)
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!evento}
              onClick={aplicar}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-acento px-3 py-2 font-medium text-fondo disabled:opacity-40"
            >
              <CheckIcon className="size-5" /> Aplicar
            </button>
            <button type="button" onClick={onTerminar} className="flex flex-1 items-center justify-center gap-2 rounded-md border border-borde px-3 py-2">
              <XMarkIcon className="size-5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {!marcando && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs tracking-wider text-texto-2 uppercase">Ajuste fino</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => ajustar(-1)} className="rounded-md border border-borde px-3 py-2">
              B un frame antes
            </button>
            <button type="button" onClick={() => ajustar(1)} className="rounded-md border border-borde px-3 py-2">
              B un frame después
            </button>
          </div>
          <p className="text-xs text-texto-2">Cada pulsación mueve B {fmt(pasoVista * 1000, 0)} ms (un frame suyo). Con los dos vídeos en el evento, deben mostrarlo a la vez.</p>
          {!sinSincronia && (
            <button
              type="button"
              onClick={() => onSincronia(vista.id, 0, { metodo: 'ninguna' })}
              className="rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
            >
              Quitar la sincronía
            </button>
          )}
        </div>
      )}
    </section>
  )
}
