import type { ReactNode } from 'react'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { ModeloMarcadores } from '../../core/modelo/tipos'
import { useVista } from './useVista'
import type { EntradaVista, VistaViva } from './vistas'

interface Props {
  readonly entrada: EntradaVista
  readonly modelo: ModeloMarcadores
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  readonly filtro?: AjustesFiltro | null
  readonly avisoInicial?: string
  readonly children: (vista: VistaViva) => ReactNode
}

/**
 * Los hooks de una vista (`useVista`) viven en este componente: un hook no se puede llamar en un bucle de longitud
 * variable, así que cada vista tiene el suyo y entrega su estado a quien pinta por una función hija. Se anidan (ver
 * `Anfitriones`): quien pinta recibe todas las vistas en el mismo render, sin un render de retraso.
 */
export default function AnfitrionVista({ entrada, modelo, filtro, avisoInicial, children }: Props) {
  const vista = useVista({
    video: entrada.video,
    orientacion: entrada.orientacion,
    modelo,
    inicial: entrada.inicial,
    filtro,
    cerosGuardados: entrada.ceros,
    calibracionGuardada: entrada.calibracion,
    avisoInicial,
  })
  return children({ id: entrada.id, orientacion: entrada.orientacion, desfaseS: entrada.desfase, sincronia: entrada.sincronia, ...vista })
}
