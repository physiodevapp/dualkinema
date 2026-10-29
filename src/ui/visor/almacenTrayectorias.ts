import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { interpolarHueco, quitarInterpolados, type HuecoInterpolable } from '../../core/seguimiento/interpolar'
import { quitarMarcasManuales } from '../../core/seguimiento/manuales'
import { fusionarDeteccion, idPose, muestrasDeFrame, PUNTOS_MEDIOS, PUNTOS_POSE, puntoMedio, type FramePose } from '../../core/pose/puntos'
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
    // Al recuperar, los medios no vienen guardados: salen de lo que hay.
    this.recalcularMedios()
    this.instantanea = { version: 0, series: this.mapa }
  }

  /**
   * Los puntos medios del modelo sin marcadores (fase 5: el tronco de frente va del medio de las caderas al de los
   * hombros), si la vista los usa: se rehacen de los dos lados con cada cambio, así que una corrección a mano de una cadera
   * llega al medio. No se marcan ni se guardan (`esPuntoMedio`).
   */
  private recalcularMedios() {
    for (const { id, parte } of PUNTOS_MEDIOS) {
      const medio = this.mapa.get(id)
      if (!medio) continue
      const izq = this.mapa.get(idPose(parte, 'izq')) ?? []
      const der = this.mapa.get(idPose(parte, 'der')) ?? []
      for (let i = 0; i < medio.length; i++) medio[i] = puntoMedio(izq[i], der[i])
    }
  }

  readonly suscribir = (oyente: () => void) => {
    this.oyentes.add(oyente)
    return () => {
      this.oyentes.delete(oyente)
    }
  }

  readonly leer = () => this.instantanea

  private publicar() {
    this.recalcularMedios()
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

  /**
   * Que haya serie para cada id (vacía si no la había). Al detectar sin marcadores, la vista empieza a seguir los puntos
   * del modelo y sus series aparecen. No publica: no cambia nada que se vea, y se puede llamar durante el render.
   */
  readonly asegurar = (ids: readonly IdMarcador[]) => {
    let nuevos = false
    for (const id of ids) {
      if (this.mapa.has(id)) continue
      this.mapa.set(id, new Array(this.tiempos.length))
      nuevos = true
    }
    if (nuevos) this.recalcularMedios()
  }

  /** Un lote del worker sin marcadores mientras detecta: lo detectado no sobrescribe lo marcado a mano. */
  readonly aplicarPose = (lote: readonly FramePose[]) => {
    this.asegurar(PUNTOS_POSE.map((p) => p.id))
    for (const f of lote) {
      muestrasDeFrame(f).forEach((m, k) => {
        const serie = this.mapa.get(PUNTOS_POSE[k]!.id)!
        if (!serie[f.indice]?.editadoManual) serie[f.indice] = m
      })
    }
    this.publicar()
  }

  /**
   * Una detección entera ya corregida (las piernas en su lado): sustituye lo que había salvo lo marcado a mano, y donde no
   * llegó deja lo de antes (`fusionarDeteccion`).
   */
  readonly fusionar = (nuevas: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>) => {
    const r = fusionarDeteccion(this.mapa, nuevas)
    for (const id of nuevas.keys()) this.mapa.set(id, r.get(id)!)
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
   * Quita lo seguido después de `desde` en las series de `ids` (lo marcado a mano se conserva; los puntos sin marcadores
   * no se siguen y no se tocan) y devuelve lo quitado, por si hay que devolverlo (`devolver`).
   */
  readonly borrarDespuesDe = (desde: number, ids: readonly IdMarcador[]) => {
    const total = this.tiempos.length
    const quitado: SeriesTrayectorias = new Map()
    for (const id of ids) {
      const serie = this.mapa.get(id)
      if (!serie) continue
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

  /** Quita las marcas a mano posteriores a `desde` en las series de `ids` (las que se siguen). Devuelve cuántas. */
  readonly quitarManualesDespuesDe = (desde: number, ids: readonly IdMarcador[]) => {
    const n = quitarMarcasManuales(new Map(ids.flatMap((id) => (this.mapa.has(id) ? [[id, this.mapa.get(id)!] as const] : []))), desde)
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
