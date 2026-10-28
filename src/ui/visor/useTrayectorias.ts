import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { huecosInterpolables } from '../../core/seguimiento/interpolar'
import type { TablaFrames } from '../../core/tiempo/tablaFrames'
import { AlmacenTrayectorias, type SeriesTrayectorias } from './almacenTrayectorias'
import type { EstadoFrame } from './BandaFrames'

export type { SeriesTrayectorias } from './almacenTrayectorias'

interface Opciones {
  /** Los marcadores de la vista (gomets y, sin marcadores, los puntos del modelo). */
  readonly ids: readonly IdMarcador[]
  /**
   * Los que cuentan en la franja de cada frame y en los huecos cortos (los que se marcan; sin la pierna lejana del modelo,
   * casi siempre dudosa).
   */
  readonly idsFranja: readonly IdMarcador[]
  readonly tabla: TablaFrames
  /** Al recuperar una sesión: las trayectorias tal como se guardaron. */
  readonly inicial?: ReadonlyMap<IdMarcador, (Muestra2D | undefined)[]>
  /** ¿Posición utilizable para el análisis? (`CALIDAD_MINIMA`; la define el visor). */
  readonly valida: (m: Muestra2D | undefined) => m is Muestra2D
}

/**
 * Las trayectorias del visor (`AlmacenTrayectorias`, creado una vez por apertura y leído con `useSyncExternalStore`):
 * `series` es el mapa de las series (siempre el mismo objeto, modificado en sitio) y `version` cambia con cada
 * modificación; los mutadores son los del almacén. Además, lo que sale de ellas frame a frame: el estado de cada frame
 * para la franja y los huecos cortos que se pueden rellenar.
 *
 * Quien lee `series` durante el render (useMemo) tiene que depender de `version`.
 */
export function useTrayectorias({ ids, idsFranja, tabla, inicial, valida }: Opciones) {
  const total = tabla.tiempos.length
  const [almacen] = useState(() => new AlmacenTrayectorias(ids, tabla.tiempos, inicial))
  // La vista puede empezar a seguir marcadores nuevos (al detectar sin marcadores): sus series, vacías, desde este render.
  almacen.asegurar(ids)
  const { version, series } = useSyncExternalStore(almacen.suscribir, almacen.leer)
  const muestra = useCallback((id: IdMarcador, i: number) => series.get(id)?.[i], [series])

  // ---- Huecos cortos: rellenar a petición ----
  // En los marcadores de la franja: los puntos del modelo que no se miden (la pierna lejana) no se rellenan.
  const huecosCortos = useMemo(() => {
    void version
    return idsFranja.flatMap((id) => huecosInterpolables(series.get(id)!, tabla.tiempos).map((h) => ({ id, h })))
  }, [version, series, idsFranja, tabla])
  const hayInterpolados = useMemo(() => {
    void version
    return [...series.values()].some((s) => s.some((m) => m?.interpolado))
  }, [version, series])

  /** Rellena los huecos cortos (`huecosCortos`). Devuelve cuántas posiciones ha interpolado. */
  const { rellenar } = almacen
  const rellenarCortos = useCallback(() => rellenar(huecosCortos), [rellenar, huecosCortos])

  // ---- Estado por frame para la franja ----
  const estadosFrames = useMemo<EstadoFrame[]>(() => {
    void version
    const r: EstadoFrame[] = new Array(total)
    for (let i = 0; i < total; i++) {
      let hay = false
      let perdido = false
      let manual = false
      let interpolado = false
      for (const id of idsFranja) {
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
  }, [version, total, idsFranja, muestra, valida])

  return {
    series: series as SeriesTrayectorias,
    version,
    muestra,
    poner: almacen.poner,
    quitar: almacen.quitar,
    aplicarLote: almacen.aplicarLote,
    borrarDespuesDe: almacen.borrarDespuesDe,
    devolver: almacen.devolver,
    quitarManualesDespuesDe: almacen.quitarManualesDespuesDe,
    aplicarPose: almacen.aplicarPose,
    fusionar: almacen.fusionar,
    huecosCortos,
    hayInterpolados,
    rellenarCortos,
    quitarInterpolados: almacen.quitarInterpolados,
    estadosFrames,
  }
}
