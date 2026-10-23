import { useEffect, useMemo, useRef } from 'react'
import { ArrowTrendingUpIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon, VideoCameraIcon } from '@heroicons/react/24/outline'
import { tramoInicial } from '../../core/articulaciones/cero'
import type { ModeloMarcadores } from '../../core/modelo/tipos'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { VideoAbierto } from '../../media/video'
import { COLORES_MARCADOR, ladoDeVista, nombreCorto } from '../marcadores'
import PanelGrafica from './PanelGrafica'
import MiniGrafica from './MiniGrafica'
import LienzoVideo from './LienzoVideo'
import { DESVIACION_AVISO } from './PanelCinematica'
import PanelEscala from './PanelEscala'
import Pestanas, { PanelPestana } from './Pestanas'
import { useAltura } from './useAltura'
import { useVistaMovil } from './useVistaMovil'
import { useMiniGrande } from './useMiniGrande'
import { EXTRA_MAXIMO_PX } from './miniGrande'
import SeparadorVideo from './SeparadorVideo'
import AsaVolver from './AsaVolver'
import { ALTO_VIDEO_DVH, AMPLIAR_PX } from './reparto'
import { useOcultarAlBajar } from './useOcultarAlBajar'
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
import type { VistaViva } from './vistas'

/** Letra de cada vista, en el orden de la sesión. */
const LETRAS = ['A', 'B'] as const

interface Props {
  /** Todas las vistas de la sesión (la de referencia primero). */
  vistas: readonly VistaViva[]
  /** Índice de la vista activa: la que se pinta y se marca. */
  activa: number
  sesion: SesionAbierta
  modelo: ModeloMarcadores
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
  onElegirVista: (id: string) => void
  onAnadirVista: (video: VideoAbierto, orientacion: OrientacionVista) => void
}

export default function CuerpoVisor({ vistas, activa, sesion, modelo, recuperada, sinGuardar, pestana, onPestana: setPestana, fuera, registrarVistas, sincronizarVistas, onElegirVista, onAnadirVista }: Props) {
  const activaViva = vistas[activa]!
  const orientacion = activaViva.orientacion
  const lado = ladoDeVista(orientacion)
  const ids = useMemo(() => modelo.marcadores.map((m) => m.id), [modelo])
  const articulacion = modelo.articulaciones[0]!

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
    ajustes,
    cambiarAjustes,
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

  // Se guardan todas las vistas; los ajustes del filtro son los de la vista de referencia (la primera).
  const guardado = useGuardado({
    sesion,
    modelo,
    filtro: vistas[0]!.ajustes,
    vistas: vistas.map((w) => ({
      id: w.id,
      huella: w.huella,
      orientacion: w.orientacion,
      series: w.series,
      ceros: w.ceros,
      calibracion: w.calibracion,
      desfase: w.desfaseS,
      sincronia: w.sincronia,
    })),
    // Los contadores solo crecen: su suma cambia con cualquiera de ellos.
    version: vistas.reduce((suma, w) => suma + w.version + w.revAjustes + w.revCeros + w.revCalibracion, 0),
    recuperada,
    sinGuardar,
  })
  // Con varias vistas se sigue de una en una (dos decodificadores a la vez duplican la memoria y compiten por el del
  // hardware): mientras otra vista sigue, esta espera.
  const otraSiguiendo = vistas.some((w, i) => i !== activa && w.siguiendo)
  const listoParaSeguir = listoPropio && !otraSiguiendo
  const aviso = avisoPropio ?? (otraSiguiendo ? { texto: 'Se está siguiendo la otra vista: espera a que acabe para seguir esta.' } : null)
  // La sesión conoce las vistas vivas (el cursor común mueve las demás) y, al abrir otra vista, la pone donde toca.
  useEffect(() => {
    registrarVistas(vistas)
  })
  useEffect(() => sincronizarVistas(), [sincronizarVistas, vistas.length])
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
      <SelectorMarcadores marcadores={modelo.marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={siguiendo} onElegir={setSeleccionado} compacto />
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
                ? 'aparece max-lg:fixed max-lg:inset-0 max-lg:gap-0 max-lg:overflow-hidden max-lg:py-2 max-lg:pl-3'
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
              key={activaViva.id}
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
            <div data-testid="columna-marcado" className={`flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-[calc(var(--alto-barra)-0.5rem)] ${ANCHO_COLUMNA_APAISADA}`}>
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
            {vistas.length === 1 && <AnadirVista existentes={[activaViva.huella]} onAnadir={onAnadirVista} />}
            <DatosVideo info={info} total={total} est={est} orientacion={orientacion} msDecodificar={msDecodificar} lectura={lectura} />
          </PanelPestana>
        </div>
      </div>
      </div>
    </div>
  )
}
