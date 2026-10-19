import { useMemo } from 'react'
import { partirInterpolado, type SeriePorFrame } from '../../core/graficas/series'
import GraficaTiempo, { type SerieGrafica } from './GraficaTiempo'

interface Props {
  /** Tiempo de cada frame, s. */
  tiempos: ArrayLike<number>
  /** Frame actual, o null. */
  indice: number | null
  onBuscar: (t: number) => void
  /** Ángulo por frame, crudo y con las coordenadas filtradas. */
  crudo: SeriePorFrame
  filtrado: SeriePorFrame
}

const grados = (v: number) => `${Math.round(v)}°`

/**
 * Gráfica baja del ángulo (crudo fino y filtrado) para tenerla siempre a la vista debajo del
 * vídeo en el móvil. Misma gráfica, mismos huecos y mismo cursor que la completa; tocar o
 * arrastrar salta de frame. La velocidad y los segmentos, solo en la completa.
 */
export default function MiniGrafica({ tiempos, indice, onBuscar, crudo, filtrado }: Props) {
  const xs = useMemo(() => Array.from(tiempos), [tiempos])
  const n = xs.length
  const series = useMemo<SerieGrafica[]>(() => {
    const c = partirInterpolado(crudo.valores, crudo.interpolado, n)
    const f = partirInterpolado(filtrado.valores, filtrado.interpolado, n)
    return [
      { id: 'crudo', color: 'acento', valores: c.medida, ancho: 1, visible: true },
      { id: 'crudo-interpolado', color: 'interpolado', valores: c.interpolada, ancho: 1, trazos: true, visible: true },
      { id: 'filtrado', color: 'texto', valores: f.medida, ancho: 1.5, visible: true },
      { id: 'filtrado-interpolado', color: 'interpolado', valores: f.interpolada, ancho: 1.5, trazos: true, visible: true },
    ]
  }, [crudo, filtrado, n])

  return (
    <GraficaTiempo
      xs={xs}
      series={series}
      desde={xs[0] ?? 0}
      hasta={xs.at(-1) ?? 1}
      indice={indice}
      onBuscar={onBuscar}
      unidad={grados}
      altoMinimo={20}
      alto={84}
      etiqueta="Gráfica del ángulo en el tiempo, resumida"
      testid="minigrafica"
    />
  )
}
