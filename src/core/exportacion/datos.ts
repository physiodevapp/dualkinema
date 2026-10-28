import { serieAngular } from '../articulaciones/calculo'
import { ceroDeReferencia, relativoAlCero, type CeroReferencia, type TramoEstatico } from '../articulaciones/cero'
import { marcadoresDeArticulacion, type DefinicionArticulacion } from '../articulaciones/definicion'
import type { CalibracionVista } from '../calibracion/escala'
import { derivadasAngulares, type Derivadas, type VelocidadMarcador } from '../filtros/derivadas'
import { comoMuestras, type TrayectoriaFiltrada } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import type { DeteccionPose, IdMarcador, Marcador, Muestra2D } from '../modelo/tipos'
import { fuenteDe } from '../pose/catalogo'
import { angulosPorFrame, type AnguloExportado, type DatosExportacion, type SincronizacionExportada } from './csv'

/** Lo filtrado que se exporta: coordenadas, velocidad de cada marcador, derivadas del ángulo y corte aplicado. */
export interface FiltradoExportable {
  readonly porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>
  readonly velocidades: ReadonlyMap<IdMarcador, VelocidadMarcador>
  readonly derivadas: Derivadas
  /** Corte aplicado (Hz): el elegido, limitado por los fps. */
  readonly corte: number
  /** Frecuencia de muestreo de referencia (fps mediano), con la que se derivan las demás articulaciones. */
  readonly fs: number
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
  /** Solo con varias vistas: cómo se sincronizó esta con la de referencia. */
  readonly sincronia?: SincronizacionExportada
  /**
   * Fase 5: las demás articulaciones de la vista (además de `articulacion`, la elegida), que se exportan también, cada
   * una con su cero (`ceros`, tramo por id). Las de otro plano no salen.
   */
  readonly otras?: readonly DefinicionArticulacion[]
  readonly ceros?: Readonly<Record<string, TramoEstatico>>
  /** La última detección sin marcadores de la vista. */
  readonly deteccion?: DeteccionPose | null
}

/**
 * Lo que se exporta de una articulación que no es la que muestra el visor, con el mismo camino que el visor (`useFiltrado`
 * y `useAnalisis`): el ángulo crudo de lo seguido, el filtrado de las coordenadas filtradas, sus derivadas por tramos, el
 * cero del tramo y el relativo. Así cada articulación tiene una sola serie, la misma que vería al elegirla.
 */
export function anguloExportadoDe(
  def: DefinicionArticulacion,
  crudo: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>,
  porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>,
  orientacion: OrientacionVista,
  fs: number,
  tiempos: ArrayLike<number>,
  tramo: TramoEstatico | null,
): AnguloExportado {
  const ids = marcadoresDeArticulacion(def)
  const muestras = (id: IdMarcador) => (crudo.get(id) ?? []).filter((m): m is Muestra2D => m !== undefined)
  const serieCruda = serieAngular(def, Object.fromEntries(ids.map((id) => [id, muestras(id)])), orientacion)
  const filtradas = Object.fromEntries(ids.flatMap((id) => (porMarcador.has(id) ? [[id, comoMuestras(porMarcador.get(id)!)] as const] : [])))
  const serieFiltrada = serieAngular(def, filtradas, orientacion)
  const filtrado = angulosPorFrame(serieFiltrada, tiempos)
  const cero = tramo ? ceroDeReferencia(serieFiltrada, tramo) : null
  const derivadas = derivadasAngulares(def, porMarcador, orientacion, fs)
  return {
    id: def.id,
    nombre: def.nombre,
    fuente: fuenteDe(def),
    positivo: def.positivo,
    negativo: def.negativo,
    crudo: angulosPorFrame(serieCruda, tiempos),
    filtrado,
    relativo: cero ? filtrado.map((v) => relativoAlCero(v, cero)) : null,
    velocidad: derivadas.velocidad,
    aceleracion: derivadas.aceleracion,
    cero,
  }
}

/**
 * Reúne lo que tiene el visor en lo que `construirCsv` exporta. Los ángulos solo salen si la articulación es del plano
 * de la vista; el relativo, solo si hay cero. La elegida, con lo que muestra el visor; las demás, con `anguloExportadoDe`.
 * Sin valor = NaN (celda vacía), nunca 0.
 */
export function datosCsv(e: EntradaDatosCsv): DatosExportacion {
  const mismoPlano = e.orientacion.plano === e.articulacion.plano
  const elegida: AnguloExportado[] = mismoPlano
    ? [
        {
          id: e.articulacion.id,
          nombre: e.articulacion.nombre,
          fuente: fuenteDe(e.articulacion),
          positivo: e.articulacion.positivo,
          negativo: e.articulacion.negativo,
          crudo: e.anguloCrudo,
          filtrado: e.anguloFiltrado,
          relativo: e.cero ? e.anguloFiltrado.map((v) => relativoAlCero(v, e.cero!)) : null,
          velocidad: e.filtrado.derivadas.velocidad,
          aceleracion: e.filtrado.derivadas.aceleracion,
          cero: e.cero,
        },
      ]
    : []
  const otras = (e.otras ?? [])
    .filter((a) => a.id !== e.articulacion.id && a.plano === e.orientacion.plano)
    .map((a) => anguloExportadoDe(a, e.crudo, e.filtrado.porMarcador, e.orientacion, e.filtrado.fs, e.tiempos, e.ceros?.[a.id] ?? null))
  return {
    tiempos: e.tiempos,
    marcadores: e.marcadores.map((mk) => ({
      id: mk.id,
      nombre: mk.nombre,
      crudo: e.crudo.get(mk.id) ?? [],
      filtrado: e.filtrado.porMarcador.get(mk.id)!,
      velocidad: e.filtrado.velocidades.get(mk.id)!,
    })),
    angulos: [...elegida, ...otras],
    calibracion: e.calibracion,
    ...(e.sincronia ? { sincronia: e.sincronia } : {}),
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
      ...(e.deteccion ? { deteccion: e.deteccion } : {}),
    },
  }
}
