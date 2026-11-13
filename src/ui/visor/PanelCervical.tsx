import { useEffect, useMemo, useRef, useState } from 'react'
import { tramoAlrededor, tramoInicial } from '../../core/articulaciones/cero'
import { anotarFrames, caraVacia, fusionarVistas, giroNeutro, medidaEn, rango, seriesCervicales, type PlanoCervical } from '../../core/cervical/sesion'
import { construirCsvCervical } from '../../core/exportacion/csvCervical'
import { nombreArchivoCsv } from '../../core/exportacion/csv'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { AlWorkerCara, DelWorkerCara } from '../../workers/protocolo'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import GraficaTiempo from './GraficaTiempo'
import PanelExportar from './PanelExportar'
import type { VistaViva } from './vistas'

interface Props {
  readonly vista: VistaViva
  readonly ajustes: AjustesFiltro
  /** Frame que se ve (null mientras se decodifica el primero). */
  readonly mostrado: number | null
  /** Lleva la vista a un instante de su vídeo. */
  readonly onIr: (t: number) => void
  readonly deshabilitado: boolean
  /** La otra vista de la sesión (dos móviles: D6), o null. */
  readonly otra: VistaViva | null
}

type Estado = { fase: 'parado' } | { fase: 'detectando'; progreso: number; delegado?: string } | { fase: 'error'; mensaje: string } | { fase: 'hecho'; conCara: number; ms: number; delegado: string }

const PLANOS: readonly { id: PlanoCervical; nombre: string; pos: string; neg: string }[] = [
  { id: 'rotacion', nombre: 'Rotación', pos: 'izquierda', neg: 'derecha' },
  { id: 'flexion', nombre: 'Flexo-extensión', pos: 'flexión', neg: 'extensión' },
  { id: 'inclinacion', nombre: 'Inclinación lateral', pos: 'izquierda', neg: 'derecha' },
]
const grados = (v: number) => (Number.isFinite(v) ? `${fmt(Math.round(v * 10) / 10 + 0, 1)}°` : '—')
const boton = 'rounded-md border border-borde px-3 py-2 text-sm disabled:opacity-50'

/**
 * Cervical (fase 10, docs/plan-fase-10.md): «Detectar la cara» pasa el vídeo por Face Landmarker en un worker, y de la
 * orientación de la cabeza en cada frame salen la rotación, la flexo-extensión y la inclinación lateral respecto al neutro
 * (el cero: los primeros 2 s al acabar, o «Aquí ± 0,2 s»), con el rango a cada lado y su asimetría, y el CSV. Para una toma
 * de cerca: sentado, con la espalda apoyada y la cabeza y los hombros en el encuadre.
 */
