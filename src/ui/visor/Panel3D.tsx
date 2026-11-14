import { tramoAlrededor, tramoInicial } from '../../core/articulaciones/cero'
import { frameVisibleEnComun } from '../../core/tiempo/comun'
import { ARTICULACIONES_3D } from '../../core/tresd/angulos3d'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import GraficaTiempo from './GraficaTiempo'
import Monigote3D from './Monigote3D'
import PanelExportar from './PanelExportar'
import PanelCinetica from './PanelCinetica'
import PanelMarcha3D from './PanelMarcha3D'
import SelectorArticulacion3D from './SelectorArticulacion3D'
import { IDS_3D, type Angulos3D } from './useAngulos3D'

interface Props {
  /** Los ángulos 3D de la sesión (`useAngulos3D`, compartidos con la gráfica central). */
  readonly t3: Angulos3D
  /** Instante común del cursor (el de la vista activa), o null. */
  readonly instante: number | null
  /** Lo que abarca la sesión (tiempo común): el eje X. */
  readonly desde: number
  readonly hasta: number
  readonly onBuscar: (tComun: number) => void
  /** El filtro de la sesión (la marcha filtra sus señales con él). */
  readonly ajustes: { readonly corteHz: number }
}

const medianaFinita = (xs: readonly number[]) => {
  const v = xs.filter(Number.isFinite).sort((p, q) => p - q)
  return v.length ? v[Math.floor(v.length / 2)]! : NaN
}
const grados = (v: number) => `${fmt(Math.round(v * 10) / 10 + 0, 1)}°`

/**
 * Los ángulos en 3D (fase 6, paso 4), en «Análisis» con la sesión calibrada: de las dos piernas, en los tres planos, de
 * los puntos 3D filtrados (`core/tresd/`). La gráfica va en el tiempo común con el cursor de la sesión, el valor en el
 * cursor sin cero y relativo al cero (de los primeros 2 s o de un tramo alrededor del cursor), y un CSV con todos los
 * ángulos y las coordenadas 3D. Los puntos 3D se recalculan de las trayectorias 2D: corregir un punto en una vista cambia
 * su 3D.
 */
