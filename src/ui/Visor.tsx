import { useMemo, useState, type ReactNode } from 'react'
import { modeloRodilla3 } from '../core/articulaciones/catalogo'
import type { AjustesFiltro } from '../core/filtros/tramos'
import type { ModeloMarcadores } from '../core/modelo/tipos'
import { ladoDeVista } from './marcadores'
import AnfitrionVista from './visor/AnfitrionVista'
import CuerpoVisor from './visor/CuerpoVisor'
import type { SesionAbierta } from './visor/useGuardado'
import type { EntradaVista, VistaViva } from './visor/vistas'

interface Props {
  /** Las vistas de la sesión, la de referencia primero. */
  vistas: readonly EntradaVista[]
  sesion: SesionAbierta
  /** Al recuperar una sesión: su modelo, tal como se guardó. */
  modelo?: ModeloMarcadores
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  filtro?: AjustesFiltro | null
  avisoInicial?: string
}

interface PropsAnfitriones {
  readonly entradas: readonly EntradaVista[]
  readonly acumuladas: readonly VistaViva[]
  readonly modelo: ModeloMarcadores
  readonly filtro?: AjustesFiltro | null
  readonly avisoInicial?: string
  readonly children: (vistas: readonly VistaViva[]) => ReactNode
}

/** Una vista dentro de otra: cada una con sus hooks, y el último nivel pinta con todas. */
function Anfitriones({ entradas, acumuladas, modelo, filtro, avisoInicial, children }: PropsAnfitriones) {
  const [primera, ...resto] = entradas
  return (
    <AnfitrionVista entrada={primera!} modelo={modelo} filtro={filtro} avisoInicial={avisoInicial}>
      {(vista) =>
        resto.length ? (
          <Anfitriones entradas={resto} acumuladas={[...acumuladas, vista]} modelo={modelo} filtro={filtro}>
            {children}
          </Anfitriones>
        ) : (
          children([...acumuladas, vista])
        )
      }
    </AnfitrionVista>
  )
}

/**
 * La sesión del visor: el modelo de marcadores y las vistas abiertas (cada una con sus hooks en un `AnfitrionVista`).
 * `CuerpoVisor` pinta la vista activa y se ocupa de lo común (pestañas, reparto de la pantalla y guardado).
 */
export default function Visor({ vistas, sesion, modelo: modeloGuardado, filtro, avisoInicial }: Props) {
  // Modelo de la fase 1: rodilla con 3 gomets en la pierna que ve la cámara de la vista de referencia.
  // Una sesión recuperada usa el que se guardó con ella.
  const lado = ladoDeVista(vistas[0]!.orientacion)
  const modelo = useMemo(() => modeloGuardado ?? modeloRodilla3(lado), [modeloGuardado, lado])
  const [activa] = useState(0)
  return (
    <Anfitriones entradas={vistas} acumuladas={[]} modelo={modelo} filtro={filtro} avisoInicial={avisoInicial}>
      {(vivas) => <CuerpoVisor vistas={vivas} activa={activa} sesion={sesion} modelo={modelo} recuperada={!!vistas[0]!.inicial} />}
    </Anfitriones>
  )
}
