import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { serieAngular, type MuestraAngulo } from '../../core/articulaciones/calculo'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import { corteEfectivo } from '../../core/filtros/butterworth'
import { derivadasAngulares, velocidadMarcador, type Derivadas, type VelocidadMarcador } from '../../core/filtros/derivadas'
import { comoMuestras, filtrarTrayectoria, type AjustesFiltro, type TrayectoriaFiltrada } from '../../core/filtros/tramos'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { fpsMediano, type TablaFrames } from '../../core/tiempo/tablaFrames'
import { esperaRefiltrado } from './refiltrado'

interface Opciones {
  readonly trayectorias: RefObject<Map<IdMarcador, (Muestra2D | undefined)[]>>
  /** Contador de cambios de las trayectorias (el `version` del visor). */
  readonly version: number
  readonly ids: readonly IdMarcador[]
  readonly tabla: TablaFrames
  readonly ajustes: AjustesFiltro
  readonly articulacion: DefinicionArticulacion
  readonly orientacion: OrientacionVista
  /** Escala de la vista (m/px); null = sin escala, velocidades en px/s. */
  readonly metrosPorPx: number | null
  /**
   * Mientras se sigue, las trayectorias cambian con cada lote del worker: se
   * refiltra a intervalos (`esperaRefiltrado`), no con cada lote, y al parar.
   */
  readonly siguiendo?: boolean
}

export interface Filtrado {
  /** Coordenadas filtradas por marcador (una posición o nada por frame). */
  readonly porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>
  /** Ángulo calculado con las coordenadas filtradas (decisión D1). */
  readonly serie: readonly MuestraAngulo[]
  /** Frecuencia de muestreo de referencia: mediana de los fps. */
  readonly fs: number
  /** Corte aplicado: el elegido, limitado por los fps. */
  readonly corte: number
  /** Tramos cortos (filtrados, sin derivadas), sumando todos los marcadores. */
  readonly tramosCortos: number
  /** Velocidad (°/s) y aceleración (°/s²) angulares por frame (NaN = sin valor). */
  readonly derivadas: Derivadas
  /** Velocidad lineal de cada marcador por frame: en m/s con escala, en px/s sin ella. */
  readonly velocidades: ReadonlyMap<IdMarcador, VelocidadMarcador>
}

/**
 * Filtra las coordenadas de cada marcador y calcula con ellas el ángulo, sus
 * derivadas y la velocidad de cada marcador.
 * Se rehace cuando cambian las trayectorias o el corte (mientras se sigue, a intervalos);
 * es lineal en el número de frames: unos 8 ms por marcador con 3600 frames
 * (2 min a 30 fps) en un ordenador, varias veces más en un móvil.
 */
export function useFiltrado({ trayectorias, version, ids, tabla, ajustes, articulacion, orientacion, metrosPorPx, siguiendo }: Opciones): Filtrado {
  const fs = useMemo(() => fpsMediano(tabla), [tabla])
  // Mientras se sigue se filtra con la versión «pedida», que alcanza a la
  // actual como mucho cada `esperaRefiltrado`; parado, con la actual.
  const [pedida, setPedida] = useState(version)
  const vigente = siguiendo ? pedida : version
  // Inicio y coste (ms) de la última pasada.
  const ultima = useRef({ inicio: -Infinity, coste: 0 })
  useEffect(() => {
    if (!siguiendo || pedida === version) return
    const espera = esperaRefiltrado(performance.now(), ultima.current.inicio, ultima.current.coste)
    const id = setTimeout(() => setPedida(version), espera)
    return () => clearTimeout(id)
  }, [siguiendo, pedida, version])
  const filtrado = useMemo(() => {
    void vigente
    const inicio = performance.now()
    const porMarcador = new Map<IdMarcador, TrayectoriaFiltrada>()
    let tramosCortos = 0
    if (Number.isFinite(fs)) {
      for (const id of ids) {
        const f = filtrarTrayectoria(trayectorias.current.get(id) ?? [], fs, ajustes)
        porMarcador.set(id, f)
        tramosCortos += f.tramos.filter((t) => t.corto).length
      }
    }
    const serie =
      orientacion.plano === articulacion.plano
        ? serieAngular(articulacion, Object.fromEntries([...porMarcador].map(([id, f]) => [id, comoMuestras(f)])), orientacion)
        : []
    const derivadas = derivadasAngulares(articulacion, porMarcador, orientacion, fs)
    ultima.current = { inicio, coste: performance.now() - inicio }
    return { porMarcador, serie, fs, corte: corteEfectivo(ajustes.corteHz, fs), tramosCortos, derivadas }
  }, [vigente, fs, ids, trayectorias, ajustes, articulacion, orientacion])
  // Aparte: cambiar la escala no obliga a volver a filtrar.
  const velocidades = useMemo(
    () => new Map([...filtrado.porMarcador].map(([id, f]) => [id, velocidadMarcador(f, metrosPorPx)])),
    [filtrado, metrosPorPx],
  )
  return useMemo(() => ({ ...filtrado, velocidades }), [filtrado, velocidades])
}
