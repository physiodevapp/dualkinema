import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowTrendingUpIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { tramoInicial } from '../../core/articulaciones/cero'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { ModeloMarcadores } from '../../core/modelo/tipos'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { Sincronia } from '../../core/modelo/tipos'
import type { VideoAbierto } from '../../media/video'
import type { Lado } from '../../core/articulaciones/catalogo'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'
import PanelGrafica from './PanelGrafica'
import MiniGrafica from './MiniGrafica'
import LienzoVideo from './LienzoVideo'
import { DESVIACION_AVISO } from './PanelCinematica'
import PanelEscala from './PanelEscala'
import Pestanas, { PanelPestana } from './Pestanas'
import { useAltura } from './useAltura'
import { useVistaMovil } from './useVistaMovil'
import SeparadorVideo from './SeparadorVideo'
import SelectorModoMovil, { ALTO_SELECTOR_PX } from './SelectorModoMovil'
import { guardarModoMovil, leerModoMovil, type ModoMovil } from './preferencias'
import AsaVolver from './AsaVolver'
import { altosVideo } from './reparto'
import SeparadorHerramientas from './SeparadorHerramientas'
import { useRepartoHerramientas } from './useRepartoHerramientas'
import { useGuardado, type SesionAbierta } from './useGuardado'
import SelectorMarcadores from './SelectorMarcadores'
import BotonSeguir from './BotonSeguir'
import InterruptorAOjo from './InterruptorAOjo'
import BotonesQuitarManual from './BotonesQuitarManual'
import AvisoAnclas from './AvisoAnclas'
import AccionesHuecos from './AccionesHuecos'
import BotonIrAlHueco from './BotonIrAlHueco'
import TextoGuardado from './TextoGuardado'
import ErrorToque from './ErrorToque'
import DeslizadorFrames from './DeslizadorFrames'
import ResumenGrafica from './ResumenGrafica'
import DatosVideo from './DatosVideo'
import PanelMarcar from './PanelMarcar'
import PanelAnalisis from './PanelAnalisis'
import BarraPosicion, { ANCHO_COLUMNA_APAISADA } from './BarraPosicion'
import { textoOrientacion } from '../sesion'
import AnadirVista from './AnadirVista'
import ConmutadorVista from './ConmutadorVista'
import MiniaturaVista from './MiniaturaVista'
import PanelComparacion, { useVistaComparada } from './PanelComparacion'
import SincronizarVistas, { type MarcaEvento } from './SincronizarVistas'
import { rangoSesion } from '../../core/tiempo/comun'
import type { SincronizacionExportada } from '../../core/exportacion/csv'
import { incertidumbreEvento, pasoTipico } from '../../core/sincronia/evento'
import type { VistaViva } from './vistas'
import { dibujarEsqueleto } from './capa'
import type { EsqueletoPorFrame } from './ExperimentoPose'

// Experimento sin marcadores de la fase 5 (paso 1): solo con `?pose`, y solo se descarga entonces.
const ExperimentoPose = new URLSearchParams(location.search).has('pose') ? lazy(() => import('./ExperimentoPose')) : null

/** Letra de cada vista, en el orden de la sesión. */
const LETRAS = ['A', 'B'] as const

