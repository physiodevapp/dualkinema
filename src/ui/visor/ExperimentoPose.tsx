import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardDocumentIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import type { Lado } from '../../core/articulaciones/catalogo'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { OrientacionVista } from '../../core/geometria/canonico'
import { cambiosDeLado } from '../../core/pose/cambiosLado'
import { anguloFiltradoPorFrame, compararSeries } from '../../core/pose/comparar'
import { textoInforme } from '../../core/pose/informe'
import { rodillaSagitalPose, trayectoriasPose, type FramePose } from '../../core/pose/puntos'
import { fpsMediano, type TablaFrames } from '../../core/tiempo/tablaFrames'
import type { AlWorkerPose, DelWorkerPose, TamanoModeloPose } from '../../workers/protocolo'
import { grados } from './formato'
import GraficaTiempo, { type SerieGrafica } from './GraficaTiempo'

/** Frames ya procesados por el modelo: los puntos de cada uno (null = nadie detectado), por índice de frame. */
export type EsqueletoPorFrame = ReadonlyMap<number, readonly number[] | null>

interface Props {
  archivo: File
  tabla: TablaFrames
  ancho: number
  alto: number
  orientacion: OrientacionVista
  lado: Lado
  ajustes: AjustesFiltro
  /** Flexión de la rodilla con los gomets, filtrada, un valor por frame (NaN = sin valor); null si esta vista no la mide. */
  gomets: Float64Array | null
  /** Tiempo de cada frame en el eje X de las gráficas (con dos vistas, el tiempo común). */
  tiemposGrafica: readonly number[]
  mostrado: number | null
  onBuscar: (t: number) => void
  /** El esqueleto de cada frame procesado, para dibujarlo sobre el vídeo (null al desmontar). */
  onEsqueleto: (esqueleto: EsqueletoPorFrame | null) => void
}

type Estado =
  | { fase: 'parado' }
  | { fase: 'cargando' }
  | { fase: 'detectando'; progreso: number }
  | { fase: 'hecho'; motivo: 'final' | 'cancelado' }
  | { fase: 'error'; mensaje: string }

interface Medida {
  modelo: TamanoModeloPose
  delegado: string
  avisoDelegado?: string
  msCarga: number
  msProceso: number
  procesados: number
}

const MODELOS: readonly { id: TamanoModeloPose; nombre: string }[] = [
  { id: 'lite', nombre: 'Lite (rápido)' },
  { id: 'full', nombre: 'Full' },
  { id: 'heavy', nombre: 'Heavy (preciso, lento)' },
]

/**
 * Experimento sin marcadores (fase 5, paso 1; solo con `?pose`): pasa MediaPipe Pose por el vídeo de la vista en un
 * worker, dibuja el esqueleto sobre el vídeo y, de perfil, compara la flexión de la rodilla con la de los gomets (si los
 * hay) y da un informe para copiar. No guarda nada: al cerrar el vídeo se pierde.
 */
