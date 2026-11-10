import { frameVisibleEnComun } from '../../core/tiempo/comun'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import GraficaTiempo from './GraficaTiempo'
import SelectorArticulacion3D from './SelectorArticulacion3D'
import type { Angulos3D } from './useAngulos3D'

const grados = (v: number) => `${fmt(Math.round(v * 10) / 10 + 0, 1)}°`

interface Props {
  readonly t3: Angulos3D
  /** Instante común del cursor (el de la vista activa), o null. */
  readonly instante: number | null
  readonly desde: number
  readonly hasta: number
  readonly onBuscar: (tComun: number) => void
  /** Más alta (escritorio o «Solo gráficas»). */
  readonly ampliada: boolean
}

/**
 * La gráfica central con la sesión calibrada en 3D (pedida por el usuario el 10-11): el ángulo 3D que se mira (de los
 * puntos 3D o del esqueleto, el mismo estado que la tarjeta de «Análisis», `useAngulos3D`) en el tiempo común, con el
 * cursor de la sesión y el valor en el cursor (y relativo al cero, si lo hay). Con dos móviles en flancos, los ángulos 2D
 * de cada vista son proyecciones: esta es la medida. El cero y el esqueleto se ponen en «Análisis».
 */
export default function Grafica3DCentral({ t3, instante, desde, hasta, onBuscar, ampliada }: Props) {
  const { tr, serie, art, cero, fuente, esqueleto } = t3
  const indice = instante === null ? null : frameVisibleEnComun({ tabla: { tiempos: tr.tiempos }, desfase: 0 }, instante)
  const valor = indice === null ? NaN : (serie[indice]?.valor ?? NaN)
  const sinEsqueleto = fuente === 'esqueleto' && !esqueleto
  return (
    <section className="flex shrink-0 flex-col gap-2" data-testid="grafica-central-3d">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
          {art.nombre.replace(/ en 3D$/, '').replace(/ \(esqueleto\)$/, '')} · 3D{fuente === 'esqueleto' ? ' (esqueleto)' : ''}
          <InfoGlosario id="angulos-tres-d" tema="los ángulos en 3D" className="-my-1.5" />
        </h3>
        <p className="font-mono text-sm" data-testid="valor-3d-central">
          {Number.isFinite(valor) ? grados(valor) : '—'}
          {cero && Number.isFinite(valor) && <span className="text-texto-2"> · relativo {grados(valor - cero.media)}</span>}
        </p>
      </div>
      <SelectorArticulacion3D t3={t3} testid="articulacion-3d-central" />
      {sinEsqueleto ? (
        <p className="text-sm text-texto-2">El esqueleto aún no está ajustado: hazlo en «Análisis» → «Ángulos en 3D» → «Ajustar el esqueleto».</p>
      ) : (
        <GraficaTiempo
          xs={tr.tiempos}
          series={[
            { id: '3d', color: 'acento', valores: serie.map((m) => (Number.isFinite(m.valor) && m.fiable ? m.valor : null)), visible: true, ancho: 2 },
            { id: '3d-poco-fiable', color: 'texto-2', valores: serie.map((m) => (Number.isFinite(m.valor) && !m.fiable ? m.valor : null)), visible: true, ancho: 1, trazos: true },
          ]}
          desde={desde}
          hasta={hasta}
          indice={indice}
          unidad={(v) => `${fmt(v, 0)}°`}
          altoMinimo={20}
          alto={ampliada ? 300 : 200}
          etiqueta={art.nombre}
          testid="grafica-3d-central"
          onBuscar={onBuscar}
        />
      )}
      <p className="text-xs text-texto-2">+ es {art.positivo}. El cero, la fuente (puntos o esqueleto) y el CSV, en «Análisis» → «Ángulos en 3D».</p>
    </section>
  )
}
