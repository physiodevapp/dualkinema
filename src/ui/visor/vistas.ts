import type { TramoEstatico } from '../../core/articulaciones/cero'
import type { CalibracionVista } from '../../core/calibracion/escala'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { IdMarcador, Muestra2D, Sincronia } from '../../core/modelo/tipos'
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
}

/** Una vista con todo su estado (lo que devuelve `useVista`) y los datos de su entrada que necesita la sesión. */
export type VistaViva = ReturnType<typeof useVista> & Pick<EntradaVista, 'id' | 'orientacion' | 'sincronia'> & {
  /** Su desfase respecto a la referencia, en s (`desfase` a secas es el de la escala). */
  readonly desfaseS: number
}
