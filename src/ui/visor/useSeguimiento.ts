import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../../core/modelo/tipos'
import type { VideoAbierto } from '../../media/video'
import type { AlWorker, DelWorker, MuestraFrame } from '../../workers/protocolo'
import { nombreCorto } from '../marcadores'
import type { ErrorDeToque } from './ErrorToque'
import { describirMotivos } from './formato'
import type { SeriesTrayectorias } from './useTrayectorias'

/** Aviso del panel «Marcar»: el texto, el detalle para diagnosticar y, si hay huecos, el primer frame con hueco. */
export type Aviso = { texto: string; detalle?: string; irA?: number }

type Seguimiento = { estado: 'parado' } | { estado: 'siguiendo'; progreso: number }

interface Opciones {
  readonly video: VideoAbierto
  readonly modelo: ModeloMarcadores
  /** Los marcadores que se siguen: los gomets (los puntos sin marcadores no se siguen: se detectan). */
  readonly ids: readonly IdMarcador[]
  readonly series: SeriesTrayectorias
  readonly muestra: (id: IdMarcador, i: number) => Muestra2D | undefined
  /** ¿Posición utilizable para el análisis? (`CALIDAD_MINIMA`; la define el visor). */
  readonly valida: (m: Muestra2D | undefined) => m is Muestra2D
  /** Mutadores de `useTrayectorias`. */
  readonly aplicarLote: (lote: readonly MuestraFrame[]) => void
  readonly borrarDespuesDe: (desde: number, ids: readonly IdMarcador[]) => SeriesTrayectorias
  readonly devolver: (quitado: SeriesTrayectorias) => void
  /** Frame mostrado (null mientras se decodifica el primero). */
  readonly mostrado: number | null
  readonly setAviso: Dispatch<SetStateAction<Aviso | null>>
  readonly setSeleccionado: Dispatch<SetStateAction<IdMarcador | null>>
  readonly setErrorToque: Dispatch<SetStateAction<ErrorDeToque | null>>
}

/**
 * El seguimiento con el worker: se crea una vez por vídeo abierto (el visor se monta de nuevo con cada apertura),
 * recibe los lotes y el final (con sus avisos), y si no llega a arrancar devuelve lo que «Seguir desde aquí» quitó.
 */
