import { useCallback, useMemo, useState } from 'react'
import { CALIDAD_MINIMA } from '../../core/articulaciones/calculo'
import { construirCsv, nombreArchivoCsv, type FormatoCsv } from '../../core/exportacion/csv'
import { datosCsv } from '../../core/exportacion/datos'
import type { TramoEstatico } from '../../core/articulaciones/cero'
import type { CalibracionVista } from '../../core/calibracion/escala'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../../core/modelo/tipos'
import { framesConMarcaManual } from '../../core/seguimiento/manuales'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import { estadisticas, indiceMasCercano } from '../../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../../media/video'
import { nombreCorto } from '../marcadores'
import { huellaDe } from '../sesion'
import { useTrayectorias } from './useTrayectorias'
import { useMarcado } from './useMarcado'
import { useSeguimiento, type Aviso } from './useSeguimiento'
import { useAnalisis } from './useAnalisis'
import { useEscala } from './useEscala'
import { useNavegacionFrames } from './useNavegacionFrames'
import { caminosTrayectoria, dibujarCapa } from './capa'
import type { ErrorDeToque } from './ErrorToque'

export const valida = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)

interface Opciones {
  readonly video: VideoAbierto
  readonly orientacion: OrientacionVista
  /** El modelo de marcadores tal como lo ve esta vista: sus marcadores y su articulación (`modeloDeVista`). */
  readonly modelo: ModeloMarcadores
  /** Al recuperar una sesión: las trayectorias de esta vista tal como se guardaron. */
  readonly inicial?: Map<IdMarcador, (Muestra2D | undefined)[]>
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  readonly filtro?: AjustesFiltro | null
  /** Al recuperar: el tramo estático del cero de referencia, por articulación. */
  readonly cerosGuardados?: Readonly<Record<string, TramoEstatico>>
  /** Al recuperar: la escala de la vista (null = sin escala). */
  readonly calibracionGuardada?: CalibracionVista | null
  readonly avisoInicial?: string
  /** Es la vista que se marca y se navega (con varias vistas, solo una); las demás siguen el cursor común. */
  readonly activa?: boolean
  /** Se llama en cada cambio de frame de esta vista (el cursor común mueve con ello las demás). Debe ser estable. */
  readonly alCambiarFrame?: (frame: number) => void
}

/**
 * Todo lo de una vista (fase 3, paso 2b): sus trayectorias, la navegación por sus frames, el marcado, el seguimiento,
 * la escala, el análisis, el dibujo sobre su lienzo, los valores del frame y su CSV. El visor (la sesión) se queda con
 * lo común: el modelo, las pestañas, el reparto de la pantalla y el guardado. Con dos vistas, el visor llamará a este
 * hook para cada una y pintará la activa.
 */
