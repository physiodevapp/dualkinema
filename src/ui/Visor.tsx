import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { CALIDAD_MINIMA } from '../core/articulaciones/calculo'
import { construirCsv, nombreArchivoCsv, type FormatoCsv } from '../core/exportacion/csv'
import { datosCsv } from '../core/exportacion/datos'
import { tramoInicial, type TramoEstatico } from '../core/articulaciones/cero'
import { modeloRodilla3 } from '../core/articulaciones/catalogo'
import type { CalibracionVista } from '../core/calibracion/escala'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../core/modelo/tipos'
import { framesConMarcaManual } from '../core/seguimiento/manuales'
import type { AjustesFiltro } from '../core/filtros/tramos'
import { estadisticas, indiceMasCercano } from '../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../media/video'
import { COLORES_MARCADOR, ladoVisible, nombreCorto } from './marcadores'
import { huellaDe } from './sesion'
import PanelGrafica from './visor/PanelGrafica'
import MiniGrafica from './visor/MiniGrafica'
import LienzoVideo from './visor/LienzoVideo'
import { DESVIACION_AVISO } from './visor/PanelCinematica'
import PanelEscala from './visor/PanelEscala'
import Pestanas, { PanelPestana } from './visor/Pestanas'
import { useAltura } from './visor/useAltura'
import { useVistaMovil } from './visor/useVistaMovil'
import { useTrayectorias } from './visor/useTrayectorias'
import { useMarcado } from './visor/useMarcado'
import { useSeguimiento, type Aviso } from './visor/useSeguimiento'
import { useAnalisis } from './visor/useAnalisis'
import { useEscala } from './visor/useEscala'
import { useNavegacionFrames } from './visor/useNavegacionFrames'
import { useMiniGrande } from './visor/useMiniGrande'
import { EXTRA_MAXIMO_PX } from './visor/miniGrande'
import SeparadorVideo from './visor/SeparadorVideo'
import AsaVolver from './visor/AsaVolver'
import { ALTO_VIDEO_DVH, AMPLIAR_PX } from './visor/reparto'
import { useOcultarAlBajar } from './visor/useOcultarAlBajar'
import { useGuardado, type SesionAbierta } from './visor/useGuardado'
import { caminosTrayectoria, dibujarCapa } from './visor/capa'
import SelectorMarcadores from './visor/SelectorMarcadores'
import BotonSeguir from './visor/BotonSeguir'
import InterruptorAOjo from './visor/InterruptorAOjo'
import BotonesQuitarManual from './visor/BotonesQuitarManual'
import AvisoAnclas from './visor/AvisoAnclas'
import AccionesHuecos from './visor/AccionesHuecos'
import BotonIrAlHueco from './visor/BotonIrAlHueco'
import TextoGuardado from './visor/TextoGuardado'
import ErrorToque, { type ErrorDeToque } from './visor/ErrorToque'
import DeslizadorFrames from './visor/DeslizadorFrames'
import ResumenGrafica from './visor/ResumenGrafica'
import DatosVideo from './visor/DatosVideo'
import PanelMarcar from './visor/PanelMarcar'
import PanelAnalisis from './visor/PanelAnalisis'
import BarraPosicion, { ANCHO_COLUMNA_APAISADA } from './visor/BarraPosicion'

const valida = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)


interface Props {
  video: VideoAbierto
  orientacion: OrientacionVista
  sesion: SesionAbierta
  /** Al recuperar una sesión: su modelo y sus trayectorias, tal como se guardaron. */
  modelo?: ModeloMarcadores
  inicial?: Map<IdMarcador, (Muestra2D | undefined)[]>
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  filtro?: AjustesFiltro | null
  /** Al recuperar: el tramo estático del cero de referencia, por articulación. */
  ceros?: Readonly<Record<string, TramoEstatico>>
  /** Al recuperar: la escala de la vista (null = sin escala). */
  calibracion?: CalibracionVista | null
  avisoInicial?: string
}

