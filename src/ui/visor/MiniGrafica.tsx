import { useMemo } from 'react'
import { ArrowsPointingOutIcon, VideoCameraIcon } from '@heroicons/react/24/outline'
import { partirInterpolado, type SeriePorFrame } from '../../core/graficas/series'
import GraficaTiempo, { type SerieGrafica, type TokenColor } from './GraficaTiempo'

export type ModoMiniGrafica = 'angulo' | 'velocidad' | 'ambas'
type Modo = ModoMiniGrafica

const MODOS: readonly { id: Modo; nombre: string; color: TokenColor }[] = [
  { id: 'angulo', nombre: 'Ángulo', color: 'texto' },
  { id: 'velocidad', nombre: 'Velocidad', color: 'acento' },
  { id: 'ambas', nombre: 'Ambas', color: 'interpolado' },
]

interface Props {
  /** Tiempo de cada frame, s. */
  tiempos: ArrayLike<number>
  /** Frame actual, o null. */
  indice: number | null
  onBuscar: (t: number) => void
  /** Ángulo por frame, crudo y con las coordenadas filtradas. */
  crudo: SeriePorFrame
  filtrado: SeriePorFrame
  /** Velocidad angular por frame, °/s (NaN = sin valor). */
  velocidad: ArrayLike<number>
  /** Qué se ve y cómo cambiarlo. El estado vive fuera: esta gráfica se desmonta en las vistas ampliadas y, si no, volvería a «Ángulo». */
  modo: ModoMiniGrafica
  onModo: (modo: ModoMiniGrafica) => void
  /** Pasa a la vista de solo gráficas. */
  onAmpliar: () => void
  /** Con las herramientas abiertas arriba cabe una sola cosa: vuelve al vídeo (si no se da, no hay botón). */
  onVideo?: () => void
}

const grados = (v: number) => `${Math.round(v)}°`
const gradosPorS = (v: number) => `${Math.round(v)}`
const porcentaje = (v: number) => `${Math.round(v * 100)} %`

/** Mayor valor absoluto de lo que tiene valor (1 si no hay ninguno, para no dividir por 0). */
function maximoAbsoluto(v: ArrayLike<number>): number {
  let m = 0
  for (let i = 0; i < v.length; i++) {
    const a = Math.abs(v[i]!)
    if (Number.isFinite(a) && a > m) m = a
  }
  return m > 0 ? m : 1
}

const dividir = (v: ArrayLike<number>, d: number) => Float64Array.from(v, (x) => x / d)

/**
 * Gráfica baja para tenerla siempre a la vista debajo del vídeo en el móvil. Muestra el ángulo
 * (crudo fino y filtrado), la velocidad angular, o las dos juntas **normalizadas** (cada una
 * dividida por su mayor valor absoluto, así que el eje es «% del máximo» y no unidades: sirve
 * para ver si coinciden en el tiempo, no para leer valores; esos, en la gráfica completa).
 * Mismos huecos y mismo cursor que la completa; tocar o arrastrar salta de frame.
 */