interface Props {
  /** Todas las vistas de la sesión (la de referencia primero). */
  vistas: readonly VistaViva[]
  /** Índice de la vista activa: la que se pinta y se marca. */
  activa: number
  sesion: SesionAbierta
  /** El modelo de la sesión (todos los marcadores; cada vista ve los suyos en `modelo` de su `VistaViva`). */
  modelo: ModeloMarcadores
  /** La pierna que se analiza (la que ve la cámara de la vista lateral de referencia). */
  lado: Lado
  /** La sesión viene de lo guardado (no es nueva). */
  recuperada: boolean
  /** La sesión que se abre no está guardada tal como es (se acaba de añadir una vista): se guarda al montar. */
  sinGuardar: boolean
  /** Pestaña de herramientas abierta (la guarda la sesión: no se pierde al abrir otra vista). */
  pestana: string
  onPestana: (id: string) => void
  /** Vistas cuyo vídeo no tiene imagen en el instante del cursor común. */
  fuera: ReadonlySet<string>
  /** Entrega las vistas a la sesión en cada render y le pide poner las demás al día con la activa. */
  registrarVistas: (vistas: readonly VistaViva[]) => void
  sincronizarVistas: () => void
  /** Enlaza o desenlaza el cursor común (desenlazado, cada vista se mueve sola: así se marca el evento de la sincronía). */
  enlazarCursor: (si: boolean) => void
  /** Cambia el desfase y la sincronía de una vista. */
  onSincronia: (id: string, desfase: number, sincronia: Sincronia) => void
  /** Sube con cada cambio de desfase o sincronía (para el guardado). */
  revSinc: number
  /** El filtro de la sesión (uno para todas las vistas), su cambio y su contador de cambios para el guardado. */
  ajustes: AjustesFiltro
  onCambiarAjustes: (a: AjustesFiltro) => void
  revAjustes: number
  onElegirVista: (id: string) => void
  onAnadirVista: (video: VideoAbierto, orientacion: OrientacionVista) => void
}

