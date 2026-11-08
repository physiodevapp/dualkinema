import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ARTICULACIONES_ESQUELETO, serieEsqueleto, type ResultadoEsqueleto } from '../../core/esqueleto/sesion'
import { puntosDePostura } from '../../core/esqueleto/modelo'
import type { AlWorkerEsqueleto, DelWorkerEsqueleto } from '../../workers/protocolo'
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
export default function Panel3D({ a, b, calibracion, ajustes, instante, desde, hasta, onBuscar }: Props) {
  const [elegida, setElegida] = useState(ARTICULACIONES_3D[0]!.id)
  const [ceros, setCeros] = useState<Readonly<Record<string, TramoEstatico>>>({})
  // Mientras se sigue o se detecta en una vista, sus trayectorias cambian con cada lote: no se rehace el 3D de toda la toma
  // cada vez (se rehace al acabar).
  const ocupado = a.siguiendo || a.detectando || b.siguiendo || b.detectando
  const va = ocupado ? -1 : a.version
  const vb = ocupado ? -1 : b.version
  // Sin filtrar (de él depende si el esqueleto ajustado sigue valiendo: cambiar el corte del filtro no lo invalida) y filtrado.
  const bruto = useMemo(
    () => {
      const ladoLargo = Math.max(a.info.ancho, a.info.alto, b.info.ancho, b.info.alto)
      const vista = (w: VistaViva) => ({ series: w.series, tabla: w.tabla, desfase: w.desfaseS, paso: pasoTipico(w.tabla) })
      return aLaboratorio(triangularSesion(calibracion, vista(a), vista(b), IDS, ladoLargo))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión de cada vista lo dice.
    [calibracion, va, vb, a.desfaseS, b.desfaseS, a.series, b.series, a.tabla, b.tabla],
  )
  const tr = useMemo(() => filtrar3D(bruto, fpsMediano(a.tabla), ajustes), [bruto, a.tabla, ajustes])
  const imagenes = useMemo(
    () =>
      [
        { ancho: a.info.ancho, alto: a.info.alto },
        { ancho: b.info.ancho, alto: b.info.alto },
      ] as const,
    [a.info, b.info],
  )
  // El esqueleto (fase 7): se ajusta a petición en un worker y vale mientras no cambien los puntos 3D de los que sale.
  const [fuente, setFuente] = useState<'puntos' | 'esqueleto'>('puntos')
  const [ajuste, setAjuste] = useState<{ bruto: typeof bruto; resultado: ResultadoEsqueleto | null; ms: number } | null>(null)
  const [estadoEsq, setEstadoEsq] = useState<{ fase: 'parado' } | { fase: 'ajustando'; fraccion: number } | { fase: 'error'; mensaje: string }>({ fase: 'parado' })
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  const esqueleto = ajuste && ajuste.bruto === bruto ? ajuste.resultado : null
  const conEsqueleto = fuente === 'esqueleto' && !!esqueleto
  const lista = fuente === 'esqueleto' ? ARTICULACIONES_ESQUELETO : ARTICULACIONES_3D
  const elegidaVigente = lista.some((x) => x.id === elegida) ? elegida : lista[0]!.id
  const fs = fpsMediano(a.tabla)
  const art = lista.find((x) => x.id === elegidaVigente)!
  const serie = useMemo(() => {
    if (fuente === 'esqueleto') {
      const ae = ARTICULACIONES_ESQUELETO.find((x) => x.id === elegidaVigente)!
      return esqueleto ? serieEsqueleto(ae, esqueleto, fs, ajustes) : tr.tiempos.map((t) => ({ t, valor: NaN, interpolado: false, fiable: true }))
    }
    return serieAngular3D(elegidaVigente, tr).map((m) => ({ ...m, fiable: true }))
  }, [fuente, elegidaVigente, tr, esqueleto, fs, ajustes])
  const puntosEsqueleto = useMemo(
    () => (conEsqueleto && esqueleto ? (i: number) => (esqueleto.posturas[i] ? puntosDePostura(esqueleto.posturas[i]!, esqueleto.medidas) : null) : undefined),
    [conEsqueleto, esqueleto],
  )

  const ajustarEsqueleto = () => {
    worker.current?.terminate()
    const w = new Worker(new URL('../../workers/esqueleto.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const desde = bruto
    setEstadoEsq({ fase: 'ajustando', fraccion: 0 })
    w.onmessage = (e: MessageEvent<DelWorkerEsqueleto>) => {
      if (worker.current !== w) return
      const m = e.data
      if (m.tipo === 'progreso') return setEstadoEsq({ fase: 'ajustando', fraccion: m.fraccion })
      if (m.tipo === 'hecho') {
        setAjuste({ bruto: desde, resultado: m.resultado, ms: m.ms })
        setEstadoEsq(m.resultado ? { fase: 'parado' } : { fase: 'error', mensaje: 'no hay bastantes puntos 3D para medir a la persona.' })
      } else setEstadoEsq({ fase: 'error', mensaje: m.mensaje })
      w.terminate()
      worker.current = null
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      if (worker.current !== w) return
      setEstadoEsq({ fase: 'error', mensaje: ev.message || 'no se ha podido cargar el cálculo. Recarga la página.' })
      worker.current = null
    }
    const vista = (x: VistaViva) => ({ series: x.series, tabla: x.tabla, desfase: x.desfaseS, paso: pasoTipico(x.tabla) })
    w.postMessage({ tipo: 'ajustar', calibracion, a: vista(a), b: vista(b), tr, ids: IDS } satisfies AlWorkerEsqueleto)
  }
  const pararEsqueleto = () => {
    worker.current?.terminate()
    worker.current = null
    setEstadoEsq({ fase: 'parado' })
  }
  const tramo = ceros[elegidaVigente] ?? null
  const cero = tramo ? ceroDeReferencia(serie, tramo) : null
  const indice = instante === null ? null : frameVisibleEnComun({ tabla: { tiempos: tr.tiempos }, desfase: 0 }, instante)
  const valor = indice === null ? NaN : (serie[indice]?.valor ?? NaN)
  const conValor = serie.filter((m) => Number.isFinite(m.valor)).length
  const xs = tr.tiempos

  const generar = (formato: Parameters<typeof construirCsv3D>[1]) => {
    const angulos = ARTICULACIONES_3D.map((x) => {
      const s = serieAngular3D(x.id, tr)
      const t = ceros[x.id]
      return { art: x, serie: s, cero: t ? (ceroDeReferencia(s, t)?.media ?? null) : null }
    })
    const delEsqueleto = esqueleto
      ? ARTICULACIONES_ESQUELETO.map((x) => {
          const s = serieEsqueleto(x, esqueleto, fs, ajustes)
          const t = ceros[x.id]
          return { art: x, serie: s, cero: t ? (ceroDeReferencia(s, t)?.media ?? null) : null, conFiable: !!x.ladoRotacion }
        })
      : []
    const texto = construirCsv3D({ tr, calibracion, angulos, esqueleto: delEsqueleto, puntos: IDS, corteHz: ajustes.corteHz, sincronia: b.sincronia.metodo }, formato)
    return { nombre: 'dualkinema_3d.csv', texto }
  }

  const ponerCero = (t: TramoEstatico | null) =>
    setCeros((c) => (t ? { ...c, [elegidaVigente]: t } : Object.fromEntries(Object.entries(c).filter(([k]) => k !== elegidaVigente))))

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
          {ajuste && ajuste.bruto !== bruto && !esqueleto && <p className="text-xs text-texto-2">Los puntos han cambiado desde el último ajuste: vuelve a ajustarlo.</p>}
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
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Articulación
        <select
          value={elegidaVigente}
          onChange={(e) => setElegida(e.target.value)}
          className="rounded-md border border-borde bg-fondo px-2 py-2 text-sm text-texto"
          data-testid="articulacion-3d"
        >
          {(['sagital', 'frontal', 'transversal'] as const).map((plano) => (
            <optgroup key={plano} label={NOMBRE_PLANO[plano]}>
              {lista.filter((x) => x.plano === plano).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre.replace(/ en 3D$/, '').replace(/ \(esqueleto\)$/, '')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
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
      <PanelExportar generar={generar} resumen={`${xs.length} frames · ${ARTICULACIONES_3D.length} ángulos 3D y las coordenadas de ${IDS.length} puntos${tr.enMetros ? ' (m)' : ' (sin escala)'}`} />
    </section>
  )
}
