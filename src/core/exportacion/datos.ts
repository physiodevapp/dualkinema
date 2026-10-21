import { relativoAlCero, type CeroReferencia } from '../articulaciones/cero'
import type { DefinicionArticulacion } from '../articulaciones/definicion'
import type { CalibracionVista } from '../calibracion/escala'
import type { Derivadas, VelocidadMarcador } from '../filtros/derivadas'
import type { TrayectoriaFiltrada } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Marcador, Muestra2D } from '../modelo/tipos'
import type { DatosExportacion } from './csv'

/** Lo filtrado que se exporta: coordenadas, velocidad de cada marcador, derivadas del ángulo y corte aplicado. */
export interface FiltradoExportable {
  readonly porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>
  readonly velocidades: ReadonlyMap<IdMarcador, VelocidadMarcador>
  readonly derivadas: Derivadas
  /** Corte aplicado (Hz): el elegido, limitado por los fps. */
  readonly corte: number
}

export interface EntradaDatosCsv {
  /** Tiempo de cada frame, en segundos de vídeo. */
  readonly tiempos: ArrayLike<number>
  readonly marcadores: readonly Marcador[]
  /** Lo seguido o marcado de cada marcador, tal cual (una posición o nada por frame). */
  readonly crudo: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>
  readonly filtrado: FiltradoExportable
  readonly articulacion: DefinicionArticulacion
  readonly orientacion: OrientacionVista
  /** Serie del ángulo por frame (NaN = sin valor), sin filtrar y filtrada: las mismas que lee la gráfica. */
  readonly anguloCrudo: Float64Array
  readonly anguloFiltrado: Float64Array
  readonly cero: CeroReferencia | null
  readonly calibracion: CalibracionVista | null
  readonly info: {
    readonly nombre: string
    readonly ancho: number
    readonly alto: number
    readonly rotacion: number
    readonly duracion: number
  }
  readonly est: { readonly fpsMedio: number; readonly variable: boolean }
  /** Corte pedido (Hz); el aplicado va en `filtrado.corte`. */
  readonly corteHz: number
  /** ISO 8601, de quien llama (así la función es pura). */
  readonly exportado: string
}

/**
 * Reúne lo que tiene el visor en lo que `construirCsv` exporta. El ángulo solo sale si la articulación es del plano
 * de la vista; el relativo, solo si hay cero. Sin valor = NaN (celda vacía), nunca 0.
 */
export function datosCsv(e: EntradaDatosCsv): DatosExportacion {
  const mismoPlano = e.orientacion.plano === e.articulacion.plano
  return {
    tiempos: e.tiempos,
    marcadores: e.marcadores.map((mk) => ({
      id: mk.id,
      nombre: mk.nombre,
      crudo: e.crudo.get(mk.id) ?? [],
      filtrado: e.filtrado.porMarcador.get(mk.id)!,
      velocidad: e.filtrado.velocidades.get(mk.id)!,
    })),
    angulo: mismoPlano
      ? {
          id: e.articulacion.id,
          nombre: e.articulacion.nombre,
          positivo: e.articulacion.positivo,
          negativo: e.articulacion.negativo,
          crudo: e.anguloCrudo,
          filtrado: e.anguloFiltrado,
          relativo: e.cero ? e.anguloFiltrado.map((v) => relativoAlCero(v, e.cero!)) : null,
          velocidad: e.filtrado.derivadas.velocidad,
          aceleracion: e.filtrado.derivadas.aceleracion,
          cero: e.cero,
        }
      : null,
    calibracion: e.calibracion,
    meta: {
      archivo: e.info.nombre,
      ancho: e.info.ancho,
      alto: e.info.alto,
      rotacion: e.info.rotacion,
      duracionS: e.info.duracion,
      fpsMedio: e.est.fpsMedio,
      fpsVariable: e.est.variable,
      orientacion: e.orientacion,
      corteHz: e.corteHz,
      corteEfectivoHz: e.filtrado.corte,
      exportado: e.exportado,
    },
  }
}
