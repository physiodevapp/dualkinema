import { useMemo } from 'react'
import type { CeroReferencia } from '../../core/articulaciones/cero'
import type { Lado } from '../../core/articulaciones/catalogo'
import { metrosPorPx, type EscalaPlano } from '../../core/calibracion/escala'
import { construirCsvMarcha } from '../../core/exportacion/csvMarcha'
import { nombreArchivoCsv } from '../../core/exportacion/csv'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import { analizarMarcha, idsDelPie, type AnalisisMarcha } from '../../core/marcha/analisis'
import { PUNTOS_CICLO, type MotivoDescarte } from '../../core/marcha/ciclos'
import type { EventoMarcha } from '../../core/marcha/eventos'
import { alternarExcluido, anadirEvento, MARCHA_VACIA, moverEvento, quitarEvento } from '../../core/marcha/guardado'
import { fuenteDe } from '../../core/pose/catalogo'
import { InfoGlosario } from '../glosario/Glosario'
import PanelExportar from './PanelExportar'
import type { Filtrado } from './useFiltrado'
import type { VistaViva } from './vistas'

interface Props {
  readonly vista: VistaViva
  readonly filtrado: Filtrado
  readonly ajustes: AjustesFiltro
  readonly cero: CeroReferencia | null
  readonly calibracion: EscalaPlano | null
  /** La pierna de la cámara de la sesión (por si la articulación no la dice). */
  readonly lado: Lado
  /** Tiempo del vídeo del frame que se ve (null mientras se decodifica el primero). */
  readonly t: number | null
  /** Lleva la vista a un instante de su vídeo. */
  readonly onIr: (t: number) => void
  readonly nombreArchivo: string
  readonly deshabilitado: boolean
}

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')
const MOTIVO: Record<MotivoDescarte, string> = { hueco: 'cruza un hueco', despegues: 'sin un despegue en medio', duracion: 'dura demasiado distinto' }
const boton = 'rounded-md border border-borde px-2 py-1 text-xs text-texto-2 disabled:opacity-50'

/**
 * La marcha de una vista de perfil (fase 9, D8 de docs/plan-fase-9.md): «Buscar los ciclos», los parámetros, la curva de la
 * articulación que se mira en % del ciclo (media ± DE con los ciclos detrás), los ciclos para incluir o excluir, los
 * eventos para corregir y el CSV.
 */
