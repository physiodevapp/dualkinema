import type { IdMarcador } from '../modelo/tipos'
import type { LeerVentana } from './imagen'
import { aprenderMarcador, ErrorMarcado, predecir, radioDe, seguir, type EstadoMarcador, type Resultado } from './seguidor'

/** Posición marcada a mano en un frame: el seguidor la toma como cierta. */
export interface Ancla {
  readonly x: number
  readonly y: number
}

/**
 * Estado de un marcador en una ancla. Se vuelve a aprender el gomet ahí
 * (color y tamaño, por si cambiaron la luz o el ángulo de visión). Si no se
 * puede (se colocó a ojo porque el gomet no se ve), se conserva lo aprendido
 * antes y solo se mueve la posición.
 *
 * La velocidad previa solo se conserva si el marcador venía bien seguido y el
 * ancla cae cerca de donde se le esperaba (una corrección fina, de menos de
 * dos radios del gomet). Si cae lejos, lo seguido justo antes estaba mal (por
 * eso se corrigió) y su velocidad también: el seguimiento arranca desde el
 * ancla sin velocidad, y la ventana de búsqueda crece si en el frame
 * siguiente no lo encuentra.
 */
export function estadoEnAncla(
  previo: EstadoMarcador,
  ancla: Ancla,
  t: number,
  leer: LeerVentana,
  ancho: number,
  alto: number,
): EstadoMarcador {
  const p = predecir(previo, t)
  const fina = previo.perdidos === 0 && Math.hypot(p.x - ancla.x, p.y - ancla.y) <= 2 * radioDe(previo.area)
  const ultimas = [...(fina ? previo.ultimas.slice(-1) : []), { t, x: ancla.x, y: ancla.y }]
  try {
    const { estado } = aprenderMarcador(leer, ancho, alto, t, ancla.x, ancla.y)
    return { ...estado, ultimas }
  } catch (e) {
    if (!(e instanceof ErrorMarcado)) throw e
    // Sin gomet en el ancla (tapado, o colocado a ojo lejos de él): si en los
    // frames siguientes no aparece cerca, se busca más lejos (`reenganche`).
    return { ...previo, ultimas, perdidos: 0, reenganche: t }
  }
}

/** Frames seguidos sin encontrar un marcador a partir de los cuales se considera «perdido» (para avisos). */
export const MAX_PERDIDOS = 3

/**
 * Sigue varios marcadores frame a frame. Si dos acaban en la misma mancha
 * (gomets del mismo color que se tocan), los dos quedan sin posición en ese
 * frame en lugar de duplicarla o inventarla.
 */
export class SeguidorMultiple {
  private estados: Map<IdMarcador, EstadoMarcador>

  constructor(
    iniciales: ReadonlyMap<IdMarcador, EstadoMarcador>,
    private readonly ancho: number,
    private readonly alto: number,
  ) {
    this.estados = new Map(iniciales)
  }

  /**
   * Busca los marcadores en el frame del instante t. Los que tienen `anclas`
   * (marcados a mano en este frame) no se buscan: su posición es la del ancla,
   * con calidad 1, y el seguimiento continúa desde ahí. Así una corrección a
   * mano arregla también los frames siguientes.
   */
  procesar(t: number, leer: LeerVentana, anclas?: ReadonlyMap<IdMarcador, Ancla>): Map<IdMarcador, Resultado> {
    const res = new Map<IdMarcador, Resultado>()
    for (const [id, e] of this.estados) {
      const a = anclas?.get(id)
      // Dónde están los demás (su ancla, o su última posición si venían bien
      // seguidos): un reenganche no puede quedarse con el gomet de otro.
      const ocupadas = [...this.estados]
        .filter(([otro]) => otro !== id)
        .flatMap(([otro, o]) => {
          const ao = anclas?.get(otro)
          if (ao) return [ao]
          return o.perdidos === 0 ? [o.ultimas[o.ultimas.length - 1]!] : []
        })
      res.set(
        id,
        a
          ? { x: a.x, y: a.y, calidad: 1, estado: estadoEnAncla(e, a, t, leer, this.ancho, this.alto) }
          : seguir(e, leer, this.ancho, this.alto, t, ocupadas),
      )
    }

    // Dos marcadores en la misma mancha (gomets del mismo color que se tocan):
    // no se pueden separar, así que los dos quedan sin posición en este frame.
    const ids = [...res.keys()]
    const enConflicto = new Set<IdMarcador>()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = res.get(ids[i]!)!
        const b = res.get(ids[j]!)!
        if (Number.isNaN(a.x) || Number.isNaN(b.x)) continue
        const minimo = Math.max(radioDe(a.estado.area), radioDe(b.estado.area))
        if (Math.hypot(a.x - b.x, a.y - b.y) < minimo) {
          // Un ancla manda: solo pierde la posición el que se ha buscado.
          if (!anclas?.has(ids[i]!)) enConflicto.add(ids[i]!)
          if (!anclas?.has(ids[j]!)) enConflicto.add(ids[j]!)
        }
      }
    }
    for (const id of enConflicto) {
      const anterior = this.estados.get(id)!
      res.set(id, { x: NaN, y: NaN, calidad: 0, estado: { ...anterior, perdidos: anterior.perdidos + 1 }, motivo: 'conflicto' })
    }

    for (const [id, r] of res) this.estados.set(id, r.estado)
    return res
  }

  /** Marcadores perdidos demasiados frames seguidos. */
  perdidos(max = MAX_PERDIDOS): IdMarcador[] {
    return [...this.estados].filter(([, e]) => e.perdidos >= max).map(([id]) => id)
  }

  /** Estados actuales (para continuar en otro momento). */
  get actuales(): ReadonlyMap<IdMarcador, EstadoMarcador> {
    return this.estados
  }
}
