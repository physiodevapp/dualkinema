import type { TramoEstatico } from '../../core/articulaciones/cero'
import type { CalibracionVista } from '../../core/calibracion/escala'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { DeteccionPose, IdMarcador, Muestra2D, Sincronia } from '../../core/modelo/tipos'
import type { Fuente } from '../../core/pose/catalogo'
import type { PropuestaDoble } from '../../core/sincronia/doble'
import type { VideoAbierto } from '../../media/video'
import type { useVista } from './useVista'

/** Una vista abierta en el visor: su vídeo, cómo se grabó y, si se recupera, lo que se guardó de ella. */
export interface EntradaVista {
  readonly id: string
  readonly video: VideoAbierto
  readonly orientacion: OrientacionVista
  /** Segundos respecto a la vista de referencia (0 en ella). */
  readonly desfase: number
  readonly sincronia: Sincronia
  /** Al recuperar: sus trayectorias tal como se guardaron. */
  readonly inicial?: Map<IdMarcador, (Muestra2D | undefined)[]>
  /** Al recuperar: el tramo estático del cero de referencia, por articulación. */
  readonly ceros?: Readonly<Record<string, TramoEstatico>>
  /** Al recuperar: la escala de la vista (null = sin escala). */
  readonly calibracion?: CalibracionVista | null
  /**
   * Marcadores del modelo que sigue la vista (D4). Sin ellos (una vista nueva), los de la articulación de su plano
   * (`marcadoresParaVista`).
   */
  readonly marcadores?: readonly IdMarcador[]
  /** Al abrir una grabación doble (fase 4): el desfase que se propone para esta vista, sin aplicar. */
  readonly propuesta?: PropuestaDoble
  /** Con qué se analiza una vista nueva (fase 5): gomets (sin decirlo) o sin marcadores. Decide qué marcadores sigue. */
  readonly fuente?: Fuente
  /** Al recuperar: la última detección sin marcadores de la vista. */
  readonly deteccion?: DeteccionPose | null
}

/** Una vista con todo su estado (lo que devuelve `useVista`) y los datos de su entrada que necesita la sesión. */
export type VistaViva = ReturnType<typeof useVista> & Pick<EntradaVista, 'id' | 'orientacion' | 'sincronia' | 'propuesta'> & {
  /** Su desfase respecto a la referencia, en s (`desfase` a secas es el de la escala). */
  readonly desfaseS: number
  /** Los marcadores que sigue (los de la entrada o, en una vista nueva, los de su plano). */
  readonly marcadores: readonly IdMarcador[]
}
