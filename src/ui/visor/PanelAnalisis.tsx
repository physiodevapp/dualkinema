import type { CeroReferencia, TramoEstatico } from '../../core/articulaciones/cero'
import { relativoAlCero, tramoInicial } from '../../core/articulaciones/cero'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { Marcador } from '../../core/modelo/tipos'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'
import { grados } from './formato'
import PanelCinematica from './PanelCinematica'
import PanelExportar from './PanelExportar'
import PanelFiltro from './PanelFiltro'
import type { Filtrado } from './useFiltrado'

interface Props {
  ajustes: AjustesFiltro
  onCambiarAjustes: (a: AjustesFiltro) => void
  /** Lo filtrado: corte aplicado, derivadas, velocidades de los marcadores y tramos cortos. */
  filtrado: Filtrado
  /** Ángulo filtrado del frame mostrado (NaN = sin valor) y ese frame (null mientras se decodifica el primero). */
  anguloFiltrado: number
  mostrado: number | null
  marcadores: readonly Marcador[]
  tramoEstatico: TramoEstatico | null
  cero: CeroReferencia | null
  /** Tiempo del frame mostrado (s) y tiempo de cada frame. */
  t: number | null
  tiempos: readonly number[]
  total: number
  onCambiarTramo: (tramo: TramoEstatico | null) => void
  generarCsv: React.ComponentProps<typeof PanelExportar>['generar']
  /** ¿Hay escala guardada? ¿La articulación es del plano de la vista? (para el resumen de lo que se exporta). */
  conEscala: boolean
  mismoPlano: boolean
  siguiendo: boolean
}

/** Pestaña «Análisis»: filtro, velocidad y cero, y exportar. */
export default function PanelAnalisis({
  ajustes,
  onCambiarAjustes,
  filtrado,
  anguloFiltrado,
  mostrado,
  marcadores,
  tramoEstatico,
  cero,
  t,
  tiempos,
  total,
  onCambiarTramo,
  generarCsv,
  conEscala,
  mismoPlano,
  siguiendo,
}: Props) {
  return (
    <>
            <PanelFiltro
              ajustes={ajustes}
              onCambiar={onCambiarAjustes}
              corte={filtrado.corte}
              fs={filtrado.fs}
              tramosCortos={filtrado.tramosCortos}
              anguloTexto={Number.isNaN(anguloFiltrado) ? '—' : `${grados(anguloFiltrado)}°`}
              deshabilitado={siguiendo}
            />

            <PanelCinematica
              angulo={anguloFiltrado}
              relativo={cero ? relativoAlCero(anguloFiltrado, cero) : NaN}
              velocidad={mostrado === null ? NaN : (filtrado.derivadas.velocidad[mostrado] ?? NaN)}
              aceleracion={mostrado === null ? NaN : (filtrado.derivadas.aceleracion[mostrado] ?? NaN)}
              marcadores={marcadores.map((mk, k) => {
                const v = filtrado.velocidades.get(mk.id)
                return {
                  id: mk.id,
                  nombre: nombreCorto(mk.nombre),
                  color: COLORES_MARCADOR[k % COLORES_MARCADOR.length]!,
                  velocidad: mostrado === null || !v ? NaN : (v.modulo[mostrado] ?? NaN),
                  unidad: v?.unidad ?? 'px/s',
                }
              })}
              tramo={tramoEstatico}
              cero={cero}
              t={t}
              t0={tiempos[0] ?? 0}
              tn={tiempos[total - 1] ?? 0}
              onTramo={onCambiarTramo}
              onPrimeros={() => onCambiarTramo(tramoInicial(tiempos))}
              deshabilitado={siguiendo}
            />

            <PanelExportar
              generar={generarCsv}
              resumen={`${total} frames · ${marcadores.length} marcadores · ${
                conEscala ? 'posiciones en px y en m, velocidades en m/s' : 'sin escala: todo en píxeles'
              }${mismoPlano ? '' : ' · sin ángulo (la articulación es de otro plano)'}`}
              deshabilitado={siguiendo}
            />
    </>
  )
}