export default function PanelCervical({ vista, ajustes, mostrado, onIr, deshabilitado, otra }: Props) {
  const { cervical, cambiarCervical, tabla, archivo, info } = vista
  const tiempos = tabla.tiempos
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' })
  const [rev, setRev] = useState(0)
  const [plano, setPlano] = useState<PlanoCervical>('rotacion')
  const [juntar, setJuntar] = useState(true)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])

  const detectar = () => {
    worker.current?.terminate()
    const c = caraVacia(tiempos.length)
    cambiarCervical(c)
    let conCara = 0
    const w = new Worker(new URL('../../workers/cara.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    let delegado = ''
    setEstado({ fase: 'detectando', progreso: 0 })
    w.onmessage = (e: MessageEvent<DelWorkerCara>) => {
      if (worker.current !== w) return
      const m = e.data
      if (m.tipo === 'listo') {
        delegado = m.delegado
        setEstado({ fase: 'detectando', progreso: 0, delegado })
      } else if (m.tipo === 'frames') {
        conCara += anotarFrames(c, m.lote)
        setRev((n) => n + 1)
        setEstado({ fase: 'detectando', progreso: m.progreso, delegado })
      } else if (m.tipo === 'fin') {
        w.terminate()
        worker.current = null
        // El neutro, de los primeros 2 s (se cambia después si la persona no estaba quieta mirando al frente).
        cambiarCervical({ ...c, cero: c.cero ?? tramoInicial(tiempos, 2) })
        setEstado({ fase: 'hecho', conCara, ms: m.msProceso, delegado })
      } else {
        w.terminate()
        worker.current = null
        setEstado({ fase: 'error', mensaje: m.mensaje })
      }
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      if (worker.current !== w) return
      worker.current = null
      setEstado({ fase: 'error', mensaje: ev.message || 'no se ha podido cargar la detección. Recarga la página.' })
    }
    w.postMessage({ tipo: 'detectar', archivo, delegado: 'GPU' } satisfies AlWorkerCara)
  }
  const parar = () => {
    worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorkerCara)
  }

  const propias = useMemo(() => (cervical ? tiempos.map((_, i) => medidaEn(cervical, i)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los arrays se llenan en sitio; `rev` dice cuándo.
    [cervical, tiempos, rev])
  // Con la cara detectada en las dos vistas, las dos juntas (D6): el rango completo.
  const otraCara = otra?.cervical ?? null
  const fusion = useMemo(() => {
    if (!juntar || !otra || !otraCara || estado.fase === 'detectando') return null
    const deOtra = otra.tabla.tiempos.map((_, i) => medidaEn(otraCara, i))
    return fusionarVistas({ medidas: propias, tiempos, desfase: vista.desfaseS }, { medidas: deOtra, tiempos: otra.tabla.tiempos, desfase: otra.desfaseS })
  }, [juntar, otra, otraCara, propias, tiempos, vista.desfaseS, estado.fase])
  const medidas = fusion ? fusion.medidas : propias
  const neutro = useMemo(() => (cervical?.cero ? giroNeutro(medidas, tiempos, cervical.cero) : null), [cervical, medidas, tiempos])
  const series = useMemo(() => (neutro ? seriesCervicales(medidas, tiempos, neutro, vista.filtrado.fs, ajustes) : null), [neutro, medidas, tiempos, vista.filtrado.fs, ajustes])
  const utilizables = medidas.filter(Boolean).length
  const detectando = estado.fase === 'detectando'
  const ponerCero = (tramo: ReturnType<typeof tramoInicial>) => cervical && tramo && cambiarCervical({ ...cervical, cero: tramo })
  const t = mostrado !== null ? (tiempos[mostrado] ?? null) : null

  const generar = (formato: Parameters<typeof construirCsvCervical>[1]) => ({
    nombre: nombreArchivoCsv(info.nombre, 'cervical'),
    texto: construirCsvCervical(
      {
        archivo: info.nombre,
        exportado: new Date().toISOString(),
        tiempos,
        calidad: fusion ? medidas.map((m) => m?.calidad ?? 0) : cervical!.calidad,
        cero: cervical!.cero!,
        series: series!,
        corteHz: ajustes.corteHz,
        ...(fusion ? { fuente: `Face Landmarker (MediaPipe), dos móviles juntos (${fmt(fusion.anguloMoviles, 0)}° entre sí)` } : {}),
      },
      formato,
    ),
  })

  return (
    <section className="relative flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-cervical">
      <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
        Cervical <InfoGlosario id="cervical" tema="la orientación de la cabeza" className="-my-1.5" />
      </h2>
      {!cervical && !detectando && (
        <p className="text-sm text-texto-2">
          Rotación, flexo-extensión e inclinación lateral de la cabeza con su cara. Para una toma de cerca: sentado, con la espalda apoyada, la cabeza y los hombros en el encuadre y el móvil delante, a la altura de la cara.
        </p>
      )}
      {detectando ? (
        <div className="flex flex-col gap-2" data-testid="progreso-cara">
          <p className="text-sm text-texto-2">
            Buscando la cara{estado.delegado ? ` (${estado.delegado})` : ''}… {Math.round(estado.progreso * 100)} %
          </p>
          <button type="button" onClick={parar} className={`${boton} self-start`}>
            Parar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={detectar} disabled={deshabilitado} className={cervical ? boton : 'rounded-md bg-acento px-3 py-2 text-sm font-medium text-fondo disabled:opacity-50'}>
            {cervical ? 'Volver a detectar la cara' : 'Detectar la cara'}
          </button>
          {cervical && (
            <button type="button" onClick={() => cambiarCervical(null)} disabled={deshabilitado} className={`${boton} text-texto-2`}>
              Quitar
            </button>
          )}
        </div>
      )}
      {estado.fase === 'error' && <p className="text-sm text-acento">No se ha podido detectar la cara: {estado.mensaje}</p>}
      {cervical && (
        <p className="font-mono text-xs text-texto-2" data-testid="resumen-cervical">
          cara utilizable en {utilizables} de {tiempos.length} frames
          {estado.fase === 'hecho' && ` · ${estado.delegado} · ${fmt(estado.ms / 1000, 1)} s`}
        </p>
      )}
      {cervical && otraCara && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={juntar} onChange={(e) => setJuntar(e.target.checked)} className="accent-acento" data-testid="juntar-moviles" />
          Juntar los dos móviles
        </label>
      )}
      {fusion && (
        <p className="font-mono text-xs text-texto-2" data-testid="fusion-cervical">
          dos móviles a {fmt(fusion.anguloMoviles, 0)}° entre sí · cara en {fusion.deA} frames de este y {fusion.deB} del otro ({fusion.comunes} a la vez)
        </p>
      )}
      {cervical && otra && !otraCara && <p className="text-xs text-texto-2">Detecta también la cara en la otra vista para juntar los dos móviles y cubrir el rango completo.</p>}
      {cervical && !detectando && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-2">Neutro:</span>
          <button type="button" className={boton} onClick={() => ponerCero(tramoInicial(tiempos, 2))}>
            Primeros 2 s
          </button>
          <button type="button" className={boton} disabled={t === null} onClick={() => t !== null && ponerCero(tramoAlrededor(t, tiempos[0]!, tiempos[tiempos.length - 1]!))}>
            Aquí ± 0,2 s
          </button>
          {cervical.cero && (
            <span className="font-mono text-xs text-texto-2" data-testid="neutro-cervical">
              {fmt(cervical.cero.desde, 2)}–{fmt(cervical.cero.hasta, 2)} s{neutro ? '' : ' (sin cara en ese tramo)'}
            </span>
          )}
        </div>
      )}
      {series && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm" data-testid="valores-cervicales">
            {PLANOS.map((p) => (
              <div key={p.id} className="contents">
                <dt className="text-texto-2">{p.nombre}</dt>
                <dd data-testid={`valor-${p.id}`}>{grados(mostrado !== null ? (series[p.id][mostrado]?.valor ?? Number.NaN) : Number.NaN)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Plano cervical">
            {PLANOS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={plano === p.id}
                onClick={() => setPlano(p.id)}
                className={`rounded-md border px-3 py-1.5 text-sm ${plano === p.id ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
              >
                {p.nombre}
              </button>
            ))}
          </div>
          <GraficaTiempo
            xs={tiempos}
            series={[{ id: 'cervical', color: 'acento', valores: series[plano].map((m) => (Number.isFinite(m.valor) ? m.valor : null)), visible: true, ancho: 2 }]}
            desde={tiempos[0] ?? 0}
            hasta={tiempos[tiempos.length - 1] ?? 0}
            indice={mostrado}
            unidad={(v) => `${fmt(v, 0)}°`}
            altoMinimo={20}
            alto={180}
            etiqueta={PLANOS.find((p) => p.id === plano)!.nombre}
            testid="grafica-cervical"
            onBuscar={onIr}
          />
          <table className="w-full font-mono text-xs" data-testid="rangos-cervicales">
            <thead>
              <tr className="text-texto-2">
                <th className="text-left font-normal">Rango</th>
                <th className="text-right font-normal">+</th>
                <th className="text-right font-normal">−</th>
                <th className="text-right font-normal">Asimetría</th>
              </tr>
            </thead>
            <tbody>
              {PLANOS.map((p) => {
                const r = rango(series[p.id])
                return (
                  <tr key={p.id} data-testid={`rango-${p.id}`}>
                    <td className="text-texto-2">{p.nombre}</td>
                    <td className="text-right">
                      {grados(r.positivo)} {p.pos}
                    </td>
                    <td className="text-right">
                      {grados(r.negativo)} {p.neg}
                    </td>
                    <td className="text-right">{Number.isFinite(r.asimetria) ? fmt(r.asimetria, 2) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <PanelExportar generar={generar} resumen={`${tiempos.length} frames · rotación, flexo-extensión e inclinación respecto al neutro`} deshabilitado={deshabilitado} />
        </>
      )}
    </section>
  )
}
