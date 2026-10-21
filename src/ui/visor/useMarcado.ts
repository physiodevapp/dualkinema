import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { aprenderMarcador, ErrorMarcado, radioDe } from '../../core/seguimiento/seguidor'
import type { TablaFrames } from '../../core/tiempo/tablaFrames'
import { lectorDeCanvas } from './capa'
import type { ErrorDeToque } from './ErrorToque'
import type { Previsualizacion } from './LienzoVideo'
import type { Aviso } from './useSeguimiento'
import type { SeriesTrayectorias } from './useTrayectorias'

interface Opciones {
  readonly ids: readonly IdMarcador[]
  readonly tabla: TablaFrames
  /** Tamaño del vídeo en px. */
  readonly info: { readonly ancho: number; readonly alto: number }
  /** Al recuperar una sesión: las trayectorias guardadas (para elegir el primer marcador que falte). */
  readonly inicial?: ReadonlyMap<IdMarcador, (Muestra2D | undefined)[]>
  /** ¿Posición utilizable para el análisis? (`CALIDAD_MINIMA`; la define el visor). */
  readonly valida: (m: Muestra2D | undefined) => m is Muestra2D
  readonly trayectorias: RefObject<SeriesTrayectorias>
  readonly muestra: (id: IdMarcador, i: number) => Muestra2D | undefined
  /** Mutadores de `useTrayectorias`. */
  readonly poner: (id: IdMarcador, i: number, x: number, y: number) => void
  readonly quitar: (id: IdMarcador, i: number) => void
  /** Frame mostrado y el canvas del último frame pintado (de él se leen los píxeles): de `useNavegacionFrames`. */
  readonly mostrado: number | null
  readonly ultimoFrame: RefObject<HTMLCanvasElement | OffscreenCanvas | null>
  /**
   * El error del toque vive en el visor (la navegación lo quita al cambiar de frame, y se declara antes); aquí se
   * pone al fallar un toque y se quita al marcar.
   */
  readonly setErrorToque: Dispatch<SetStateAction<ErrorDeToque | null>>
  readonly setAviso: Dispatch<SetStateAction<Aviso | null>>
}

/**
 * El marcado a mano: el marcador elegido, «Colocar a ojo», colocar un marcador donde se toca (en el centro del gomet
 * o a ojo), previsualizar dónde quedaría (la lupa) y quitar una marca a mano.
 */
export function useMarcado({ ids, tabla, info, inicial, valida, trayectorias, muestra, poner, quitar, mostrado, ultimoFrame, setErrorToque, setAviso }: Opciones) {
  // Al recuperar, el primer marcador que falte en el frame inicial (como al marcar);
  // si están todos, ninguno, para no mover uno sin querer con el primer toque.
  const [seleccionado, setSeleccionado] = useState<IdMarcador | null>(() =>
    inicial ? (ids.find((id) => !valida(inicial.get(id)?.[0])) ?? null) : (ids[0] ?? null),
  )
  // «Colocar a ojo»: cada toque deja el marcador justo donde se suelta el dedo, sin buscar el gomet (gomet tapado o movido).
  const [colocarAOjo, setColocarAOjo] = useState(false)

  /** Guarda una posición marcada a mano y pasa al siguiente marcador que falte en el frame. */
  const ponerManual = (id: IdMarcador, i: number, x: number, y: number) => {
    const serie = trayectorias.current.get(id)!
    poner(id, i, x, y)
    setErrorToque(null)
    const falta = ids.find((otro) => otro !== id && !valida(muestra(otro, i)))
    setSeleccionado(falta ?? null)
    // Una corrección con lo seguido detrás: se puede rehacer desde aquí con ella como ancla.
    const seguidoDespues = serie.some((m, k) => k > i && m !== undefined && !m.editadoManual)
    setAviso(
      seguidoDespues && !falta
        ? { texto: 'Corregido. Para rehacer lo que viene después a partir de aquí, pulsa «Seguir desde aquí»: respeta todo lo marcado a mano.' }
        : null,
    )
  }

  /** Dónde quedaría el marcador si se suelta en (x, y): centro y radio del gomet, o null si no hay. */
  const previsualizar = useCallback(
    (x: number, y: number, radio: number): Previsualizacion => {
      if (mostrado === null || !ultimoFrame.current) return null
      try {
        const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, tabla.tiempos[mostrado]!, x, y, { radioSemilla: radio })
        return { x: r.x, y: r.y, r: radioDe(r.estado.area) }
      } catch {
        return null
      }
    },
    [mostrado, info, tabla, ultimoFrame],
  )

  const colocar = (x: number, y: number, radio: number) => {
    if (mostrado === null || !seleccionado || !ultimoFrame.current) return
    if (colocarAOjo) {
      ponerManual(seleccionado, mostrado, x, y)
      return
    }
    const t = tabla.tiempos[mostrado]!
    try {
      // Se lleva el marcador al centro del gomet que se ve en la lupa (el mismo que marcaba el anillo).
      const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, t, x, y, { radioSemilla: radio })
      ponerManual(seleccionado, mostrado, r.x, r.y)
    } catch (e) {
      setErrorToque(
        e instanceof ErrorMarcado
          ? { texto: e.message, detalle: e.detalle, aOjo: { id: seleccionado, i: mostrado, x, y } }
          : { texto: `No se ha podido marcar: ${String(e)}` },
      )
    }
  }

  const quitarManual = (id: IdMarcador, i: number) => {
    quitar(id, i)
    setAviso(null)
  }

  return { seleccionado, setSeleccionado, colocarAOjo, setColocarAOjo, ponerManual, previsualizar, colocar, quitarManual }
}
