import { useEffect, useRef, useState } from 'react'
import { FilmIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { OrientacionVista } from '../../core/geometria/canonico'
import { claveHuella, type HuellaArchivo } from '../../core/persistencia/huella'
import type { VideoAbierto } from '../../media/video'
import ElegirOrientacion from '../ElegirOrientacion'
import { huellaDe } from '../sesion'

interface Props {
  /** Huellas de las vistas que ya hay: el mismo archivo no vale como segunda vista. */
  readonly existentes: readonly HuellaArchivo[]
  /** La vista ya está lista para entrar en la sesión. */
  readonly onAnadir: (video: VideoAbierto, orientacion: OrientacionVista) => void
}

/**
 * Pestaña «Vídeo»: abrir la segunda vista de la sesión (otro vídeo del mismo movimiento, p. ej. de frente si la primera
 * es de perfil). Se elige el archivo, se dice cómo se ve a la persona y entra como vista B. El vídeo se lee igual que el
 * primero: nada sale del dispositivo.
 */
export default function AnadirVista({ existentes, onAnadir }: Props) {
  const selector = useRef<HTMLInputElement>(null)
  const [cargando, setCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El vídeo ya abierto, a la espera de que se diga cómo se ve a la persona.
  const [pendiente, setPendienteEstado] = useState<VideoAbierto | null>(null)
  // El mismo vídeo pendiente, para cerrarlo si el componente se desmonta (se cambia de vídeo o se sale del visor) antes de
  // decir cómo se ve a la persona: si no, se quedaba abierto. `montado` evita dejarlo pendiente si la lectura acaba después.
  const pendienteRef = useRef<VideoAbierto | null>(null)
  const montado = useRef(true)
  const setPendiente = (v: VideoAbierto | null) => {
    pendienteRef.current = v
    setPendienteEstado(v)
  }
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      void pendienteRef.current?.cerrar()
      pendienteRef.current = null
    }
  }, [])

  const abrir = async (archivo: File) => {
    setError(null)
    setCargando(archivo.name)
    let video: VideoAbierto | null = null
    try {
      const { VideoAbierto } = await import('../../media/video')
      video = await VideoAbierto.abrir(archivo)
      if (!montado.current) {
        void video.cerrar()
        return
      }
      const clave = claveHuella(huellaDe(video))
      if (existentes.some((h) => claveHuella(h) === clave)) {
        void video.cerrar()
        setError(`«${archivo.name}» es el mismo vídeo que ya está abierto: elige el de la otra cámara.`)
        return
      }
      setPendiente(video)
    } catch (e) {
      void video?.cerrar()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(null)
    }
  }

  const cancelar = () => {
    void pendiente?.cerrar()
    setPendiente(null)
  }

  if (pendiente) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="anadir-vista-orientacion">
        <p className="text-sm text-texto-2">
          Segunda vista: <span className="font-mono">{pendiente.info.nombre}</span>
        </p>
        <ElegirOrientacion
          conFrontal
          onElegir={(o) => {
            const video = pendiente
            setPendiente(null)
            onAnadir(video, o)
          }}
        />
        <button type="button" onClick={cancelar} className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-2 text-texto-2">
          <XMarkIcon className="size-5" /> Cancelar
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
      <h2 className="text-xs tracking-wider text-texto-2 uppercase">Segunda vista</h2>
      <p className="text-sm text-texto-2">
        Añade el vídeo de otra cámara del mismo movimiento (por ejemplo, de frente si este es de perfil). Se marca y se sigue en cada vista por separado;
        el cursor y la gráfica las llevan juntas.
      </p>
      <input
        ref={selector}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        data-testid="archivo-segunda-vista"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (archivo) void abrir(archivo)
        }}
      />
      <button
        type="button"
        disabled={cargando !== null}
        onClick={() => selector.current?.click()}
        className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40"
      >
        <FilmIcon className="size-5" /> Añadir la segunda vista
      </button>
      {cargando && <p className="text-sm text-texto-2">Leyendo «{cargando}»…</p>}
      {error && <p className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">{error}</p>}
    </section>
  )
}
