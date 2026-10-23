import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { interpolarHueco, quitarInterpolados, type HuecoInterpolable } from '../../core/seguimiento/interpolar'
import { quitarMarcasManuales } from '../../core/seguimiento/manuales'
import type { MuestraFrame } from '../../workers/protocolo'

export type SeriesTrayectorias = Map<IdMarcador, (Muestra2D | undefined)[]>

/** Lo que lee el render: cambia de identidad con cada modificación (`version` solo crece). */
export interface InstantaneaTrayectorias {
  readonly version: number
  readonly series: SeriesTrayectorias
}

/**
 * Las trayectorias de una vista: una posición (o nada) por frame y marcador. Se modifican en sitio (un lote del worker
 * no copia series de miles de frames) y cada modificación publica una instantánea nueva para `useSyncExternalStore`:
 * el render lee la instantánea y depende de ella (o de su `version`); los manejadores llaman a los métodos. Una por
 * vista: es la pieza que se duplica con la segunda vista (fase 3).
 */
export class AlmacenTrayectorias {
  private readonly mapa: SeriesTrayectorias = new Map()
  private instantanea: InstantaneaTrayectorias
  private readonly oyentes = new Set<() => void>()

  constructor(
    ids: readonly IdMarcador[],
    private readonly tiempos: readonly number[],
    inicial?: ReadonlyMap<IdMarcador, (Muestra2D | undefined)[]>,
  ) {
    for (const id of ids) this.mapa.set(id, inicial?.get(id) ?? new Array(tiempos.length))
    this.instantanea = { version: 0, series: this.mapa }
  }

  readonly suscribir = (oyente: () => void) => {
    this.oyentes.add(oyente)
    return () => {
      this.oyentes.delete(oyente)
    }
  }

  readonly leer = () => this.instantanea

  private publicar() {
    this.instantanea = { version: this.instantanea.version + 1, series: this.mapa }
    for (const oyente of this.oyentes) oyente()
  }

  /** Marca a mano la posición de un marcador en un frame (calidad 1, `editadoManual`). */
  readonly poner = (id: IdMarcador, i: number, x: number, y: number) => {
    this.mapa.get(id)![i] = { t: this.tiempos[i]!, x, y, calidad: 1, editadoManual: true }
    this.publicar()
  }

  /** Quita la posición de un marcador en un frame (queda sin muestra). */
  readonly quitar = (id: IdMarcador, i: number) => {
    this.mapa.get(id)![i] = undefined
    this.publicar()
  }

  /** Un lote del worker: lo seguido no sobrescribe lo marcado a mano. */
  readonly aplicarLote = (lote: readonly MuestraFrame[]) => {
    for (const f of lote) {
      for (const mk of f.marcadores) {
        const serie = this.mapa.get(mk.id)
        if (!serie || serie[f.indice]?.editadoManual) continue
        serie[f.indice] = { t: f.t, x: mk.x, y: mk.y, calidad: mk.calidad, editadoManual: false }
      }
    }
    this.publicar()
  }

  /**
   * Quita lo seguido después de `desde` (lo marcado a mano se conserva) y devuelve lo quitado, por si hay que
   * devolverlo (`devolver`).
   */
  readonly borrarDespuesDe = (desde: number) => {
    const total = this.tiempos.length
    const quitado: SeriesTrayectorias = new Map()
    for (const [id, serie] of this.mapa) {
      const antes = new Array<Muestra2D | undefined>(total)
      for (let i = desde + 1; i < total; i++) {
        if (!serie[i]?.editadoManual) {
          antes[i] = serie[i]
          serie[i] = undefined
        }
      }
      quitado.set(id, antes)
    }
    this.publicar()
    return quitado
  }

  /** Devuelve lo que quitó `borrarDespuesDe` en los frames que siguen vacíos. */
  readonly devolver = (quitado: SeriesTrayectorias) => {
    for (const [id, antes] of quitado) {
      const serie = this.mapa.get(id)
      if (!serie) continue
      antes.forEach((m, i) => {
        if (m !== undefined && serie[i] === undefined) serie[i] = m
      })
    }
    this.publicar()
  }

  /** Quita las marcas a mano posteriores a `desde`. Devuelve cuántas. */
  readonly quitarManualesDespuesDe = (desde: number) => {
    const n = quitarMarcasManuales(this.mapa, desde)
    this.publicar()
    return n
  }

  /** Rellena los huecos cortos dados. Devuelve cuántas posiciones ha interpolado. */
  readonly rellenar = (huecos: readonly { id: IdMarcador; h: HuecoInterpolable }[]) => {
    let frames = 0
    for (const { id, h } of huecos) {
      const serie = this.mapa.get(id)!
      for (const { indice, muestra: m } of interpolarHueco(serie, this.tiempos, h)) {
        serie[indice] = m
        frames++
      }
    }
    this.publicar()
    return frames
  }

  /** Lo interpolado vuelve a ser hueco, con lo que había antes de rellenar (perdido, dudoso o nada). */
  readonly quitarInterpolados = () => {
    quitarInterpolados(this.mapa.values())
    this.publicar()
  }
}