export default function CuerpoVisor({ vistas, activa, sesion, modelo, lado, recuperada, sinGuardar, pestana, onPestana: setPestana, fuera, registrarVistas, sincronizarVistas, enlazarCursor, onSincronia, revSinc, ajustes, onCambiarAjustes: cambiarAjustes, revAjustes, onElegirVista, onAnadirVista }: Props) {
  const activaViva = vistas[activa]!
  const orientacion = activaViva.orientacion
  // Lo de la vista activa: sus marcadores y su articulación.
  const modeloVista = activaViva.modelo
  const ids = useMemo(() => modeloVista.marcadores.map((m) => m.id), [modeloVista])
  const articulacion = modeloVista.articulaciones[0]!

  // Todo lo de la vista activa (trayectorias, frames, marcado, seguimiento, escala, análisis, dibujo, valores y CSV).
  const {
    info,
    tabla,
    total,
    huecosCortos,
    hayInterpolados,
    estadosFrames,
    aviso: avisoPropio,
    errorToque,
    setErrorToque,
    lienzo,
    deseado,
    mostrado,
    error,
    msDecodificar,
    lectura,
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
    listoParaSeguir: listoPropio,
    seguirDesdeAqui,
    pararSeguimiento,
    calibracion,
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
    cambiarTramo,
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
  } = activaViva

  // Esqueleto del experimento sin marcadores (`?pose`), dibujado encima de lo de siempre.
  const [esqueleto, setEsqueleto] = useState<EsqueletoPorFrame | null>(null)
  const dibujarConEsqueleto = useCallback(
    (ctx: CanvasRenderingContext2D, escala: number) => {
      dibujar(ctx, escala)
      if (esqueleto && mostrado !== null) dibujarEsqueleto(ctx, escala, esqueleto.get(mostrado))
    },
    [dibujar, esqueleto, mostrado],
  )

  // Se guardan todas las vistas, con el filtro de la sesión.
  const guardado = useGuardado({
    sesion,
    modelo,
    filtro: ajustes,
    vistas: vistas.map((w) => ({
      id: w.id,
      huella: w.huella,
      orientacion: w.orientacion,
      series: w.series,
      ceros: w.ceros,
      calibracion: w.calibracion,
      desfase: w.desfaseS,
      sincronia: w.sincronia,
      marcadores: w.marcadores,
    })),
    // Los contadores solo crecen: su suma cambia con cualquiera de ellos.
    version: revSinc + revAjustes + vistas.reduce((suma, w) => suma + w.version + w.revCeros + w.revCalibracion, 0),
    recuperada,
    sinGuardar,
  })
  // Con varias vistas se sigue de una en una (dos decodificadores a la vez duplican la memoria y compiten por el del
  // hardware): mientras otra vista sigue, esta espera.
  const otraSiguiendo = vistas.some((w, i) => i !== activa && w.siguiendo)
  const listoParaSeguir = listoPropio && !otraSiguiendo
  const aviso = avisoPropio ?? (otraSiguiendo ? { texto: 'Se está siguiendo la otra vista: espera a que acabe para seguir esta.' } : null)
  // Sincronizar por un evento visual: mientras se marca, el cursor está desenlazado (cada vista se mueve sola) y el botón de
  // marcar va también sobre el vídeo (en el móvil el panel de la pestaña queda fuera de pantalla al recorrerlo).
  const [marcandoEvento, setMarcandoEvento] = useState(false)
  const [marcaEvento, setMarcaEvento] = useState<MarcaEvento>({})
  const empezarEvento = () => {
    enlazarCursor(false)
    setMarcaEvento({})
    setMarcandoEvento(true)
  }
  const terminarEvento = () => {
    setMarcandoEvento(false)
    setMarcaEvento({})
    enlazarCursor(true)
  }
  const marcarEvento = (clave: keyof MarcaEvento, t: number) => setMarcaEvento((m) => ({ ...m, [clave]: t }))
  const claveActiva: keyof MarcaEvento = activa === 0 ? 'referencia' : 'vista'
  // Con dos vistas, las gráficas van en el tiempo común (tiempo del vídeo + desfase de cada vista) y el CSV lleva el desfase.
  // La vista de referencia tiene desfase 0, así que con una vista (o con A) nada cambia.
  const desfaseActiva = activaViva.desfaseS
  const tiemposGrafica = useMemo(() => (desfaseActiva === 0 ? tabla.tiempos : tabla.tiempos.map((t) => t + desfaseActiva)), [tabla, desfaseActiva])
  const buscarEnComun = useCallback((t: number) => buscarEnTiempo(t - desfaseActiva), [buscarEnTiempo, desfaseActiva])
  const dosVistas = vistas.length === 2
  const vistaA = vistas[0]
  const vistaB = vistas[1]
  const [tablaA, desfaseA, tablaB, desfaseB] = [vistaA?.tabla, vistaA?.desfaseS, vistaB?.tabla, vistaB?.desfaseS]
  // Se memoriza por lo que lo define: calcularlo (fps mediano) en cada cambio de frame sería trabajo de más.
  const rangoComun = useMemo(
    () => (tablaA && tablaB && desfaseA !== undefined && desfaseB !== undefined ? rangoSesion([{ tabla: tablaA, desfase: desfaseA }, { tabla: tablaB, desfase: desfaseB }]) : null),
    [tablaA, desfaseA, tablaB, desfaseB],
  )
  const comparadaA = useVistaComparada(vistaA, LETRAS[0])
  const comparadaB = useVistaComparada(vistaB, LETRAS[1])
  // ± medio frame de cada vista (para el CSV): fps mediano, que se memoriza por las tablas.
  const incertidumbreS = useMemo(() => (tablaA && tablaB ? incertidumbreEvento(pasoTipico(tablaA), pasoTipico(tablaB)) : undefined), [tablaA, tablaB])
  const indiceComun = (w: VistaViva) => (fuera.has(w.id) || w.deseado >= w.total ? null : w.deseado)
  const sincroniaCsv: SincronizacionExportada | undefined = dosVistas
    ? {
        referencia: activa === 0,
        desfaseS: activaViva.desfaseS,
        sincronia: activaViva.sincronia,
        ...(incertidumbreS !== undefined && Number.isFinite(incertidumbreS) ? { incertidumbreEventoS: incertidumbreS } : {}),
      }
    : undefined
  // La sesión conoce las vistas vivas (el cursor común mueve las demás) y, al abrir otra vista, la pone donde toca.
  useEffect(() => {
    registrarVistas(vistas)
  })
  // Al abrir otra vista o cambiar un desfase, las demás vuelven a ponerse según la activa.
  const desfases = vistas.map((w) => w.desfaseS).join('|')
  useEffect(() => sincronizarVistas(), [sincronizarVistas, vistas.length, desfases])
  // Pestañas de herramientas. Un punto en el nombre avisa de lo que pide atención aunque no se vea.
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
  // La barra fija de abajo del móvil: el visor deja su sitio encima.
  const [barraRef, altoBarra] = useAltura<HTMLDivElement>()
  const { anchoLg, apaisado, vista, setVista, enVideo, enGraficas, ampliada, activo, reparto, altoArrastre, setAltoArrastre, modoMini, setModoMini, elegirReparto, volverDe } =
    useVistaMovil({ altoBarra })
  // Móvil, vista mixta: la página no se desplaza. El visor ocupa el alto entre la cabecera y la barra fija y un asa reparte
  // entre el bloque de arriba (vídeo y gráfica pequeña) y las herramientas (pestañas y tarjetas, que se desplazan por
  // dentro); dentro del bloque, el asa de siempre reparte entre el vídeo y la gráfica (ver `repartoHerramientas.ts`).
  const raizRef = useRef<HTMLDivElement>(null)
  const tiraRef = useRef<HTMLDivElement>(null)
  const [, altoTira] = useAltura<HTMLDivElement>(tiraRef)
  // Móvil girado con la vista mixta: no cabe en tres pisos (con la barra a todo el ancho quedaban unos 180 px de alto), así
  // que va en dos columnas, como el vídeo grande girado: vídeo y gráfica a la izquierda con todo el alto, y a la derecha
  // las pestañas y las tarjetas con la barra fija debajo (solo de esa columna), sin el asa de las herramientas.
  const mixtaApaisada = activo && apaisado
  const herramientas = useRepartoHerramientas({
    activo,
    raiz: raizRef,
    altoBarra: mixtaApaisada ? 0 : altoBarra,
    altoTira,
    reservado: mixtaApaisada ? 0 : ALTO_SELECTOR_PX,
  })
  // Móvil en vertical, vista mixta: nunca se ven las tres zonas a la vez (no se veía bien ninguna), sino dos, y un selector
  // siempre a la vista dice cuáles: vídeo y gráfica (`vg`), vídeo y herramientas (`vh`, la de partida) o gráfica y
  // herramientas (`gh`). Lo que no se ve sigue montado. Se guarda en este dispositivo.
  const [modo, setModo] = useState<ModoMovil>(leerModoMovil)
  const elegirModo = (m: ModoMovil) => {
    setModo(m)
    guardarModoMovil(m)
  }
  // Elegir un marcador para colocarlo, calibrar la escala tocando sus extremos o marcar el evento de la sincronía piden el
  // vídeo: si no se veía (gráfica y herramientas), se pasa a vídeo y herramientas, sin guardarlo como el modo elegido.
  // Se mira al cambiar (estado ajustado durante el render, como en `useFiltrado`): volver a la gráfica después es posible.
  const pideVideo = `${seleccionado ?? ''}|${tocandoEscala}|${marcandoEvento}`
  const [pideVideoAntes, setPideVideoAntes] = useState(pideVideo)
  if (pideVideo !== pideVideoAntes) {
    setPideVideoAntes(pideVideo)
    if (((seleccionado && !siguiendo) || tocandoEscala || marcandoEvento) && modo === 'gh') setModo('vh')
  }
  const movilVertical = activo && !mixtaApaisada
  const sinHerramientas = movilVertical && modo === 'vg'
  const soloVideo = movilVertical && modo === 'vh'
  const soloGrafica = movilVertical && modo === 'gh'
  const soloUno = soloVideo || soloGrafica
  const altoBloque = mixtaApaisada ? herramientas.disponible : sinHerramientas ? herramientas.disponible - ALTO_SELECTOR_PX : herramientas.altoBloque
  // Tope de alto del vídeo: su parte del bloque de arriba (o lo que diga el asa mientras se arrastra). El ancho lo limita
  // el propio lienzo (guarda la proporción), así que aquí no hace falta el techo.
  const altoVideoMovil = soloVideo ? altoBloque : (altoArrastre ?? Math.round(altosVideo(altoBloque, Infinity)[reparto]))
  const bloquePlegado = activo && altoBloque <= 0
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

  // Vista de vídeo grande: botones que solo salen cuando hacen falta (quitar una marca a mano, rellenar huecos cortos, ir a un hueco).
  const extrasCompactos =
    !siguiendo && (marcasManualesAqui.length > 0 || huecosCortos.length > 0 || hayInterpolados || aviso?.irA !== undefined) ? (
      <div className="flex flex-wrap gap-2" data-testid="extras-compactos">
        <BotonesQuitarManual marcas={marcasManualesAqui} siguiendo={siguiendo} frame={mostrado} onQuitar={quitarManual} claseExtra="" />
        <AccionesHuecos huecosCortos={huecosCortos.length} hayInterpolados={hayInterpolados} onRellenar={rellenarHuecosCortos} onQuitarInterpolados={quitarInterpolados} compacto />
        {aviso?.irA !== undefined && <BotonIrAlHueco frame={aviso.irA} onIr={ir} compacto />}
      </div>
    ) : null

  // Vista de vídeo grande: lo mínimo para marcar y seguir sin salir de ella.
  // Móvil girado con el vídeo grande: dos columnas (el vídeo con todo el alto; a su lado, aviso, marcado y barra fija).
  const dosColumnas = enVideo && apaisado

  const interruptorAOjo = <InterruptorAOjo activo={colocarAOjo} deshabilitado={siguiendo} onCambiar={() => setColocarAOjo((v) => !v)} enFila={dosColumnas} />
  const avisoAnclas = <AvisoAnclas frames={framesAnclas} siguiendo={siguiendo} onQuitar={quitarMarcasPosteriores} compacto />
  const botonSeguir = <BotonSeguir siguiendo={siguiendo} progreso={progresoSeguimiento} listo={listoParaSeguir} onSeguir={seguirDesdeAqui} onParar={pararSeguimiento} compacto enFila={dosColumnas} />
  const tiraMarcado = (
    <div className="flex flex-col gap-2" data-testid="marcado-compacto">
      <SelectorMarcadores marcadores={modeloVista.marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={siguiendo} onElegir={setSeleccionado} compacto />
      {dosColumnas ? (
        // Móvil girado: «a ojo» y «seguir» en una fila (la columna tiene poco alto y, con el aviso y los botones de huecos, no cabía sin scroll).
        <>
          {avisoAnclas}
          <div className="flex items-stretch gap-2">
            {interruptorAOjo}
            {botonSeguir}
          </div>
        </>
      ) : (
        <>
          {interruptorAOjo}
          {avisoAnclas}
          {botonSeguir}
        </>
      )}
      {extrasCompactos}
      {aviso && <p className={`${dosColumnas ? 'line-clamp-1' : 'line-clamp-2'} text-xs text-texto-2`}>{aviso.texto}</p>}
    </div>
  )

  return (
    <div
      ref={raizRef}
      data-testid="visor"
      className={`flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch ${activo ? 'max-lg:gap-0 max-lg:overflow-hidden' : ''} ${
        mixtaApaisada ? 'max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_clamp(18rem,40vw,24rem)] max-lg:grid-rows-[auto_auto_minmax(0,1fr)] max-lg:gap-x-3' : ''
      }`}
      // Girado, la barra va bajo la columna de la derecha y no debajo de todo: el sitio que la página le guarda abajo sobra.
      style={activo ? { height: herramientas.disponible, ...(mixtaApaisada ? { marginBottom: 'calc(-1 * var(--alto-barra))' } : {}) } : undefined}
    >
      {movilVertical && <SelectorModoMovil modo={modo} onModo={elegirModo} />}
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
            data-testid="visor-fijo"
            data-plegado={bloquePlegado}
            style={activo ? { height: altoBloque } : undefined}
            className={`flex ${dosColumnas ? 'flex-row' : 'flex-col'} gap-2 max-lg:z-30 max-lg:bg-fondo max-lg:transition-[opacity,visibility] max-lg:duration-200 motion-reduce:transition-none ${
              dosColumnas
                ? 'aparece max-lg:fixed max-lg:inset-0 max-lg:gap-0 max-lg:overflow-hidden max-lg:py-2 max-lg:pl-3'
                : enVideo
                ? 'aparece max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-(--alto-barra) max-lg:overflow-y-auto max-lg:p-4'
                : // Mixta: el bloque de arriba, con el alto que da el asa de las herramientas (plegado, no se ve pero sigue montado).
                  `max-lg:order-1 max-lg:shrink-0 max-lg:overflow-hidden ${mixtaApaisada ? 'max-lg:col-start-1 max-lg:row-span-3 max-lg:row-start-1' : ''}`
            } ${enGraficas || bloquePlegado ? 'max-lg:hidden' : ''}`}
          >
          <div className={`${dosColumnas ? 'relative min-w-0 flex-1' : 'relative'} ${soloGrafica ? 'max-lg:hidden' : ''}`}>
            <LienzoVideo
              key={activaViva.id}
              llenar={enVideo}
              apaisado={dosColumnas}
              topeLg="lg:max-h-[max(14rem,calc(100dvh-25rem))]"
              topeMovil={activo ? `${altoVideoMovil}px` : undefined}
              ancho={info.ancho}
              alto={info.alto}
              lienzo={lienzo}
              dibujar={dibujarConEsqueleto}
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
                Toca: {nombreCorto(modeloVista.marcadores.find((x) => x.id === seleccionado)!.nombre)}
                {colocarAOjo && <span className="text-texto-2">· a ojo</span>}
              </p>
            )}
            {vistas.length > 1 && (
              // Abajo a la izquierda, juntos: el conmutador y la miniatura de la otra vista (a la derecha quedan los botones del vídeo).
              <div className="absolute bottom-2 left-2 z-10 flex items-end gap-2">
                <ConmutadorVista
                  vistas={vistas.map((w, i) => ({ id: w.id, letra: LETRAS[i]!, descripcion: textoOrientacion(w.orientacion) }))}
                  activa={activaViva.id}
                  onElegir={onElegirVista}
                />
                {vistas.map(
                  (w, i) =>
                    i !== activa && <MiniaturaVista key={w.id} vista={w} etiqueta={LETRAS[i]!} fuera={fuera.has(w.id)} onElegir={() => onElegirVista(w.id)} />,
                )}
              </div>
            )}
            {marcandoEvento && (
              <button
                type="button"
                data-testid="marcar-evento-video"
                disabled={activaViva.mostrado === null || activaViva.mostrado !== activaViva.deseado}
                onClick={() => marcarEvento(claveActiva, activaViva.tabla.tiempos[activaViva.mostrado!]!)}
                className="absolute right-2 bottom-2 z-10 rounded-md bg-acento px-3 py-2 text-sm font-medium text-fondo shadow-lg disabled:opacity-40"
              >
                Es el evento · {LETRAS[activa]}
                {marcaEvento[claveActiva] !== undefined && ' ✓'}
              </button>
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
          {!anchoLg && vista === 'mixta' && !soloUno && (
            <SeparadorVideo
              reparto={reparto}
              onReparto={elegirReparto}
              onArrastre={setAltoArrastre}
              lienzo={lienzo}
              proporcion={info.alto / info.ancho}
              altoBloque={altoBloque}
              onAmpliar={setVista}
            />
          )}
          {!anchoLg && vista === 'mixta' && (
            <div className={soloVideo ? 'hidden' : 'contents'}>
            <MiniGrafica
              tiempos={tiemposGrafica}
              indice={deseado < total ? deseado : null}
              onBuscar={buscarEnComun}
              crudo={crudoPorFrame}
              filtrado={filtradoPorFrame}
              velocidad={filtrado.derivadas.velocidad}
              modo={modoMini}
              onModo={setModoMini}
              onAmpliar={() => setVista('graficas')}
            />
            </div>
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
            <div data-testid="columna-marcado" className={`flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-[calc(var(--alto-barra)-0.5rem)] ${ANCHO_COLUMNA_APAISADA}`}>
              {nodoError}
              {tiraMarcado}
            </div>
          )}
          </div>

          {!enVideo && nodoError && (
            <div className={`max-lg:order-2 max-lg:shrink-0 max-lg:pb-2 ${mixtaApaisada ? 'max-lg:col-start-2 max-lg:row-start-1' : ''}`}>{nodoError}</div>
          )}

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
            columna={dosColumnas || mixtaApaisada}
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
          // Con dos vistas hay más gráficas de las que caben en la altura de la ventana: la columna se desplaza por dentro.
          className={`flex flex-col gap-3 max-lg:order-7 lg:min-h-0${dosVistas ? ' lg:overflow-y-auto' : ''} ${
            enGraficas ? `aparece max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-(--alto-barra) max-lg:z-30 max-lg:overflow-y-auto max-lg:bg-fondo ${apaisado ? 'max-lg:p-2' : 'max-lg:p-4'}` : ''
          } ${enGraficas ? '' : 'max-lg:hidden'}`}
        >
          {enGraficas && !apaisado && <AsaVolver sentido="abajo" destino="volver a la vista con vídeo" onVolver={() => volverDe('graficas')} testid="asa-volver-graficas" />}
          {enGraficas && !apaisado && (
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
            tiempos={tiemposGrafica}
            indice={deseado < total ? deseado : null}
            onBuscar={buscarEnComun}
            rango={rangoComun ?? undefined}
            comparacion={
              comparadaA && comparadaB && rangoComun ? (
                <PanelComparacion
                  vistas={[comparadaA, comparadaB]}
                  indices={[indiceComun(vistaA!), indiceComun(vistaB!)]}
                  desde={rangoComun.desde}
                  hasta={rangoComun.hasta}
                  instante={deseado < total ? tabla.tiempos[deseado]! + desfaseActiva : null}
                  onBuscar={buscarEnComun}
                />
              ) : undefined
            }
            titulo={articulacion.nombre.replace(/\s*\(.*\)$/, '')}
            positivo={articulacion.positivo}
            crudo={crudoPorFrame}
            filtrado={filtradoPorFrame}
            velocidad={filtrado.derivadas.velocidad}
            corte={filtrado.corte}
            segmentos={seriesSegmentos}
            resumen={<ResumenGrafica resumen={resumen} instantesInterpolados={instantesInterpolados} />}
            lado={enGraficas && apaisado}
            accion={
              // Móvil girado: sin cabecera ni asa (no hay alto), el botón de volver va en la fila del título de la gráfica.
              enGraficas && apaisado ? (
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
              ) : undefined
            }
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
        {movilVertical && !sinHerramientas && (
          <SeparadorHerramientas
            posicion={herramientas.posicion}
            // Solo dos alturas para las herramientas (40 y 65 %): el asa no baja de la primera ni sube de la segunda.
            altos={{ plegadas: herramientas.altos.media, media: herramientas.altos.media, alta: herramientas.altos.alta, todo: herramientas.altos.alta }}
            onPosicion={(p) => herramientas.elegir(p === 'plegadas' ? 'media' : p === 'todo' ? 'alta' : p)}
            onArrastre={herramientas.setArrastre}
          />
        )}
        <Pestanas
          pestanas={pestanasVisor}
          activa={pestana}
          onElegir={setPestana}
          contenedorRef={tiraRef}
          className={`max-lg:order-5 max-lg:shrink-0 ${mixtaApaisada ? 'max-lg:col-start-2 max-lg:row-start-2' : ''} ${ampliada || sinHerramientas ? 'max-lg:hidden' : ''}`}
        />

        <div
          data-testid="panel-herramientas"
          className={`flex flex-col gap-3 max-lg:relative max-lg:order-6 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:pt-2 max-lg:pb-2 ${mixtaApaisada ? 'max-lg:col-start-2 max-lg:row-start-3 max-lg:mb-(--alto-barra)' : ''} lg:relative lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-borde lg:bg-panel lg:p-4 lg:[&_section]:rounded-none lg:[&_section]:border-0 lg:[&_section]:bg-transparent lg:[&_section]:p-0 lg:[&_section+section]:mt-4 lg:[&_section+section]:border-t lg:[&_section+section]:border-borde lg:[&_section+section]:pt-4 ${ampliada || sinHerramientas ? 'max-lg:hidden' : ''}`}
        >

          <PanelPestana id="marcar" activa={pestana === 'marcar'}>
            <PanelMarcar
              lado={lado}
              frontal={orientacion.plano === 'frontal'}
              marcadores={modeloVista.marcadores}
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
            {ExperimentoPose && (
              <Suspense fallback={<p className="text-sm text-texto-2">Cargando el experimento sin marcadores…</p>}>
                <ExperimentoPose
                  key={activaViva.id}
                  archivo={activaViva.archivo}
                  tabla={tabla}
                  ancho={info.ancho}
                  alto={info.alto}
                  orientacion={orientacion}
                  lado={lado}
                  ajustes={ajustes}
                  gomets={orientacion.plano === 'sagital' && articulacion.id.startsWith('rodilla_sagital') ? filtradoPorFrame.valores : null}
                  tiemposGrafica={tiemposGrafica}
                  mostrado={mostrado}
                  onBuscar={buscarEnComun}
                  onEsqueleto={setEsqueleto}
                />
              </Suspense>
            )}
          </PanelPestana>

          <PanelPestana id="analisis" activa={pestana === 'analisis'}>
            <PanelAnalisis
              ajustes={ajustes}
              onCambiarAjustes={cambiarAjustes}
              filtrado={filtrado}
              anguloFiltrado={anguloFiltrado}
              mostrado={mostrado}
              marcadores={modeloVista.marcadores}
              tramoEstatico={tramoEstatico}
              cero={cero}
              t={t}
              tiempos={tabla.tiempos}
              total={total}
              onCambiarTramo={cambiarTramo}
              generarCsv={(formato) => generarCsv(formato, sincroniaCsv)}
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
            {vistas.length === 1 && <AnadirVista existentes={[activaViva.huella]} onAnadir={onAnadirVista} />}
            {vistas.length === 2 && (
              <SincronizarVistas
                referencia={vistas[0]!}
                vista={vistas[1]!}
                onSincronia={onSincronia}
                marcando={marcandoEvento}
                marca={marcaEvento}
                onEmpezar={empezarEvento}
                onTerminar={terminarEvento}
                onMarcar={marcarEvento}
              />
            )}
            <DatosVideo info={info} total={total} est={est} orientacion={orientacion} msDecodificar={msDecodificar} lectura={lectura} />
            {/* En el móvil la página no se desplaza y el pie (rama y commit) quedaría bajo la barra: va aquí. */}
            {!anchoLg && (
              <p className="font-mono text-xs text-texto-2" data-testid="pie-visor">
                {__RAMA__} · {__COMMIT__}
              </p>
            )}
          </PanelPestana>
        </div>
      </div>
      </div>
    </div>
  )
}
