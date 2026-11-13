import { useMemo } from 'react'
import { construirCsvMarcha } from '../../core/exportacion/csvMarcha'
import type { Lado } from '../../core/articulaciones/catalogo'
import { MARCHA_VACIA, alternarExcluido } from '../../core/marcha/guardado'
import { analizarMarcha3D, type ParametrosPie } from '../../core/marcha/tresd'
import { InfoGlosario } from '../glosario/Glosario'
import { Eventos, GraficaCiclo } from './PanelMarcha'
import PanelExportar from './PanelExportar'
import type { Angulos3D } from './useAngulos3D'

interface Props {
  readonly t3: Angulos3D
  /** Instante común del cursor, o null. */
  readonly instante: number | null
  readonly onBuscar: (tComun: number) => void
  readonly ajustes: { readonly corteHz: number }
}

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')
const LADOS: readonly Lado[] = ['der', 'izq']
const NOMBRE: Record<Lado, string> = { der: 'Pie derecho', izq: 'Pie izquierdo' }
const boton = 'rounded-md border border-borde px-2 py-1 text-xs text-texto-2 disabled:opacity-50'
const ladoDe = (id: string): Lado | null => (id.endsWith('_der') ? 'der' : id.endsWith('_izq') ? 'izq' : null)

/**
 * La marcha con los puntos 3D (D10 de docs/plan-fase-9.md): los eventos de los dos pies, los parámetros de los dos (y el
 * paso, el doble apoyo, la velocidad y la anchura del paso) y la curva en % del ciclo del ángulo 3D que se mira (de los
 * puntos o del esqueleto), en los ciclos del pie de su lado.
 */
