import { CheckIcon, ExclamationTriangleIcon, SpeakerWaveIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Sincronia } from '../../core/modelo/tipos'
import { CALIDAD_AUDIO_MINIMA, compararConEvento, conComprobacion, sincroniaDeAudio } from '../../core/sincronia/audio'
import { TASA_ENVOLVENTE } from '../../core/sincronia/envolvente'
import { ajustarDesfase, ajusteManual, desfaseDeEvento, incertidumbreEvento, pasoTipico, sincroniaTrasAjuste, type EventoVisual } from '../../core/sincronia/evento'
import type { FaltaAudio } from '../../workers/protocolo'
import { fmt } from './formato'
import { useSincronizarAudio } from './useSincronizarAudio'
import type { VistaViva } from './vistas'
import { InfoGlosario } from '../glosario/Glosario'

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

/** Precisión del audio (s): una muestra de la envolvente. No incluye el retardo entre audio e imagen de cada móvil. */
const INCERTIDUMBRE_AUDIO = 1 / TASA_ENVOLVENTE

/** Lo que falta para usar el audio de A o de B, en una frase. */
function textoFalta(f: FaltaAudio): string {
  const letra = f.cual === 'referencia' ? 'A' : 'B'
  return f.motivo === 'sinAudio' ? `El vídeo ${letra} no tiene sonido.` : `Este navegador no puede leer el sonido del vídeo ${letra} (${f.codec ?? 'códec desconocido'}).`
}

/**
 * Pestaña «Vídeo», con dos vistas: sincronizarlas por el audio o por un evento visual.
 *
 * - Por el audio (`core/sincronia/audio.ts`, en un worker): la palmada que graban los dos micrófonos da el desfase. Si
 *   el pico no es claro se avisa y se propone el evento visual.
 * - Por evento visual (`core/sincronia/evento.ts`): se lleva cada vista al frame de un mismo evento (una palmada, el
 *   pie que toca el suelo) y se marca; el desfase de B es la diferencia de los dos instantes. Mientras se marca, el
 *   cursor común está desenlazado: cada vista se mueve sola.
 *
 * Con el audio aplicado, el evento visual lo **comprueba**: se guarda junto a él y se muestran los dos desfases y su
 * diferencia, sin cambiar nada; si discrepan, la persona decide si usa el de la imagen. Después se puede ajustar a mano
 * de a un frame de B.
 */
