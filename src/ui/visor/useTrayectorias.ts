/* eslint-disable react-hooks/refs, react-hooks/immutability --
 * Las trayectorias viven en una ref que se lee y se modifica durante el render (con `version` para avisar a React):
 * es el diseño de la §11 y de la persistencia, y los mutadores de este hook son quienes la modifican. Se resolverá,
 * o se encapsulará mejor, al duplicar las trayectorias por vista en la fase 3. */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { huecosInterpolables, interpolarHueco, quitarInterpolados as quitarInterpoladosDe } from '../../core/seguimiento/interpolar'
import { quitarMarcasManuales } from '../../core/seguimiento/manuales'
import type { TablaFrames } from '../../core/tiempo/tablaFrames'
import type { MuestraFrame } from '../../workers/protocolo'
import type { EstadoFrame } from './BandaFrames'

export type SeriesTrayectorias = Map<IdMarcador, (Muestra2D | undefined)[]>

interface Opciones {
  readonly ids: readonly IdMarcador[]
  readonly tabla: TablaFrames
  /** Al recuperar una sesión: las trayectorias tal como se guardaron. */
  readonly inicial?: ReadonlyMap<IdMarcador, (Muestra2D | undefined)[]>
  /** ¿Posición utilizable para el análisis? (`CALIDAD_MINIMA`; la define el visor). */
  readonly valida: (m: Muestra2D | undefined) => m is Muestra2D
}

/**
 * Las trayectorias del visor: una posición (o nada) por frame y marcador. Se modifican en sitio y `version` avisa a
 * React de que hay que repintar; cada mutador la sube por dentro. Además, lo que sale de ellas frame a frame: el
 * estado de cada frame para la franja y los huecos cortos que se pueden rellenar.
 *
 * Quien lee `trayectorias.current` durante el render (useMemo) tiene que depender de `version`.
 */
export function useTrayectorias({ ids, tabla, inicial, valida }: Opciones) {
  const total = tabla.tiempos.length
  // Trayectorias: una posición (o nada) por frame y marcador. Se modifican en
  // sitio y `version` avisa a React de que hay que repintar.
  const trayectorias = useRef<SeriesTrayectorias>(new Map())
  const [version, setVersion] = useState(0)
  if (trayectorias.current.size === 0) for (const id of ids) trayectorias.current.set(id, inicial?.get(id) ?? new Array(total))
  const muestra = useCallback((id: IdMarcador, i: number) => trayectorias.current.get(id)?.[i], [])
  /** Las series tal como están ahora (para leerlas fuera del render, p. ej. al exportar). */
  const series = useCallback(() => trayectorias.current, [])

  /** Marca a mano la posición de un marcador en un frame (calidad 1, `editadoManual`). */
  const poner = useCallback(
    (id: IdMarcador, i: number, x: number, y: number) => {
      const serie = trayectorias.current.get(id)!
      serie[i] = { t: tabla.tiempos[i]!, x, y, calidad: 1, editadoManual: true }
      setVersion((v) => v + 1)
    },
    [tabla],
  )

  /** Quita la posición de un marcador en un frame (queda sin muestra). */
  const quitar = useCallback((id: IdMarcador, i: number) => {
    trayectorias.current.get(id)![i] = undefined
    setVersion((v) => v + 1)
  }, [])

  /** Un lote del worker: lo seguido no sobrescribe lo marcado a mano. */
  const aplicarLote = useCallback((lote: readonly MuestraFrame[]) => {
    for (const f of lote) {
      for (const mk of f.marcadores) {
        const serie = trayectorias.current.get(mk.id)
        if (!serie || serie[f.indice]?.editadoManual) continue
        serie[f.indice] = { t: f.t, x: mk.x, y: mk.y, calidad: mk.calidad, editadoManual: false }
      }
    }
    setVersion((v) => v + 1)
  }, [])

  /**
   * Quita lo seguido después de `desde` (lo marcado a mano se conserva) y devuelve lo quitado, por si hay que
   * devolverlo (`devolver`).
   */
  const borrarDespuesDe = useCallback(
    (desde: number) => {
      const quitado: SeriesTrayectorias = new Map()
      for (const [id, serie] of trayectorias.current) {
        const antes = new Array<Muestra2D | undefined>(total)
        for (let i = desde + 1; i < total; i++) {
          if (!serie[i]?.editadoManual) {
            antes[i] = serie[i]
            serie[i] = undefined
          }
        }
        quitado.set(id, antes)
      }
      setVersion((v) => v + 1)
      return quitado
    },
    [total],
  )

  /** Devuelve lo que quitó `borrarDespuesDe` en los frames que siguen vacíos. */
  const devolver = useCallback((quitado: SeriesTrayectorias) => {
    for (const [id, antes] of quitado) {
      const serie = trayectorias.current.get(id)
      if (!serie) continue
      antes.forEach((m, i) => {
        if (m !== undefined && serie[i] === undefined) serie[i] = m
      })
    }
    setVersion((v) => v + 1)
  }, [])

  /** Quita las marcas a mano posteriores a `desde`. Devuelve cuántas. */
  const quitarManualesDespuesDe = useCallback((desde: number) => {
    const n = quitarMarcasManuales(trayectorias.current, desde)
    setVersion((v) => v + 1)
    return n
  }, [])

  // ---- Huecos cortos: rellenar a petición ----
  const huecosCortos = useMemo(() => {
    void version
    return ids.flatMap((id) => huecosInterpolables(trayectorias.current.get(id)!, tabla.tiempos).map((h) => ({ id, h })))
  }, [version, ids, tabla])
  const hayInterpolados = useMemo(() => {
    void version
    return [...trayectorias.current.values()].some((s) => s.some((m) => m?.interpolado))
  }, [version])

  /** Rellena los huecos cortos (`huecosCortos`). Devuelve cuántas posiciones ha interpolado. */
  const rellenarCortos = useCallback(() => {
    let frames = 0
    for (const { id, h } of huecosCortos) {
      const serie = trayectorias.current.get(id)!
      for (const { indice, muestra: m } of interpolarHueco(serie, tabla.tiempos, h)) {
        serie[indice] = m
        frames++
      }
    }
    setVersion((v) => v + 1)
    return frames
  }, [huecosCortos, tabla])

  /** Lo interpolado vuelve a ser hueco, con lo que había antes de rellenar (perdido, dudoso o nada). */
  const quitarInterpolados = useCallback(() => {
    quitarInterpoladosDe(trayectorias.current.values())
    setVersion((v) => v + 1)
  }, [])

  // ---- Estado por frame para la franja ----
  const estadosFrames = useMemo<EstadoFrame[]>(() => {
    void version
    const r: EstadoFrame[] = new Array(total)
    for (let i = 0; i < total; i++) {
      let hay = false
      let perdido = false
      let manual = false
      let interpolado = false
      for (const id of ids) {
        const m = muestra(id, i)
        if (!m) continue
        hay = true
        if (m.editadoManual) manual = true
        else if (m.interpolado) interpolado = true
        else if (!valida(m)) perdido = true
      }
      r[i] = perdido ? 'perdido' : interpolado ? 'interpolado' : manual ? 'manual' : hay ? 'seguido' : 'vacio'
    }
    return r
  }, [version, total, ids, muestra, valida])

  return {
    trayectorias,
    version,
    muestra,
    series,
    poner,
    quitar,
    aplicarLote,
    borrarDespuesDe,
    devolver,
    quitarManualesDespuesDe,
    huecosCortos,
    hayInterpolados,
    rellenarCortos,
    quitarInterpolados,
    estadosFrames,
  }
}
