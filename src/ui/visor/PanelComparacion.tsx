import { useMemo, useState } from 'react'
import uPlot from 'uplot'
import { partirInterpolado, type SeriePorFrame } from '../../core/graficas/series'
import { InfoGlosario } from '../glosario/Glosario'
import GraficaTiempo, { type SerieGrafica, type TokenColor } from './GraficaTiempo'
import type { VistaViva } from './vistas'
import { guardarModoComparacion, leerModoComparacion, MODOS_COMPARACION, type ModoComparacion } from './preferencias'

/** Una vista de las que se comparan: su medida (la serie del ángulo filtrado) con sus propios instantes. */
export interface VistaComparada {
  readonly id: string
  /** «A», «B». */
  readonly letra: string
  /** «Rodilla izquierda (flexión +)»: qué se mide en esta vista. */
  readonly medida: string
  /** Tiempo de cada frame en el vídeo de la vista, s. */
  readonly tiempos: ArrayLike<number>
  /** Segundos que se suman al tiempo del vídeo para dar el tiempo común. */
  readonly desfase: number
  /** El ángulo filtrado por frame y qué frames son interpolados. */
  readonly filtrado: SeriePorFrame
}

interface Props {
  readonly vistas: readonly [VistaComparada, VistaComparada]
  /** Frame mostrado en cada vista (en el orden de `vistas`), o null si el cursor común cae fuera de su vídeo (sin cursor ni valor). */
  readonly indices: readonly [number | null, number | null]
  /** Lo que abarca la sesión (la unión de los dos vídeos, en tiempo común): el eje X de todas las gráficas. */
  readonly desde: number
  readonly hasta: number
  /** Instante común del cursor (el de la vista activa), o null. */
  readonly instante: number | null
  /** Se toca o arrastra una gráfica: instante común pedido. */
  readonly onBuscar: (tComun: number) => void
}

/** Color de cada vista, en orden (A, B): distintos entre sí y de lo interpolado (azul, a trazos). */
const COLORES: readonly TokenColor[] = ['acento', 'texto']