export default function ExperimentoPose({ archivo, tabla, ancho, alto, orientacion, lado, ajustes, gomets, tiemposGrafica, mostrado, onBuscar, onEsqueleto }: Props) {
  const [modelo, setModelo] = useState<TamanoModeloPose>('full')
  const [delegadoPedido, setDelegadoPedido] = useState<'GPU' | 'CPU'>('GPU')
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' })
  const [frames, setFrames] = useState<EsqueletoPorFrame>(new Map())
  const [medida, setMedida] = useState<Medida | null>(null)
  const [copiado, setCopiado] = useState(false)
  const worker = useRef<Worker | null>(null)
  const total = tabla.tiempos.length

  // El esqueleto va al visor para dibujarlo; al desmontar (otra vista, otro vídeo) se quita y se cierra el worker.
  useEffect(() => onEsqueleto(frames), [frames, onEsqueleto])
  useEffect(
    () => () => {
      worker.current?.terminate()
      onEsqueleto(null)
    },
    [onEsqueleto],
  )

  const empezar = () => {
    worker.current?.terminate()
    const w = new Worker(new URL('../../workers/pose.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const acumulado = new Map<number, readonly number[] | null>()
    setFrames(new Map())
    setMedida(null)
    setCopiado(false)
    setEstado({ fase: 'cargando' })
    let parcial: Medida = { modelo, delegado: delegadoPedido, msCarga: 0, msProceso: 0, procesados: 0 }
    w.onmessage = (e: MessageEvent<DelWorkerPose>) => {
      if (worker.current !== w) return
      const m = e.data
      if (m.tipo === 'listo') {
        parcial = { ...parcial, delegado: m.delegado, avisoDelegado: m.avisoDelegado, msCarga: m.msCarga }
        setEstado({ fase: 'detectando', progreso: 0 })
      } else if (m.tipo === 'frames') {
        for (const f of m.lote) acumulado.set(f.indice, f.puntos)
        setFrames(new Map(acumulado))
        setEstado({ fase: 'detectando', progreso: m.progreso })
      } else if (m.tipo === 'fin') {
        setMedida({ ...parcial, msProceso: m.msProceso, procesados: m.procesados })
        setEstado({ fase: 'hecho', motivo: m.motivo })
        w.terminate()
        worker.current = null
      } else {
        setEstado({ fase: 'error', mensaje: m.mensaje })
        w.terminate()
        worker.current = null
      }
    }
    w.onerror = (e) => {
      setEstado({ fase: 'error', mensaje: e.message || 'El worker sin marcadores ha fallado.' })
      w.terminate()
      worker.current = null
    }
    w.postMessage({ tipo: 'detectar', archivo, modelo, delegado: delegadoPedido } satisfies AlWorkerPose)
  }
  const parar = () => worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorkerPose)

  const sagital = orientacion.plano === 'sagital'
  const hecho = estado.fase === 'hecho'
  // El análisis, al acabar (mientras detecta solo se dibuja el esqueleto).
  const analisis = useMemo(() => {
    if (!hecho || !medida) return null
    const lista: FramePose[] = [...frames].map(([indice, puntos]) => ({ indice, t: tabla.tiempos[indice]!, puntos }))
    const trayectorias = trayectoriasPose(lista, total)
    const pose = sagital ? anguloFiltradoPorFrame(trayectorias, rodillaSagitalPose(lado), orientacion, tabla, ajustes) : null
    const comparacion = pose && gomets ? compararSeries(gomets, pose) : null
    const framesGomets = gomets ? gomets.filter(Number.isFinite).length : 0
    const texto = textoInforme({
      modelo: medida.modelo,
      delegado: medida.delegado,
      avisoDelegado: medida.avisoDelegado,
      msCarga: medida.msCarga,
      msProceso: medida.msProceso,
      procesados: medida.procesados,
      total,
      ancho,
      alto,
      duracion: total > 1 ? tabla.tiempos[total - 1]! - tabla.tiempos[0]! : 0,
      fps: fpsMediano(tabla),
      lado,
      trayectorias,
      conAngulo: pose ? pose.filter(Number.isFinite).length : 0,
      cambiosLado: cambiosDeLado(trayectorias, 0.05 * alto).length,
      corteHz: ajustes.corteHz,
      comparacion,
      framesGomets,
    })
    return { pose, comparacion, texto }
  }, [hecho, medida, frames, tabla, total, sagital, lado, orientacion, ajustes, gomets, ancho, alto])

  const xs = useMemo(() => Array.from(tiemposGrafica), [tiemposGrafica])
  const series = useMemo<SerieGrafica[]>(() => {
    const comoLinea = (v: Float64Array) => Array.from(v, (x) => (Number.isFinite(x) ? x : null))
    const r: SerieGrafica[] = []
    if (analisis?.pose) r.push({ id: 'pose', color: 'texto', valores: comoLinea(analisis.pose), ancho: 2, visible: true })
    if (gomets && analisis?.pose) r.push({ id: 'gomets', color: 'acento', valores: comoLinea(gomets), ancho: 2, visible: true })
    return r
  }, [analisis, gomets])

  const copiar = async () => {
    if (!analisis) return
    try {
      await navigator.clipboard.writeText(analisis.texto)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  const ocupado = estado.fase === 'cargando' || estado.fase === 'detectando'
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-acento/50 bg-panel p-4" data-testid="experimento-pose">
      <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Sin marcadores (experimental)</h2>
      <p className="text-sm text-texto-2">
        Detecta el cuerpo en cada frame con MediaPipe y dibuja el esqueleto sobre el vídeo.{' '}
        {sagital ? 'Si esta vista tiene los gomets seguidos, compara la flexión de la rodilla de las dos formas.' : 'De frente solo se dibuja el esqueleto.'} No se guarda nada.
        El vídeo no sale del móvil; la primera vez se descarga el modelo (6–30 MB).
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          Modelo
          <select value={modelo} disabled={ocupado} onChange={(e) => setModelo(e.target.value as TamanoModeloPose)} className="rounded-md border border-borde bg-fondo px-2 py-1">
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Procesador
          <select value={delegadoPedido} disabled={ocupado} onChange={(e) => setDelegadoPedido(e.target.value as 'GPU' | 'CPU')} className="rounded-md border border-borde bg-fondo px-2 py-1">
            <option value="GPU">GPU</option>
            <option value="CPU">CPU</option>
          </select>
        </label>
      </div>
      {ocupado ? (
        <button type="button" onClick={parar} className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3">
          <StopIcon className="size-5" /> Parar
          <span className="inline-block w-[12ch] text-right font-mono text-sm text-texto-2" data-testid="progreso-pose">
            {estado.fase === 'cargando' ? 'cargando…' : `${Math.round(estado.progreso * 100)} %`}
          </span>
        </button>
      ) : (
        <button type="button" onClick={empezar} className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo">
          <PlayIcon className="size-5" /> Detectar el cuerpo (experimental)
        </button>
      )}
      {estado.fase === 'error' && (
        <p className="rounded-md border border-acento/50 p-3 text-sm" role="status" data-testid="error-pose">
          No se ha podido detectar: {estado.mensaje}
        </p>
      )}
      {hecho && estado.motivo === 'cancelado' && <p className="text-sm text-texto-2">Parado: el informe es de lo procesado hasta ahí.</p>}
      {analisis && (
        <>
          {series.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-texto-2">
                Flexión de la rodilla: <span className="text-texto">sin marcadores</span>
                {gomets && (
                  <>
                    {' '}
                    y <span className="text-acento">gomets</span>
                  </>
                )}
                {analisis.comparacion && <> · diferencia media {grados(analisis.comparacion.media)}°</>}
              </p>
              <GraficaTiempo
                xs={xs}
                series={series}
                desde={xs[0] ?? 0}
                hasta={xs[xs.length - 1] ?? 0}
                indice={mostrado}
                unidad={grados}
                altoMinimo={20}
                alto={180}
                etiqueta="Flexión de la rodilla con gomets y sin marcadores"
                testid="grafica-pose"
                onBuscar={onBuscar}
              />
            </div>
          )}
          <pre className="overflow-x-auto rounded-md border border-borde bg-fondo p-3 font-mono text-xs whitespace-pre-wrap" data-testid="informe-pose">
            {analisis.texto}
          </pre>
          <button type="button" onClick={copiar} className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-2 text-sm">
            <ClipboardDocumentIcon className="size-5" /> {copiado ? 'Copiado' : 'Copiar el informe'}
          </button>
        </>
      )}
    </section>
  )
}
