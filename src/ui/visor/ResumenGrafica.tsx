import type { ResumenSerie } from '../../core/graficas/rango'
import { fmt, grados } from './formato'

interface Props {
  resumen: ResumenSerie
  /** Instantes de la serie que son interpolados (a petición). */
  instantesInterpolados: number
}

/** Máximo, mínimo y huecos de la serie del ángulo, bajo la gráfica. */
export default function ResumenGrafica({ resumen, instantesInterpolados }: Props) {
  return (
    <p className="font-mono text-xs text-texto-2" data-testid="resumen-grafica">
                {resumen.max && resumen.min ? (
                  <>
                    <span className="whitespace-nowrap">
                      máx. {grados(resumen.max.valor)}° (t = {fmt(resumen.max.t, 2)} s)
                    </span>{' '}
                    ·{' '}
                    <span className="whitespace-nowrap">
                      mín. {grados(resumen.min.valor)}° (t = {fmt(resumen.min.t, 2)} s)
                    </span>
                    {resumen.huecos > 0 && <span className="whitespace-nowrap text-red-300"> · {resumen.huecos} sin valor</span>}
                    {instantesInterpolados > 0 && <span className="whitespace-nowrap text-interpolado"> · {instantesInterpolados} interpolados</span>}
                  </>
                ) : (
                  'Sin datos todavía: marca los gomets y pulsa «Seguir desde aquí».'
                )}
              </p>
  )
}