export default function SincronizarVistas({ referencia, vista, onSincronia, marcando, marca, onEmpezar, onTerminar, onMarcar }: Props) {
  const audio = useSincronizarAudio()
  const pasoRef = pasoTipico(referencia.tabla)
  const pasoVista = pasoTipico(vista.tabla)
  const incEvento = incertidumbreEvento(pasoRef, pasoVista)
  const evento: EventoVisual | null = marca.referencia !== undefined && marca.vista !== undefined ? { referencia: marca.referencia, vista: marca.vista } : null
  const s = vista.sincronia
  // Con el audio aplicado, marcar el evento lo comprueba (no cambia el desfase).
  const comprobando = s.metodo === 'audio'

  const aplicar = () => {
    if (!evento) return
    if (comprobando) onSincronia(vista.id, vista.desfaseS, conComprobacion(s, evento))
    else onSincronia(vista.id, desfaseDeEvento(evento), { metodo: 'evento', evento })
    onTerminar()
  }
  const ajustar = (frames: number) => onSincronia(vista.id, ajustarDesfase(vista.desfaseS, frames, pasoVista), sincroniaTrasAjuste(s))
  const aplicarAudio = () => {
    if (audio.estado.fase !== 'resultado') return
    onSincronia(vista.id, audio.estado.resultado.desfase, sincroniaDeAudio(audio.estado.resultado))
    audio.descartar()
  }

  const sinSincronia = s.metodo === 'ninguna' && vista.desfaseS === 0
  const ajuste = ajusteManual(vista.desfaseS, s)
  // Los dos desfases, si se tienen (el audio comprobado con un evento, o el evento elegido tras comprobar el audio).
  const comparacion = s.audio && s.evento ? compararConEvento({ desfase: s.audio.desfase, incertidumbre: INCERTIDUMBRE_AUDIO }, s.evento, incEvento) : null
  const filas = [
    { letra: 'A', v: referencia, clave: 'referencia' as const },
    { letra: 'B', v: vista, clave: 'vista' as const },
  ]

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="sincronizar-vistas">
      <h2 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
        Sincronizar las vistas <InfoGlosario id="tiempo-comun" tema="el tiempo común y el desfase" className="-my-1.5" />
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
        <dt className="text-texto-2">Desfase de B</dt>
        <dd data-testid="desfase-sincronia">{segundos(vista.desfaseS)}</dd>
        <dt className="text-texto-2">Cómo</dt>
        <dd data-testid="metodo-sincronia">
          {TEXTO_METODO[s.metodo]}
          {s.metodo === 'audio' && s.audio && <> (calidad {fmt(s.audio.calidad, 1)})</>}
          {ajuste !== null && Math.abs(ajuste) > 1e-9 && <span className="text-acento"> · ajustada {milis(ajuste)}</span>}
        </dd>
        {s.metodo === 'evento' && (
          <>
            <dt className="text-texto-2">
              Precisión <InfoGlosario id="sincronia" tema="la sincronía por evento y su precisión" className="-my-1.5 align-middle" />
            </dt>
            <dd data-testid="incertidumbre-sincronia">± {fmt(incEvento * 1000, 0)} ms</dd>
          </>
        )}
        {s.metodo === 'audio' && (
          <>
            <dt className="text-texto-2">
              Precisión <InfoGlosario id="sincronia-audio" tema="la sincronía por audio y lo que no sabe" className="-my-1.5 align-middle" />
            </dt>
            <dd data-testid="incertidumbre-sincronia">± {fmt(INCERTIDUMBRE_AUDIO * 1000, 1)} ms del audio</dd>
          </>
        )}
      </dl>
      {s.metodo === 'audio' && (
        <p className="text-xs text-texto-2">
          La precisión es la del audio: no incluye el retardo entre el sonido y la imagen de cada móvil. {!s.evento && 'Compruébalo con un evento visual.'}
        </p>
      )}

      {comparacion && (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3" data-testid="comprobacion-audio">
          <p className="font-mono text-sm" data-testid="comparacion-audio-evento">
            Audio {segundos(comparacion.audio)} · evento visual {segundos(comparacion.evento)} (± {fmt(incEvento * 1000, 0)} ms) · diferencia{' '}
            {milis(comparacion.diferencia)}
          </p>
          {comparacion.discrepan ? (
            <>
              <p className="flex gap-2 text-sm text-acento" data-testid="aviso-discrepan">
                <ExclamationTriangleIcon className="size-5 shrink-0" />
                Discrepan más de lo que explica la precisión del evento: el retardo entre sonido e imagen de los móviles no es el mismo. La imagen es la que manda.
              </p>
              {s.metodo === 'audio' && s.evento && (
                <button
                  type="button"
                  onClick={() => onSincronia(vista.id, desfaseDeEvento(s.evento!), { metodo: 'evento', evento: s.evento!, audio: s.audio })}
                  className="rounded-md border border-acento px-3 py-2 text-acento"
                >
                  Usar el desfase del evento visual
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-texto-2" data-testid="aviso-coinciden">
              Coinciden dentro de la precisión del evento.
            </p>
          )}
        </div>
      )}

      {!marcando && <PorAudio estado={audio.estado} onEmpezar={() => audio.empezar(referencia.archivo, vista.archivo)} onAplicar={aplicarAudio} onDescartar={audio.descartar} onEvento={onEmpezar} />}

      {!marcando ? (
        <>
          <p className="text-xs text-texto-2">
            {comprobando
              ? 'Comprueba el desfase del audio con un evento que se vea en las dos vistas: no lo cambia, solo muestra la diferencia.'
              : 'O halla el desfase con un evento que se vea en las dos vistas (una palmada, el pie que toca el suelo). Cada vídeo sitúa el evento con un error de hasta medio frame: eso es la precisión.'}
          </p>
          <button type="button" onClick={onEmpezar} className="flex items-center justify-center gap-2 rounded-md border border-acento px-4 py-3 text-acento">
            {comprobando ? 'Comprobar con un evento visual' : 'Marcar el evento en las dos vistas'}
          </button>
        </>
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
              {comprobando ? 'Desfase por el evento' : 'Desfase de B'}: {segundos(desfaseDeEvento(evento))} (± {fmt(incEvento * 1000, 0)} ms)
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!evento}
              onClick={aplicar}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-acento px-3 py-2 font-medium text-fondo disabled:opacity-40"
            >
              <CheckIcon className="size-5" /> {comprobando ? 'Comprobar' : 'Aplicar'}
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

interface PropsAudio {
  readonly estado: ReturnType<typeof useSincronizarAudio>['estado']
  readonly onEmpezar: () => void
  readonly onAplicar: () => void
  readonly onDescartar: () => void
  /** Empieza a marcar el evento visual (lo que se propone cuando el audio no sirve). */
  readonly onEvento: () => void
}

/** Sincronizar por el audio: el botón, la lectura con su progreso y lo que propone (o por qué no puede). */
function PorAudio({ estado, onEmpezar, onAplicar, onDescartar, onEvento }: PropsAudio) {
  const usarEvento = (
    <button type="button" onClick={onEvento} className="rounded-md border border-borde px-3 py-2 text-sm">
      Marcar el evento visual
    </button>
  )
  return (
    <div className="flex flex-col gap-2" data-testid="sincronia-audio">
      <h3 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
        Por el audio <InfoGlosario id="sincronia-audio" tema="la sincronía por audio y lo que no sabe" className="-my-1.5" />
      </h3>
      {estado.fase === 'leyendo' ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 font-mono text-sm" data-testid="progreso-audio" role="status">
            Leyendo el audio… {fmt(estado.progreso * 100, 0)} %
          </p>
          <button type="button" onClick={onDescartar} className="flex items-center gap-1 rounded-md border border-borde px-3 py-2 text-sm">
            <XMarkIcon className="size-5" /> Cancelar
          </button>
        </div>
      ) : estado.fase === 'resultado' ? (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3" data-testid="resultado-audio">
          <p className="font-mono text-sm" data-testid="desfase-audio">
            Desfase de B por el audio: {segundos(estado.resultado.desfase)} (calidad {fmt(estado.resultado.calidad, 1)})
          </p>
          {estado.resultado.fiable ? (
            <div className="flex gap-2">
              <button type="button" onClick={onAplicar} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-acento px-3 py-2 font-medium text-fondo">
                <CheckIcon className="size-5" /> Aplicar
              </button>
              <button type="button" onClick={onDescartar} className="flex flex-1 items-center justify-center gap-2 rounded-md border border-borde px-3 py-2">
                <XMarkIcon className="size-5" /> Descartar
              </button>
            </div>
          ) : (
            <>
              <p className="flex gap-2 text-sm text-acento" data-testid="aviso-audio">
                <ExclamationTriangleIcon className="size-5 shrink-0" />
                El audio no da un pico claro (calidad por debajo de {fmt(CALIDAD_AUDIO_MINIMA, 0)}): puede haber varios golpes parecidos, pasos, música o mucho ruido. Marca el evento visual.
              </p>
              <div className="flex gap-2">
                {usarEvento}
                <button type="button" onClick={onDescartar} className="rounded-md border border-borde px-3 py-2 text-sm">
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      ) : estado.fase === 'parado' ? (
        <button type="button" onClick={onEmpezar} className="flex items-center justify-center gap-2 rounded-md border border-acento px-4 py-3 text-acento">
          <SpeakerWaveIcon className="size-5" /> Sincronizar por el audio
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3" data-testid="aviso-audio">
          <p className="flex gap-2 text-sm text-acento">
            <ExclamationTriangleIcon className="size-5 shrink-0" />
            {estado.fase === 'falta'
              ? `${estado.faltas.map(textoFalta).join(' ')} Usa el evento visual.`
              : estado.fase === 'sinPico'
                ? 'No se encuentra un sonido común en los dos audios (¿en silencio, o grabados con más de 10 s de diferencia?). Usa el evento visual.'
                : `Error al leer el audio: ${estado.mensaje}`}
          </p>
          <div className="flex gap-2">
            {usarEvento}
            <button type="button" onClick={onDescartar} className="rounded-md border border-borde px-3 py-2 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
