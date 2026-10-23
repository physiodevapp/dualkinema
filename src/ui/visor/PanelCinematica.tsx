import type { CeroReferencia, TramoEstatico } from '../../core/articulaciones/cero'
import type { UnidadVelocidad } from '../../core/filtros/derivadas'
import { InfoGlosario } from '../glosario/Glosario'

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Con d decimales, sin «−0» ni «−0,0». */
const num = (n: number, d: number) => fmt(Math.round(n * 10 ** d) / 10 ** d + 0, d)
const valor = (n: number, d: number, unidad: string) => (Number.isFinite(n) ? `${num(n, d)}${unidad === '°' ? '' : ' '}${unidad}` : '—')

/** Por encima de esta desviación típica en la toma estática, se avisa de que hubo movimiento. */
export const DESVIACION_AVISO = 2

interface Props {
  /** Ángulo filtrado del frame actual, sin cero (NaN si no hay). */
  angulo: number
  /** Ángulo relativo al cero de referencia (NaN si no hay ángulo o no hay cero). */
  relativo: number
  velocidad: number
  aceleracion: number
  marcadores: readonly { id: string; nombre: string; color: string; velocidad: number; unidad: UnidadVelocidad }[]
  tramo: TramoEstatico | null
  /** Media del tramo elegido; null si no se ha elegido o no tiene ángulo. */
  cero: CeroReferencia | null
  /** Tiempo del frame actual (null mientras no hay ninguno) y del primer y el último frame. */
  t: number | null
  t0: number
  tn: number
  onTramo: (t: TramoEstatico | null) => void
  onPrimeros: () => void
  deshabilitado?: boolean
}

/**
 * Velocidades y cero de referencia del frame actual (paso 5 de la fase 2).
 * Provisional: la gráfica de velocidad llega en el paso 8.
 */
export default function PanelCinematica({
  angulo,
  relativo,
  velocidad,
  aceleracion,
  marcadores,
  tramo,
  cero,
  t,
  t0,
  tn,
  onTramo,
  onPrimeros,
  deshabilitado,
}: Props) {
  const inicioAqui = () => {
    if (t === null || t >= tn) return
    onTramo({ desde: t, hasta: tramo && tramo.hasta > t ? tramo.hasta : Math.min(tn, t + 2) })
  }
  const finAqui = () => {
    if (t === null || t <= t0) return
    onTramo({ desde: tramo && tramo.desde < t ? tramo.desde : Math.max(t0, t - 2), hasta: t })
  }
  const boton = 'rounded-md border border-borde px-3 py-2 text-sm disabled:opacity-40'

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-cinematica">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Velocidad y cero</h2>
        <InfoGlosario id="velocidad" tema="la velocidad y la aceleración" className="-my-1.5" />
      </div>

      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1">
        <dt className="text-texto-2">
          Ángulo (sin cero) <InfoGlosario id="angulo" tema="el ángulo sin cero y el relativo" className="-my-1.5 align-middle" />
        </dt>
        <dd className="text-right font-mono" data-testid="angulo-sin-cero">{valor(angulo, 1, '°')}</dd>
        <dt className="text-texto-2">Relativo al estático</dt>
        <dd className="text-right font-mono text-lg text-acento" data-testid="angulo-relativo">
          {tramo ? valor(relativo, 1, '°') : '—'}
        </dd>
        <dt className="text-texto-2">Velocidad angular</dt>
        <dd className="text-right font-mono" data-testid="velocidad-angular">{valor(velocidad, 1, '°/s')}</dd>
        <dt className="text-texto-2">Aceleración angular</dt>
        <dd className="text-right font-mono" data-testid="aceleracion-angular">{valor(aceleracion, 0, '°/s²')}</dd>
        {marcadores.map((m) => (
          <div key={m.id} className="contents">
            <dt className="flex items-center gap-2 text-texto-2">
              <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
              Velocidad {m.nombre}
            </dt>
            <dd className="text-right font-mono" data-testid={`velocidad-marcador-${m.id}`}>{valor(m.velocidad, m.unidad === 'm/s' ? 2 : 0, m.unidad)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-texto-2">
        Derivadas de lo filtrado. Sin valor en el primer y el último frame de cada tramo seguido ni en los tramos cortos. La
        aceleración amplifica mucho el ruido: si salta de un frame a otro, baja el corte del filtro. Las velocidades de los
        marcadores van en m/s con la escala calibrada y en px/s sin ella.
      </p>

      <div className="flex flex-col gap-2 border-t border-borde pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm">Cero de referencia (toma estática)</h3>
          <InfoGlosario id="cero" tema="el cero de referencia" className="-my-1.5" />
        </div>
        {tramo ? (
          <p className="font-mono text-sm" data-testid="cero-tramo">
            {num(tramo.desde, 2)}–{num(tramo.hasta, 2)} s
            {cero ? (
              <>
                {' · media '}
                <span data-testid="cero-media">{num(cero.media, 1)}°</span> ± {num(cero.desviacion, 1)}° ({cero.muestras} frames)
              </>
            ) : (
              <span className="text-acento"> · sin ángulo en ese tramo</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-texto-2">
            Elige un tramo quieto (por ejemplo, de pie antes de empezar). Su ángulo medio se resta para dar el relativo; el
            ángulo sin cero se sigue viendo.
          </p>
        )}
        {cero && cero.desviacion > DESVIACION_AVISO && (
          <p className="text-xs text-acento">
            En ese tramo el ángulo varía ± {num(cero.desviacion, 1)}°: no parece quieto. Elige otro más estable.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={boton} disabled={deshabilitado || tn <= t0} onClick={onPrimeros}>
            Primeros 2 s
          </button>
          <button type="button" className={boton} disabled={deshabilitado || t === null || t >= tn} onClick={inicioAqui}>
            Inicio aquí
          </button>
          <button type="button" className={boton} disabled={deshabilitado || t === null || t <= t0} onClick={finAqui}>
            Fin aquí
          </button>
          {tramo && (
            <button type="button" className={`${boton} text-texto-2`} disabled={deshabilitado} onClick={() => onTramo(null)}>
              Quitar
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
