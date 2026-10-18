import { useMemo, useRef, type RefObject } from 'react'
import { anguloArticular, serieAngular, type MuestraAngulo } from '../../core/articulaciones/calculo'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import { corteEfectivo } from '../../core/filtros/butterworth'
import { derivadasAngulares, velocidadMarcador, type Derivadas, type VelocidadMarcador } from '../../core/filtros/derivadas'
import { comoMuestras, filtrarTrayectoria, type AjustesFiltro, type TrayectoriaFiltrada } from '../../core/filtros/tramos'
import { aCanonico, type OrientacionVista } from '../../core/geometria/canonico'
import type { Vec3 } from '../../core/geometria/vector'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import { fpsMediano, type TablaFrames } from '../../core/tiempo/tablaFrames'

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
   * Mientras se sigue, las trayectorias cambian con cada lote del worker:
   * se conserva lo último filtrado y se rehace al parar.
   */
  readonly congelado?: boolean
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
  /** Ángulo filtrado en el frame i (NaN si falta algún marcador). */
  readonly anguloEn: (i: number) => number
  /** Velocidad (°/s) y aceleración (°/s²) angulares por frame (NaN = sin valor). */
  readonly derivadas: Derivadas
  /** Velocidad lineal de cada marcador por frame: en m/s con escala, en px/s sin ella. */
  readonly velocidades: ReadonlyMap<IdMarcador, VelocidadMarcador>
}

/**
 * Filtra las coordenadas de cada marcador y calcula con ellas el ángulo, sus
 * derivadas y la velocidad de cada marcador.
 * Se rehace cuando cambian las trayectorias o el corte (salvo `congelado`);
 * es lineal en el número de frames: unos 8 ms por marcador con 3600 frames
 * (2 min a 30 fps) en un ordenador, varias veces más en un móvil.
 */
export function useFiltrado({ trayectorias, version, ids, tabla, ajustes, articulacion, orientacion, metrosPorPx, congelado }: Opciones): Filtrado {
  const fs = useMemo(() => fpsMediano(tabla), [tabla])
  const ultimo = useRef<Omit<Filtrado, 'velocidades'> | null>(null)
  const filtrado = useMemo(() => {
    void version
    if (congelado && ultimo.current) return ultimo.current
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
    const anguloEn = (i: number) => {
      const puntos = new Map<IdMarcador, Vec3>()
      for (const [id, f] of porMarcador) {
        const p = f.posiciones[i]
        if (p) puntos.set(id, aCanonico(p.x, p.y, orientacion))
      }
      return anguloArticular(articulacion, puntos)
    }
    const derivadas = derivadasAngulares(articulacion, porMarcador, orientacion, fs)
    return { porMarcador, serie, fs, corte: corteEfectivo(ajustes.corteHz, fs), tramosCortos, anguloEn, derivadas }
  }, [version, fs, ids, trayectorias, ajustes, articulacion, orientacion, congelado])
  ultimo.current = filtrado
  // Aparte: cambiar la escala no obliga a volver a filtrar.
  const velocidades = useMemo(
    () => new Map([...filtrado.porMarcador].map(([id, f]) => [id, velocidadMarcador(f, metrosPorPx)])),
    [filtrado, metrosPorPx],
  )
  return useMemo(() => ({ ...filtrado, velocidades }), [filtrado, velocidades])
}
