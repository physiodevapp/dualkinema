import { useCallback, useMemo, type ReactNode } from 'react'
import { marcadoresParaVista, modeloDeVista } from '../../core/articulaciones/modeloVista'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { ModeloMarcadores } from '../../core/modelo/tipos'
import { fuenteDe, marcadoresSinMarcadores } from '../../core/pose/catalogo'
import { useVista } from './useVista'
import type { EntradaVista, VistaViva } from './vistas'

interface Props {
  readonly entrada: EntradaVista
  readonly modelo: ModeloMarcadores
  /** El ajuste del filtro, uno para toda la sesión. */
  readonly filtro: AjustesFiltro
  readonly avisoInicial?: string
  /** Es la vista que se marca; las demás siguen el cursor común. */
  readonly activa: boolean
  /** Esta vista cambió de frame (el cursor común mueve con ello las demás). Debe ser estable. */
  readonly alCambiarFrame: (id: string, frame: number) => void
  /** Esta vista pasa a seguir los puntos del modelo sin marcadores (al detectar el cuerpo). Debe ser estable. */
  readonly alUsarPose: (id: string) => void
  readonly children: (vista: VistaViva) => ReactNode
}

/**
 * Los hooks de una vista (`useVista`) viven en este componente: un hook no se puede llamar en un bucle de longitud
 * variable, así que cada vista tiene el suyo y entrega su estado a quien pinta por una función hija. Se anidan (ver
 * `Anfitriones`): quien pinta recibe todas las vistas en el mismo render, sin un render de retraso.
 */
export default function AnfitrionVista({ entrada, modelo, filtro, avisoInicial, activa, alCambiarFrame, alUsarPose, children }: Props) {
  const id = entrada.id
  const alCambiar = useCallback((frame: number) => alCambiarFrame(id, frame), [alCambiarFrame, id])
  const usarPose = useCallback(() => alUsarPose(id), [alUsarPose, id])
  // Lo que ve esta vista del modelo de la sesión: sus marcadores y la articulación de su plano (D4). Una vista nueva sigue
  // los de su plano con la fuente con que se abrió (gomets o sin marcadores, fase 5).
  const fuente = entrada.fuente ?? 'gomets'
  const marcadores = useMemo(
    () =>
      entrada.marcadores ??
      (fuente === 'sinMarcadores' ? marcadoresSinMarcadores(entrada.orientacion) : marcadoresParaVista(modelo, entrada.orientacion, (a) => fuenteDe(a) === fuente)),
    [entrada.marcadores, modelo, entrada.orientacion, fuente],
  )
  const modeloVista = useMemo(() => modeloDeVista(modelo, marcadores, entrada.orientacion), [modelo, marcadores, entrada.orientacion])
  const vista = useVista({
    video: entrada.video,
    orientacion: entrada.orientacion,
    modelo: modeloVista,
    inicial: entrada.inicial,
    filtro,
    cerosGuardados: entrada.ceros,
    calibracionGuardada: entrada.calibracion,
    avisoInicial,
    activa,
    alCambiarFrame: alCambiar,
    deteccionGuardada: entrada.deteccion,
    articulacionGuardada: entrada.articulacion,
    alUsarPose: usarPose,
  })
  return children({ id: entrada.id, orientacion: entrada.orientacion, desfaseS: entrada.desfase, sincronia: entrada.sincronia, propuesta: entrada.propuesta, marcadores, ...vista })
}
