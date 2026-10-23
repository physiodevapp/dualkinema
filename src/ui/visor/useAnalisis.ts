import { useCallback, useMemo, useState } from 'react'
import { serieAngular } from '../../core/articulaciones/calculo'
import { ceroDeReferencia, type TramoEstatico } from '../../core/articulaciones/cero'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import { metrosPorPx, type CalibracionVista } from '../../core/calibracion/escala'
import { constanciaSegmento } from '../../core/calibracion/segmentos'
import { AJUSTES_FILTRO_DEFECTO, type AjustesFiltro } from '../../core/filtros/tramos'
import type { OrientacionVista } from '../../core/geometria/canonico'
import { resumirSerie } from '../../core/graficas/rango'
import { seriePorFrame } from '../../core/graficas/series'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import type { TablaFrames } from '../../core/tiempo/tablaFrames'
import { useFiltrado } from './useFiltrado'
import type { SeriesTrayectorias } from './useTrayectorias'

interface Opciones {
  readonly series: SeriesTrayectorias
  /** Contador de cambios de las trayectorias (el `version` de `useTrayectorias`). */
  readonly version: number
  readonly ids: readonly IdMarcador[]
  readonly tabla: TablaFrames
  readonly articulacion: DefinicionArticulacion
  readonly orientacion: OrientacionVista
  /** Segmentos de la articulación (para vigilar su longitud). */
  readonly segmentos: readonly { readonly desde: IdMarcador; readonly hasta: IdMarcador; readonly nombre: string }[]
  /** Escala de la vista: con ella, las velocidades de los marcadores en m/s. */
  readonly calibracion: CalibracionVista | null
  readonly siguiendo: boolean
  /** Al recuperar: el ajuste del filtro guardado (null o sin dar = el de por defecto) y los tramos del cero. */
  readonly filtroInicial?: AjustesFiltro | null
  readonly cerosIniciales?: Readonly<Record<string, TramoEstatico>>
}

/**
 * El análisis de la vista: ajuste del filtro y cero de referencia (con sus contadores de cambios, para el guardado),
 * la serie del ángulo sin filtrar y su resumen, lo filtrado (coordenadas, ángulo, derivadas y velocidades), las series
 * por frame de la gráfica y del CSV, el cero, y la longitud de los segmentos.
 */
export function useAnalisis({
  series,
  version,
  ids,
  tabla,
  articulacion,
  orientacion,
  segmentos,
  calibracion,
  siguiendo,
  filtroInicial,
  cerosIniciales,
}: Opciones) {
  // Ajuste del filtro: se guarda con la sesión. `revAjustes` cuenta sus cambios
  // para que el guardado automático los vea (como `version` con las trayectorias).
  const [ajustes, setAjustes] = useState<AjustesFiltro>(filtroInicial ?? AJUSTES_FILTRO_DEFECTO)
  const [revAjustes, setRevAjustes] = useState(0)
  const cambiarAjustes = useCallback((a: AjustesFiltro) => {
    setAjustes(a)
    setRevAjustes((r) => r + 1)
  }, [])
  // Cero de referencia (paso 5): tramo estático por articulación; se guarda
  // el tramo y la media se recalcula con lo filtrado.
  const [ceros, setCeros] = useState<Readonly<Record<string, TramoEstatico>>>(cerosIniciales ?? {})
  const [revCeros, setRevCeros] = useState(0)
  const cambiarTramo = useCallback(
    (tramo: TramoEstatico | null) => {
      setCeros((c) => {
        const r: Record<string, TramoEstatico> = { ...c }
        if (tramo) r[articulacion.id] = tramo
        else delete r[articulacion.id]
        return r
      })
      setRevCeros((r) => r + 1)
    },
    [articulacion.id],
  )

  // Serie completa del ángulo para la gráfica: misma regla de huecos que el valor
  // en directo (marcador ausente o perdido = sin valor). Lo interpolado a
  // petición tiene valor, pero va marcado y se dibuja aparte.
  const serie = useMemo(() => {
    void version
    if (orientacion.plano !== articulacion.plano) return []
    const porMarcador: Record<IdMarcador, Muestra2D[]> = {}
    for (const id of ids) porMarcador[id] = (series.get(id) ?? []).filter((m): m is Muestra2D => m !== undefined)
    return serieAngular(articulacion, porMarcador, orientacion)
  }, [version, ids, orientacion, articulacion, series])
  const resumen = useMemo(() => resumirSerie(serie), [serie])
  const filtrado = useFiltrado({
    series,
    version,
    ids,
    tabla,
    ajustes,
    articulacion,
    orientacion,
    metrosPorPx: calibracion ? metrosPorPx(calibracion) : null,
    siguiendo,
  })

  // Las series de la gráfica, un valor por frame.
  const crudoPorFrame = useMemo(() => seriePorFrame(serie, tabla.tiempos), [serie, tabla])
  const filtradoPorFrame = useMemo(() => seriePorFrame(filtrado.serie, tabla.tiempos), [filtrado.serie, tabla])
  const tramoEstatico = ceros[articulacion.id] ?? null
  const cero = useMemo(() => (tramoEstatico ? ceroDeReferencia(filtrado.serie, tramoEstatico) : null), [tramoEstatico, filtrado.serie])
  // Longitud de cada segmento a lo largo del vídeo, con lo filtrado (menos ruido que lo crudo).
  const constancia = useMemo(
    () =>
      segmentos.map((s) => ({
        segmento: s,
        c: constanciaSegmento(filtrado.porMarcador.get(s.desde)?.posiciones ?? [], filtrado.porMarcador.get(s.hasta)?.posiciones ?? []),
      })),
    [segmentos, filtrado.porMarcador],
  )
  const seriesSegmentos = useMemo(
    () =>
      constancia.map(({ segmento: s, c }) => ({
        id: `${s.desde}-${s.hasta}`,
        nombre: s.nombre,
        relativa: c?.relativa ?? [],
        interpolado: c?.interpolado ?? [],
      })),
    [constancia],
  )
  const instantesInterpolados = useMemo(() => serie.filter((p) => p.interpolado).length, [serie])

  return {
    ajustes,
    cambiarAjustes,
    revAjustes,
    ceros,
    cambiarTramo,
    revCeros,
    serie,
    resumen,
    filtrado,
    crudoPorFrame,
    filtradoPorFrame,
    tramoEstatico,
    cero,
    constancia,
    seriesSegmentos,
    instantesInterpolados,
  }
}
