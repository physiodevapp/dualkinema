import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { OrientacionVista } from '../core/geometria/canonico'
import { estadisticas, limitarIndice } from '../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../media/video'
import { useRepetir } from './useRepetir'

const SALTO = 10

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

function BotonPaso({ etiqueta, accion, children }: { etiqueta: string; accion: () => void; children: React.ReactNode }) {
  const manejadores = useRepetir(accion)
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      {...manejadores}
      className="flex h-14 flex-1 touch-manipulation items-center justify-center rounded-md border border-borde bg-panel select-none active:border-acento active:text-acento"
    >
      {children}
    </button>
  )
}

export default function Visor({ video, orientacion }: { video: VideoAbierto; orientacion: OrientacionVista }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const total = video.tabla.tiempos.length
  const [deseado, setDeseado] = useState(0)
  const [mostrado, setMostrado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msDecodificar, setMsDecodificar] = useState<number | null>(null)

  // Pintado «el último gana»: si llegan peticiones mientras se decodifica (botón
  // mantenido, deslizador), se salta a la más reciente en vez de encolarlas.
  const pedido = useRef(0)
  const ocupado = useRef(false)

  const pintar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      for (;;) {
        const i = pedido.current
        const inicio = performance.now()
        const frame = await video.frame(i)
        const ctx = lienzo.current?.getContext('2d')
        ctx?.drawImage(frame.canvas, 0, 0)
        setMsDecodificar(performance.now() - inicio)
        setMostrado(i)
        setError(null)
        if (pedido.current === i) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      ocupado.current = false
    }
  }, [video])

  // Primer frame al montar. pintar() solo cambia el estado tras decodificar
  // (asíncrono), no de forma síncrona dentro del efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void pintar(), [pintar])

  const ir = useCallback(
    (i: number) => {
      pedido.current = limitarIndice(video.tabla, i)
      setDeseado(pedido.current)
      void pintar()
    },
    [video, pintar],
  )
  const mover = useCallback((d: number) => ir(pedido.current + d), [ir])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
      const paso = e.shiftKey ? SALTO : 1
      if (e.key === 'ArrowRight') mover(paso)
      else if (e.key === 'ArrowLeft') mover(-paso)
      else if (e.key === 'Home') ir(0)
      else if (e.key === 'End') ir(total - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mover, ir, total])

  const est = useMemo(() => estadisticas(video.tabla), [video])
  const { info } = video
  const t = mostrado === null ? null : video.tabla.tiempos[mostrado]!

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-2xl border border-borde bg-black">
          <canvas
            ref={lienzo}
            width={info.ancho}
            height={info.alto}
            className="mx-auto block max-h-[60dvh] max-w-full"
            style={{ aspectRatio: `${info.ancho} / ${info.alto}` }}
          />
          {mostrado === null && !error && (
            <p className="absolute inset-0 grid place-items-center text-texto-2">Decodificando…</p>
          )}
        </div>

        <div className="flex items-baseline justify-between font-mono text-sm">
          <span>
            t = <span className="text-acento">{t === null ? '—' : fmt(t, 3)} s</span>
          </span>
          <span className="text-texto-2">
            frame {mostrado === null ? '—' : mostrado + 1} / {total}
            {mostrado !== deseado && ' …'}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={total - 1}
          step={1}
          value={deseado}
          onChange={(e) => ir(Number(e.target.value))}
          aria-label="Posición en el vídeo"
          className="w-full accent-acento"
        />

        <div className="flex gap-2">
          <BotonPaso etiqueta={`Retroceder ${SALTO} frames`} accion={() => mover(-SALTO)}>
            <ChevronDoubleLeftIcon className="size-6" />
          </BotonPaso>
          <BotonPaso etiqueta="Frame anterior" accion={() => mover(-1)}>
            <ChevronLeftIcon className="size-7" />
          </BotonPaso>
          <BotonPaso etiqueta="Frame siguiente" accion={() => mover(1)}>
            <ChevronRightIcon className="size-7" />
          </BotonPaso>
          <BotonPaso etiqueta={`Avanzar ${SALTO} frames`} accion={() => mover(SALTO)}>
            <ChevronDoubleRightIcon className="size-6" />
          </BotonPaso>
        </div>
        <p className="text-sm text-texto-2">
          Mantén pulsado para avanzar seguido. Con teclado: ← → (Mayús: de {SALTO} en {SALTO}), Inicio, Fin.
        </p>

        {error && <p className="rounded-md border border-red-400/50 p-3 text-red-300">{error}</p>}
      </div>

      <section className="rounded-2xl border border-borde bg-panel p-4 font-mono text-sm">
        <h2 className="text-xs tracking-wider text-texto-2 uppercase">Datos del vídeo</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-texto-2">Archivo</dt>
          <dd className="truncate" title={info.nombre}>{info.nombre}</dd>
          <dt className="text-texto-2">Formato</dt>
          <dd>{info.formato} · {info.codec}</dd>
          <dt className="text-texto-2">Tamaño</dt>
          <dd>{info.ancho} × {info.alto} px{info.rotacion ? ` (girado ${info.rotacion}°)` : ''}</dd>
          <dt className="text-texto-2">Duración</dt>
          <dd>{fmt(info.duracion, 2)} s</dd>
          <dt className="text-texto-2">Frames</dt>
          <dd>{total}</dd>
          <dt className="text-texto-2">fps medio</dt>
          <dd>{Number.isNaN(est.fpsMedio) ? '—' : fmt(est.fpsMedio, 2)}</dd>
          <dt className="text-texto-2">Entre frames</dt>
          <dd>
            {Number.isNaN(est.pasoMin) ? '—' : `${fmt(est.pasoMin * 1000, 1)}–${fmt(est.pasoMax * 1000, 1)} ms`}
            {est.variable && <span className="text-acento"> · variable</span>}
          </dd>
          <dt className="text-texto-2">Persona</dt>
          <dd>{orientacion.plano === 'sagital' ? `mira a la ${orientacion.mira}` : `vista desde ${orientacion.ve}`}</dd>
          <dt className="text-texto-2">Decodificar</dt>
          <dd>{msDecodificar === null ? '—' : `${fmt(msDecodificar, 0)} ms`}</dd>
        </dl>
      </section>
    </div>
  )
}
