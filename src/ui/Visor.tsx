import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { CALIDAD_MINIMA, serieAngular } from '../core/articulaciones/calculo'
import { construirCsv, nombreArchivoCsv, type FormatoCsv } from '../core/exportacion/csv'
import { ceroDeReferencia, relativoAlCero, tramoInicial, type TramoEstatico } from '../core/articulaciones/cero'
import { modeloRodilla3 } from '../core/articulaciones/catalogo'
import { escalaDesfasada, medirEntreMarcadores, metrosPorPx, type CalibracionVista } from '../core/calibracion/escala'
import { constanciaSegmento } from '../core/calibracion/segmentos'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../core/modelo/tipos'
import { huecosInterpolables, interpolarHueco, quitarInterpolados as quitarInterpoladosDe } from '../core/seguimiento/interpolar'
import { framesConMarcaManual, quitarMarcasManuales } from '../core/seguimiento/manuales'
import { aprenderMarcador, ErrorMarcado, radioDe } from '../core/seguimiento/seguidor'
import { AJUSTES_FILTRO_DEFECTO, type AjustesFiltro } from '../core/filtros/tramos'
import { resumirSerie } from '../core/graficas/rango'
import { seriePorFrame } from '../core/graficas/series'
import { polilineasTrayectoria } from '../core/graficas/trayectoria'
import { estadisticas, indiceMasCercano, limitarIndice } from '../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../media/video'
import type { AlWorker, DelWorker } from '../workers/protocolo'
import { COLORES_MARCADOR, ladoVisible, nombreCorto } from './marcadores'
import { huellaDe } from './sesion'
import type { EstadoFrame } from './visor/BandaFrames'
import ControlTrayectoria from './visor/ControlTrayectoria'
import PanelGrafica from './visor/PanelGrafica'
import MiniGrafica from './visor/MiniGrafica'
import LienzoVideo, { type Previsualizacion } from './visor/LienzoVideo'
import PanelCinematica, { DESVIACION_AVISO } from './visor/PanelCinematica'
import PanelExportar from './visor/PanelExportar'
import PanelEscala, { escalaDeBorrador, OBJETOS, type BorradorEscala } from './visor/PanelEscala'
import { tocarExtremo as tocarExtremoEscala } from './visor/toquesEscala'
import PanelFiltro from './visor/PanelFiltro'
import Pestanas, { PanelPestana } from './visor/Pestanas'
import { useAltura, useAnchoMinimo } from './visor/useAltura'
import { useMiniGrande } from './visor/useMiniGrande'
import { EXTRA_MAXIMO_PX } from './visor/miniGrande'
import SeparadorVideo from './visor/SeparadorVideo'
import AsaVolver from './visor/AsaVolver'
import { ALTO_VIDEO_DVH, AMPLIAR_PX, CLAVE_REPARTO, leerReparto, repartoAlVolver, type Reparto } from './visor/reparto'
import { useOcultarAlBajar } from './visor/useOcultarAlBajar'
import { useFiltrado } from './visor/useFiltrado'
import { useGuardado, type SesionAbierta } from './visor/useGuardado'
import { dibujarSegmentoEscala, lectorDeCanvas } from './visor/capa'
import { describirMotivos, fmt, grados, valorEn } from './visor/formato'
import BotonPaso from './visor/BotonPaso'
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

const SALTO = 10
const ESTELA = 20 // frames de trayectoria dibujados por detrás, en el sentido en que se recorre el vídeo

const valida = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)