export default function Panel3D({ t3, instante, desde, hasta, onBuscar, ajustes }: Props) {
  const { tr, calibracion, imagenes, ocupado, fuente, setFuente, ajuste, estadoEsq, esqueleto, art, serie, puntosEsqueleto, tramo, cero, ponerCero } = t3
  const ajustarEsqueleto = t3.ajustarEsqueleto
  const pararEsqueleto = t3.pararEsqueleto
  const indice = instante === null ? null : frameVisibleEnComun({ tabla: { tiempos: tr.tiempos }, desfase: 0 }, instante)
  const valor = indice === null ? NaN : (serie[indice]?.valor ?? NaN)
  const conValor = serie.filter((m) => Number.isFinite(m.valor)).length
  const xs = tr.tiempos

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-3d">
      <h2 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
        Ángulos en 3D <InfoGlosario id="angulos-tres-d" tema="los ángulos en 3D y el marco de la pelvis" className="-my-1.5" />
      </h2>
      <Monigote3D
        tr={tr}
        calibracion={calibracion}
        imagenes={imagenes}
        indice={indice}
        puntos={puntosEsqueleto}
      />
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">De dónde salen los ángulos</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="fuente-3d" checked={fuente === 'puntos'} onChange={() => setFuente('puntos')} className="accent-acento" />
          Puntos
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="fuente-3d" checked={fuente === 'esqueleto'} onChange={() => setFuente('esqueleto')} className="accent-acento" data-testid="fuente-esqueleto" />
          Esqueleto
        </label>
        <InfoGlosario id="esqueleto" tema="el esqueleto ajustado" className="-my-1.5" />
      </fieldset>
      {fuente === 'esqueleto' && (
        <div className="flex flex-col gap-2" data-testid="esqueleto-3d">
          {estadoEsq.fase === 'ajustando' ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm" role="status" data-testid="progreso-esqueleto">
                Ajustando el esqueleto… {Math.round(estadoEsq.fraccion * 100)} %
              </p>
              <button type="button" onClick={pararEsqueleto} className="rounded-md border border-borde px-3 py-2 text-sm">
                Parar
              </button>
            </div>
          ) : (
            <button type="button" onClick={ajustarEsqueleto} disabled={ocupado} className="rounded-md border border-acento px-4 py-3 text-acento disabled:opacity-40">
              {esqueleto ? 'Volver a ajustar el esqueleto' : 'Ajustar el esqueleto'}
            </button>
          )}
          {estadoEsq.fase === 'error' && <p className="text-sm text-acento">No se ha podido ajustar: {estadoEsq.mensaje}</p>}
          {ajuste?.cambiado && !esqueleto && <p className="text-xs text-texto-2">Los puntos han cambiado desde el último ajuste: vuelve a ajustarlo.</p>}
          {esqueleto && (
            <p className="font-mono text-xs text-texto-2" data-testid="resumen-esqueleto">
              {esqueleto.posturas.filter(Boolean).length} de {esqueleto.posturas.length} frames ajustados · error mediano{' '}
              {fmt(medianaFinita(esqueleto.errores), 1)} px · muslo {fmt(esqueleto.medidas.muslo * (tr.enMetros ? 100 : 1), tr.enMetros ? 0 : 3)}
              {tr.enMetros ? ' cm' : ''}
              {Math.max(esqueleto.asimetria.muslo, esqueleto.asimetria.pierna) > 0.05 ? ' · las dos piernas miden distinto: revisa la detección' : ''}
            </p>
          )}
        </div>
      )}
      <SelectorArticulacion3D t3={t3} testid="articulacion-3d" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
        <dt className="text-texto-2">En el cursor</dt>
        <dd data-testid="valor-3d">
          {Number.isFinite(valor) ? grados(valor) : '—'}
          {Number.isFinite(valor) && serie[indice ?? -1]?.fiable === false && <span className="text-texto-2"> (poco fiable: rodilla casi recta)</span>}
        </dd>
        {cero && (
          <>
            <dt className="text-texto-2">Relativo al cero</dt>
            <dd data-testid="relativo-3d">{Number.isFinite(valor) ? grados(valor - cero.media) : '—'}</dd>
          </>
        )}
        <dt className="text-texto-2">+ es</dt>
        <dd className="font-sans">{art.positivo}</dd>
      </dl>
      <GraficaTiempo
        xs={xs}
        series={[
          { id: '3d', color: 'acento', valores: serie.map((m) => (Number.isFinite(m.valor) && m.fiable ? m.valor : null)), visible: true, ancho: 2 },
          // Lo poco fiable (la rotación de cadera con la rodilla recta, D4 de la fase 7), tenue y a trazos.
          { id: '3d-poco-fiable', color: 'texto-2', valores: serie.map((m) => (Number.isFinite(m.valor) && !m.fiable ? m.valor : null)), visible: true, ancho: 1, trazos: true },
        ]}
        desde={desde}
        hasta={hasta}
        indice={indice}
        unidad={(v) => `${fmt(v, 0)}°`}
        altoMinimo={20}
        alto={180}
        etiqueta={art.nombre}
        testid="grafica-3d"
        onBuscar={onBuscar}
      />
      <p className="text-xs text-texto-2" data-testid="resumen-3d">
        {conValor} de {xs.length} frames con este ángulo en 3D (los puntos tienen que verse en las dos vistas).
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="self-center text-xs text-texto-2">Cero:</span>
        <button type="button" onClick={() => ponerCero(tramoInicial(xs))} className="rounded-md border border-borde px-3 py-2">
          Primeros 2 s
        </button>
        <button
          type="button"
          onClick={() => instante !== null && xs.length && ponerCero(tramoAlrededor(instante, xs[0]!, xs[xs.length - 1]!))}
          className="rounded-md border border-borde px-3 py-2"
        >
          Aquí ± 0,2 s
        </button>
        {tramo && (
          <button type="button" onClick={() => ponerCero(null)} className="rounded-md border border-borde px-3 py-2 text-texto-2">
            Quitar el cero
          </button>
        )}
      </div>
      {cero && (
        <p className="font-mono text-xs text-texto-2" data-testid="cero-3d">
          cero {grados(cero.media)} ({fmt(cero.tramo.desde, 2)}–{fmt(cero.tramo.hasta, 2)} s, ± {fmt(cero.desviacion, 1)}°)
        </p>
      )}
      <PanelExportar generar={t3.generar} resumen={`${xs.length} frames · ${ARTICULACIONES_3D.length} ángulos 3D y las coordenadas de ${IDS_3D.length} puntos${tr.enMetros ? ' (m)' : ' (sin escala)'}`} />
      <PanelCinetica t3={t3} instante={instante} desde={desde} hasta={hasta} onBuscar={onBuscar} ajustes={ajustes} />
      <PanelMarcha3D t3={t3} instante={instante} onBuscar={onBuscar} ajustes={ajustes} />
    </section>
  )
}
