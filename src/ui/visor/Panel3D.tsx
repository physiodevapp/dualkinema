import { useMemo, useState } from 'react'
import { ceroDeReferencia, tramoAlrededor, tramoInicial, type TramoEstatico } from '../../core/articulaciones/cero'
import { construirCsv3D } from '../../core/exportacion/csv3d'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import { marcadoresSinMarcadores } from '../../core/pose/catalogo'
import { esPuntoMedio } from '../../core/pose/puntos'
import { pasoTipico } from '../../core/sincronia/evento'
import { fpsMediano } from '../../core/tiempo/tablaFrames'
import { frameVisibleEnComun } from '../../core/tiempo/comun'
import { ARTICULACIONES_3D, serieAngular3D, type Plano3D } from '../../core/tresd/angulos3d'
import type { Calibracion3D } from '../../core/tresd/calibracion3d'
import { aLaboratorio, filtrar3D, triangularSesion } from '../../core/tresd/puntos3d'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import GraficaTiempo from './GraficaTiempo'
import Monigote3D from './Monigote3D'
import PanelExportar from './PanelExportar'
import type { VistaViva } from './vistas'

interface Props {
  readonly a: VistaViva
  readonly b: VistaViva
  readonly calibracion: Calibracion3D
  readonly ajustes: AjustesFiltro
  /** Instante común del cursor (el de la vista activa), o null. */
  readonly instante: number | null
  /** Lo que abarca la sesión (tiempo común): el eje X. */
  readonly desde: number
  readonly hasta: number
  readonly onBuscar: (tComun: number) => void
}

const IDS = marcadoresSinMarcadores({ plano: 'sagital', mira: 'derecha' }).filter((id) => !esPuntoMedio(id))
const NOMBRE_PLANO: Record<Plano3D, string> = { sagital: 'Sagital', frontal: 'Frontal', transversal: 'Transversal' }
const grados = (v: number) => `${fmt(Math.round(v * 10) / 10 + 0, 1)}°`

/**
 * Los ángulos en 3D (fase 6, paso 4), en «Análisis» con la sesión calibrada: de las dos piernas, en los tres planos, de
 * los puntos 3D filtrados (`core/tresd/`). La gráfica va en el tiempo común con el cursor de la sesión, el valor en el
 * cursor sin cero y relativo al cero (de los primeros 2 s o de un tramo alrededor del cursor), y un CSV con todos los
 * ángulos y las coordenadas 3D. Los puntos 3D se recalculan de las trayectorias 2D: corregir un punto en una vista cambia
 * su 3D.
 */
export default function Panel3D({ a, b, calibracion, ajustes, instante, desde, hasta, onBuscar }: Props) {
  const [elegida, setElegida] = useState(ARTICULACIONES_3D[0]!.id)
  const [ceros, setCeros] = useState<Readonly<Record<string, TramoEstatico>>>({})
  const { version: va } = a
  const { version: vb } = b
  const tr = useMemo(
    () => {
      const ladoLargo = Math.max(a.info.ancho, a.info.alto, b.info.ancho, b.info.alto)
      const vista = (w: VistaViva) => ({ series: w.series, tabla: w.tabla, desfase: w.desfaseS, paso: pasoTipico(w.tabla) })
      return filtrar3D(aLaboratorio(triangularSesion(calibracion, vista(a), vista(b), IDS, ladoLargo)), fpsMediano(a.tabla), ajustes)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión de cada vista lo dice.
    [calibracion, va, vb, a.desfaseS, b.desfaseS, ajustes, a.series, b.series, a.tabla, b.tabla],
  )
  const imagenes = useMemo(
    () =>
      [
        { ancho: a.info.ancho, alto: a.info.alto },
        { ancho: b.info.ancho, alto: b.info.alto },
      ] as const,
    [a.info, b.info],
  )
  const art = ARTICULACIONES_3D.find((x) => x.id === elegida)!
  const serie = useMemo(() => serieAngular3D(elegida, tr), [elegida, tr])
  const tramo = ceros[elegida] ?? null
  const cero = tramo ? ceroDeReferencia(serie, tramo) : null
  const indice = instante === null ? null : frameVisibleEnComun({ tabla: { tiempos: tr.tiempos }, desfase: 0 }, instante)
  const valor = indice === null ? NaN : (serie[indice]?.valor ?? NaN)
  const conValor = serie.filter((m) => Number.isFinite(m.valor)).length
  const xs = tr.tiempos

  const generar = (formato: Parameters<typeof construirCsv3D>[1]) => {
    const angulos = ARTICULACIONES_3D.map((x) => {
      const s = x.id === elegida ? serie : serieAngular3D(x.id, tr)
      const t = ceros[x.id]
      return { art: x, serie: s, cero: t ? (ceroDeReferencia(s, t)?.media ?? null) : null }
    })
    const texto = construirCsv3D({ tr, calibracion, angulos, puntos: IDS, corteHz: ajustes.corteHz, sincronia: b.sincronia.metodo }, formato)
    return { nombre: 'dualkinema_3d.csv', texto }
  }

  const ponerCero = (t: TramoEstatico | null) => setCeros((c) => (t ? { ...c, [elegida]: t } : Object.fromEntries(Object.entries(c).filter(([k]) => k !== elegida))))

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
      />
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Articulación
        <select
          value={elegida}
          onChange={(e) => setElegida(e.target.value)}
          className="rounded-md border border-borde bg-fondo px-2 py-2 text-sm text-texto"
          data-testid="articulacion-3d"
        >
          {(['sagital', 'frontal', 'transversal'] as const).map((plano) => (
            <optgroup key={plano} label={NOMBRE_PLANO[plano]}>
              {ARTICULACIONES_3D.filter((x) => x.plano === plano).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre.replace(/ en 3D$/, '')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
        <dt className="text-texto-2">En el cursor</dt>
        <dd data-testid="valor-3d">{Number.isFinite(valor) ? grados(valor) : '—'}</dd>
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
        series={[{ id: '3d', color: 'acento', valores: serie.map((m) => (Number.isFinite(m.valor) ? m.valor : null)), visible: true, ancho: 2 }]}
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
      <PanelExportar generar={generar} resumen={`${xs.length} frames · ${ARTICULACIONES_3D.length} ángulos 3D y las coordenadas de ${IDS.length} puntos${tr.enMetros ? ' (m)' : ' (sin escala)'}`} />
    </section>
  )
}
