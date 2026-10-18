import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, FilmIcon } from '@heroicons/react/24/outline'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { TramoEstatico } from '../core/articulaciones/cero'
import type { AjustesFiltro } from '../core/filtros/tramos'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../core/modelo/tipos'
import type { CabeceraSesion } from '../core/persistencia/esquema'
import { diferenciasHuella } from '../core/persistencia/huella'
import { desempaquetarTrayectoria } from '../core/persistencia/trayectorias'
import type { VideoAbierto } from '../media/video'
import { buscarPorHuella, leerSesion } from '../persistencia/almacen'
import Compatibilidad from './compatibilidad'
import ElegirOrientacion from './ElegirOrientacion'
import RecuperarSesion, { type Candidata } from './RecuperarSesion'
import SesionesGuardadas from './SesionesGuardadas'
import { fechaCorta, huellaDe, textoResumen } from './sesion'
import type { SesionAbierta } from './visor/useGuardado'
// El visor (con la gráfica y uPlot) solo se descarga al abrir un vídeo.
const Visor = lazy(() => import('./Visor'))

type Estado =
  | { fase: 'inicio'; error?: string }
  | { fase: 'cargando'; nombre: string }
  | { fase: 'recuperar'; video: VideoAbierto; apertura: number; candidatas: Candidata[]; ocupado?: boolean; error?: string }
  | { fase: 'orientacion'; video: VideoAbierto; apertura: number; aviso?: string }
  | {
      fase: 'visor'
      video: VideoAbierto
      apertura: number
      orientacion: OrientacionVista
      sesion: SesionAbierta
      /** Solo al recuperar: modelo y trayectorias guardados. */
      modelo?: ModeloMarcadores
      inicial?: Map<IdMarcador, (Muestra2D | undefined)[]>
      filtro?: AjustesFiltro | null
      ceros?: Readonly<Record<string, TramoEstatico>>
      aviso?: string
    }

const NOMBRE_DIFERENCIA = { nombre: 'nombre', tamano: 'tamaño', duracion: 'duración', frames: 'número de frames' } as const

/** Sesión nueva para el vídeo abierto (con una sola vista hasta la fase 3). */
const sesionNueva = (video: VideoAbierto): SesionAbierta => ({
  id: crypto.randomUUID(),
  nombre: video.info.nombre,
  creada: new Date().toISOString(),
  vistaId: 'v1',
})

/** Lee una sesión guardada y prepara el visor tal como se dejó. */
async function prepararRecuperacion(video: VideoAbierto, cabecera: CabeceraSesion) {
  const { datos } = await leerSesion(cabecera.id)
  const vista = cabecera.vistas[0]!
  const total = video.tabla.tiempos.length
  const inicial = new Map<IdMarcador, (Muestra2D | undefined)[]>()
  for (const mk of cabecera.modelo.marcadores) inicial.set(mk.id, desempaquetarTrayectoria(datos.trayectorias[vista.id]![mk.id]!, total))
  return {
    orientacion: vista.orientacion,
    sesion: { id: cabecera.id, nombre: cabecera.nombre, creada: cabecera.creada, vistaId: vista.id },
    modelo: cabecera.modelo,
    inicial,
    filtro: cabecera.filtro,
    ceros: vista.ceros,
    aviso: `Trabajo recuperado tal como se guardó el ${fechaCorta(cabecera.actualizada)}: ${textoResumen(cabecera)}.`,
  }
}