const fmt = (n: number, d: number) => (Math.round(n * 10 ** d) / 10 ** d + 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const grados = (v: number) => `${fmt(v, 0)}°`

/**
 * Las dos medidas en el mismo eje de tiempo (el tiempo común: tiempo del vídeo + desfase de cada vista), con el cursor
 * compartido. **Alineadas**: una gráfica por vista, una encima de la otra, con el mismo eje X. **Superpuestas**: las dos en
 * la misma gráfica, con el color de cada vista (solo tiene sentido porque las dos son grados). Sin remuestrear nada: cada
 * vista conserva sus instantes; al superponerlas se unen con `uPlot.join`, donde un hueco (null) corta la línea y un
 * instante que solo existe en la otra vista (undefined) se salta sin cortarla.
 */
export default function PanelComparacion({ vistas, indices, desde, hasta, instante, onBuscar }: Props) {
  const [modo, setModo] = useState<ModoComparacion>(leerModoComparacion)
  const elegirModo = (m: ModoComparacion) => {
    setModo(m)
    guardarModoComparacion(m)
  }
  // Qué vistas se ven (cada una se oculta con su botón de la leyenda).
  const [visibles, setVisibles] = useState<Readonly<Record<string, boolean>>>({})
  const visible = (id: string) => visibles[id] ?? true

  // Por vista: sus instantes en el tiempo común y su serie partida en lo medido y lo interpolado.
  const [a, b] = vistas
  const datosA = useMemo(() => datosDe(a), [a])
  const datosB = useMemo(() => datosDe(b), [b])
  const datos = [datosA, datosB]

  const serieDe = (k: number, valores: { medida: (number | null)[]; interpolada: (number | null)[] }, v: boolean): SerieGrafica[] => [
    { id: `${vistas[k]!.id}`, color: COLORES[k]!, valores: valores.medida, ancho: 1.5, puntos: true, visible: v },
    { id: `${vistas[k]!.id}-interpolado`, color: 'interpolado', valores: valores.interpolada, ancho: 1.5, trazos: true, visible: v },
  ]

  // Alineadas: las series de cada vista, memorizadas. Si se crearan en cada render, `GraficaTiempo` vería datos nuevos con
  // cada cambio de frame y redibujaría la gráfica entera (el cursor va en una capa aparte: mover el frame no redibuja).
  const seriesAlineadas = useMemo<readonly [SerieGrafica[], SerieGrafica[]]>(
    () => [serieDe(0, datosA.partida, true), serieDe(1, datosB.partida, true)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serieDe solo lee los ids de las vistas, que no cambian
    [datosA, datosB, a.id, b.id],
  )

  // Superpuestas: las dos tablas en una sola con los instantes de las dos (join de uPlot; cada serie conserva sus huecos).
  const unidas = useMemo(() => {
    const t = uPlot.join([
      [datosA.xs, datosA.partida.medida, datosA.partida.interpolada],
      [datosB.xs, datosB.partida.medida, datosB.partida.interpolada],
    ] as uPlot.AlignedData[])
    return t as unknown as [number[], ...(number | null)[][]]
  }, [datosA, datosB])
  const seriesUnidas = useMemo<SerieGrafica[]>(
    () => [
      ...serieDe(0, { medida: unidas[1]!, interpolada: unidas[2]! }, visibles[a.id] ?? true),
      ...serieDe(1, { medida: unidas[3]!, interpolada: unidas[4]! }, visibles[b.id] ?? true),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serieDe solo lee los ids de las vistas, que no cambian
    [unidas, visibles, a.id, b.id],
  )

  const valorEn = (v: VistaComparada, k: number) => {
    const i = indices[k]!
    const x = i === null ? NaN : (v.filtrado.valores[i] ?? NaN)
    return Number.isFinite(x) ? `${fmt(x, 1)}°` : '—'
  }

  return (
    <div className="flex flex-col gap-2" data-testid="comparacion">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
        <div className="flex items-center gap-1">
          <h3 className="font-mono text-xs text-texto-2">Comparar las vistas</h3>
          <InfoGlosario id="tiempo-comun" tema="el tiempo común y el desfase" className="-my-1.5" />
        </div>
        <div className="flex overflow-hidden rounded-md border border-borde text-xs" role="group" aria-label="Cómo comparar las vistas">
          {MODOS_COMPARACION.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              data-testid={`comparacion-${m}`}
              onClick={() => elegirModo(m)}
              className={`px-2 py-1 ${modo === m ? 'bg-acento text-fondo' : 'text-texto-2'}`}
            >
              {m === 'alineadas' ? 'Alineadas' : 'Superpuestas'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Vistas de la comparación">
        {vistas.map((v, k) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={visible(v.id)}
            data-testid={`comparacion-vista-${v.letra}`}
            onClick={() => setVisibles((s) => ({ ...s, [v.id]: !(s[v.id] ?? true) }))}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${visible(v.id) ? 'border-borde text-texto' : 'border-borde/60 text-texto-2 opacity-60'}`}
          >
            <span aria-hidden="true" className="inline-block h-1 w-4 rounded-full" style={{ backgroundColor: `var(--color-${COLORES[k]})` }} />
            {v.letra} · {v.medida}
            <span className="font-mono tabular-nums text-texto-2" data-testid={`comparacion-valor-${v.letra}`}>
              {valorEn(v, k)}
            </span>
          </button>
        ))}
      </div>

      {modo === 'alineadas' ? (
        vistas.map((v, k) =>
          visible(v.id) ? (
            <div key={v.id}>
              <GraficaTiempo
                xs={datos[k]!.xs}
                series={seriesAlineadas[k]!}
                desde={desde}
                hasta={hasta}
                indice={indices[k]!}
                unidad={grados}
                altoMinimo={20}
                alto={130}
                etiqueta={`Gráfica de ${v.medida} de la vista ${v.letra} en el tiempo común`}
                testid={`comparacion-grafica-${v.letra}`}
                onBuscar={onBuscar}
              />
            </div>
          ) : null,
        )
      ) : (
        <div>
          <GraficaTiempo
            xs={unidas[0]}
            series={seriesUnidas}
            desde={desde}
            hasta={hasta}
            indice={null}
            instante={instante}
            unidad={grados}
            altoMinimo={20}
            alto={190}
            etiqueta="Gráfica de las dos vistas superpuestas en el tiempo común"
            testid="comparacion-grafica"
            onBuscar={onBuscar}
          />
        </div>
      )}
    </div>
  )
}

/**
 * La vista como la compara este panel. Se memoriza por lo que la define (no por el objeto de la vista, que es nuevo en cada
 * render): así no se rehacen los datos de las gráficas con cada cambio de frame.
 */
export function useVistaComparada(w: VistaViva | undefined, letra: string): VistaComparada | null {
  const id = w?.id
  const tabla = w?.tabla
  const desfase = w?.desfaseS
  const filtrado = w?.filtradoPorFrame
  const articulacion = w?.articulacion
  return useMemo(
    () =>
      !id || !tabla || desfase === undefined || !filtrado || !articulacion
        ? null
        : {
            id,
            letra,
            medida: `${articulacion.nombre.replace(/\s*\(.*\)$/, '')} (${articulacion.positivo} +)`,
            tiempos: tabla.tiempos,
            desfase,
            filtrado,
          },
    [id, letra, tabla, desfase, filtrado, articulacion],
  )
}

/** Los instantes de una vista en el tiempo común y su serie partida en lo medido y lo interpolado. */
function datosDe(v: VistaComparada) {
  const n = v.tiempos.length
  return {
    xs: Array.from(v.tiempos, (t) => t + v.desfase),
    partida: partirInterpolado(v.filtrado.valores, v.filtrado.interpolado, n),
  }
}
