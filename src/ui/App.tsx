import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Fuente } from '../core/pose/catalogo'
import { ArrowLeftIcon, ArrowPathIcon, BookOpenIcon, DevicePhoneMobileIcon, FilmIcon, Square2StackIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { OrientacionVista } from '../core/geometria/canonico'
import { codigoDeBusqueda } from '../core/sala/codigo'
import type { AjustesFiltro } from '../core/filtros/tramos'
import type { ModeloMarcadores } from '../core/modelo/tipos'
import type { CabeceraSesion, DatosSesion } from '../core/persistencia/esquema'
import { diferenciasHuella } from '../core/persistencia/huella'
import type { VideoAbierto } from '../media/video'
import { buscarPorHuella, leerSesion } from '../persistencia/almacen'
import Compatibilidad from './compatibilidad'
import Claqueta from './Claqueta'
import ElegirOrientacion from './ElegirOrientacion'
import FaltanVideos from './FaltanVideos'
import { GlosarioProvider, useGlosario } from './glosario/Glosario'
import { armarSesion, vistaDeHuella, vistasQueFaltan, type Abiertos } from './recuperacion'
import RecuperarSesion, { type Candidata } from './RecuperarSesion'
import SesionesGuardadas from './SesionesGuardadas'
import { huellaDe } from './sesion'
import { useVersionNueva } from './useVersionNueva'
import { ProveedorVolver, type Volver } from './volverCabecera'
import type { SesionAbierta } from './visor/useGuardado'
import type { EntradaVista } from './visor/vistas'
// El visor (con la gráfica y uPlot) solo se descarga al abrir un vídeo.
const Visor = lazy(() => import('./Visor'))
// El laboratorio de la fase 4 (qué da este móvil al grabar) solo existe con `?laboratorio` y solo se descarga entonces.
const Laboratorio = lazy(() => import('./Laboratorio'))
const HAY_LABORATORIO = new URLSearchParams(location.search).has('laboratorio')
// Grabar con la cámara del móvil (fase 4, paso 2): solo se descarga al entrar, y solo se ofrece si el navegador puede.
const Grabar = lazy(() => import('./Grabar'))
// Grabar con dos móviles (fase 4, paso 4): emparejar por código o QR. Un QR lleva `?sala=CÓDIGO` y abre la app ya en la sala.
const Emparejar = lazy(() => import('./Emparejar'))
const PUEDE_GRABAR =
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof globalThis.VideoEncoder === 'function' &&
  typeof (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor === 'function'
// Pitido de claqueta (fase 4, paso 6): el pitido de la grabación doble desde un solo móvil, para cámaras arrancadas a mano.
const HAY_AUDIO = typeof globalThis.AudioContext === 'function'

type Estado =
  | { fase: 'inicio'; error?: string }
  /** Grabar con la cámara de este móvil (fase 4). */
  | { fase: 'grabar' }
  /** Grabar con dos móviles: la sala (con su código si ya se ha creado o se llega por el QR). */
  | { fase: 'emparejar'; codigo: string | null }
  | { fase: 'cargando'; nombre: string }
  /** Abrir una grabación doble (fase 4): ya hay un vídeo de la pareja; falta elegir el otro. */
  | { fase: 'doble'; primero: File; error?: string }
  | { fase: 'recuperar'; video: VideoAbierto; apertura: number; candidatas: Candidata[]; ocupado?: boolean; error?: string }
  | { fase: 'orientacion'; video: VideoAbierto; apertura: number; aviso?: string }
  /** Una sesión de varias vistas, con parte de sus vídeos abiertos: faltan los demás. */
  | { fase: 'faltan'; apertura: number; cabecera: CabeceraSesion; datos: DatosSesion; abiertos: Abiertos; ocupado?: boolean; error?: string }
  | {
      fase: 'visor'
      apertura: number
      /** Las vistas, la de referencia primero. */
      vistas: readonly EntradaVista[]
      sesion: SesionAbierta
      /** Solo al recuperar: el modelo y el filtro guardados. */
      modelo?: ModeloMarcadores
      filtro?: AjustesFiltro | null
      aviso?: string
      /** Pestaña con que empezar (una grabación doble abre en «Vídeo», con la sincronía propuesta). */
      pestana?: string
    }

const NOMBRE_DIFERENCIA = { nombre: 'nombre', tamano: 'tamaño', duracion: 'duración', frames: 'número de frames' } as const

const ID_VISTA_REFERENCIA = 'v1'

/** Sesión nueva para el vídeo abierto, que es su vista de referencia. */
const sesionNueva = (video: VideoAbierto): SesionAbierta => ({
  id: crypto.randomUUID(),
  nombre: video.info.nombre,
  creada: new Date().toISOString(),
  referencia: ID_VISTA_REFERENCIA,
})

/**
 * Lee una sesión guardada. Con todos sus vídeos abiertos, el visor continúa tal como se dejó; si le faltan vídeos, se pide
 * elegirlos (`faltan`).
 */
async function leerParaRecuperar(video: VideoAbierto, elegida: CabeceraSesion, apertura: number): Promise<Estado> {
  // La cabecera recién leída, no la de la lista: otra pestaña puede haberla cambiado
  // (escala, cero, filtro) y mezclarla con las trayectorias nuevas las desemparejaría.
  const { cabecera, datos } = await leerSesion(elegida.id)
  const vista = vistaDeHuella(cabecera, huellaDe(video), {})
  if (!vista) throw new Error('Este vídeo ya no corresponde a ninguna vista de esa sesión.')
  return estadoDeSesion(cabecera, datos, { [vista.id]: video }, apertura)
}

/** El visor, si ya están todos los vídeos de la sesión; si no, la pantalla que los pide. */
function estadoDeSesion(cabecera: CabeceraSesion, datos: DatosSesion, abiertos: Abiertos, apertura: number): Estado {
  if (vistasQueFaltan(cabecera, abiertos).length) return { fase: 'faltan', apertura, cabecera, datos, abiertos }
  const vistas = Object.keys(abiertos).length
  for (const v of Object.values(abiertos)) v.repartirMemoria(vistas)
  return { fase: 'visor', apertura, ...armarSesion(cabecera, datos, abiertos) }
}

/** Los vídeos que mantiene abiertos un estado de la app. */
function videosDe(e: Estado): VideoAbierto[] {
  if (e.fase === 'recuperar' || e.fase === 'orientacion') return [e.video]
  if (e.fase === 'faltan') return Object.values(e.abiertos)
  if (e.fase === 'visor') return e.vistas.map((v) => v.video)
  return []
}

/** Botón de la cabecera: abre el glosario (sin entrada concreta). */
function BotonGlosario({ conVideo }: { conVideo: boolean }) {
  const { abrir } = useGlosario()
  return (
    <button
      type="button"
      onClick={() => abrir()}
      title="Glosario"
      data-testid="abrir-glosario"
      className={`flex items-center justify-center gap-2 rounded-md border border-borde text-texto ${conVideo ? 'max-lg:size-11 lg:px-4 lg:py-2' : 'size-11 sm:w-auto sm:px-4 sm:py-2'}`}
    >
      <BookOpenIcon className="size-5" />
      <span className={conVideo ? 'max-lg:sr-only' : 'max-sm:sr-only'}>Glosario</span>
    </button>
  )
}

function Aplicacion() {
  const [estado, setEstado] = useState<Estado>(() => {
    const codigo = PUEDE_GRABAR ? codigoDeBusqueda(location.search) : null
    return codigo ? { fase: 'emparejar', codigo } : { fase: 'inicio' }
  })
  // El botón de volver de la cabecera (en el móvil, de una herramienta o del vídeo grande a la pantalla principal): lo pide el
  // visor, que sabe a dónde se vuelve, y la cabecera lo pinta en lugar del título.
  const [volver, setVolver] = useState<Volver | null>(null)
  const cabecera = useRef<HTMLElement>(null)
  // Dónde acaba la cabecera (`--alto-cabecera`): el vídeo grande empieza ahí cuando la cabecera se queda a la vista.
  useLayoutEffect(() => {
    const el = cabecera.current
    if (!el) return
    const medir = () => document.documentElement.style.setProperty('--alto-cabecera', `${Math.ceil(el.getBoundingClientRect().bottom)}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
      document.documentElement.style.removeProperty('--alto-cabecera')
    }
  }, [])
  const selector = useRef<HTMLInputElement>(null)
  const selectorDoble = useRef<HTMLInputElement>(null)
  const { nueva: versionNueva, descartar: descartarVersion } = useVersionNueva()
  // Identifica cada apertura de un vídeo: el visor se monta de cero aunque se
  // vuelva a abrir un archivo con el mismo nombre (antes la clave era el nombre).
  const aperturas = useRef(0)
  // Sesión que se quiere continuar desde la lista: el archivo elegido debe ser su vídeo.
  const objetivo = useRef<CabeceraSesion | null>(null)
  // El archivo que se elija es para una sesión de varias vistas que pide el vídeo que le falta.
  const paraFaltante = useRef(false)
  const hayVideo = videosDe(estado).length > 0

  // Cierra los vídeos que dejan de estar en uso (al cambiar de vídeo, al salir del visor) y todos al desmontar. Las vistas
  // de una sesión comparten estado: un vídeo que pasa de una pantalla a otra (recuperar → faltan → visor) sigue abierto.
  const enUso = useRef<ReadonlySet<VideoAbierto>>(new Set())
  useEffect(() => {
    const ahora = new Set(videosDe(estado))
    for (const v of enUso.current) if (!ahora.has(v)) void v.cerrar()
    enUso.current = ahora
  }, [estado])
  useEffect(
    () => () => {
      for (const v of enUso.current) void v.cerrar()
    },
    [],
  )

  const cargar = useCallback(async (archivo: File, buscada: CabeceraSesion | null) => {
    setEstado({ fase: 'cargando', nombre: archivo.name })
    // Desde ya: una recuperación a medias del vídeo anterior deja de valer.
    const apertura = ++aperturas.current
    let video: VideoAbierto | null = null
    try {
      // Mediabunny solo se descarga al abrir el primer vídeo: la portada carga rápido.
      const { VideoAbierto } = await import('../media/video')
      video = await VideoAbierto.abrir(archivo)
      const huella = huellaDe(video)
      if (buscada) {
        // «Continuar» desde la lista: solo vale un vídeo de esa sesión.
        if (!vistaDeHuella(buscada, huella, {})) {
          void video.cerrar()
          const distinto = diferenciasHuella(buscada.vistas[0]!.huella, huella).filter((d) => d !== 'nombre')
          setEstado({
            fase: 'inicio',
            error:
              buscada.vistas.length === 1
                ? `«${archivo.name}» no es el vídeo de la sesión «${buscada.nombre}»: cambia ${distinto.map((d) => NOMBRE_DIFERENCIA[d]).join(', ')}. Elige el mismo archivo con que se trabajó.`
                : `«${archivo.name}» no es ninguno de los vídeos de la sesión «${buscada.nombre}». Elige uno de los archivos con que se trabajó.`,
          })
          return
        }
        setEstado(await leerParaRecuperar(video, buscada, apertura))
        return
      }
      // Si no se puede leer lo guardado, se abre igual (el vídeo no depende de
      // ello), pero se dice: si no, parece que no había nada y se empieza otra sesión sin saberlo.
      let candidatas: Candidata[] = []
      let aviso: string | undefined
      try {
        candidatas = await buscarPorHuella(huella)
      } catch (e) {
        aviso = `No se ha podido comprobar si hay trabajo guardado de este vídeo (${e instanceof Error ? e.message : String(e)}). Si lo había, vuelve a la portada y usa «Continuar» en la lista.`
      }
      setEstado(candidatas.length ? { fase: 'recuperar', video, apertura, candidatas } : { fase: 'orientacion', video, apertura, aviso })
    } catch (e) {
      void video?.cerrar()
      setEstado({ fase: 'inicio', error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const recuperar = useCallback(async (video: VideoAbierto, apertura: number, candidatas: Candidata[], cabecera: CabeceraSesion) => {
    setEstado({ fase: 'recuperar', video, apertura, candidatas, ocupado: true })
    try {
      const siguiente = await leerParaRecuperar(video, cabecera, apertura)
      // Mientras se leía se pudo cambiar de vídeo: entonces esto ya no vale.
      if (aperturas.current !== apertura) return
      setEstado(siguiente)
    } catch (e) {
      if (aperturas.current !== apertura) return
      setEstado({ fase: 'recuperar', video, apertura, candidatas, error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  /**
   * Abre los dos vídeos de una grabación doble (fase 4, paso 7): comprueba por sus metadatos que son pareja, pone el de
   * perfil como referencia con la orientación de cada uno y propone el desfase (pitido o reloj: `core/sincronia/doble.ts`).
   * Si ya hay una sesión de esos dos vídeos, la recupera.
   */
  const abrirDoble = useCallback(async (archivos: readonly [File, File]) => {
    setEstado({ fase: 'cargando', nombre: 'la grabación doble' })
    const apertura = ++aperturas.current
    const abiertos: VideoAbierto[] = []
    // Otra apertura ha empezado después: esta se abandona y cierra lo que abrió.
    const sustituida = () => {
      if (aperturas.current === apertura) return false
      for (const v of abiertos) void v.cerrar()
      return true
    }
    try {
      const [{ VideoAbierto }, { leerMetadatosArchivo }, { idaVueltaDePareja }, { parejaDoble, TEXTO_MOTIVO_PAREJA }, { desfaseDeReloj, proponerDesfase }] = await Promise.all([
        import('../media/video'),
        import('../media/grabaciones'),
        import('../media/pitido'),
        import('../core/grabacion/pareja'),
        import('../core/sincronia/doble'),
      ])
      const metas = await Promise.all(archivos.map(leerMetadatosArchivo))
      const pareja = parejaDoble(metas[0]!, metas[1]!)
      if (!pareja.ok) {
        if (sustituida()) return
        const quien = pareja.cual === undefined ? 'Estos dos vídeos no son una grabación doble' : `«${archivos[pareja.cual].name}» no sirve`
        setEstado({ fase: 'inicio', error: `${quien}: ${TEXTO_MOTIVO_PAREJA[pareja.motivo]}. Ábrelos con «Cargar vídeo» y añade el otro como segunda vista.` })
        return
      }
      const iRef = pareja.referencia
      const iVista = (1 - iRef) as 0 | 1
      const [dRef, dVista] = [pareja.doble[iRef], pareja.doble[iVista]]
      for (const i of [iRef, iVista]) abiertos.push(await VideoAbierto.abrir(archivos[i]))
      const [ref, otra] = abiertos as [VideoAbierto, VideoAbierto]
      if (sustituida()) return
      // ¿Ya se trabajó con esta pareja? Entonces se continúa donde se dejó.
      const candidatas = await buscarPorHuella(huellaDe(ref)).catch(() => [])
      for (const { cabecera } of candidatas) {
        const vRef = vistaDeHuella(cabecera, huellaDe(ref), {})
        const vOtra = vRef && vistaDeHuella(cabecera, huellaDe(otra), { [vRef.id]: ref })
        if (vRef && vOtra && cabecera.vistas.length === 2) {
          const { cabecera: c, datos } = await leerSesion(cabecera.id)
          if (sustituida()) return
          setEstado(estadoDeSesion(c, datos, { [vRef.id]: ref, [vOtra.id]: otra }, apertura))
          return
        }
      }
      const pitido =
        dRef.pitidos && dVista.pitidos
          ? await idaVueltaDePareja({ archivo: archivos[iRef], pitidos: dRef.pitidos }, { archivo: archivos[iVista], pitidos: dVista.pitidos }).catch(() => null)
          : null
      const propuesta = proponerDesfase(pitido, desfaseDeReloj(dRef, dVista))
      if (sustituida()) return
      for (const v of abiertos) v.repartirMemoria(2)
      setEstado({
        fase: 'visor',
        apertura,
        sesion: sesionNueva(ref),
        pestana: 'video',
        vistas: [
          { id: ID_VISTA_REFERENCIA, video: ref, orientacion: dRef.vista, desfase: 0, sincronia: { metodo: 'ninguna' } },
          { id: 'v2', video: otra, orientacion: dVista.vista, desfase: 0, sincronia: { metodo: 'ninguna' }, propuesta },
        ],
      })
    } catch (e) {
      for (const v of abiertos) void v.cerrar()
      if (aperturas.current !== apertura) return
      setEstado({ fase: 'inicio', error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  /** Archivos elegidos para una grabación doble: con los dos, se abre; con uno, se pide el otro. */
  const elegidosDoble = (archivos: File[]) => {
    const primero = estado.fase === 'doble' ? estado.primero : null
    const todos = primero ? [primero, ...archivos] : archivos
    if (todos.length >= 2) void abrirDoble([todos[0]!, todos[1]!])
    else if (todos.length === 1) setEstado({ fase: 'doble', primero: todos[0]! })
  }

  // Segunda vista de la sesión abierta: el vídeo ya está leído y se sabe cómo se ve a la persona. Las dos se reparten
  // la memoria de la caché de frames.
  const anadirVista = (video: VideoAbierto, orientacion: OrientacionVista, fuente: Fuente) => {
    if (estado.fase !== 'visor' || estado.vistas.length >= 2) {
      void video.cerrar()
      return
    }
    const vistas = [...estado.vistas, { id: 'v2', video, orientacion, desfase: 0, sincronia: { metodo: 'ninguna' as const }, fuente }]
    for (const v of vistas) v.video.repartirMemoria(vistas.length)
    setEstado({ ...estado, vistas })
  }

  const elegirArchivo = (buscada: CabeceraSesion | null) => {
    objetivo.current = buscada
    paraFaltante.current = false
    selector.current?.click()
  }

  // Una sesión de varias vistas pide los vídeos que faltan: el archivo elegido tiene que ser uno de ellos.
  const elegirFaltante = () => {
    paraFaltante.current = true
    selector.current?.click()
  }
  const abrirFaltante = async (archivo: File) => {
    if (estado.fase !== 'faltan') return
    const { apertura, cabecera, datos, abiertos } = estado
    setEstado({ ...estado, ocupado: true, error: undefined })
    let video: VideoAbierto | null = null
    try {
      const { VideoAbierto } = await import('../media/video')
      video = await VideoAbierto.abrir(archivo)
      if (aperturas.current !== apertura) {
        void video.cerrar()
        return
      }
      const vista = vistaDeHuella(cabecera, huellaDe(video), abiertos)
      if (!vista) {
        void video.cerrar()
        setEstado({ fase: 'faltan', apertura, cabecera, datos, abiertos, error: `«${archivo.name}» no es ninguno de los vídeos que faltan en la sesión «${cabecera.nombre}».` })
        return
      }
      setEstado(estadoDeSesion(cabecera, datos, { ...abiertos, [vista.id]: video }, apertura))
    } catch (e) {
      void video?.cerrar()
      // Como al acabar bien: si mientras tanto se abrió otra cosa, el error de esta apertura ya no toca.
      if (aperturas.current !== apertura) return
      setEstado({ fase: 'faltan', apertura, cabecera, datos, abiertos, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const botonDoble = (
    <button
      type="button"
      onClick={() => selectorDoble.current?.click()}
      disabled={estado.fase === 'cargando'}
      data-testid="abrir-doble"
      className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40"
    >
      <Square2StackIcon className="size-5" />
      Abrir la grabación doble
    </button>
  )

  // Botón de la portada (sin vídeo abierto). Con un vídeo abierto, el de cambiarlo va en la cabecera.
  const botonCargar = (
    <button
      type="button"
      onClick={() => elegirArchivo(null)}
      disabled={estado.fase === 'cargando'}
      className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
    >
      <FilmIcon className="size-5" />
      Cargar vídeo
    </button>
  )

  return (
    <ProveedorVolver value={setVolver}>
    {/* El visor aprovecha pantallas anchas (vídeo, gráfica y herramientas lado a lado); la portada y los diálogos, no. */}
    <main
      className={`mx-auto flex min-h-dvh flex-col px-4 pb-[calc(1.5rem+var(--alto-barra,0px))] lg:gap-6 lg:pt-6 lg:pb-6 ${
        hayVideo ? 'gap-3 pt-3' : 'gap-6 pt-6'
      } ${
        // En el móvil, el visor acaba justo sobre la barra fija y la página no se desplaza: debajo, solo el sitio de la barra.
        estado.fase === 'visor' ? 'max-w-[90rem] max-lg:pb-(--alto-barra)' : 'max-w-6xl'
      }`}
    >
      {/* Flotante (fixed, sobre todo): el aviso no ocupa sitio, así que no cambia el alto de la app ni mueve lo medido
          (vídeo, gráfica, barra). Se puede cerrar y no vuelve hasta que haya otra versión distinta. */}
      {versionNueva && (
        <div
          role="status"
          data-testid="version-nueva"
          className="fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-40 mx-auto flex max-w-xl items-center gap-2 rounded-md border border-acento/60 bg-panel px-3 py-2 text-sm shadow-lg"
        >
          <span className="min-w-0 flex-1">
            Hay una versión nueva.
            {estado.fase === 'visor' && ' El trabajo se guarda solo; al recargar tendrás que volver a abrir el vídeo.'}
          </span>
          <button type="button" onClick={() => location.reload()} className="shrink-0 rounded-md bg-acento px-3 py-1.5 font-medium text-fondo">
            Recargar
          </button>
          <button
            type="button"
            onClick={descartarVersion}
            aria-label="Cerrar el aviso"
            title="Más tarde"
            data-testid="version-nueva-cerrar"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-borde text-texto-2"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>
      )}

      {/* Con un vídeo abierto, la cabecera es baja en el móvil: el sitio es para el vídeo y la gráfica. Cambiar de vídeo
          se hace poco, así que su botón es secundario (sin el ámbar, que queda para lo que se está usando) y en el
          móvil solo lleva el icono. */}
      <header
        ref={cabecera}
        // Con el botón de volver a la vista, la cabecera queda por encima del vídeo grande (que empieza justo debajo de ella).
        className={`flex items-center justify-between gap-3 ${volver ? 'max-lg:relative max-lg:z-40 max-lg:bg-fondo' : 'flex-wrap'}`}
      >
        {volver ? (
          <button
            type="button"
            onClick={volver.onVolver}
            data-testid="volver-cabecera"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-acento px-3 text-sm text-acento"
          >
            <ArrowLeftIcon className="size-5 shrink-0" />
            <span className="truncate">{volver.texto}</span>
          </button>
        ) : (
          <h1 className={`font-serif ${hayVideo ? 'text-2xl lg:text-3xl' : 'text-3xl'}`}>
            dual<span className="text-acento">kinema</span>
          </h1>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <BotonGlosario conVideo={hayVideo} />
          {hayVideo && (
            <button
              type="button"
              onClick={() => elegirArchivo(null)}
              title="Cambiar vídeo"
              data-testid="cambiar-video"
              className="flex items-center justify-center gap-2 rounded-md border border-borde text-texto max-lg:size-11 lg:px-4 lg:py-2"
            >
              <ArrowPathIcon className="size-5" />
              <span className="max-lg:sr-only">Cambiar vídeo</span>
            </button>
          )}
        </div>
      </header>

      <input
        ref={selector}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (archivo && paraFaltante.current) void abrirFaltante(archivo)
          else if (archivo) void cargar(archivo, objetivo.current)
          objetivo.current = null
          paraFaltante.current = false
        }}
      />
      {/* Después del de siempre: las pruebas usan el primer input de archivo. */}
      <input
        ref={selectorDoble}
        type="file"
        multiple
        accept="video/mp4,.mp4"
        className="hidden"
        data-testid="selector-doble"
        onChange={(e) => {
          const archivos = [...(e.target.files ?? [])]
          e.target.value = ''
          if (archivos.length) elegidosDoble(archivos)
        }}
      />

      {(estado.fase === 'inicio' || estado.fase === 'cargando') && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <p className="text-texto-2">
            Análisis cinemático diferido a partir de vídeo con marcadores. Todo se procesa en este dispositivo: los
            vídeos nunca salen de él.
          </p>
          {botonCargar}
          {botonDoble}
          {PUEDE_GRABAR && (
            <button
              type="button"
              onClick={() => setEstado({ fase: 'grabar' })}
              disabled={estado.fase === 'cargando'}
              data-testid="ir-grabar"
              className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40"
            >
              <VideoCameraIcon className="size-5" />
              Grabar con este móvil
            </button>
          )}
          {PUEDE_GRABAR && (
            <button
              type="button"
              onClick={() => setEstado({ fase: 'emparejar', codigo: null })}
              disabled={estado.fase === 'cargando'}
              data-testid="ir-emparejar"
              className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40"
            >
              <DevicePhoneMobileIcon className="size-5" />
              Grabar con dos móviles
            </button>
          )}
          {HAY_AUDIO && <Claqueta />}
          {estado.fase === 'cargando' && <p className="text-texto-2">Leyendo «{estado.nombre}»…</p>}
          {estado.fase === 'inicio' && estado.error && (
            <p className="rounded-md border border-red-400/50 p-3 text-red-300">{estado.error}</p>
          )}
          <Compatibilidad />
          <SesionesGuardadas ocupado={estado.fase === 'cargando'} onContinuar={(c) => elegirArchivo(c)} />
          {HAY_LABORATORIO && (
            <Suspense fallback={<p className="text-texto-2">Cargando el laboratorio…</p>}>
              <Laboratorio alAbrir={(archivo) => void cargar(archivo, null)} />
            </Suspense>
          )}
        </div>
      )}

      {estado.fase === 'grabar' && (
        <Suspense fallback={<p className="text-texto-2">Cargando la cámara…</p>}>
          <Grabar
            alAbrir={(archivo) => void cargar(archivo, null)}
            alAbrirDoble={(archivo) => setEstado({ fase: 'doble', primero: archivo })}
            alSalir={() => setEstado({ fase: 'inicio' })}
          />
        </Suspense>
      )}

      {estado.fase === 'doble' && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="falta-doble">
          <h2 className="font-serif text-2xl">Abrir la grabación doble</h2>
          <p className="text-sm">
            Tienes «<span className="font-mono">{estado.primero.name}</span>». Elige el vídeo del otro móvil (el que te pasó por Quick Share, en Descargas).
          </p>
          <button type="button" onClick={() => selectorDoble.current?.click()} data-testid="elegir-otro-doble" className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo">
            <FilmIcon className="size-5" />
            Elegir el otro vídeo
          </button>
          <button type="button" onClick={() => setEstado({ fase: 'inicio' })} className="rounded-md border border-borde px-4 py-3 text-texto">
            Cancelar
          </button>
        </div>
      )}

      {estado.fase === 'emparejar' && (
        <Suspense fallback={<p className="text-texto-2">Cargando…</p>}>
          <Emparejar codigoInicial={estado.codigo} alSalir={() => setEstado({ fase: 'inicio' })} alAbrirDoble={(archivo) => setEstado({ fase: 'doble', primero: archivo })} />
        </Suspense>
      )}

      {estado.fase === 'recuperar' && (
        <div className="mx-auto w-full max-w-xl">
          <RecuperarSesion
            nombre={estado.video.info.nombre}
            huella={huellaDe(estado.video)}
            candidatas={estado.candidatas}
            ocupado={!!estado.ocupado}
            error={estado.error}
            onRecuperar={(c) => void recuperar(estado.video, estado.apertura, estado.candidatas, c)}
            onNueva={() => setEstado({ fase: 'orientacion', video: estado.video, apertura: estado.apertura })}
          />
        </div>
      )}

      {estado.fase === 'faltan' && (
        <div className="mx-auto w-full max-w-xl">
          <FaltanVideos
            nombreSesion={estado.cabecera.nombre}
            abiertos={Object.values(estado.abiertos).map((v) => v.info.nombre)}
            faltan={vistasQueFaltan(estado.cabecera, estado.abiertos)}
            ocupado={!!estado.ocupado}
            error={estado.error}
            onElegir={elegirFaltante}
            onCancelar={() => setEstado({ fase: 'inicio' })}
          />
        </div>
      )}

      {estado.fase === 'orientacion' && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {estado.aviso && <p className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">{estado.aviso}</p>}
          <ElegirOrientacion
            onElegir={(orientacion, fuente) =>
              setEstado({
                fase: 'visor',
                apertura: estado.apertura,
                sesion: sesionNueva(estado.video),
                vistas: [{ id: ID_VISTA_REFERENCIA, video: estado.video, orientacion, desfase: 0, sincronia: { metodo: 'ninguna' }, fuente }],
              })
            }
          />
        </div>
      )}

      {estado.fase === 'visor' && (
        <Suspense fallback={<p className="text-texto-2">Cargando el visor…</p>}>
          <Visor
            key={estado.apertura}
            vistas={estado.vistas}
            sesion={estado.sesion}
            modelo={estado.modelo}
            filtro={estado.filtro}
            avisoInicial={estado.aviso}
            onAnadirVista={anadirVista}
            pestanaInicial={estado.pestana}
          />
        </Suspense>
      )}

      {/* En el visor del móvil la página no se desplaza: el pie va en la pestaña «Vídeo» (`pie-visor`). */}
      <footer className={`mt-auto font-mono text-xs text-texto-2 ${estado.fase === 'visor' ? 'max-lg:hidden' : ''}`} data-testid="pie">
        {__RAMA__} · {__COMMIT__}
      </footer>
    </main>
    </ProveedorVolver>
  )
}

/** La app, con el glosario disponible desde cualquier icono de información. */
export default function App() {
  return (
    <GlosarioProvider>
      <Aplicacion />
    </GlosarioProvider>
  )
}