export default function PanelMarcha({ vista, filtrado, ajustes, cero, calibracion, lado: ladoSesion, t, onIr, nombreArchivo, deshabilitado }: Props) {
  const { articulacion, series, version, orientacion, marcha, cambiarMarcha } = vista
  const lado: Lado = articulacion.id.endsWith('_izq') ? 'izq' : articulacion.id.endsWith('_der') ? 'der' : ladoSesion
  // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión lo dice.
  const ids = useMemo(() => idsDelPie(series, lado, fuenteDe(articulacion)), [series, version, lado, articulacion])
  const analisis = useMemo(
    () =>
      marcha && ids
        ? analizarMarcha({
            series,
            orientacion,
            lado,
            ids,
            fs: filtrado.fs,
            ajustes,
            guardado: marcha,
            serieAngulo: filtrado.serie,
            cero: cero?.media ?? null,
            metrosPorPx: calibracion ? metrosPorPx(calibracion) : null,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión lo dice.
    [marcha, ids, series, version, orientacion, lado, filtrado, ajustes, cero, calibracion],
  )
  if (orientacion.plano !== 'sagital') return null
  const titulo = (
    <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
      Marcha <InfoGlosario id="marcha" tema="el análisis de la marcha" className="-my-1.5" />
    </h2>
  )
  if (!marcha || !analisis) {
    return (
      <section className="relative flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-marcha">
        {titulo}
        <p className="text-sm text-texto-2">
          {ids
            ? 'Para una toma andando de perfil: busca los contactos y despegues del pie de la cámara, corta la toma en ciclos y da la curva media de la articulación que se mira.'
            : 'Hacen falta el talón, la punta del pie y la cadera del lado de la cámara: detecta el cuerpo o marca los gomets del tobillo (calcáneo y 5.º metatarsiano) y el trocánter.'}
        </p>
        <button
          type="button"
          disabled={!ids || deshabilitado}
          onClick={() => cambiarMarcha(marcha ?? MARCHA_VACIA)}
          className="self-start rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-fondo disabled:opacity-50"
        >
          Buscar los ciclos
        </button>
      </section>
    )
  }
  const p = analisis.parametros
  const validos = analisis.ciclos.filter((c) => !c.descarte)
  const descartados = analisis.ciclos.filter((c) => c.descarte)
  const enCintaTexto = marcha.enCinta === null ? 'auto' : marcha.enCinta ? 'cinta' : 'suelo'
  const generar = (formato: Parameters<typeof construirCsvMarcha>[1]) => ({
    nombre: nombreArchivoCsv(nombreArchivo, `marcha_${articulacion.id}`),
    texto: construirCsvMarcha(
      { archivo: nombreArchivo, exportado: new Date().toISOString(), articulacion: { id: articulacion.id, nombre: articulacion.nombre }, cero: cero?.media ?? null, corteHz: ajustes.corteHz, analisis },
      formato,
    ),
  })
  return (
    <section className="relative flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-marcha">
      <div className="flex items-center justify-between gap-2">
        {titulo}
        <button type="button" className={boton} onClick={() => cambiarMarcha(null)} disabled={deshabilitado}>
          Dejar de mirar la marcha
        </button>
      </div>
      <p className="text-sm text-texto-2" data-testid="resumen-marcha">
        {validos.length} ciclos válidos del pie {lado === 'der' ? 'derecho' : 'izquierdo'}
        {descartados.length > 0 && ` · ${descartados.length} descartados`}
        {analisis.ciclos.some((c) => c.excluido) && ` · ${analisis.ciclos.filter((c) => c.excluido).length} excluidos a mano`}
      </p>
      {p && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm" data-testid="parametros-marcha">
          <dt className="text-texto-2">Zancada</dt>
          <dd data-testid="zancada">
            {fmt(p.zancada.media, 2)} s{Number.isFinite(p.zancada.de) && ` ± ${fmt(p.zancada.de, 2)}`}
          </dd>
          <dt className="text-texto-2">Cadencia</dt>
          <dd data-testid="cadencia">{fmt(p.cadencia)} pasos/min</dd>
          <dt className="text-texto-2">Apoyo</dt>
          <dd data-testid="apoyo">{fmt(p.apoyo.media)} % del ciclo</dd>
          <dt className="text-texto-2">Longitud</dt>
          <dd data-testid="longitud">{p.longitud ? `${fmt(p.longitud.media, 2)} m` : p.enCinta ? '— (en cinta)' : '— (sin escala)'}</dd>
          <dt className="text-texto-2">Velocidad</dt>
          <dd data-testid="velocidad">{p.velocidad !== null ? `${fmt(p.velocidad, 2)} m/s` : '—'}</dd>
        </dl>
      )}
      <label className="flex items-center gap-2 text-xs text-texto-2">
        Dónde anda
        <select
          value={enCintaTexto}
          onChange={(e) => cambiarMarcha({ ...marcha, enCinta: e.target.value === 'auto' ? null : e.target.value === 'cinta' })}
          className="rounded-md border border-borde bg-fondo px-2 py-1 text-sm text-texto"
          data-testid="donde-anda"
        >
          <option value="auto">{`Lo decide la app (${p?.enCinta ? 'en cinta' : 'por el suelo'})`}</option>
          <option value="suelo">Por el suelo</option>
          <option value="cinta">En cinta</option>
        </select>
      </label>
      <GraficaCiclo analisis={analisis} titulo={`${articulacion.nombre.replace(/\s*sin marcadores$/, '')}${cero ? ', relativo al cero' : ''}`} />
      <div className="flex flex-col gap-1" data-testid="lista-ciclos">
        <h3 className="text-xs text-texto-2">Ciclos</h3>
        {analisis.ciclos.map((c, k) => (
          <div key={`${c.inicio}`} className={`flex flex-wrap items-center gap-2 text-xs ${c.descarte ? 'text-texto-2' : ''}`} data-testid="ciclo">
            {!c.descarte && (
              <input type="checkbox" checked={!c.excluido} onChange={() => cambiarMarcha(alternarExcluido(marcha, c.inicio))} aria-label={`Ciclo ${k + 1} en la media`} />
            )}
            <span className="font-mono">
              {k + 1}. {fmt(c.inicio, 2)}–{fmt(c.fin, 2)} s ({fmt(c.fin - c.inicio, 2)} s)
            </span>
            {c.descarte ? <span>descartado: {MOTIVO[c.descarte]}</span> : !c.curva && <span>sin la curva entera</span>}
            <button type="button" className={boton} onClick={() => onIr(c.inicio)} disabled={deshabilitado}>
              Ir
            </button>
          </div>
        ))}
      </div>
      <Eventos eventos={analisis.eventos} t={t} onIr={onIr} deshabilitado={deshabilitado} onCambiar={(f) => cambiarMarcha(f(marcha))} lado={lado} />
      <PanelExportar generar={generar} resumen={`La curva en % del ciclo: media, DE y cada uno de los ${validos.filter((c) => !c.excluido && c.curva).length} ciclos`} deshabilitado={deshabilitado} />
    </section>
  )
}

type Cambio = (m: typeof MARCHA_VACIA) => typeof MARCHA_VACIA

export function Eventos({ eventos, t, onIr, deshabilitado, onCambiar, lado }: { eventos: readonly EventoMarcha[]; t: number | null; onIr: (t: number) => void; deshabilitado: boolean; onCambiar: (f: Cambio) => void; lado: Lado }) {
  return (
    <details className="flex flex-col gap-1" data-testid="eventos-marcha">
      <summary className="cursor-pointer text-xs text-texto-2">Eventos ({eventos.length}): corregir a mano</summary>
      <div className="mt-1 flex flex-wrap gap-2">
        {(['contacto', 'despegue'] as const).map((tipo) => (
          <button key={tipo} type="button" className={boton} disabled={deshabilitado || t === null} onClick={() => t !== null && onCambiar((m) => anadirEvento(m, { tipo, lado, t }))}>
            Añadir {tipo} aquí
          </button>
        ))}
      </div>
      {eventos.map((e) => (
        <div key={`${e.tipo}${e.t}`} className="flex flex-wrap items-center gap-2 text-xs" data-testid="evento">
          <span className="font-mono">
            {fmt(e.t, 3)} s · {e.tipo === 'contacto' ? 'contacto inicial' : 'despegue'}
            {e.manual && ' (a mano)'}
          </span>
          <button type="button" className={boton} onClick={() => onIr(e.t)} disabled={deshabilitado}>
            Ir
          </button>
          <button type="button" className={boton} disabled={deshabilitado || t === null} onClick={() => t !== null && onCambiar((m) => moverEvento(m, e, t))}>
            Mover aquí
          </button>
          <button type="button" className={boton} disabled={deshabilitado} onClick={() => onCambiar((m) => quitarEvento(m, e))}>
            Quitar
          </button>
        </div>
      ))}
    </details>
  )
}

/** La curva en % del ciclo: los ciclos incluidos finos, la banda media ± DE, la media y el despegue medio (SVG estático). */
export function GraficaCiclo({ analisis, titulo }: { analisis: Pick<AnalisisMarcha, 'ciclos' | 'media' | 'despegueMedio'>; titulo: string }) {
  const curvas = analisis.ciclos.filter((c) => !c.descarte && !c.excluido && c.curva).map((c) => c.curva!)
  const m = analisis.media
  if (!m || curvas.length === 0) return <p className="text-sm text-texto-2">Sin ciclos con la curva entera.</p>
  const [W, H, izq, der, arr, aba] = [320, 170, 34, 8, 8, 20]
  const todos = [...curvas.flat(), ...m.media.map((v, i) => v + (Number.isFinite(m.de[i]!) ? m.de[i]! : 0)), ...m.media.map((v, i) => v - (Number.isFinite(m.de[i]!) ? m.de[i]! : 0))]
  const lo = Math.floor(Math.min(...todos) - 2)
  const hi = Math.ceil(Math.max(...todos) + 2)
  const x = (k: number) => izq + ((W - izq - der) * k) / (PUNTOS_CICLO - 1)
  const y = (v: number) => arr + ((H - arr - aba) * (hi - v)) / (hi - lo)
  const linea = (vs: readonly number[]) => vs.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const conDe = m.de.every(Number.isFinite)
  const banda = conDe ? `${linea(m.media.map((v, k) => v + m.de[k]!))}${m.media.map((v, k) => [k, v - m.de[k]!] as const).reverse().map(([k, v]) => `L${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')}Z` : null
  const desp = analisis.despegueMedio
  return (
    <figure className="flex flex-col gap-1" data-testid="grafica-ciclo" data-ciclos={curvas.length}>
      <figcaption className="text-xs text-texto-2">{titulo} en % del ciclo (media ± DE)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${titulo}: media de ${curvas.length} ciclos`}>
        <line x1={izq} x2={W - der} y1={H - aba} y2={H - aba} stroke="var(--color-borde)" />
        <line x1={izq} x2={izq} y1={arr} y2={H - aba} stroke="var(--color-borde)" />
        {[0, 50, 100].map((k) => (
          <text key={k} x={x(k)} y={H - 5} fontSize="10" textAnchor="middle" fill="var(--color-texto-2)" fontFamily="DM Mono, monospace">
            {k} %
          </text>
        ))}
        {[lo, hi].map((v) => (
          <text key={v} x={izq - 4} y={y(v) + 3} fontSize="10" textAnchor="end" fill="var(--color-texto-2)" fontFamily="DM Mono, monospace">
            {v}°
          </text>
        ))}
        {Number.isFinite(desp) && <line x1={x(desp)} x2={x(desp)} y1={arr} y2={H - aba} stroke="var(--color-texto-2)" strokeDasharray="3 3" data-testid="despegue-medio" />}
        {curvas.map((c, k) => (
          <path key={k} d={linea(c)} fill="none" stroke="var(--color-texto-2)" strokeOpacity="0.35" strokeWidth="1" />
        ))}
        {banda && <path d={banda} fill="var(--color-acento)" fillOpacity="0.2" stroke="none" />}
        <path d={linea(m.media)} fill="none" stroke="var(--color-acento)" strokeWidth="2" data-testid="media-ciclo" />
      </svg>
    </figure>
  )
}