export function useVista({ video, orientacion, modelo, inicial, filtro, cerosGuardados, calibracionGuardada, avisoInicial, activa = true, alCambiarFrame }: Opciones) {
  const ids = useMemo(() => modelo.marcadores.map((m) => m.id), [modelo])
  const articulacion = modelo.articulaciones[0]!
  const { info, tabla } = video
  const total = tabla.tiempos.length
  // Trayectorias: una posición (o nada) por frame y marcador, con sus mutadores (suben `version` por dentro), el estado
  // de cada frame y los huecos cortos.
  const {
    series,
    version,
    muestra,
    poner,
    quitar,
    aplicarLote,
    borrarDespuesDe,
    devolver,
    quitarManualesDespuesDe,
    huecosCortos,
    hayInterpolados,
    rellenarCortos,
    quitarInterpolados: deshacerInterpolados,
    estadosFrames,
  } = useTrayectorias({ ids, tabla, inicial, valida })

  const [aviso, setAviso] = useState<Aviso | null>(avisoInicial ? { texto: avisoInicial } : null)
  // Error al tocar: se muestra encima del vídeo, que es donde se mira al marcar.
  // `aOjo`: dónde se tocó, para ofrecer colocarlo ahí aunque no se reconozca el gomet.
  const [errorToque, setErrorToque] = useState<ErrorDeToque | null>(null)
  const huella = useMemo(() => huellaDe(video), [video])
  // Navegación por frames: lienzo, frame pedido / mostrado / deseado, pintado «el último gana», teclado.
  // El error de un toque es de su frame: «Colocarlo aquí a ojo» marcaría el anterior.
  const alIr = useCallback(
    (destino: number) => {
      setErrorToque((e) => (e?.aOjo?.i === destino ? e : null))
      alCambiarFrame?.(destino)
    },
    [alCambiarFrame],
  )
  const { lienzo, deseado, mostrado, error, msDecodificar, lectura, ultimoFrame, sentido, ir, mover } = useNavegacionFrames(video, alIr, activa)

  // Marcado a mano: marcador elegido, «Colocar a ojo», colocar (en el gomet o a ojo), la lupa y quitar.
  const { seleccionado, setSeleccionado, colocarAOjo, setColocarAOjo, ponerManual, previsualizar, colocar, quitarManual } = useMarcado({
    ids,
    tabla,
    info,
    inicial,
    valida,
    series,
    muestra,
    poner,
    quitar,
    mostrado,
    ultimoFrame,
    setErrorToque,
    setAviso,
  })
  // Seguimiento con el worker: lotes, final con sus avisos, devolver lo quitado si no arranca, seguir y parar.
  const { siguiendo, progresoSeguimiento, listoParaSeguir, seguirDesdeAqui, pararSeguimiento } = useSeguimiento({
    video,
    modelo,
    ids,
    series,
    muestra,
    valida,
    aplicarLote,
    borrarDespuesDe,
    devolver,
    mostrado,
    setAviso,
    setSeleccionado,
    setErrorToque,
  })

  // Escala: la guardada, el borrador mientras se calibra, los toques en los extremos y la medida entre marcadores.
  const {
    calibracion,
    revCalibracion,
    borrador,
    setBorrador,
    calibrando,
    tocandoEscala,
    frameCalibracion,
    tocarExtremo,
    medicion,
    desfase,
    framesTramo,
    empezarEscala: empezarEscalaCon,
    guardarEscala,
    quitarEscala,
  } = useEscala({ tabla, articulacion, series, version, calibracionInicial: calibracionGuardada, mostrado, ir })
  // Segmentos de la articulación: se pueden usar para calibrar y se vigila su longitud.
  const segmentos = useMemo(() => {
    const nombre = (id: IdMarcador) => nombreCorto(modelo.marcadores.find((m) => m.id === id)?.nombre ?? id)
    return [articulacion.proximal, articulacion.distal].map((s) => ({ desde: s.desde, hasta: s.hasta, nombre: `${nombre(s.desde)} – ${nombre(s.hasta)}` }))
  }, [modelo, articulacion])
  // Análisis: ajuste del filtro, cero de referencia, serie del ángulo, lo filtrado, series por frame y segmentos.
  const {
    ajustes,
    cambiarAjustes,
    revAjustes,
    ceros,
    cambiarTramo,
    revCeros,
    resumen,
    filtrado,
    crudoPorFrame,
    filtradoPorFrame,
    tramoEstatico,
    cero,
    constancia,
    seriesSegmentos,
    instantesInterpolados,
  } = useAnalisis({
    series,
    version,
    ids,
    tabla,
    articulacion,
    orientacion,
    segmentos,
    calibracion,
    siguiendo,
    filtroInicial: filtro,
    cerosIniciales: cerosGuardados,
  })
  // ---- Escala ----
  const empezarEscala = () => {
    setErrorToque(null)
    empezarEscalaCon(ceros[articulacion.id])
  }

  // ---- Huecos cortos: rellenar a petición ----
  const rellenarHuecosCortos = () => {
    const frames = rellenarCortos()
    setAviso({
      texto: `Rellenados ${huecosCortos.length} hueco${huecosCortos.length === 1 ? '' : 's'} (${frames} posiciones interpoladas, en azul en la franja y a trazos en la gráfica).`,
    })
  }

  const quitarInterpolados = () => {
    // Vuelven a ser huecos, con lo que había antes de rellenar (perdido, dudoso o nada).
    deshacerInterpolados()
    setAviso({ texto: 'Quitado lo interpolado: esos frames vuelven a ser huecos.' })
  }

  // ---- Ángulo actual ----
  // Trayectoria completa de cada marcador, con lo filtrado: se prepara aquí al
  // encenderla y cuando cambian las trayectorias o el corte; en cada frame solo se pinta.
  const [trayectoriaCompleta, setTrayectoriaCompleta] = useState(false)
  const [conTrayectoria, setConTrayectoria] = useState<ReadonlySet<IdMarcador>>(() => new Set(ids))
  const elegirTrayectoria = (id: IdMarcador) =>
    setConTrayectoria((c) => {
      const n = new Set(c)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const caminos = useMemo(() => caminosTrayectoria(filtrado.porMarcador, trayectoriaCompleta), [filtrado.porMarcador, trayectoriaCompleta])

  // ---- Capa de dibujo ----
  const dibujar = useCallback(
    (ctx: CanvasRenderingContext2D, escala: number) => {
      void version
      dibujarCapa(ctx, escala, { mostrado, sentido, total, ids, muestra, valida, articulacion, trayectoriaCompleta, conTrayectoria, caminos, borrador, medicion, calibracion, frameCalibracion })
    },
    [version, mostrado, sentido, total, ids, muestra, articulacion, borrador, medicion, calibracion, frameCalibracion, trayectoriaCompleta, conTrayectoria, caminos],
  )

  // El valor del frame sale de las mismas series que la gráfica y el CSV (una sola
  // fuente: antes se recalculaba aparte y podía quedar 360° desplazado de la curva).
  const angulo = mostrado === null ? NaN : (crudoPorFrame.valores[mostrado] ?? NaN)
  const anguloFiltrado = mostrado === null ? NaN : (filtradoPorFrame.valores[mostrado] ?? NaN)
  // Redondeado a la décima que se muestra (+ 0 evita «−0,0»), para que la etiqueta
  // (flexión / hiperextensión) concuerde con el número visible.
  const anguloRedondeado = Math.round(angulo * 10) / 10 + 0
  const est = useMemo(() => estadisticas(tabla), [tabla])
  const generarCsv = useCallback(
    (formato: FormatoCsv) => {
      const datos = datosCsv({
        tiempos: tabla.tiempos,
        marcadores: modelo.marcadores,
        crudo: series,
        filtrado,
        articulacion,
        orientacion,
        anguloCrudo: crudoPorFrame.valores,
        anguloFiltrado: filtradoPorFrame.valores,
        cero,
        calibracion,
        info,
        est,
        corteHz: ajustes.corteHz,
        exportado: new Date().toISOString(),
      })
      const texto = construirCsv(datos, formato)
      return { nombre: nombreArchivoCsv(info.nombre, datos.angulo ? articulacion.id : null), texto }
    },
    [orientacion, articulacion, filtrado, tabla, modelo, crudoPorFrame, filtradoPorFrame, cero, calibracion, info, est, ajustes, series],
  )
  const buscarEnTiempo = useCallback(
    (t: number) => {
      const i = indiceMasCercano(tabla, t)
      if (i >= 0) ir(i)
    },
    [tabla, ir],
  )
  const t = mostrado === null ? null : tabla.tiempos[mostrado]!
  // Marcadores con una marca a mano en el frame actual: se pueden quitar sin tener que elegirlos antes.
  const marcasManualesAqui = mostrado === null ? [] : modelo.marcadores.map((mk, k) => ({ mk, k })).filter(({ mk }) => muestra(mk.id, mostrado)?.editadoManual)
  // Estado de cada marcador en el frame mostrado, para el selector.
  const estadosMarcadores = modelo.marcadores.map((mk) => {
    const m = mostrado === null ? undefined : muestra(mk.id, mostrado)
    return valida(m) ? (m.editadoManual ? 'a mano' : m.interpolado ? 'interpolado' : 'seguido') : m ? 'perdido' : '—'
  })

  // Marcas a mano más adelante: «Seguir desde aquí» las toma como anclas y sigue desde ellas (ver `AvisoAnclas`).
  const framesAnclas = useMemo(() => {
    void version
    return mostrado === null ? [] : framesConMarcaManual(series, mostrado)
  }, [version, mostrado, series])
  const quitarMarcasPosteriores = () => {
    if (mostrado === null) return
    const n = quitarManualesDespuesDe(mostrado)
    setAviso({
      texto: `Quitadas ${n} marca${n === 1 ? '' : 's'} a mano posteriores al frame ${mostrado + 1}. Los frames quedan sin posición: pulsa «Seguir desde aquí» para volver a seguirlos.`,
    })
  }

  return {
    /** El modelo de esta vista (sus marcadores y su articulación). */
    modelo,
    articulacion,
    info,
    tabla,
    total,
    series,
    version,
    quitar,
    huecosCortos,
    hayInterpolados,
    estadosFrames,
    aviso,
    errorToque,
    setErrorToque,
    huella,
    lienzo,
    ultimoFrame,
    deseado,
    mostrado,
    error,
    msDecodificar,
    lectura,
    sentido,
    ir,
    mover,
    seleccionado,
    setSeleccionado,
    colocarAOjo,
    setColocarAOjo,
    ponerManual,
    previsualizar,
    colocar,
    quitarManual,
    siguiendo,
    progresoSeguimiento,
    listoParaSeguir,
    seguirDesdeAqui,
    pararSeguimiento,
    calibracion,
    revCalibracion,
    borrador,
    setBorrador,
    calibrando,
    tocandoEscala,
    frameCalibracion,
    tocarExtremo,
    medicion,
    desfase,
    framesTramo,
    guardarEscala,
    quitarEscala,
    segmentos,
    ajustes,
    cambiarAjustes,
    revAjustes,
    ceros,
    cambiarTramo,
    revCeros,
    resumen,
    filtrado,
    crudoPorFrame,
    filtradoPorFrame,
    tramoEstatico,
    cero,
    constancia,
    seriesSegmentos,
    instantesInterpolados,
    empezarEscala,
    rellenarHuecosCortos,
    quitarInterpolados,
    trayectoriaCompleta,
    setTrayectoriaCompleta,
    conTrayectoria,
    elegirTrayectoria,
    dibujar,
    angulo,
    anguloFiltrado,
    anguloRedondeado,
    est,
    generarCsv,
    buscarEnTiempo,
    t,
    marcasManualesAqui,
    estadosMarcadores,
    framesAnclas,
    quitarMarcasPosteriores,
  }
}
