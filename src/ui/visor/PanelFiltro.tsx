import { CORTE_DEFECTO_HZ, CORTE_MAX_HZ, CORTE_MIN_HZ, type AjustesFiltro } from '../../core/filtros/tramos'

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

interface Props {
  ajustes: AjustesFiltro
  onCambiar: (a: AjustesFiltro) => void
  /** Corte aplicado (el elegido, limitado por los fps). */
  corte: number
  /** Mediana de los fps del vídeo. */
  fs: number
  tramosCortos: number
  /** Ángulo filtrado en el frame actual (ya formateado) y su etiqueta. */
  anguloTexto: string
  deshabilitado?: boolean
}

/**
 * Ajuste del Butterworth de fase cero: frecuencia de corte de 2 a 15 Hz
 * (6 Hz por defecto). Se guarda con la sesión.
 */
export default function PanelFiltro({ ajustes, onCambiar, corte, fs, tramosCortos, anguloTexto, deshabilitado }: Props) {
  const limitado = corte < ajustes.corteHz
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-filtro">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Filtro</h2>
        <span className="font-mono text-sm">
          corte <span className="text-acento" data-testid="corte">{fmt(ajustes.corteHz, 1)} Hz</span>
        </span>
      </div>
      <input
        type="range"
        min={CORTE_MIN_HZ}
        max={CORTE_MAX_HZ}
        step={0.5}
        value={ajustes.corteHz}
        disabled={deshabilitado}
        onChange={(e) => onCambiar({ corteHz: Number(e.target.value) })}
        aria-label="Frecuencia de corte del filtro"
        className="w-full accent-acento"
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-texto-2">Ángulo filtrado</span>
        <span className="font-mono text-lg" data-testid="angulo-filtrado">{anguloTexto}</span>
      </div>
      {limitado && (
        <p className="text-xs text-acento">
          Con {fmt(fs, 0)} fps el corte se limita a {fmt(corte, 1)} Hz (0,4 × fps).
        </p>
      )}
      {tramosCortos > 0 && (
        <p className="text-xs text-texto-2" data-testid="tramos-cortos">
          {tramosCortos} tramo{tramosCortos === 1 ? '' : 's'} demasiado corto{tramosCortos === 1 ? '' : 's'} (menos de 10 frames
          seguidos): se filtran, pero sus bordes no son fiables y no tendrán velocidad.
        </p>
      )}
      <p className="text-xs text-texto-2">
        Butterworth de fase cero (sin retraso) sobre las coordenadas de cada gomet; el ángulo se calcula después. Más corte =
        sigue más el detalle y también el ruido. {CORTE_DEFECTO_HZ} Hz es lo habitual para sentadilla o marcha.
        {ajustes.corteHz !== CORTE_DEFECTO_HZ && !deshabilitado && (
          <>
            {' '}
            <button type="button" onClick={() => onCambiar({ corteHz: CORTE_DEFECTO_HZ })} className="text-acento underline">
              Volver a {CORTE_DEFECTO_HZ} Hz
            </button>
          </>
        )}
      </p>
    </section>
  )
}
