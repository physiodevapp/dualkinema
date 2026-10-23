import { useCallback, useRef, useState } from 'react'
import { frameVisibleEnComun, tiempoComunDeFrame, aVideo } from '../../core/tiempo/comun'
import { indiceMasCercano } from '../../core/tiempo/tablaFrames'
import type { VistaViva } from './vistas'

/** Instante común en que empieza el frame `frame` de una vista. */
const tiempoDe = (w: VistaViva, frame: number) => tiempoComunDeFrame({ tabla: w.tabla, desfase: w.desfaseS }, frame)

const mismoConjunto = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x))

/**
 * El cursor común de la sesión (fase 3, §2): un instante del tiempo común. Lo lleva la vista activa: al cambiar de
 * frame ella, su tiempo pasa a ser el del cursor y las demás van al frame que se ve en ese instante (por tiempo, nunca
 * por índice: cada vista tiene su tabla de frames). Si el instante cae fuera de un vídeo, esa vista se queda donde
 * estaba y se marca como `fuera`.
 *
 * Cambiar de vista activa no mueve el cursor: cada vista sigue en su frame. Solo si el cursor cae fuera del vídeo de la
 * que pasa a ser activa, esta va al frame más próximo (el de su extremo) y el cursor pasa a ser el de ese frame.
 *
 * El cursor se puede **desenlazar** (`enlazar(false)`) mientras se marca el evento para sincronizar: cada vista se mueve
 * sola, sin arrastrar a la otra, para llevar cada una a su frame del evento.
 *
 * Quien pinta registra las vistas vivas en cada render (`registrar`); los manejadores leen de ahí lo último sin
 * rehacerse (tienen que ser estables: son `useCallback` de los hooks de cada vista).
 */
export function useCursorComun(idInicial: string) {
  const [activaId, setActivaId] = useState(idInicial)
  // Vistas en cuyo vídeo no hay imagen en el instante del cursor.
  const [fuera, setFuera] = useState<ReadonlySet<string>>(new Set())
  const vivas = useRef<readonly VistaViva[]>([])
  const activaRef = useRef(idInicial)
  // Con el cursor desenlazado (marcando el evento para sincronizar), mover una vista no mueve la otra.
  const enlazado = useRef(true)
  // El instante común del cursor; null hasta que se mueva algo (entonces es el frame de la activa).
  const cursor = useRef<number | null>(null)

  const registrar = useCallback((v: readonly VistaViva[]) => {
    vivas.current = v
  }, [])

  /** Lleva todas las vistas menos `origen` al frame que se ve en el instante común `t`. */
  const llevarA = useCallback((t: number, origen: string) => {
    const sinImagen = new Set<string>()
    for (const w of vivas.current) {
      if (w.id === origen) continue
      const j = frameVisibleEnComun({ tabla: w.tabla, desfase: w.desfaseS }, t)
      if (j === null) sinImagen.add(w.id)
      else w.ir(j)
    }
    setFuera((anterior) => (mismoConjunto(anterior, sinImagen) ? anterior : sinImagen))
  }, [])

  /** La activa está en `frame` de su vídeo: las demás van a lo que se ve en ese instante común. */
  const propagar = useCallback(
    (idOrigen: string, frame: number) => {
      const origen = vivas.current.find((w) => w.id === idOrigen)
      if (!origen || origen.id !== activaRef.current) return
      const t = tiempoDe(origen, frame)
      cursor.current = t
      if (enlazado.current) llevarA(t, origen.id)
    },
    [llevarA],
  )

  /**
   * Las demás vistas se ponen donde toca según la activa, que no se mueve (al añadir una vista, al volver a montar o al
   * cambiar un desfase: el instante común de su frame puede haber cambiado).
   */
  const sincronizar = useCallback(() => {
    const activa = vivas.current.find((w) => w.id === activaRef.current)
    if (!activa || !enlazado.current) return
    const t = tiempoDe(activa, activa.deseado)
    cursor.current = t
    llevarA(t, activa.id)
  }, [llevarA])

  /** Enlaza o desenlaza el cursor; al enlazar, las demás vistas van donde toca según la activa. */
  const enlazar = useCallback(
    (si: boolean) => {
      enlazado.current = si
      if (si) sincronizar()
    },
    [sincronizar],
  )

  /** Cambia la vista activa; el cursor se queda donde estaba (salvo que caiga fuera del vídeo de la nueva). */
  const elegirActiva = useCallback(
    (id: string) => {
      const antes = vivas.current.find((w) => w.id === activaRef.current)
      const nueva = vivas.current.find((w) => w.id === id)
      if (!antes || !nueva || antes.id === id) return
      const t = cursor.current ?? tiempoDe(antes, antes.deseado)
      const visible = frameVisibleEnComun({ tabla: nueva.tabla, desfase: nueva.desfaseS }, t)
      // Mientras `activaRef` aún es la vieja, el aviso de este `ir` se ignora: el cursor se actualiza justo después.
      const enlazada = enlazado.current
      if (enlazada && visible === null) nueva.ir(indiceMasCercano(nueva.tabla, aVideo(t, nueva.desfaseS)))
      activaRef.current = id
      setActivaId(id)
      if (!enlazada) return
      if (visible === null) propagar(id, indiceMasCercano(nueva.tabla, aVideo(t, nueva.desfaseS)))
      else llevarA(t, id)
    },
    [propagar, llevarA],
  )

  return { activaId, fuera, registrar, propagar, sincronizar, enlazar, elegirActiva }
}