export default function MiniGrafica({ tiempos, indice, onBuscar, crudo, filtrado, velocidad, modo, onModo, onAmpliar, onVideo }: Props) {
  const xs = useMemo(() => Array.from(tiempos), [tiempos])
  const n = xs.length

  const { series, unidad, altoMinimo } = useMemo(() => {
    const c = partirInterpolado(crudo.valores, crudo.interpolado, n)
    const v = partirInterpolado(velocidad, filtrado.interpolado, n)
    if (modo === 'angulo') {
      const f = partirInterpolado(filtrado.valores, filtrado.interpolado, n)
      return {
        series: [
          { id: 'crudo', color: 'texto-2', valores: c.medida, ancho: 1, visible: true },
          { id: 'crudo-interpolado', color: 'interpolado', valores: c.interpolada, ancho: 1, trazos: true, visible: true },
          { id: 'filtrado', color: 'texto', valores: f.medida, ancho: 1.5, visible: true },
          { id: 'filtrado-interpolado', color: 'interpolado', valores: f.interpolada, ancho: 1.5, trazos: true, visible: true },
        ] satisfies SerieGrafica[],
        unidad: grados,
        altoMinimo: 20,
      }
    }
    if (modo === 'velocidad') {
      return {
        series: [
          { id: 'velocidad', color: 'acento', valores: v.medida, ancho: 1.5, visible: true },
          { id: 'velocidad-interpolada', color: 'interpolado', valores: v.interpolada, ancho: 1.5, trazos: true, visible: true },
        ] satisfies SerieGrafica[],
        unidad: gradosPorS,
        altoMinimo: 40,
      }
    }
    // Las dos normalizadas por su propio máximo: el ángulo (de 0 a 1 si no cambia de signo) y la velocidad (de −1 a 1).
    const dAng = maximoAbsoluto(filtrado.valores)
    const dVel = maximoAbsoluto(velocidad)
    const f = partirInterpolado(dividir(filtrado.valores, dAng), filtrado.interpolado, n)
    const vn = partirInterpolado(dividir(velocidad, dVel), filtrado.interpolado, n)
    return {
      series: [
        { id: 'filtrado', color: 'texto', valores: f.medida, ancho: 1.5, visible: true },
        { id: 'filtrado-interpolado', color: 'interpolado', valores: f.interpolada, ancho: 1.5, trazos: true, visible: true },
        { id: 'velocidad', color: 'acento', valores: vn.medida, ancho: 1.5, visible: true },
        { id: 'velocidad-interpolada', color: 'interpolado', valores: vn.interpolada, ancho: 1.5, trazos: true, visible: true },
      ] satisfies SerieGrafica[],
      unidad: porcentaje,
      altoMinimo: 1,
    }
  }, [modo, crudo, filtrado, velocidad, n])

  return (
    // Llena lo que le deja el vídeo en el bloque de arriba (ver `repartoHerramientas.ts`).
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Qué muestra la gráfica pequeña">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={modo === m.id}
              data-testid={`minigrafica-modo-${m.id}`}
              onClick={() => onModo(m.id)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${modo === m.id ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
            >
              {m.id !== 'ambas' && <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: `var(--color-${m.color})` }} />}
              {m.id === 'ambas' && (
                <span aria-hidden="true" className="flex gap-0.5">
                  <span className="inline-block h-0.5 w-1.5 rounded-full bg-texto" />
                  <span className="inline-block h-0.5 w-1.5 rounded-full bg-acento" />
                </span>
              )}
              {m.nombre}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {onVideo && (
            <button
              type="button"
              onClick={onVideo}
              aria-label="Ver el vídeo en lugar de la gráfica"
              title="Ver el vídeo en lugar de la gráfica"
              data-testid="ver-video"
              className="flex size-7 items-center justify-center rounded-md border border-borde text-texto-2"
            >
              <VideoCameraIcon className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onAmpliar}
            aria-label="Ver solo las gráficas"
            title="Ver solo las gráficas"
            data-testid="ampliar-graficas"
            className="flex size-7 items-center justify-center rounded-md border border-borde text-texto-2"
          >
            <ArrowsPointingOutIcon className="size-4" />
          </button>
        </div>
      </div>
      <div data-testid="minigrafica-caja" className="relative min-h-0 flex-1">
        <GraficaTiempo
          xs={xs}
          series={series}
          desde={xs[0] ?? 0}
          hasta={xs.at(-1) ?? 1}
          indice={indice}
          onBuscar={onBuscar}
          unidad={unidad}
          altoMinimo={altoMinimo}
          alto="llenar"
          etiqueta={
            modo === 'ambas'
              ? 'Gráfica del ángulo y de la velocidad angular, normalizadas, en el tiempo'
              : modo === 'velocidad'
                ? 'Gráfica de la velocidad angular en el tiempo, resumida'
                : 'Gráfica del ángulo en el tiempo, resumida'
          }
          testid="minigrafica"
        />
      </div>
      {modo === 'ambas' && <p className="shrink-0 text-[0.65rem] leading-tight text-texto-2">Normalizadas (% del máximo de cada una): para ver si coinciden en el tiempo, no para leer valores.</p>}
    </div>
  )
}
