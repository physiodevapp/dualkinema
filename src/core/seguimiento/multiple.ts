import type { IdMarcador } from '../modelo/tipos'
import type { LeerVentana } from './imagen'
import { radioDe, seguir, type EstadoMarcador, type Resultado } from './seguidor'

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

  procesar(t: number, leer: LeerVentana): Map<IdMarcador, Resultado> {
    const res = new Map<IdMarcador, Resultado>()
    for (const [id, e] of this.estados) res.set(id, seguir(e, leer, this.ancho, this.alto, t))

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
          enConflicto.add(ids[i]!)
          enConflicto.add(ids[j]!)
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