export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' })
  const selector = useRef<HTMLInputElement>(null)
  // Identifica cada apertura de un vídeo: el visor se monta de cero aunque se
  // vuelva a abrir un archivo con el mismo nombre (antes la clave era el nombre).
  const aperturas = useRef(0)
  // Sesión que se quiere continuar desde la lista: el archivo elegido debe ser su vídeo.
  const objetivo = useRef<CabeceraSesion | null>(null)
  const videoActual = estado.fase === 'recuperar' || estado.fase === 'orientacion' || estado.fase === 'visor' ? estado.video : null

  // Cierra el vídeo anterior al cambiar de vídeo o al salir.
  useEffect(() => {
    return () => void videoActual?.cerrar()
  }, [videoActual])

  const cargar = useCallback(async (archivo: File, buscada: CabeceraSesion | null) => {
    setEstado({ fase: 'cargando', nombre: archivo.name })
    let video: VideoAbierto | null = null
    try {
      // Mediabunny solo se descarga al abrir el primer vídeo: la portada carga rápido.
      const { VideoAbierto } = await import('../media/video')
      video = await VideoAbierto.abrir(archivo)
      const huella = huellaDe(video)
      const apertura = ++aperturas.current
      if (buscada) {
        // «Continuar» desde la lista: solo vale el vídeo de esa sesión.
        const guardada = buscada.vistas[0]!.huella
        const distinto = diferenciasHuella(guardada, huella).filter((d) => d !== 'nombre')
        if (distinto.length) {
          void video.cerrar()
          setEstado({
            fase: 'inicio',
            error: `«${archivo.name}» no es el vídeo de la sesión «${buscada.nombre}»: cambia ${distinto.map((d) => NOMBRE_DIFERENCIA[d]).join(', ')}. Elige el mismo archivo con que se trabajó.`,
          })
          return
        }
        setEstado({ fase: 'visor', video, apertura, ...(await prepararRecuperacion(video, buscada)) })
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
      setEstado({ fase: 'visor', video, apertura, ...(await prepararRecuperacion(video, cabecera)) })
    } catch (e) {
      setEstado({ fase: 'recuperar', video, apertura, candidatas, error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const elegirArchivo = (buscada: CabeceraSesion | null) => {
    objetivo.current = buscada
    selector.current?.click()
  }

  const botonCargar = (
    <button
      type="button"
      onClick={() => elegirArchivo(null)}
      disabled={estado.fase === 'cargando'}
      className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
    >
      {videoActual ? <ArrowPathIcon className="size-5" /> : <FilmIcon className="size-5" />}
      {videoActual ? 'Cambiar vídeo' : 'Cargar vídeo'}
    </button>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">
          dual<span className="text-acento">kinema</span>
        </h1>
        {videoActual && botonCargar}
      </header>

      <input
        ref={selector}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (archivo) void cargar(archivo, objetivo.current)
          objetivo.current = null
        }}
      />

      {(estado.fase === 'inicio' || estado.fase === 'cargando') && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <p className="text-texto-2">
            Análisis cinemático diferido a partir de vídeo con marcadores. Todo se procesa en este dispositivo: los
            vídeos nunca salen de él.
          </p>
          {botonCargar}
          {estado.fase === 'cargando' && <p className="text-texto-2">Leyendo «{estado.nombre}»…</p>}
          {estado.fase === 'inicio' && estado.error && (
            <p className="rounded-md border border-red-400/50 p-3 text-red-300">{estado.error}</p>
          )}
          <Compatibilidad />
          <SesionesGuardadas ocupado={estado.fase === 'cargando'} onContinuar={(c) => elegirArchivo(c)} />
        </div>
      )}

      {estado.fase === 'recuperar' && (
        <div className="mx-auto w-full max-w-xl">
          <RecuperarSesion
            nombre={estado.video.info.nombre}
            candidatas={estado.candidatas}
            ocupado={!!estado.ocupado}
            error={estado.error}
            onRecuperar={(c) => void recuperar(estado.video, estado.apertura, estado.candidatas, c)}
            onNueva={() => setEstado({ fase: 'orientacion', video: estado.video, apertura: estado.apertura })}
          />
        </div>
      )}

      {estado.fase === 'orientacion' && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {estado.aviso && <p className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">{estado.aviso}</p>}
          <ElegirOrientacion
            onElegir={(orientacion) =>
              setEstado({ fase: 'visor', video: estado.video, apertura: estado.apertura, orientacion, sesion: sesionNueva(estado.video) })
            }
          />
        </div>
      )}

      {estado.fase === 'visor' && (
        <Suspense fallback={<p className="text-texto-2">Cargando el visor…</p>}>
          <Visor
            key={estado.apertura}
            video={estado.video}
            orientacion={estado.orientacion}
            sesion={estado.sesion}
            modelo={estado.modelo}
            inicial={estado.inicial}
            filtro={estado.filtro}
            ceros={estado.ceros}
            avisoInicial={estado.aviso}
          />
        </Suspense>
      )}

      <footer className="mt-auto font-mono text-xs text-texto-2">
        {__RAMA__} · {__COMMIT__}
      </footer>
    </main>
  )
}