export default function PanelMarcha3D({ t3, instante, onBuscar, ajustes }: Props) {
  const { bruto, fs, marcha, setMarcha, serie, cero, art, ocupado } = t3
  const ladoArticulacion = ladoDe(art.id)
  const analisis = useMemo(
    () =>
      marcha
        ? analizarMarcha3D({ tr: bruto, fs, ajustes, guardado: marcha, serieAngulo: serie, cero: cero?.media ?? null, ladoArticulacion })
        : null,
    [marcha, bruto, fs, ajustes, serie, cero, ladoArticulacion],
  )
  const titulo = (
    <h3 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
      Marcha en 3D <InfoGlosario id="marcha" tema="el análisis de la marcha" className="-my-1.5" />
    </h3>
  )
  if (!marcha || !analisis) {
    return (
      <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="marcha-3d">
        {titulo}
        <p className="text-sm text-texto-2">Para una toma andando: los contactos y despegues de los dos pies, el paso, el doble apoyo, la anchura del paso y la curva media del ángulo que se mira.</p>
        <button type="button" disabled={ocupado} onClick={() => setMarcha(MARCHA_VACIA)} className="self-start rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-fondo disabled:opacity-50">
          Buscar los ciclos
        </button>
      </div>
    )
  }
  const p = analisis.parametros
  const enMetros = bruto.enMetros
  const pie = (l: Lado, f: (x: ParametrosPie) => string) => (p?.porPie[l] ? f(p.porPie[l]!) : '—')
  const ciclosCurva = analisis.ciclos[analisis.ladoCurva]
  const extra: [string, string][] = p
    ? [
        ['curva del pie', analisis.ladoCurva === 'der' ? 'derecho' : 'izquierdo'],
        ...LADOS.flatMap((l): [string, string][] => [
          [`${NOMBRE[l].toLowerCase()}: zancada (s)`, pie(l, (x) => `${fmt(x.zancada.media, 3)} ± ${fmt(x.zancada.de, 3)}`)],
          [`${NOMBRE[l].toLowerCase()}: paso (s)`, pie(l, (x) => `${fmt(x.paso.media, 3)} ± ${fmt(x.paso.de, 3)}`)],
          [`${NOMBRE[l].toLowerCase()}: apoyo (% del ciclo)`, pie(l, (x) => fmt(x.apoyo.media, 1))],
          [`${NOMBRE[l].toLowerCase()}: longitud de zancada (m)`, pie(l, (x) => (x.longitud ? fmt(x.longitud.media, 3) : '—'))],
        ]),
        ['doble apoyo (% del ciclo)', fmt(p.dobleApoyo.media, 1)],
        ['anchura del paso (m)', p.anchura ? fmt(p.anchura.media, 3) : '—'],
      ]
    : []
  const generar = (formato: Parameters<typeof construirCsvMarcha>[1]) => ({
    nombre: `dualkinema_marcha_3d_${art.id}.csv`,
    texto: construirCsvMarcha(
      {
        archivo: '3D (dos vistas)',
        exportado: new Date().toISOString(),
        articulacion: { id: art.id, nombre: art.nombre },
        cero: cero?.media ?? null,
        corteHz: ajustes.corteHz,
        analisis: { ciclos: ciclosCurva, media: analisis.media, parametros: null },
        extra: [...extra, ['cadencia (pasos/min)', p ? fmt(p.cadencia, 1) : '—'], ['velocidad (m/s)', p?.velocidad != null ? fmt(p.velocidad, 3) : '—'], ['en cinta', p?.enCinta ? 'sí' : 'no']],
      },
      formato,
    ),
  })
  return (
    <div className="flex flex-col gap-3 border-t border-borde pt-3" data-testid="marcha-3d">
      <div className="flex items-center justify-between gap-2">
        {titulo}
        <button type="button" className={boton} onClick={() => setMarcha(null)} disabled={ocupado}>
          Dejar de mirar la marcha
        </button>
      </div>
      <p className="text-sm text-texto-2" data-testid="resumen-marcha-3d">
        {LADOS.map((l) => `${NOMBRE[l]}: ${analisis.ciclos[l].filter((c) => !c.descarte).length} ciclos válidos`).join(' · ')}
      </p>
      {p && (
        <table className="w-full font-mono text-xs" data-testid="parametros-marcha-3d">
          <thead>
            <tr className="text-texto-2">
              <th className="text-left font-normal" />
              <th className="text-right font-normal">Derecho</th>
              <th className="text-right font-normal">Izquierdo</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Zancada', (x: ParametrosPie) => `${fmt(x.zancada.media, 2)} s`],
                ['Paso', (x: ParametrosPie) => `${fmt(x.paso.media, 2)} s`],
                ['Apoyo', (x: ParametrosPie) => `${fmt(x.apoyo.media)} %`],
                ['Longitud', (x: ParametrosPie) => (x.longitud ? `${fmt(x.longitud.media, 2)} m` : '—')],
              ] as const
            ).map(([nombre, f]) => (
              <tr key={nombre} data-testid={`fila-${nombre.toLowerCase()}`}>
                <td className="text-texto-2">{nombre}</td>
                {LADOS.map((l) => (
                  <td key={l} className="text-right">
                    {pie(l, f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
          <dt className="text-texto-2">Cadencia</dt>
          <dd data-testid="cadencia-3d">{fmt(p.cadencia)} pasos/min</dd>
          <dt className="text-texto-2">Doble apoyo</dt>
          <dd data-testid="doble-apoyo">{fmt(p.dobleApoyo.media)} % del ciclo</dd>
          <dt className="text-texto-2">Velocidad</dt>
          <dd>{p.velocidad !== null ? `${fmt(p.velocidad, 2)} m/s` : p.enCinta ? '— (en cinta)' : '— (sin escala)'}</dd>
          <dt className="text-texto-2">Anchura del paso</dt>
          <dd data-testid="anchura">{p.anchura ? `${fmt(p.anchura.media * 100)} cm` : enMetros ? '—' : '— (sin escala)'}</dd>
        </dl>
      )}
      <label className="flex items-center gap-2 text-xs text-texto-2">
        Dónde anda
        <select
          value={marcha.enCinta === null ? 'auto' : marcha.enCinta ? 'cinta' : 'suelo'}
          onChange={(e) => setMarcha({ ...marcha, enCinta: e.target.value === 'auto' ? null : e.target.value === 'cinta' })}
          className="rounded-md border border-borde bg-fondo px-2 py-1 text-sm text-texto"
        >
          <option value="auto">{`Lo decide la app (${p?.enCinta ? 'en cinta' : 'por el suelo'})`}</option>
          <option value="suelo">Por el suelo</option>
          <option value="cinta">En cinta</option>
        </select>
      </label>
      <GraficaCiclo
        analisis={{ ciclos: ciclosCurva, media: analisis.media, despegueMedio: analisis.despegueMedio }}
        titulo={`${art.nombre.replace(/ en 3D$/, '')}${cero ? ', relativo al cero' : ''} (ciclos del ${analisis.ladoCurva === 'der' ? 'pie derecho' : 'pie izquierdo'})`}
      />
      {LADOS.map((l) => (
        <div key={l} className="flex flex-col gap-1" data-testid={`ciclos-3d-${l}`}>
          <h4 className="text-xs text-texto-2">Ciclos del {NOMBRE[l].toLowerCase()}</h4>
          {analisis.ciclos[l].map((c, k) => (
            <div key={c.inicio} className={`flex flex-wrap items-center gap-2 text-xs ${c.descarte ? 'text-texto-2' : ''}`}>
              {!c.descarte && (
                <input type="checkbox" checked={!c.excluido} onChange={() => setMarcha(alternarExcluido(marcha, c.inicio))} aria-label={`${NOMBRE[l]}, ciclo ${k + 1} incluido`} />
              )}
              <span className="font-mono">
                {k + 1}. {fmt(c.inicio, 2)}–{fmt(c.fin, 2)} s
              </span>
              {c.descarte && <span>descartado</span>}
              <button type="button" className={boton} onClick={() => onBuscar(c.inicio)} disabled={ocupado}>
                Ir
              </button>
            </div>
          ))}
          <Eventos eventos={analisis.eventos.filter((e) => e.lado === l)} t={instante} onIr={onBuscar} deshabilitado={ocupado} onCambiar={(f) => setMarcha(f(marcha))} lado={l} />
        </div>
      ))}
      <PanelExportar generar={generar} resumen="La curva en % del ciclo (media, DE y cada ciclo) y los parámetros de los dos pies" deshabilitado={ocupado} />
    </div>
  )
}