export function useSeguimiento({
  video,
  modelo,
  ids,
  series,
  muestra,
  valida,
  aplicarLote,
  borrarDespuesDe,
  devolver,
  mostrado,
  setAviso,
  setSeleccionado,
  setErrorToque,
}: Opciones) {
  const total = video.tabla.tiempos.length
  const [seguimiento, setSeguimiento] = useState<Seguimiento>({ estado: 'parado' })

  // ---- Worker de seguimiento ----
  const worker = useRef<Worker | null>(null)
  // Lo seguido que «Seguir desde aquí» quitó, hasta que llega el primer lote: si el
  // seguimiento no arranca (gomet no reconocido, error), se devuelve tal cual.
  const quitadoAlSeguir = useRef<Map<IdMarcador, (Muestra2D | undefined)[]> | null>(null)
  const devolverQuitado = useCallback(() => {
    const quitado = quitadoAlSeguir.current
    quitadoAlSeguir.current = null
    if (!quitado) return
    devolver(quitado)
  }, [devolver])
  useEffect(() => {
    const w = new Worker(new URL('../../workers/seguimiento.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<DelWorker>) => {
      const m = e.data
      if (m.tipo === 'muestras') {
        if (m.lote.length) quitadoAlSeguir.current = null
        aplicarLote(m.lote)
        setSeguimiento({ estado: 'siguiendo', progreso: m.progreso })
      } else if (m.tipo === 'fin') {
        setSeguimiento({ estado: 'parado' })
        devolverQuitado()
        const nombre = (id: IdMarcador) => nombreCorto(modelo.marcadores.find((x) => x.id === id)?.nombre ?? id)
        if (m.motivo === 'inicio') {
          setAviso({
            texto: `No reconozco ${m.sinReconocer.map(nombre).join(' ni ')} en este frame. Vuelve a tocarlo justo encima del gomet.`,
          })
          setSeleccionado(m.sinReconocer[0] ?? null)
        } else if (m.huecos.length) {
          const primero = Math.min(...m.huecos.map((h) => h.primero))
          setAviso({
            texto:
              `${m.motivo === 'final' ? 'Seguimiento completado' : 'Seguimiento parado'}, con huecos: ` +
              m.huecos.map((h) => `${nombre(h.id)} no tiene posición fiable en ${h.frames} frame${h.frames === 1 ? '' : 's'}`).join('; ') +
              '. Son los frames en rojo de la franja y no se rellenan. Si en alguno sí se ve el gomet, tócalo ahí y pulsa «Seguir desde aquí».',
            detalle: m.huecos.map((h) => `${nombre(h.id)}: ${describirMotivos(h)}`).join('\n'),
            irA: primero,
          })
          setSeleccionado(m.huecos[0]!.id)
        } else {
          setAviso({ texto: m.motivo === 'final' ? 'Seguimiento completado hasta el final del vídeo, sin huecos.' : 'Seguimiento parado.' })
        }
      } else {
        setSeguimiento({ estado: 'parado' })
        devolverQuitado()
        setAviso({ texto: `Error en el seguimiento: ${m.mensaje}` })
      }
    }
    // Si el worker no llega a cargar (p. ej. una versión nueva publicada con la app abierta)
    // o el navegador lo cierra, no llegaría ningún mensaje y el visor quedaría «siguiendo».
    w.onerror = (ev) => {
      ev.preventDefault()
      setSeguimiento({ estado: 'parado' })
      devolverQuitado()
      setAviso({ texto: `Error en el seguimiento: ${ev.message || 'no se ha podido cargar el proceso de seguimiento. Recarga la página.'}` })
    }
    return () => w.terminate()
  }, [modelo, devolverQuitado, aplicarLote, setAviso, setSeleccionado])

  const posicionesEn = useCallback(
    (i: number) => ids.map((id) => ({ id, m: muestra(id, i) })),
    [ids, muestra],
  )
  const listoParaSeguir = mostrado !== null && ids.length > 0 && posicionesEn(mostrado).every(({ m }) => valida(m))

  const seguirDesdeAqui = () => {
    if (mostrado === null || !listoParaSeguir) return
    // Lo seguido antes a partir de aquí se descarta; lo marcado a mano se conserva.
    // Se guarda una copia por si el seguimiento no llega a arrancar.
    quitadoAlSeguir.current = borrarDespuesDe(mostrado, ids)
    setAviso(null)
    setErrorToque(null)
    setSeguimiento({ estado: 'siguiendo', progreso: mostrado / Math.max(1, total - 1) })
    // Lo marcado a mano más adelante son anclas: el seguidor las respeta y sigue desde ellas.
    const anclas: { indice: number; id: IdMarcador; x: number; y: number }[] = []
    for (const id of ids) {
      const serie = series.get(id) ?? []
      for (let i = mostrado + 1; i < total; i++) {
        const m = serie[i]
        if (m?.editadoManual && Number.isFinite(m.x)) anclas.push({ indice: i, id, x: m.x, y: m.y })
      }
    }
    const msg: AlWorker = {
      tipo: 'seguir',
      archivo: video.archivo,
      desde: mostrado,
      posiciones: posicionesEn(mostrado).map(({ id, m }) => ({ id, x: m!.x, y: m!.y })),
      anclas,
    }
    worker.current?.postMessage(msg)
  }
  const pararSeguimiento = () => worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorker)

  const siguiendo = seguimiento.estado === 'siguiendo'
  const progresoSeguimiento = seguimiento.estado === 'siguiendo' ? seguimiento.progreso : 0

  return { siguiendo, progresoSeguimiento, listoParaSeguir, seguirDesdeAqui, pararSeguimiento }
}