export default function Visor({ video, orientacion, sesion, modelo: modeloGuardado, inicial, filtro, ceros: cerosGuardados, calibracion: calibracionGuardada, avisoInicial }: Props) {
  const { info, tabla } = video
  const total = tabla.tiempos.length

  // Modelo de la fase 1: rodilla con 3 gomets en la pierna que ve la cámara.
  // Una sesión recuperada usa el que se guardó con ella.
  const lado = orientacion.plano === 'sagital' ? ladoVisible(orientacion) : 'izq'
  const modelo = useMemo(() => modeloGuardado ?? modeloRodilla3(lado), [modeloGuardado, lado])
  const ids = useMemo(() => modelo.marcadores.map((m) => m.id), [modelo])
  const articulacion = modelo.articulaciones[0]!

  // Trayectorias: una posición (o nada) por frame y marcador, con sus mutadores (suben `version` por dentro), el estado
  // de cada frame y los huecos cortos.
  const {
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
  const alIr = useCallback((destino: number) => setErrorToque((e) => (e?.aOjo?.i === destino ? e : null)), [])
  const { lienzo, deseado, mostrado, error, msDecodificar, lectura, ultimoFrame, sentido, ir, mover } = useNavegacionFrames(video, alIr)

  // Marcado a mano: marcador elegido, «Colocar a ojo», colocar (en el gomet o a ojo), la lupa y quitar.
  const { seleccionado, setSeleccionado, colocarAOjo, setColocarAOjo, ponerManual, previsualizar, colocar, quitarManual } = useMarcado({
    ids,
    tabla,
    info,
    inicial,
    valida,
    trayectorias,
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
    trayectorias,
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
  } = useEscala({ tabla, articulacion, trayectorias, version, calibracionInicial: calibracionGuardada, mostrado, ir })
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
    trayectorias,
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
  const guardado = useGuardado({
    sesion,
    huella,
    orientacion,
    modelo,
    trayectorias,
    filtro: ajustes,
    ceros,
    calibracion,
    // Los contadores solo crecen: su suma cambia con cualquiera de ellos.
    version: version + revAjustes + revCeros + revCalibracion,
    recuperada: !!inicial,
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
        crudo: series(),
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

  // Pestañas de herramientas. Un punto en el nombre avisa de lo que pide atención aunque no se vea.
  const [pestana, setPestana] = useState('marcar')
  const pestanasVisor = [
    { id: 'marcar', nombre: 'Marcar', aviso: (resumen.huecos > 0 || huecosCortos.length > 0) && 'Hay huecos sin valor' },
    { id: 'analisis', nombre: 'Análisis', aviso: !!cero && cero.desviacion > DESVIACION_AVISO && 'El cero de referencia no parece quieto' },
    {
      id: 'escala',
      nombre: 'Escala',
      aviso: !!desfase && 'La escala ya no corresponde a lo seguido: se puede rehacer',
    },
    { id: 'video', nombre: 'Vídeo', aviso: guardado.estado === 'error' && 'No se ha podido guardar' },
  ]
  // Piezas fijas del móvil: la barra de abajo (la página deja su sitio debajo) y el vídeo con su
  // gráfica de arriba (las pestañas se pegan justo debajo al desplazarse).
  const [barraRef, altoBarra] = useAltura<HTMLDivElement>()
  const [fijoRef, altoFijo] = useAltura<HTMLDivElement>()
  const { anchoLg, apaisado, vista, setVista, enVideo, enGraficas, ampliada, activo, reparto, altoArrastre, setAltoArrastre, modoMini, setModoMini, elegirReparto, volverDe } =
    useVistaMovil({ altoBarra })
  // Al bajar por las tarjetas, el vídeo y su gráfica se esconden (y vuelven al subir, al cambiar de frame o de pestaña,
  // y mientras se calibra tocando el vídeo); las pestañas suben a ocupar su sitio.
  const tiraRef = useRef<HTMLDivElement>(null)
  const tarjetasRef = useRef<HTMLDivElement>(null)
  const [, altoTira] = useAltura<HTMLDivElement>(tiraRef)
  const { oculto: videoOculto, ver: verVideo } = useOcultarAlBajar({
    activo,
    tarjetas: tarjetasRef,
    tira: tiraRef,
    altoTira,
    forzarVisible: tocandoEscala,
    reinicio: `${deseado}|${pestana}`,
  })
  // Arriba del todo la gráfica pequeña crece hasta llenar lo que queda sobre la barra fija: en la primera pantalla solo
  // vídeo, gráfica, pestañas y barra. Al bajar vuelve a su alto de siempre.
  const cajaMiniRef = useRef<HTMLDivElement>(null)
  const mini = useMiniGrande({
    activo,
    caja: cajaMiniRef,
    tira: tiraRef,
    barra: barraRef,
    fijo: fijoRef,
    // Lo que se quita al vídeo lo puede ganar la gráfica, aunque pase de su tope de siempre.
    extraMaximo:
      reparto === 'grafica' || altoArrastre !== null
        ? EXTRA_MAXIMO_PX + Math.ceil(((ALTO_VIDEO_DVH.normal - ALTO_VIDEO_DVH.grafica) / 100) * window.innerHeight) + AMPLIAR_PX
        : EXTRA_MAXIMO_PX,
  })
  // Debajo del vídeo (en la vista de vídeo grande, dentro de ella: lo de fuera queda tapado).
  // En el vídeo grande, el aviso va justo debajo del vídeo (sin `order`: con `order-2` quedaba el último, tras los marcadores,
  // el botón de seguir y el deslizador, fuera de pantalla), corto, con el detalle plegado y sus botones a la vista.
  const nodoError = errorToque && (
    <ErrorToque error={errorToque} enVideo={enVideo} onColocarAOjo={ponerManual} onCerrar={() => setErrorToque(null)} />
  )

  // Deslizador de frames con la franja de estado. Una sola barra: la franja de cada frame es la pista del deslizador y el
  // tirador va encima (la franja se mete la mitad del tirador por cada lado, para que su centro coincida con el frame).
  // En el móvil va en la fila de posición de la barra de abajo (a mano desde cualquier pestaña y vista); desde `lg`, en el
  // flujo de la página, bajo el vídeo. Es el mismo control dibujado en los dos sitios y solo se ve uno.
  const controlDeslizador = (
    <DeslizadorFrames estados={estadosFrames} total={total} deseado={deseado} t={tabla.tiempos[deseado]!} onIr={ir} />
  )
  const nodoDeslizador = <div className="flex flex-col gap-1 max-lg:hidden lg:order-1">{controlDeslizador}</div>

  // Marcadores con una marca a mano en el frame actual: se pueden quitar sin tener que elegirlos antes.
  const marcasManualesAqui = mostrado === null ? [] : modelo.marcadores.map((mk, k) => ({ mk, k })).filter(({ mk }) => muestra(mk.id, mostrado)?.editadoManual)
  // Estado de cada marcador en el frame mostrado, para el selector.
  const estadosMarcadores = modelo.marcadores.map((mk) => {
    const m = mostrado === null ? undefined : muestra(mk.id, mostrado)
    return valida(m) ? (m.editadoManual ? 'a mano' : m.interpolado ? 'interpolado' : 'seguido') : m ? 'perdido' : '—'
  })

  // Vista de vídeo grande: botones que solo salen cuando hacen falta (quitar una marca a mano, rellenar huecos cortos, ir a un hueco).
  const extrasCompactos =
    !siguiendo && (marcasManualesAqui.length > 0 || huecosCortos.length > 0 || hayInterpolados || aviso?.irA !== undefined) ? (
      <div className="flex flex-wrap gap-2" data-testid="extras-compactos">
        <BotonesQuitarManual marcas={marcasManualesAqui} siguiendo={siguiendo} frame={mostrado} onQuitar={quitarManual} claseExtra="" />
        <AccionesHuecos huecosCortos={huecosCortos.length} hayInterpolados={hayInterpolados} onRellenar={rellenarHuecosCortos} onQuitarInterpolados={quitarInterpolados} compacto />
        {aviso?.irA !== undefined && <BotonIrAlHueco frame={aviso.irA} onIr={ir} compacto />}
      </div>
    ) : null

  // Marcas a mano más adelante: «Seguir desde aquí» las toma como anclas y sigue desde ellas (ver `AvisoAnclas`).
  const framesAnclas = useMemo(() => {
    void version
    return mostrado === null ? [] : framesConMarcaManual(trayectorias.current, mostrado)
  }, [version, mostrado, trayectorias])
  const quitarMarcasPosteriores = () => {
    if (mostrado === null) return
    const n = quitarManualesDespuesDe(mostrado)
    setAviso({
      texto: `Quitadas ${n} marca${n === 1 ? '' : 's'} a mano posteriores al frame ${mostrado + 1}. Los frames quedan sin posición: pulsa «Seguir desde aquí» para volver a seguirlos.`,
    })
  }

  // Vista de vídeo grande: lo mínimo para marcar y seguir sin salir de ella.
  // Móvil girado con el vídeo grande: dos columnas (el vídeo con todo el alto; a su lado, aviso, marcado y barra fija).
  const dosColumnas = enVideo && apaisado

  const tiraMarcado = (
    <div className="flex flex-col gap-2" data-testid="marcado-compacto">
      <SelectorMarcadores marcadores={modelo.marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={siguiendo} onElegir={setSeleccionado} compacto />
      <InterruptorAOjo activo={colocarAOjo} deshabilitado={siguiendo} onCambiar={() => setColocarAOjo((v) => !v)} />
      <AvisoAnclas frames={framesAnclas} siguiendo={siguiendo} onQuitar={quitarMarcasPosteriores} compacto />
      <BotonSeguir siguiendo={siguiendo} progreso={progresoSeguimiento} listo={listoParaSeguir} onSeguir={seguirDesdeAqui} onParar={pararSeguimiento} compacto />
      {extrasCompactos}
      {aviso && <p className="line-clamp-2 text-xs text-texto-2">{aviso.texto}</p>}
    </div>
  )

  return (
    <div
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch"
      style={{ '--alto-fijo': videoOculto ? '0px' : `${altoFijo}px` } as React.CSSProperties}
    >
      {/* En el móvil el orden es vídeo, pestañas y gráfica (order-*): las herramientas quedan a un
          toque y a una pantalla del vídeo, no detrás de la gráfica. En pantalla ancha, dos columnas. */}
      {/* Pantalla ancha: vídeo y controles a la izquierda y la gráfica a su lado, para que quepa en la altura de la ventana
          (apilados no caben con un vídeo de tamaño razonable). La gráfica ocupa el alto de la columna de al lado. */}
      <div className="contents lg:min-h-[34rem] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-3">
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-3">
          {/* Móvil: el vídeo (con altura limitada) y la gráfica del ángulo quedan pegados arriba mientras
              se desplazan las pestañas y los paneles. El elemento pegado tiene que colgar de la página
              (por eso la columna de la izquierda es `contents`): un `sticky` solo dura lo que su padre. */}
          <div
            ref={fijoRef}
            data-testid="visor-fijo"
            data-oculto={videoOculto}
            data-grande={mini.grande}
            inert={videoOculto}
            className={`flex ${dosColumnas ? 'flex-row' : 'flex-col'} gap-2 max-lg:z-30 max-lg:bg-fondo max-lg:transition-[opacity,visibility] max-lg:duration-200 motion-reduce:transition-none ${
              dosColumnas
                ? 'aparece max-lg:fixed max-lg:inset-0 max-lg:gap-0 max-lg:overflow-hidden max-lg:py-3 max-lg:pl-3'
                : enVideo
                ? 'aparece max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-(--alto-barra) max-lg:overflow-y-auto max-lg:p-4'
                : videoOculto
                  ? // Oculto: fuera del flujo (las tarjetas ganan su sitio), pero con su tamaño, para no desmontar ni medir 0.
                    // Se desvanece (la visibilidad cambia al acabar el fundido) mientras las pestañas suben.
                    'max-lg:invisible max-lg:opacity-0 max-lg:pointer-events-none max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:px-4 max-lg:pb-2'
                  : 'max-lg:sticky max-lg:top-0 max-lg:order-1 max-lg:-mx-4 max-lg:border-b max-lg:border-borde max-lg:px-4 max-lg:pb-2'
            } ${enGraficas ? 'max-lg:hidden' : ''}`}
          >
          <div className={dosColumnas ? 'relative min-w-0 flex-1' : 'relative'}>
            <LienzoVideo
              llenar={enVideo}
              apaisado={dosColumnas}
              topeLg="lg:max-h-[max(14rem,calc(100dvh-25rem))]"
              topeMovil={!anchoLg && vista === 'mixta' ? (altoArrastre !== null ? `${altoArrastre}px` : `${ALTO_VIDEO_DVH[reparto]}dvh`) : undefined}
              ancho={info.ancho}
              alto={info.alto}
              lienzo={lienzo}
              dibujar={dibujar}
              interactivo={(tocandoEscala || (!calibrando && !!seleccionado)) && !siguiendo && mostrado === deseado}
              onToque={tocandoEscala ? tocarExtremo : colocar}
              // Al calibrar no se busca ningún gomet: el extremo queda justo donde se suelta.
              previsualizar={!calibrando && seleccionado && !colocarAOjo ? previsualizar : undefined}
            />
            {mostrado === null && !error && (
              <p className="absolute inset-0 grid place-items-center text-texto-2">Decodificando…</p>
            )}
            {tocandoEscala && !siguiendo && (
              <p className="pointer-events-none absolute top-2 left-2 rounded-md bg-fondo/85 px-2 py-1 text-sm" data-testid="toca-escala">
                Escala:{' '}
                {!borrador!.a
                  ? 'toca un extremo'
                  : !borrador!.b
                    ? borrador!.otroFrame
                      ? 'otro frame, empieza de nuevo: toca el otro extremo'
                      : 'toca el otro extremo'
                    : 'toca cerca de un extremo para moverlo'}
              </p>
            )}
            {!calibrando && seleccionado && !siguiendo && (
              <p className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-fondo/85 px-2 py-1 text-sm">
                <span
                  className="size-3 rounded-full"
                  style={{ background: COLORES_MARCADOR[ids.indexOf(seleccionado) % COLORES_MARCADOR.length] }}
                />
                Toca: {nombreCorto(modelo.marcadores.find((x) => x.id === seleccionado)!.nombre)}
                {colocarAOjo && <span className="text-texto-2">· a ojo</span>}
              </p>
            )}
            {!anchoLg && (
              <button
                type="button"
                onClick={() => (enVideo ? volverDe('video') : setVista('video'))}
                aria-label={enVideo ? 'Volver a la vista con gráfica' : 'Ampliar el vídeo para marcar'}
                title={enVideo ? 'Volver a la vista con gráfica' : 'Ampliar el vídeo para marcar'}
                data-testid={enVideo ? 'reducir-video' : 'ampliar-video'}
                className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-md border border-borde bg-fondo/85 text-texto"
              >
                {enVideo ? <ArrowsPointingInIcon className="size-5" /> : <ArrowsPointingOutIcon className="size-5" />}
              </button>
            )}
            {!anchoLg && vista !== 'graficas' && (
              <button
                type="button"
                onClick={() => setTrayectoriaCompleta((t) => !t)}
                aria-pressed={trayectoriaCompleta}
                aria-label="Mostrar la trayectoria completa"
                title="Mostrar la trayectoria completa"
                data-testid="trayectoria-compacta"
                className={`absolute top-14 right-2 z-10 flex size-9 items-center justify-center rounded-md border bg-fondo/85 ${trayectoriaCompleta ? 'border-acento text-acento' : 'border-borde text-texto'}`}
              >
                <ArrowTrendingUpIcon className="size-5" />
              </button>
            )}
          </div>
          {!anchoLg && vista === 'mixta' && (
            <SeparadorVideo
              reparto={reparto}
              onReparto={elegirReparto}
              onArrastre={setAltoArrastre}
              lienzo={lienzo}
              proporcion={info.alto / info.ancho}
              onAmpliar={setVista}
            />
          )}
          {!anchoLg && vista === 'mixta' && (
            <MiniGrafica
              tiempos={tabla.tiempos}
              indice={deseado < total ? deseado : null}
              onBuscar={buscarEnTiempo}
              crudo={crudoPorFrame}
              filtrado={filtradoPorFrame}
              velocidad={filtrado.derivadas.velocidad}
              modo={modoMini}
              onModo={setModoMini}
              onAmpliar={() => setVista('graficas')}
              alto={mini.alto}
              // Mientras se arrastra el asa, la gráfica sigue al vídeo sin retraso (la tira de pestañas no se mueve).
              animable={mini.animable && altoArrastre === null}
              cajaRef={cajaMiniRef}
            />
          )}
          {enVideo && !dosColumnas && (
            <>
              <AsaVolver sentido="arriba" destino="volver a la vista con gráfica" onVolver={() => volverDe('video')} testid="asa-volver-video" />
              {nodoError}
              {tiraMarcado}
            </>
          )}
          {dosColumnas && (
            // Sin asa para volver (se tira hacia abajo y aquí no hay sitio): queda el botón del vídeo. La barra fija (más
            // abajo) mide lo mismo y tiene el mismo relleno lateral, para que el contenido de las dos quede alineado; el hueco de abajo
            // es el de la barra.
            <div data-testid="columna-marcado" className={`flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-(--alto-barra) ${ANCHO_COLUMNA_APAISADA}`}>
              {nodoError}
              {tiraMarcado}
            </div>
          )}
          </div>

          {!enVideo && nodoError}

          {nodoDeslizador}

          {/* Móvil: barra fija abajo con los botones, la línea de posición y los valores del frame, para
              no perderlos de vista al hacer scroll. Altura fija (nada de lo que contiene cambia de
              altura). En pantalla ancha no existe como caja (contents): queda en su sitio de siempre. */}
          <BarraPosicion
            contenedorRef={barraRef}
            t={t}
            mostrado={mostrado}
            deseado={deseado}
            total={total}
            msDecodificar={msDecodificar}
            lectura={lectura}
            deslizador={controlDeslizador}
            anguloFiltrado={anguloFiltrado}
            cero={cero}
            velocidad={filtrado.derivadas.velocidad}
            aceleracion={filtrado.derivadas.aceleracion}
            onMover={mover}
            columna={dosColumnas}
          />

          {/* En el móvil el estado del guardado va en la pestaña «Vídeo» (aquí quitaba una línea a la primera pantalla); un punto
              en esa pestaña avisa si falla. */}
          {anchoLg && (
            <div className="lg:order-3">
              <TextoGuardado g={guardado} />
            </div>
          )}
        </div>

        {/* La gráfica completa: en pantalla ancha, debajo del vídeo; en el móvil solo en la vista «Solo gráficas»
            (oculta pero montada en las demás, para no perder qué series se ven) y en la mixta se ve la pequeña. */}
        <div
          data-testid="vista-graficas"
          className={`flex flex-col gap-3 max-lg:order-7 lg:min-h-0 ${
            enGraficas ? 'aparece max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-(--alto-barra) max-lg:z-30 max-lg:overflow-y-auto max-lg:bg-fondo max-lg:p-4' : ''
          } ${enGraficas ? '' : 'max-lg:hidden'}`}
        >
          {enGraficas && <AsaVolver sentido="abajo" destino="volver a la vista con vídeo" onVolver={() => volverDe('graficas')} testid="asa-volver-graficas" />}
          {enGraficas && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs tracking-wider text-texto-2 uppercase">Solo gráficas</span>
              <button
                type="button"
                onClick={() => volverDe('graficas')}
                aria-label="Volver a la vista con vídeo"
                title="Volver a la vista con vídeo"
                data-testid="reducir-graficas"
                className="flex size-9 items-center justify-center rounded-md border border-borde text-texto"
              >
                <ArrowsPointingInIcon className="size-5" />
              </button>
            </div>
          )}

          <PanelGrafica
            ampliada={enGraficas || anchoLg}
            tiempos={tabla.tiempos}
            indice={deseado < total ? deseado : null}
            onBuscar={buscarEnTiempo}
            titulo={articulacion.nombre.replace(/\s*\(.*\)$/, '')}
            positivo={articulacion.positivo}
            crudo={crudoPorFrame}
            filtrado={filtradoPorFrame}
            velocidad={filtrado.derivadas.velocidad}
            corte={filtrado.corte}
            segmentos={seriesSegmentos}
            resumen={<ResumenGrafica resumen={resumen} instantesInterpolados={instantesInterpolados} />}
          />

          {error && <p className="rounded-md border border-red-400/50 p-3 text-red-300">{error}</p>}
        </div>
      </div>

      {/* Columna de herramientas. En pantalla ancha va fija (sticky) con su propio scroll, para que
          el vídeo y la gráfica no se muevan al recorrer los paneles. */}
      {/* En el móvil la columna es `contents`: la tira de pestañas cuelga de la página (como el vídeo) y se
          queda pegada durante todo el desplazamiento, también al pasar a la gráfica de debajo; un `sticky`
          dentro de la columna se iría con ella al acabar sus paneles. */}
      {/* Pantalla ancha: la columna mide lo mismo que la fila del vídeo y la gráfica (estira la rejilla) pero no la alarga: va en una caja
          absoluta. Debajo de las pestañas, UNA tarjeta (esquinas redondeadas siempre) que es la que se desplaza por dentro si el panel
          abierto excede esa altura; los paneles de dentro pierden su caja propia y se separan con una línea. */}
      <div className="max-lg:contents lg:relative">
      <div className="max-lg:contents lg:absolute lg:inset-0 lg:flex lg:flex-col lg:gap-3" data-testid="columna-herramientas">
        <Pestanas
          pestanas={pestanasVisor}
          activa={pestana}
          onElegir={(id) => {
            setPestana(id)
            // Con la gráfica grande (arriba del todo), las tarjetas están bajo la pantalla: se sube hasta ellas.
            mini.irALasTarjetas()
          }}
          contenedorRef={tiraRef}
          className={`max-lg:order-5 ${ampliada ? 'max-lg:hidden' : ''}`}
          accion={
            // Con el vídeo oculto, un botón con su icono lo trae y lo deja fijo; con el vídeo a la vista, su sitio queda libre.
            videoOculto ? (
              <button
                type="button"
                onClick={verVideo}
                data-testid="mostrar-video"
                aria-label="Mostrar el vídeo y mantenerlo a la vista"
                title="Mostrar el vídeo y mantenerlo a la vista"
                className="flex size-10 items-center justify-center rounded-md border border-borde bg-fondo text-texto-2"
              >
                <VideoCameraIcon className="size-5" />
              </button>
            ) : (
              <span aria-hidden className="block size-10" />
            )
          }
        />

        <div
          data-testid="panel-herramientas"
          ref={tarjetasRef}
          className={`flex flex-col gap-3 max-lg:order-6 lg:relative lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-borde lg:bg-panel lg:p-4 lg:[&_section]:rounded-none lg:[&_section]:border-0 lg:[&_section]:bg-transparent lg:[&_section]:p-0 lg:[&_section+section]:mt-4 lg:[&_section+section]:border-t lg:[&_section+section]:border-borde lg:[&_section+section]:pt-4 ${ampliada ? 'max-lg:hidden' : ''}`}
        >

          <PanelPestana id="marcar" activa={pestana === 'marcar'}>
            <PanelMarcar
              lado={lado}
              marcadores={modelo.marcadores}
              estadosMarcadores={estadosMarcadores}
              seleccionado={seleccionado}
              onElegirMarcador={setSeleccionado}
              siguiendo={siguiendo}
              colocarAOjo={colocarAOjo}
              onCambiarAOjo={() => setColocarAOjo((v) => !v)}
              listoParaSeguir={listoParaSeguir}
              marcasManualesAqui={marcasManualesAqui}
              mostrado={mostrado}
              onQuitarManual={quitarManual}
              framesAnclas={framesAnclas}
              onQuitarMarcasPosteriores={quitarMarcasPosteriores}
              progresoSeguimiento={progresoSeguimiento}
              onSeguir={seguirDesdeAqui}
              onParar={pararSeguimiento}
              aviso={aviso}
              onIr={ir}
              huecosCortos={huecosCortos.length}
              hayInterpolados={hayInterpolados}
              onRellenarHuecos={rellenarHuecosCortos}
              onQuitarInterpolados={quitarInterpolados}
              trayectoriaCompleta={trayectoriaCompleta}
              onTrayectoriaCompleta={setTrayectoriaCompleta}
              conTrayectoria={conTrayectoria}
              onElegirTrayectoria={elegirTrayectoria}
              articulacion={articulacion}
              angulo={angulo}
              anguloRedondeado={anguloRedondeado}
            />
          </PanelPestana>

          <PanelPestana id="analisis" activa={pestana === 'analisis'}>
            <PanelAnalisis
              ajustes={ajustes}
              onCambiarAjustes={cambiarAjustes}
              filtrado={filtrado}
              anguloFiltrado={anguloFiltrado}
              mostrado={mostrado}
              marcadores={modelo.marcadores}
              tramoEstatico={tramoEstatico}
              cero={cero}
              t={t}
              tiempos={tabla.tiempos}
              total={total}
              onCambiarTramo={cambiarTramo}
              generarCsv={generarCsv}
              conEscala={!!calibracion}
              mismoPlano={orientacion.plano === articulacion.plano}
              siguiendo={siguiendo}
            />
          </PanelPestana>

          <PanelPestana id="escala" activa={pestana === 'escala'}>
            <PanelEscala
              calibracion={calibracion}
              borrador={borrador}
              medicion={medicion}
              framesTramo={framesTramo}
              desfase={desfase}
              segmentos={segmentos}
              tramos={{ cero: tramoEstatico, primeros: tramoInicial(tabla.tiempos), actual: t }}
              constancia={constancia}
              onIr={ir}
              frameCalibracion={frameCalibracion === null ? null : frameCalibracion + 1}
              onEmpezar={empezarEscala}
              onBorrador={setBorrador}
              onGuardar={guardarEscala}
              onCancelar={() => setBorrador(null)}
              onQuitar={quitarEscala}
              onIrAlFrame={() => frameCalibracion !== null && ir(frameCalibracion)}
              deshabilitado={siguiendo}
            />

          </PanelPestana>

          <PanelPestana id="video" activa={pestana === 'video'}>
            {!anchoLg && <TextoGuardado g={guardado} />}
            <DatosVideo info={info} total={total} est={est} orientacion={orientacion} msDecodificar={msDecodificar} lectura={lectura} />
          </PanelPestana>
        </div>
      </div>
      </div>
    </div>
  )
}
