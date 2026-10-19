import { useMemo, useState, type ReactNode } from 'react'
import { UMBRAL_CONSTANCIA } from '../../core/calibracion/segmentos'
import { partirInterpolado, type SeriePorFrame } from '../../core/graficas/series'
import GraficaTiempo, { type SerieGrafica, type TokenColor } from './GraficaTiempo'

const fmt = (n: number, d: number) =>
  (Math.round(n * 10 ** d) / 10 ** d + 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Lo que se puede mostrar u ocultar, con su valor en el frame actual. */
interface Interruptor {
  readonly id: string
  readonly nombre: string
  readonly color: TokenColor
  /** Línea fina (lo filtrado) o gruesa (lo medido) en la muestra del botón. */
  readonly fina?: boolean
  readonly valor: (i: number) => string
}

export interface SerieSegmento {
  readonly id: string
  readonly nombre: string
  readonly relativa: ArrayLike<number>
  readonly interpolado: ArrayLike<number>
}

/** Colores de los segmentos, en orden (proximal, distal). */
const COLORES_SEGMENTO: readonly TokenColor[] = ['texto', 'acento']
/** Banda de la gráfica de segmentos: lo que `constanciaSegmento` cuenta como «fuera», en %. */
const BANDA_SEGMENTOS = [-UMBRAL_CONSTANCIA * 100, UMBRAL_CONSTANCIA * 100] as const

interface Props {
  /** Tiempo de cada frame, s. */
  tiempos: ArrayLike<number>
  /** Frame actual, o null. */
  indice: number | null
  onBuscar: (t: number) => void
  /** Nombre corto de la articulación (título del panel) y sentido positivo. */
  titulo: string
  positivo: string
  /** Ángulo por frame, crudo y con las coordenadas filtradas. */
  crudo: SeriePorFrame
  filtrado: SeriePorFrame
  /** Velocidad angular por frame, °/s (NaN = sin valor). */
  velocidad: ArrayLike<number>
  /** Corte aplicado, Hz. */
  corte: number
  /** Longitud de cada segmento frente a su mediana, por frame (fracción; NaN = sin valor). */
  segmentos: readonly SerieSegmento[]
  /** Resumen bajo la gráfica del ángulo. */
  resumen: ReactNode
}

const VISIBLES_DEFECTO: Record<string, boolean> = { crudo: true, filtrado: true, velocidad: true }

const grados = (v: number) => `${fmt(v, 0)}°`
const gradosPorS = (v: number) => fmt(v, 0)
const porcentaje = (v: number) => `${fmt(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0)} %`

/**
 * Gráficas del ángulo (crudo y filtrado) y de su velocidad, una debajo de
 * otra con el mismo eje X en segundos y el mismo cursor. Cada serie se muestra
 * u oculta con su botón, que da además su valor en el frame actual; un panel
 * sin ninguna serie a la vista no se dibuja.
 */
export default function PanelGrafica({ tiempos, indice, onBuscar, titulo, positivo, crudo, filtrado, velocidad, corte, segmentos, resumen }: Props) {
  // Los segmentos empiezan ocultos: son una comprobación, no el análisis.
  const [visibles, setVisibles] = useState(VISIBLES_DEFECTO)
  const visible = (id: string) => visibles[id] ?? false
  const xs = useMemo(() => Array.from(tiempos), [tiempos])
  const desde = xs[0] ?? 0
  const hasta = xs.at(-1) ?? 1

  // Todas las series con un valor por frame, aunque lo seguido no llegue al final.
  const n = xs.length
  const partidas = useMemo(
    () => ({
      crudo: partirInterpolado(crudo.valores, crudo.interpolado, n),
      filtrado: partirInterpolado(filtrado.valores, filtrado.interpolado, n),
      // La velocidad sale de lo filtrado: es interpolada donde lo es el ángulo filtrado.
      velocidad: partirInterpolado(velocidad, filtrado.interpolado, n),
      // En %, como se leen.
      segmentos: segmentos.map((g) => partirInterpolado(Float64Array.from(g.relativa, (r) => r * 100), g.interpolado, n)),
    }),
    [crudo, filtrado, velocidad, segmentos, n],
  )

  const seriesAngulo = useMemo<SerieGrafica[]>(
    () => [
      { id: 'crudo', color: 'acento', valores: partidas.crudo.medida, puntos: true, visible: visibles.crudo! },
      { id: 'crudo-interpolado', color: 'interpolado', valores: partidas.crudo.interpolada, trazos: true, visible: visibles.crudo! },
      // Filtrado: línea fina y clara por encima de la cruda.
      { id: 'filtrado', color: 'texto', valores: partidas.filtrado.medida, ancho: 1.5, visible: visibles.filtrado! },
      { id: 'filtrado-interpolado', color: 'interpolado', valores: partidas.filtrado.interpolada, ancho: 1.5, trazos: true, visible: visibles.filtrado! },
    ],
    [partidas, visibles.crudo, visibles.filtrado],
  )
  const seriesVelocidad = useMemo<SerieGrafica[]>(
    () => [
      { id: 'velocidad', color: 'texto', valores: partidas.velocidad.medida, ancho: 1.5, visible: visibles.velocidad! },
      { id: 'velocidad-interpolada', color: 'interpolado', valores: partidas.velocidad.interpolada, ancho: 1.5, trazos: true, visible: visibles.velocidad! },
    ],
    [partidas, visibles.velocidad],
  )
  const visiblesSegmentos = segmentos.map((g) => (visibles[`segmento-${g.id}`] ? 1 : 0)).join('')
  const seriesSegmentos = useMemo<SerieGrafica[]>(
    () =>
      segmentos.flatMap((g, k) => {
        const v = visiblesSegmentos[k] === '1'
        return [
          { id: `segmento-${g.id}`, color: COLORES_SEGMENTO[k % COLORES_SEGMENTO.length]!, valores: partidas.segmentos[k]!.medida, ancho: 1.5, visible: v },
          { id: `segmento-${g.id}-interpolado`, color: 'interpolado', valores: partidas.segmentos[k]!.interpolada, ancho: 1.5, trazos: true, visible: v },
        ]
      }),
    [segmentos, partidas, visiblesSegmentos],
  )

  const valor = (v: number | undefined, d: number, u: string) => (v !== undefined && Number.isFinite(v) ? `${fmt(v, d)}${u}` : '—')
  const interruptores: Interruptor[] = [
    { id: 'crudo', nombre: 'Crudo', color: 'acento', valor: (i) => valor(crudo.valores[i], 1, '°') },
    { id: 'filtrado', nombre: `Filtrado ${fmt(corte, 1)} Hz`, color: 'texto', fina: true, valor: (i) => valor(filtrado.valores[i], 1, '°') },
    { id: 'velocidad', nombre: 'Velocidad', color: 'texto', fina: true, valor: (i) => valor(velocidad[i], 1, ' °/s') },
    ...segmentos.map((g, k) => ({
      id: `segmento-${g.id}`,
      nombre: g.nombre,
      color: COLORES_SEGMENTO[k % COLORES_SEGMENTO.length]!,
      fina: true,
      valor: (i: number) => {
        // Signo del valor redondeado: sin «+0,0».
        const r = Math.round((g.relativa[i] ?? NaN) * 1000) / 10
        return Number.isFinite(r) ? `${r > 0 ? '+' : ''}${valor(r, 1, ' %')}` : '—'
      },
    })),
  ]

  const comun = { xs, desde, hasta, indice, onBuscar }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-3" data-testid="panel-grafica">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">{titulo}</h2>
        <span className="font-mono text-xs text-texto-2">{positivo} +</span>
      </div>

      <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Series de la gráfica">
        {interruptores.map((s) => {
          const activo = visible(s.id)
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={activo}
              data-testid={`serie-${s.id}`}
              onClick={() => setVisibles((v) => ({ ...v, [s.id]: !v[s.id] }))}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${activo ? 'border-borde text-texto' : 'border-borde/60 text-texto-2 opacity-60'}`}
            >
              <span
                aria-hidden="true"
                className={`inline-block w-4 rounded-full ${s.fina ? 'h-0.5' : 'h-1'}`}
                style={{ backgroundColor: `var(--color-${s.color})` }}
              />
              {s.nombre}
              <span className="font-mono tabular-nums text-texto-2" data-testid={`valor-serie-${s.id}`}>
                {indice === null ? '—' : s.valor(indice)}
              </span>
            </button>
          )
        })}
      </div>

      {(visibles.crudo || visibles.filtrado) && (
        <GraficaTiempo
          {...comun}
          series={seriesAngulo}
          unidad={grados}
          altoMinimo={20}
          alto={190}
          etiqueta="Gráfica del ángulo en el tiempo"
          testid="grafica-angulo"
        />
      )}
      <div className="px-1">{resumen}</div>

      {visibles.velocidad && (
        <div className="flex flex-col gap-1 border-t border-borde pt-2">
          <h3 className="px-1 font-mono text-xs text-texto-2">Velocidad angular (°/s)</h3>
          <GraficaTiempo
            {...comun}
            series={seriesVelocidad}
            unidad={gradosPorS}
            altoMinimo={40}
            alto={130}
            etiqueta="Gráfica de la velocidad angular en el tiempo"
            testid="grafica-velocidad"
          />
        </div>
      )}

      {seriesSegmentos.some((x) => x.visible) && (
        <div className="flex flex-col gap-1 border-t border-borde pt-2">
          <h3 className="px-1 font-mono text-xs text-texto-2">Longitud de los segmentos (% frente a su mediana)</h3>
          <GraficaTiempo
            {...comun}
            series={seriesSegmentos}
            unidad={porcentaje}
            altoMinimo={10}
            banda={BANDA_SEGMENTOS}
            alto={130}
            etiqueta="Gráfica de la longitud de los segmentos en el tiempo"
            testid="grafica-segmentos"
          />
          <p className="px-1 text-xs text-texto-2">
            Con los gomets en el plano de la cámara, la longitud no cambia. Fuera de la banda (±{fmt(UMBRAL_CONSTANCIA * 100, 0)} %), el segmento sale del
            plano o los gomets se deslizan: ahí el ángulo es menos fiable.
          </p>
        </div>
      )}

      <p className="px-1 text-xs text-texto-2">
        Huecos sin línea; <span className="text-interpolado">a trazos</span>, lo interpolado. Ángulo filtrado a {fmt(corte, 1)} Hz. Toca o
        arrastra la gráfica para ir a ese instante.
      </p>
    </section>
  )
}