type Seguimiento = { estado: 'parado' } | { estado: 'siguiendo'; progreso: number }

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
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { info, tabla } = video
  const total = tabla.tiempos.length

  // Modelo de la fase 1: rodilla con 3 gomets en la pierna que ve la cámara.
  // Una sesión recuperada usa el que se guardó con ella.
  const lado = orientacion.plano === 'sagital' ? ladoVisible(orientacion) : 'izq'
  const modelo = useMemo(() => modeloGuardado ?? modeloRodilla3(lado), [modeloGuardado, lado])
  const ids = useMemo(() => modelo.marcadores.map((m) => m.id), [modelo])
  const articulacion = modelo.articulaciones[0]!

  // Trayectorias: una posición (o nada) por frame y marcador. Se modifican en
  // sitio y `version` avisa a React de que hay que repintar.
  const trayectorias = useRef<Map<IdMarcador, (Muestra2D | undefined)[]>>(new Map())
  const [version, setVersion] = useState(0)
  if (trayectorias.current.size === 0) for (const id of ids) trayectorias.current.set(id, inicial?.get(id) ?? new Array(total))
  const muestra = useCallback((id: IdMarcador, i: number) => trayectorias.current.get(id)?.[i], [])

  const [deseado, setDeseado] = useState(0)
  const [mostrado, setMostrado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; detalle?: string; irA?: number } | null>(avisoInicial ? { texto: avisoInicial } : null)
  // Error al tocar: se muestra encima del vídeo, que es donde se mira al marcar.
  // `aOjo`: dónde se tocó, para ofrecer colocarlo ahí aunque no se reconozca el gomet.
  const [errorToque, setErrorToque] = useState<ErrorDeToque | null>(null)
  const [msDecodificar, setMsDecodificar] = useState<number | null>(null)
  // Cómo se consiguió el frame: de la caché, siguiendo el decodificador o desde el fotograma clave.
  const [lectura, setLectura] = useState<string | null>(null)
  // Al recuperar, el primer marcador que falte en el frame inicial (como al marcar);
  // si están todos, ninguno, para no mover uno sin querer con el primer toque.
  const [seleccionado, setSeleccionado] = useState<IdMarcador | null>(() =>
    inicial ? (ids.find((id) => !valida(inicial.get(id)?.[0])) ?? null) : (ids[0] ?? null),
  )
  const [seguimiento, setSeguimiento] = useState<Seguimiento>({ estado: 'parado' })
  // «Colocar a ojo»: cada toque deja el marcador justo donde se suelta el dedo, sin buscar el gomet (gomet tapado o movido).
  const [colocarAOjo, setColocarAOjo] = useState(false)
  const ultimoFrame = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null)
  const huella = useMemo(() => huellaDe(video), [video])
  // Ajuste del filtro: se guarda con la sesión. `revAjustes` cuenta sus cambios
  // para que el guardado automático los vea (como `version` con las trayectorias).
  const [ajustes, setAjustes] = useState<AjustesFiltro>(filtro ?? AJUSTES_FILTRO_DEFECTO)
  const [revAjustes, setRevAjustes] = useState(0)
  const cambiarAjustes = useCallback((a: AjustesFiltro) => {
    setAjustes(a)
    setRevAjustes((r) => r + 1)
  }, [])
  // Cero de referencia (paso 5): tramo estático por articulación; se guarda
  // el tramo y la media se recalcula con lo filtrado.
  const [ceros, setCeros] = useState<Readonly<Record<string, TramoEstatico>>>(cerosGuardados ?? {})
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
  // Escala (paso 6): la guardada y, mientras se calibra, el borrador con los extremos tocados.
  const [calibracion, setCalibracion] = useState<CalibracionVista | null>(calibracionGuardada ?? null)
  const [revCalibracion, setRevCalibracion] = useState(0)
  const [borrador, setBorrador] = useState<BorradorEscala | null>(null)
  const calibrando = borrador !== null
  // Calibrar tocando los extremos (con «Entre dos marcadores» no se toca el vídeo).
  const tocandoEscala = calibrando && borrador.objeto !== 'marcadores'
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

  // Pintado «el último gana».
  const pedido = useRef(0)
  const ocupado = useRef(false)
  const pintar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      for (;;) {
        const i = pedido.current
        const inicio = performance.now()
        const frame = await video.frame(i)
        lienzo.current?.getContext('2d')?.drawImage(frame.canvas, 0, 0)
        ultimoFrame.current = frame.canvas
        setMsDecodificar(performance.now() - inicio)
        const l = video.ultimaLectura
        setLectura(!l ? null : l.modo === 'cache' ? 'caché' : l.modo === 'seguido' ? 'seguido' : 'clave')
        setMostrado(i)
        setError(null)
        if (pedido.current === i) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      ocupado.current = false
    }
  }, [video])

  // Primer frame al montar. pintar() solo cambia el estado tras decodificar
  // (asíncrono), no de forma síncrona dentro del efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void pintar(), [pintar])

  // Sentido de la última navegación: la estela va por detrás del marcador, hacia los frames
  // de los que se viene (hacia atrás en el tiempo al avanzar, hacia delante al retroceder).
  const [sentido, setSentido] = useState<1 | -1>(1)
  const ir = useCallback(
    (i: number) => {
      const destino = limitarIndice(tabla, i)
      if (destino !== pedido.current) setSentido(destino > pedido.current ? 1 : -1)
      pedido.current = destino
      setDeseado(destino)
      // El error de un toque es de su frame: «Colocarlo aquí a ojo» marcaría el anterior.
      setErrorToque((e) => (e?.aOjo?.i === destino ? e : null))
      void pintar()
    },
    [tabla, pintar],
  )
  const mover = useCallback((d: number) => ir(pedido.current + d), [ir])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Las flechas de otro campo son suyas (el corte del filtro, los de texto); las del
      // deslizador de frames, de los botones y de las pestañas mueven el frame.
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('input, select, textarea') && el.getAttribute('aria-label') !== 'Posición en el vídeo') return
      const paso = e.shiftKey ? SALTO : 1
      if (e.key === 'ArrowRight') mover(paso)
      else if (e.key === 'ArrowLeft') mover(-paso)
      else if (e.key === 'Home') ir(0)
      else if (e.key === 'End') ir(total - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mover, ir, total])

  // ---- Worker de seguimiento ----
  const worker = useRef<Worker | null>(null)
  // Lo seguido que «Seguir desde aquí» quitó, hasta que llega el primer lote: si el
  // seguimiento no arranca (gomet no reconocido, error), se devuelve tal cual.
  const quitadoAlSeguir = useRef<Map<IdMarcador, (Muestra2D | undefined)[]> | null>(null)
  const devolverQuitado = useCallback(() => {
    const quitado = quitadoAlSeguir.current
    quitadoAlSeguir.current = null
    if (!quitado) return
    for (const [id, antes] of quitado) {
      const serie = trayectorias.current.get(id)
      if (!serie) continue
      antes.forEach((m, i) => {
        if (m !== undefined && serie[i] === undefined) serie[i] = m
      })
    }
    setVersion((v) => v + 1)
  }, [])
  useEffect(() => {
    const w = new Worker(new URL('../workers/seguimiento.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<DelWorker>) => {
      const m = e.data
      if (m.tipo === 'muestras') {
        if (m.lote.length) quitadoAlSeguir.current = null
        for (const f of m.lote) {
          for (const mk of f.marcadores) {
            const serie = trayectorias.current.get(mk.id)
            if (!serie || serie[f.indice]?.editadoManual) continue
            serie[f.indice] = { t: f.t, x: mk.x, y: mk.y, calidad: mk.calidad, editadoManual: false }
          }
        }
        setSeguimiento({ estado: 'siguiendo', progreso: m.progreso })
        setVersion((v) => v + 1)
      } else if (m.tipo === 'fin') {
        setSeguimiento({ estado: 'parado' })
        devolverQuitado()
        const nombre = (id: IdMarcador) => nombreCorto(modelo.marcadores.find((x) => x.id === id)?.nombre ?? id)
        if (m.motivo === 'inicio') {
          setAviso({
            texto: `No reconozco ${m.sinReconocer.map(nombre).join(' ni ')} en este frame. Vuelve a tocarlo justo encima del gomet.`,
          })
          setSeleccionado(m.sinReconocer[0] ?? null)
        } else if (m.huecos.length) {
          const primero = Math.min(...m.huecos.map((h) => h.primero))
          setAviso({
            texto:
              `${m.motivo === 'final' ? 'Seguimiento completado' : 'Seguimiento parado'}, con huecos: ` +
              m.huecos.map((h) => `${nombre(h.id)} no tiene posición fiable en ${h.frames} frame${h.frames === 1 ? '' : 's'}`).join('; ') +
              '. Son los frames en rojo de la franja y no se rellenan. Si en alguno sí se ve el gomet, tócalo ahí y pulsa «Seguir desde aquí».',
            detalle: m.huecos.map((h) => `${nombre(h.id)}: ${describirMotivos(h)}`).join('\n'),
            irA: primero,
          })
          setSeleccionado(m.huecos[0]!.id)
        } else {
          setAviso({ texto: m.motivo === 'final' ? 'Seguimiento completado hasta el final del vídeo, sin huecos.' : 'Seguimiento parado.' })
        }
      } else {
        setSeguimiento({ estado: 'parado' })
        devolverQuitado()
        setAviso({ texto: `Error en el seguimiento: ${m.mensaje}` })
      }
    }
    // Si el worker no llega a cargar (p. ej. una versión nueva publicada con la app abierta)
    // o el navegador lo cierra, no llegaría ningún mensaje y el visor quedaría «siguiendo».
    w.onerror = (ev) => {
      ev.preventDefault()
      setSeguimiento({ estado: 'parado' })
      devolverQuitado()
      setAviso({ texto: `Error en el seguimiento: ${ev.message || 'no se ha podido cargar el proceso de seguimiento. Recarga la página.'}` })
    }
    return () => w.terminate()
  }, [modelo, ir, devolverQuitado])

  const posicionesEn = useCallback(
    (i: number) => ids.map((id) => ({ id, m: muestra(id, i) })),
    [ids, muestra],
  )
  const listoParaSeguir = mostrado !== null && posicionesEn(mostrado).every(({ m }) => valida(m))

  const seguirDesdeAqui = () => {
    if (mostrado === null || !listoParaSeguir) return
    // Lo seguido antes a partir de aquí se descarta; lo marcado a mano se conserva.
    // Se guarda una copia por si el seguimiento no llega a arrancar.
    const quitado = new Map<IdMarcador, (Muestra2D | undefined)[]>()
    for (const [id, serie] of trayectorias.current) {
      const antes = new Array<Muestra2D | undefined>(total)
      for (let i = mostrado + 1; i < total; i++) {
        if (!serie[i]?.editadoManual) {
          antes[i] = serie[i]
          serie[i] = undefined
        }
      }
      quitado.set(id, antes)
    }
    quitadoAlSeguir.current = quitado
    setVersion((v) => v + 1)
    setAviso(null)
    setErrorToque(null)
    setSeguimiento({ estado: 'siguiendo', progreso: mostrado / Math.max(1, total - 1) })
    // Lo marcado a mano más adelante son anclas: el seguidor las respeta y sigue desde ellas.
    const anclas: { indice: number; id: IdMarcador; x: number; y: number }[] = []
    for (const [id, serie] of trayectorias.current) {
      for (let i = mostrado + 1; i < total; i++) {
        const m = serie[i]
        if (m?.editadoManual && Number.isFinite(m.x)) anclas.push({ indice: i, id, x: m.x, y: m.y })
      }
    }
    const msg: AlWorker = {
      tipo: 'seguir',
      archivo: video.archivo,
      desde: mostrado,
      posiciones: posicionesEn(mostrado).map(({ id, m }) => ({ id, x: m!.x, y: m!.y })),
      anclas,
    }
    worker.current?.postMessage(msg)
  }

  /** Guarda una posición marcada a mano y pasa al siguiente marcador que falte en el frame. */
  const ponerManual = (id: IdMarcador, i: number, x: number, y: number) => {
    const serie = trayectorias.current.get(id)!
    serie[i] = { t: tabla.tiempos[i]!, x, y, calidad: 1, editadoManual: true }
    setErrorToque(null)
    setVersion((v) => v + 1)
    const falta = ids.find((otro) => otro !== id && !valida(muestra(otro, i)))
    setSeleccionado(falta ?? null)
    // Una corrección con lo seguido detrás: se puede rehacer desde aquí con ella como ancla.
    const seguidoDespues = serie.some((m, k) => k > i && m !== undefined && !m.editadoManual)
    setAviso(
      seguidoDespues && !falta
        ? { texto: 'Corregido. Para rehacer lo que viene después a partir de aquí, pulsa «Seguir desde aquí»: respeta todo lo marcado a mano.' }
        : null,
    )
  }

  /** Dónde quedaría el marcador si se suelta en (x, y): centro y radio del gomet, o null si no hay. */
  const previsualizar = useCallback(
    (x: number, y: number, radio: number): Previsualizacion => {
      if (mostrado === null || !ultimoFrame.current) return null
      try {
        const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, tabla.tiempos[mostrado]!, x, y, { radioSemilla: radio })
        return { x: r.x, y: r.y, r: radioDe(r.estado.area) }
      } catch {
        return null
      }
    },
    [mostrado, info, tabla],
  )

  const colocar = (x: number, y: number, radio: number) => {
    if (mostrado === null || !seleccionado || !ultimoFrame.current) return
    if (colocarAOjo) {
      ponerManual(seleccionado, mostrado, x, y)
      return
    }
    const t = tabla.tiempos[mostrado]!
    try {
      // Se lleva el marcador al centro del gomet que se ve en la lupa (el mismo que marcaba el anillo).
      const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, t, x, y, { radioSemilla: radio })
      ponerManual(seleccionado, mostrado, r.x, r.y)
    } catch (e) {
      setErrorToque(
        e instanceof ErrorMarcado
          ? { texto: e.message, detalle: e.detalle, aOjo: { id: seleccionado, i: mostrado, x, y } }
          : { texto: `No se ha podido marcar: ${String(e)}` },
      )
    }
  }

  const quitarManual = (id: IdMarcador, i: number) => {
    trayectorias.current.get(id)![i] = undefined
    setAviso(null)
    setVersion((v) => v + 1)
  }

  // ---- Escala: tocar los dos extremos del objeto ----
  const frameCalibracion = useMemo(() => (calibracion ? indiceMasCercano(tabla, calibracion.t) : null), [calibracion, tabla])
  const tocarExtremo = (x: number, y: number) => {
    if (mostrado === null || !borrador) return
    // Los dos extremos, del mismo frame: un toque en otro empieza de nuevo.
    setBorrador(tocarExtremoEscala(borrador, { x, y }, tabla.tiempos[mostrado]!))
  }
  // Segmentos de la articulación: se pueden usar para calibrar y se vigila su longitud.
  const segmentos = useMemo(() => {
    const nombre = (id: IdMarcador) => nombreCorto(modelo.marcadores.find((m) => m.id === id)?.nombre ?? id)
    return [articulacion.proximal, articulacion.distal].map((s) => ({ desde: s.desde, hasta: s.hasta, nombre: `${nombre(s.desde)} – ${nombre(s.hasta)}` }))
  }, [modelo, articulacion])
  // Con «Entre dos marcadores»: posición media de los dos en el tramo, con lo seguido ahora.
  const medicion = useMemo(() => {
    void version
    if (borrador?.objeto !== 'marcadores' || !borrador.entre || !borrador.tramo) return null
    const serie = (id: IdMarcador) => trayectorias.current.get(id) ?? []
    return medirEntreMarcadores(serie(borrador.entre.desde), serie(borrador.entre.hasta), borrador.tramo)
  }, [borrador, version])
  // La guardada, medida otra vez con lo seguido ahora: si se calibró antes de seguir, hay más frames.
  const medicionGuardada = useMemo(() => {
    void version
    const entre = calibracion?.entre
    if (!entre) return null
    return medirEntreMarcadores(trayectorias.current.get(entre.desde) ?? [], trayectorias.current.get(entre.hasta) ?? [], entre.tramo)
  }, [calibracion, version])
  // Si lo seguido cambió en el tramo desde que se guardó (más o menos frames, marcadores corregidos), se avisa.
  const desfase = useMemo(() => (calibracion ? escalaDesfasada(calibracion, medicionGuardada) : null), [calibracion, medicionGuardada])
  const framesTramo = useMemo(() => {
    const tr = borrador?.tramo
    if (!tr) return null
    return tabla.tiempos.reduce((n, t) => (t >= tr.desde && t <= tr.hasta ? n + 1 : n), 0)
  }, [borrador?.tramo, tabla])
  const empezarEscala = () => {
    setErrorToque(null)
    // Por defecto, el segmento distal (rodilla–tobillo: el gomet del trocánter se desliza más) y el tramo del cero o los primeros 2 s.
    const entre = calibracion?.entre ? { desde: calibracion.entre.desde, hasta: calibracion.entre.hasta } : { desde: articulacion.distal.desde, hasta: articulacion.distal.hasta }
    const tramo = calibracion?.entre?.tramo ?? ceros[articulacion.id] ?? tramoInicial(tabla.tiempos)
    if (!calibracion) {
      setBorrador({ objeto: 'cinta', a: null, b: null, t: null, longitud: OBJETOS.cinta.cm, entre, tramo })
      return
    }
    // Rehacer: se parte de lo guardado, en su frame, para ajustar un extremo o la longitud.
    const longitud = fmt(calibracion.longitudM * 100, 1).replace(/,0$/, '')
    setBorrador({ objeto: calibracion.objeto, a: calibracion.a, b: calibracion.b, t: calibracion.t, longitud, entre, tramo })
    if (frameCalibracion !== null) ir(frameCalibracion)
  }
  const guardarEscala = () => {
    const r = borrador && escalaDeBorrador(borrador, medicion)
    if (!r?.ok) return
    setCalibracion(r.valor)
    setRevCalibracion((v) => v + 1)
    setBorrador(null)
  }
  const quitarEscala = () => {
    setCalibracion(null)
    setRevCalibracion((v) => v + 1)
  }

  // ---- Huecos cortos: rellenar a petición ----
  const huecosCortos = useMemo(() => {
    void version
    return ids.flatMap((id) => huecosInterpolables(trayectorias.current.get(id)!, tabla.tiempos).map((h) => ({ id, h })))
  }, [version, ids, tabla])
  const hayInterpolados = useMemo(() => {
    void version
    return [...trayectorias.current.values()].some((s) => s.some((m) => m?.interpolado))
  }, [version])

  const rellenarHuecosCortos = () => {
    let frames = 0
    for (const { id, h } of huecosCortos) {
      const serie = trayectorias.current.get(id)!
      for (const { indice, muestra: m } of interpolarHueco(serie, tabla.tiempos, h)) {
        serie[indice] = m
        frames++
      }
    }
    setAviso({
      texto: `Rellenados ${huecosCortos.length} hueco${huecosCortos.length === 1 ? '' : 's'} (${frames} posiciones interpoladas, en azul en la franja y a trazos en la gráfica).`,
    })
    setVersion((v) => v + 1)
  }

  const quitarInterpolados = () => {
    // Vuelven a ser huecos, con lo que había antes de rellenar (perdido, dudoso o nada).
    quitarInterpoladosDe(trayectorias.current.values())
    setAviso({ texto: 'Quitado lo interpolado: esos frames vuelven a ser huecos.' })
    setVersion((v) => v + 1)
  }

  // ---- Estado por frame para la franja y ángulo actual ----
  const estadosFrames = useMemo<EstadoFrame[]>(() => {
    void version
    const r: EstadoFrame[] = new Array(total)
    for (let i = 0; i < total; i++) {
      let hay = false
      let perdido = false
      let manual = false
      let interpolado = false
      for (const id of ids) {
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
  }, [version, total, ids, muestra])

  // Serie completa del ángulo para la gráfica: misma regla de huecos que el valor
  // en directo (marcador ausente o perdido = sin valor). Lo interpolado a
  // petición tiene valor, pero va marcado y se dibuja aparte.
  const serie = useMemo(() => {
    void version
    if (orientacion.plano !== articulacion.plano) return []
    const porMarcador: Record<IdMarcador, Muestra2D[]> = {}
    for (const id of ids) porMarcador[id] = (trayectorias.current.get(id) ?? []).filter((m): m is Muestra2D => m !== undefined)
    return serieAngular(articulacion, porMarcador, orientacion)
  }, [version, ids, orientacion, articulacion])
  const resumen = useMemo(() => resumirSerie(serie), [serie])
  const filtrado = useFiltrado({
    trayectorias,
    version,
    ids,
    tabla,
    ajustes,
    articulacion,
    orientacion,
    metrosPorPx: calibracion ? metrosPorPx(calibracion) : null,
    siguiendo: seguimiento.estado === 'siguiendo',
  })

  // Trayectoria completa de cada marcador, con lo filtrado: se prepara aquí al
  // encenderla y cuando cambian las trayectorias o el corte; en cada frame solo se pinta.
  const [trayectoriaCompleta, setTrayectoriaCompleta] = useState(false)
  const [conTrayectoria, setConTrayectoria] = useState<ReadonlySet<IdMarcador>>(() => new Set(ids))
  const caminos = useMemo(() => {
    const r = new Map<IdMarcador, { continuo: Path2D; trazos: Path2D }>()
    if (!trayectoriaCompleta) return r
    for (const [id, f] of filtrado.porMarcador) {
      const c = { continuo: new Path2D(), trazos: new Path2D() }
      for (const l of polilineasTrayectoria(f.posiciones)) {
        const camino = l.interpolado ? c.trazos : c.continuo
        const [p0, ...resto] = l.puntos
        camino.moveTo(p0!.x, p0!.y)
        // Un punto suelto se ve como un punto (extremo redondeado).
        if (resto.length === 0) camino.lineTo(p0!.x, p0!.y)
        for (const q of resto) camino.lineTo(q.x, q.y)
      }
      r.set(id, c)
    }
    return r
  }, [filtrado.porMarcador, trayectoriaCompleta])

  // ---- Capa de dibujo ----
  const dibujar = useCallback(
    (ctx: CanvasRenderingContext2D, escala: number) => {
      void version
      if (mostrado === null) return
      const base = 2 * escala // 2 px de pantalla
      // Segmentos de la articulación.
      const p = (id: IdMarcador) => muestra(id, mostrado)
      ctx.lineCap = 'round'
      for (const s of [articulacion.proximal, articulacion.distal]) {
        const a = p(s.desde)
        const b = p(s.hasta)
        if (!valida(a) || !valida(b)) continue
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = base
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ids.forEach((id, k) => {
        const color = COLORES_MARCADOR[k % COLORES_MARCADOR.length]!
        // Trayectoria completa (con lo filtrado), ya preparada: aquí solo se pinta.
        const camino = trayectoriaCompleta && conTrayectoria.has(id) ? caminos.get(id) : undefined
        if (camino) {
          ctx.save()
          ctx.strokeStyle = color
          ctx.lineWidth = base * 0.75
          ctx.lineJoin = 'round'
          ctx.globalAlpha = 0.9
          ctx.stroke(camino.continuo)
          ctx.setLineDash([base * 2, base * 1.5])
          ctx.stroke(camino.trazos)
          ctx.restore()
        }
        // Estela de los últimos frames recorridos.
        ctx.strokeStyle = color
        ctx.lineWidth = base * 0.6
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        let empezado = false
        const desde = sentido > 0 ? Math.max(0, mostrado - ESTELA) : mostrado
        const hasta = sentido > 0 ? mostrado : Math.min(total - 1, mostrado + ESTELA)
        for (let i = desde; i <= hasta; i++) {
          const m = muestra(id, i)
          if (!valida(m)) {
            empezado = false
            continue
          }
          if (empezado) ctx.lineTo(m.x, m.y)
          else ctx.moveTo(m.x, m.y)
          empezado = true
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        const m = muestra(id, mostrado)
        if (!valida(m)) return
        ctx.lineWidth = base
        ctx.strokeStyle = '#000'
        ctx.beginPath()
        ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = color
        ctx.lineWidth = base * 0.7
        // Interpolado: círculo a trazos (no es una detección).
        if (m.interpolado) ctx.setLineDash([base * 1.5, base * 1.5])
        ctx.beginPath()
        ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        if (m.editadoManual) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(m.x, m.y, base * 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      // Escala: mientras se calibra, y la guardada en el frame en que se marcó.
      const segmento = borrador
        ? borrador.objeto === 'marcadores'
          ? medicion?.ok
            ? medicion
            : null
          : borrador
        : calibracion && mostrado === frameCalibracion
          ? calibracion
          : null
      if (segmento) dibujarSegmentoEscala(ctx, base, segmento.a, segmento.b)
    },
    [version, mostrado, sentido, total, ids, muestra, articulacion, borrador, medicion, calibracion, frameCalibracion, trayectoriaCompleta, conTrayectoria, caminos],
  )

  // Las series de la gráfica, un valor por frame.
  const crudoPorFrame = useMemo(() => seriePorFrame(serie, tabla.tiempos), [serie, tabla])
  const filtradoPorFrame = useMemo(() => seriePorFrame(filtrado.serie, tabla.tiempos), [filtrado.serie, tabla])
  // El valor del frame sale de las mismas series que la gráfica y el CSV (una sola
  // fuente: antes se recalculaba aparte y podía quedar 360° desplazado de la curva).
  const angulo = mostrado === null ? NaN : (crudoPorFrame.valores[mostrado] ?? NaN)
  const anguloFiltrado = mostrado === null ? NaN : (filtradoPorFrame.valores[mostrado] ?? NaN)
  // Redondeado a la décima que se muestra (+ 0 evita «−0,0»), para que la etiqueta
  // (flexión / hiperextensión) concuerde con el número visible.
  const anguloRedondeado = Math.round(angulo * 10) / 10 + 0
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
  const est = useMemo(() => estadisticas(tabla), [tabla])
  const generarCsv = useCallback(
    (formato: FormatoCsv) => {
      const mismoPlano = orientacion.plano === articulacion.plano
      const texto = construirCsv(
        {
          tiempos: tabla.tiempos,
          marcadores: modelo.marcadores.map((mk) => ({
            id: mk.id,
            nombre: mk.nombre,
            crudo: trayectorias.current.get(mk.id) ?? [],
            filtrado: filtrado.porMarcador.get(mk.id)!,
            velocidad: filtrado.velocidades.get(mk.id)!,
          })),
          angulo: mismoPlano
            ? {
                id: articulacion.id,
                nombre: articulacion.nombre,
                positivo: articulacion.positivo,
                negativo: articulacion.negativo,
                crudo: crudoPorFrame.valores,
                filtrado: filtradoPorFrame.valores,
                relativo: cero ? filtradoPorFrame.valores.map((v) => relativoAlCero(v, cero)) : null,
                velocidad: filtrado.derivadas.velocidad,
                aceleracion: filtrado.derivadas.aceleracion,
                cero,
              }
            : null,
          calibracion,
          meta: {
            archivo: info.nombre,
            ancho: info.ancho,
            alto: info.alto,
            rotacion: info.rotacion,
            duracionS: info.duracion,
            fpsMedio: est.fpsMedio,
            fpsVariable: est.variable,
            orientacion,
            corteHz: ajustes.corteHz,
            corteEfectivoHz: filtrado.corte,
            exportado: new Date().toISOString(),
          },
        },
        formato,
      )
      return { nombre: nombreArchivoCsv(info.nombre, mismoPlano ? articulacion.id : null), texto }
    },
    [orientacion, articulacion, filtrado, tabla, modelo, crudoPorFrame, filtradoPorFrame, cero, calibracion, info, est, ajustes],
  )
  const instantesInterpolados = useMemo(() => serie.filter((p) => p.interpolado).length, [serie])
  const buscarEnTiempo = useCallback(
    (t: number) => {
      const i = indiceMasCercano(tabla, t)
      if (i >= 0) ir(i)
    },
    [tabla, ir],
  )
  const t = mostrado === null ? null : tabla.tiempos[mostrado]!
  const siguiendo = seguimiento.estado === 'siguiendo'

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
  const anchoLg = useAnchoMinimo()
  // La página deja debajo el sitio de la barra fija (`--alto-barra`, en la raíz: el pie de página también va debajo y
  // cuelga de `main`, fuera de este componente; con el hueco dentro del visor, el pie quedaba tapado por la barra).
  useEffect(() => {
    document.documentElement.style.setProperty('--alto-barra', `${altoBarra}px`)
    return () => {
      document.documentElement.style.removeProperty('--alto-barra')
    }
  }, [altoBarra])
  // Vista en el móvil: la mixta de siempre, el vídeo grande para marcar o solo las gráficas. En pantalla ancha no existe.
  const [vista, setVista] = useState<'mixta' | 'video' | 'graficas'>('mixta')
  const enVideo = !anchoLg && vista === 'video'
  const enGraficas = !anchoLg && vista === 'graficas'
  const ampliada = enVideo || enGraficas
  // Al bajar por las tarjetas, el vídeo y su gráfica se esconden (y vuelven al subir, al cambiar de frame o de pestaña,
  // y mientras se calibra tocando el vídeo); las pestañas suben a ocupar su sitio.
  const tiraRef = useRef<HTMLDivElement>(null)
  const tarjetasRef = useRef<HTMLDivElement>(null)
  const [, altoTira] = useAltura<HTMLDivElement>(tiraRef)
  const { oculto: videoOculto, ver: verVideo } = useOcultarAlBajar({
    activo: !anchoLg && vista === 'mixta',
    tarjetas: tarjetasRef,
    tira: tiraRef,
    altoTira,
    forzarVisible: tocandoEscala,
    reinicio: `${deseado}|${pestana}`,
  })
  // Arriba del todo la gráfica pequeña crece hasta llenar lo que queda sobre la barra fija: en la primera pantalla solo
  // vídeo, gráfica, pestañas y barra. Al bajar vuelve a su alto de siempre.
  // Reparto del alto entre el vídeo y la gráfica pequeña (móvil, vista mixta): un asa entre los dos lo cambia y la
  // gráfica grande llena lo que quede (ver `reparto.ts`). Se guarda en este dispositivo.
  const [reparto, setReparto] = useState<Reparto>(leerReparto)
  const [altoArrastre, setAltoArrastre] = useState<number | null>(null)
  const cajaMiniRef = useRef<HTMLDivElement>(null)
  const mini = useMiniGrande({
    activo: !anchoLg && vista === 'mixta',
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
  // Volver de una vista ampliada a la mixta: aterriza en el extremo del que se viene (vídeo grande o gráfica grande) para
  // seguir viendo en grande lo que se estaba mirando. No se guarda: el reparto guardado sigue siendo el elegido a mano.
  const volverDe = useCallback((desde: 'video' | 'graficas') => {
    setReparto(repartoAlVolver(desde))
    setVista('mixta')
  }, [])
  const elegirReparto = useCallback((r: Reparto) => {
    setReparto(r)
    try {
      localStorage.setItem(CLAVE_REPARTO, r)
    } catch {
      // Sin almacenamiento (modo privado): se usa solo esta vez.
    }
  }, [])
  // Con una vista ampliada, la página de debajo no se desplaza.
  useEffect(() => {
    if (!ampliada) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [ampliada])

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
  const pararSeguimiento = () => worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorker)
  const progresoSeguimiento = seguimiento.estado === 'siguiendo' ? seguimiento.progreso : 0

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
  }, [version, mostrado])
  const quitarMarcasPosteriores = () => {
    if (mostrado === null) return
    const n = quitarMarcasManuales(trayectorias.current, mostrado)
    setVersion((v) => v + 1)
    setAviso({
      texto: `Quitadas ${n} marca${n === 1 ? '' : 's'} a mano posteriores al frame ${mostrado + 1}. Los frames quedan sin posición: pulsa «Seguir desde aquí» para volver a seguirlos.`,
    })
  }

  // Vista de vídeo grande: lo mínimo para marcar y seguir sin salir de ella.
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
            className={`flex flex-col gap-2 max-lg:z-30 max-lg:bg-fondo max-lg:transition-[opacity,visibility] max-lg:duration-200 motion-reduce:transition-none ${
              enVideo
                ? 'aparece max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-(--alto-barra) max-lg:overflow-y-auto max-lg:p-4'
                : videoOculto
                  ? // Oculto: fuera del flujo (las tarjetas ganan su sitio), pero con su tamaño, para no desmontar ni medir 0.
                    // Se desvanece (la visibilidad cambia al acabar el fundido) mientras las pestañas suben.
                    'max-lg:invisible max-lg:opacity-0 max-lg:pointer-events-none max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:px-4 max-lg:pb-2'
                  : 'max-lg:sticky max-lg:top-0 max-lg:order-1 max-lg:-mx-4 max-lg:border-b max-lg:border-borde max-lg:px-4 max-lg:pb-2'
            } ${enGraficas ? 'max-lg:hidden' : ''}`}
          >
          <div className="relative">
            <LienzoVideo
              llenar={enVideo}
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
                {!borrador.a
                  ? 'toca un extremo'
                  : !borrador.b
                    ? borrador.otroFrame
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
            {enVideo && (
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
              onAmpliar={() => setVista('graficas')}
              alto={mini.alto}
              // Mientras se arrastra el asa, la gráfica sigue al vídeo sin retraso (la tira de pestañas no se mueve).
              animable={mini.animable && altoArrastre === null}
              cajaRef={cajaMiniRef}
            />
          )}
          {enVideo && (
            <>
              <AsaVolver sentido="arriba" destino="volver a la vista con gráfica" onVolver={() => volverDe('video')} testid="asa-volver-video" />
              {nodoError}
              {tiraMarcado}
            </>
          )}
          </div>

          {!enVideo && nodoError}

          {nodoDeslizador}

          {/* Móvil: barra fija abajo con los botones, la línea de posición y los valores del frame, para
              no perderlos de vista al hacer scroll. Altura fija (nada de lo que contiene cambia de
              altura). En pantalla ancha no existe como caja (contents): queda en su sitio de siempre. */}
          <div
            ref={barraRef}
            data-testid="barra-fija"
            className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:flex max-lg:flex-col max-lg:gap-1.5 max-lg:border-t max-lg:border-borde max-lg:bg-fondo max-lg:px-4 max-lg:pt-1.5 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:contents"
          >
            {/* Siempre la misma altura: una línea que no se parte (lo que no cabe se corta). Si el texto
                cambiaba de una a dos líneas (p. ej. «288 ms clave»), los botones de debajo se movían
                y se perdía la pulsación mantenida. En el móvil, sin «t =» ni «frame» y sin los ms (están en la pestaña
                «Vídeo»), con el deslizador de frames en medio: tiempo, deslizador y «frame / total» en una sola fila. */}
            <div className={`flex items-center gap-x-2 font-mono text-sm tabular-nums max-lg:h-7 lg:items-baseline lg:justify-between lg:gap-x-3`} data-testid="posicion">
              <span className="shrink-0 whitespace-nowrap">
                <span className="max-lg:hidden">t = </span>
                <span className="text-acento">{t === null ? '—' : fmt(t, 3)} s</span>
              </span>
              <div className="min-w-0 flex-1 lg:hidden">{controlDeslizador}</div>
              <span className="min-w-0 truncate whitespace-nowrap text-texto-2 max-lg:shrink-0">
                <span className="max-lg:hidden">frame </span>
                {mostrado === null ? '—' : mostrado + 1} / {total}
                {mostrado !== deseado && ' …'}
                {/* A la vista junto a los controles: para ver en el móvil si decodificar se frena al mantener pulsado. */}
                {msDecodificar !== null && (
                  <span data-testid="ms-decodificar" className="max-lg:hidden">
                    {' '}
                    · {fmt(msDecodificar, 0)} ms{lectura && (
                      <>
                        {' '}
                        <span data-testid="lectura" className="text-xs">
                          {lectura}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </span>
            </div>

            {/* Valores del frame actual junto a los controles: en el móvil, el panel «Velocidad y
                cero» queda fuera de la vista mientras se recorre el movimiento. Altura fija y sin
                partir, para no mover los botones (se perdería la pulsación mantenida). */}
            <dl className={`grid grid-cols-4 gap-1 rounded-md border border-borde bg-panel px-2 py-0.5 font-mono tabular-nums`} data-testid="lectura-rapida">
              {(
                [
                  ['Ángulo', Number.isFinite(anguloFiltrado) ? `${grados(anguloFiltrado)}°` : '—', 'rapida-angulo'],
                  ['Relativo', cero && Number.isFinite(anguloFiltrado) ? `${grados(relativoAlCero(anguloFiltrado, cero))}°` : '—', 'rapida-relativo'],
                  ['°/s', valorEn(filtrado.derivadas.velocidad, mostrado, 1), 'rapida-velocidad'],
                  ['°/s²', valorEn(filtrado.derivadas.aceleracion, mostrado, 0), 'rapida-aceleracion'],
                ] as const
              ).map(([etiqueta, texto, id]) => (
                <div key={id} className="min-w-0 text-center">
                  <dt className="truncate text-[0.65rem] leading-tight text-texto-2">{etiqueta}</dt>
                  <dd className="truncate text-sm leading-tight whitespace-nowrap" data-testid={id}>{texto}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2 lg:order-2">
              <BotonPaso etiqueta={`Retroceder ${SALTO} frames`} accion={() => mover(-SALTO)}>
                <ChevronDoubleLeftIcon className="size-6" />
              </BotonPaso>
              <BotonPaso etiqueta="Frame anterior" accion={() => mover(-1)}>
                <ChevronLeftIcon className="size-7" />
              </BotonPaso>
              <BotonPaso etiqueta="Frame siguiente" accion={() => mover(1)}>
                <ChevronRightIcon className="size-7" />
              </BotonPaso>
              <BotonPaso etiqueta={`Avanzar ${SALTO} frames`} accion={() => mover(SALTO)}>
                <ChevronDoubleRightIcon className="size-6" />
              </BotonPaso>
            </div>
          </div>

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
            <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Marcadores</h2>
                <span className="text-sm text-texto-2">pierna {lado === 'izq' ? 'izquierda' : 'derecha'} (la que ve la cámara)</span>
              </div>

              <SelectorMarcadores marcadores={modelo.marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={siguiendo} onElegir={setSeleccionado} />

              <p className="text-sm text-texto-2">
                {siguiendo
                  ? 'Siguiendo los gomets…'
                  : seleccionado && colocarAOjo
                    ? `A ojo: el ${nombreCorto(modelo.marcadores.find((x) => x.id === seleccionado)!.nombre).toLowerCase()} queda justo donde sueltas el dedo, sin ajustarse a ningún gomet. Usa la lupa para afinar.`
                    : seleccionado
                      ? `Toca el ${nombreCorto(modelo.marcadores.find((x) => x.id === seleccionado)!.nombre).toLowerCase()} en la imagen. Mantén el dedo para ver la lupa: cuando el gomet salga rodeado por un anillo, suelta y el marcador irá a su centro.`
                      : listoParaSeguir
                        ? 'Los tres marcadores están en este frame: ya puedes seguir. Para corregir uno, elígelo y arrástralo con la lupa.'
                        : 'Elige un marcador para colocarlo o corregirlo en este frame.'}
              </p>

              <InterruptorAOjo activo={colocarAOjo} deshabilitado={siguiendo} onCambiar={() => setColocarAOjo((v) => !v)} />

              {/* Quitar una marca a mano equivocada de cualquier marcador, en este frame, sin elegirlo antes. */}
              {marcasManualesAqui.length > 0 && !siguiendo && (
                <div className="flex flex-wrap gap-2">
                  <BotonesQuitarManual marcas={marcasManualesAqui} siguiendo={siguiendo} frame={mostrado} onQuitar={quitarManual} claseExtra="" />
                </div>
              )}

              <AvisoAnclas frames={framesAnclas} siguiendo={siguiendo} onQuitar={quitarMarcasPosteriores} />

              <BotonSeguir siguiendo={siguiendo} progreso={progresoSeguimiento} listo={listoParaSeguir} onSeguir={seguirDesdeAqui} onParar={pararSeguimiento} />

              {aviso && (
                <div className="flex flex-col gap-2 rounded-md border border-acento/50 p-3 text-sm" role="status">
                  <p data-testid="aviso">{aviso.texto}</p>
                  {aviso.detalle && (
                    <details className="text-texto-2">
                      <summary className="cursor-pointer">Por qué (para diagnosticar)</summary>
                      <pre className="mt-1 font-mono text-xs whitespace-pre-wrap">{aviso.detalle}</pre>
                    </details>
                  )}
                  {aviso.irA !== undefined && <BotonIrAlHueco frame={aviso.irA} onIr={ir} />}
                </div>
              )}

              {!siguiendo && (huecosCortos.length > 0 || hayInterpolados) && (
                <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="huecos-cortos">
                  <AccionesHuecos huecosCortos={huecosCortos.length} hayInterpolados={hayInterpolados} onRellenar={rellenarHuecosCortos} onQuitarInterpolados={quitarInterpolados} />
                </div>
              )}

              <ControlTrayectoria
                activa={trayectoriaCompleta}
                onActiva={setTrayectoriaCompleta}
                marcadores={modelo.marcadores.map((mk, k) => ({ id: mk.id, nombre: nombreCorto(mk.nombre), color: COLORES_MARCADOR[k % COLORES_MARCADOR.length]! }))}
                elegidos={conTrayectoria}
                onElegir={(id) =>
                  setConTrayectoria((c) => {
                    const n = new Set(c)
                    if (!n.delete(id)) n.add(id)
                    return n
                  })
                }
              />

              <div className="flex items-baseline justify-between border-t border-borde pt-3">
                <span className="text-texto-2">{nombreCorto(articulacion.nombre.replace(/\s*\(.*\)$/, ''))}</span>
                <span className="font-mono text-2xl" data-testid="angulo">
                  {Number.isNaN(angulo) ? '—' : `${grados(angulo)}°`}
                  {anguloRedondeado !== 0 && !Number.isNaN(angulo) && (
                    <span className="ml-2 text-sm text-texto-2">{anguloRedondeado > 0 ? articulacion.positivo : articulacion.negativo}</span>
                  )}
                </span>
              </div>
            </section>
          </PanelPestana>

          <PanelPestana id="analisis" activa={pestana === 'analisis'}>
            <PanelFiltro
              ajustes={ajustes}
              onCambiar={cambiarAjustes}
              corte={filtrado.corte}
              fs={filtrado.fs}
              tramosCortos={filtrado.tramosCortos}
              anguloTexto={Number.isNaN(anguloFiltrado) ? '—' : `${grados(anguloFiltrado)}°`}
              deshabilitado={siguiendo}
            />

            <PanelCinematica
              angulo={anguloFiltrado}
              relativo={cero ? relativoAlCero(anguloFiltrado, cero) : NaN}
              velocidad={mostrado === null ? NaN : (filtrado.derivadas.velocidad[mostrado] ?? NaN)}
              aceleracion={mostrado === null ? NaN : (filtrado.derivadas.aceleracion[mostrado] ?? NaN)}
              marcadores={modelo.marcadores.map((mk, k) => {
                const v = filtrado.velocidades.get(mk.id)
                return {
                  id: mk.id,
                  nombre: nombreCorto(mk.nombre),
                  color: COLORES_MARCADOR[k % COLORES_MARCADOR.length]!,
                  velocidad: mostrado === null || !v ? NaN : (v.modulo[mostrado] ?? NaN),
                  unidad: v?.unidad ?? 'px/s',
                }
              })}
              tramo={tramoEstatico}
              cero={cero}
              t={t}
              t0={tabla.tiempos[0] ?? 0}
              tn={tabla.tiempos[total - 1] ?? 0}
              onTramo={cambiarTramo}
              onPrimeros={() => cambiarTramo(tramoInicial(tabla.tiempos))}
              deshabilitado={siguiendo}
            />

            <PanelExportar
              generar={generarCsv}
              resumen={`${total} frames · ${modelo.marcadores.length} marcadores · ${
                calibracion ? 'posiciones en px y en m, velocidades en m/s' : 'sin escala: todo en píxeles'
              }${orientacion.plano === articulacion.plano ? '' : ' · sin ángulo (la articulación es de otro plano)'}`}
              deshabilitado={siguiendo}
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
