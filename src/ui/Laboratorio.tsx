import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  BeakerIcon,
  ClipboardDocumentIcon,
  FilmIcon,
  ShareIcon,
  StopIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { formatearInforme, type ValorInforme } from '../media/informe'
import {
  informeAlmacenamiento,
  informeAudio,
  informeCamaras,
  informeCodecs,
  informeEntorno,
  grabarPrueba,
  listarCamaras,
  type CamaraListada,
  type ModoExposicion,
} from '../media/laboratorio'

/*
 * Laboratorio (fase 4, paso 1; se abre con `?laboratorio`): qué da este móvil en Chrome antes de grabar con él. Un
 * informe de texto para pegar en el chat y una grabación de prueba que se abre en el visor. Todo local.
 */

const MODOS = [
  { id: '720p30', etiqueta: '1280×720, 30 fps', ancho: 1280, alto: 720, fps: 30 },
  { id: '1080p30', etiqueta: '1920×1080, 30 fps', ancho: 1920, alto: 1080, fps: 30 },
  { id: '1080p60', etiqueta: '1920×1080, 60 fps', ancho: 1920, alto: 1080, fps: 60 },
  { id: '4k30', etiqueta: '3840×2160, 30 fps', ancho: 3840, alto: 2160, fps: 30 },
] as const

const CODECS = [
  { id: 'auto', etiqueta: 'Automático (H.264, si no VP9…)' },
  { id: 'avc', etiqueta: 'H.264' },
  { id: 'hevc', etiqueta: 'HEVC / H.265' },
  { id: 'vp9', etiqueta: 'VP9' },
  { id: 'av1', etiqueta: 'AV1' },
] as const

/** Duración de la grabación de prueba (s). `?duracion=` la cambia (las pruebas e2e la acortan). */
const duracionDePrueba = (): number => {
  const d = Number(new URLSearchParams(location.search).get('duracion'))
  return Number.isFinite(d) && d >= 1 && d <= 60 ? d : 10
}

const EXPOSICIONES: readonly { id: ModoExposicion; etiqueta: string }[] = [
  { id: 'auto', etiqueta: 'Automáticos (como la app de cámara)' },
  { id: 'bloqueada', etiqueta: 'Bloqueados en lo que elija la cámara' },
  { id: 'corta', etiqueta: 'Exposición corta (1/120 s), más oscura' },
]

const estiloBoton = 'flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40'

export default function Laboratorio({ alAbrir }: { alAbrir: (archivo: File) => void }) {
  const [informe, setInforme] = useState<{ [seccion: string]: ValorInforme }>({})
  const [haciendo, setHaciendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [camaras, setCamaras] = useState<CamaraListada[]>([])
  const [camaraId, setCamaraId] = useState('')
  const [modo, setModo] = useState<(typeof MODOS)[number]['id']>('1080p30')
  const [exposicion, setExposicion] = useState<ModoExposicion>('auto')
  const [codec, setCodec] = useState<(typeof CODECS)[number]['id']>('auto')
  const [progreso, setProgreso] = useState<number | null>(null)
  const [flujo, setFlujo] = useState<MediaStream | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [copiado, setCopiado] = useState(false)
  const cancelar = useRef<AbortController | null>(null)
  const vista = useRef<HTMLVideoElement>(null)
  const [duracion] = useState(duracionDePrueba)

  useEffect(() => {
    if (vista.current) vista.current.srcObject = flujo
  }, [flujo])
  // Al salir, no dejar la cámara abierta.
  useEffect(() => () => cancelar.current?.abort(), [])

  const texto = useMemo(() => formatearInforme(informe), [informe])
  const poner = (titulo: string, datos: ValorInforme) => setInforme((i) => ({ ...i, [titulo]: datos }))

  async function medirTodo() {
    setError(null)
    try {
      setHaciendo('Entorno…')
      poner('Entorno', await informeEntorno())
      setHaciendo('Almacenamiento…')
      poner('Almacenamiento y pantalla', await informeAlmacenamiento())
      setHaciendo('Códecs…')
      poner('Códecs que codifica', await informeCodecs())
      setHaciendo('Micrófono…')
      poner('Micrófono sin procesar', await informeAudio())
      setHaciendo('Cámaras (da permiso si lo pide)…')
      poner('Cámaras', await informeCamaras(setHaciendo))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setHaciendo(null)
    }
  }

  async function elegirCamara() {
    setError(null)
    try {
      const lista = await listarCamaras()
      setCamaras(lista)
      setCamaraId((actual) => (lista.some((c) => c.id === actual) ? actual : ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function grabar() {
    const m = MODOS.find((x) => x.id === modo)!
    setError(null)
    setArchivo(null)
    setProgreso(0)
    const control = new AbortController()
    cancelar.current = control
    try {
      const r = await grabarPrueba({
        ancho: m.ancho,
        alto: m.alto,
        fps: m.fps,
        codec,
        exposicion,
        duracion,
        camaraId: camaraId || undefined,
        senal: control.signal,
        alProgreso: setProgreso,
        alFlujo: setFlujo,
      })
      poner('Grabación de prueba', r.informe)
      setArchivo(r.archivo)
    } catch (e) {
      const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setError(texto)
      // También en el informe: es lo que se pega, y sin esto un fallo de la grabación no llegaba a quien lo lee.
      poner('Grabación de prueba', { error: texto })
    } finally {
      setProgreso(null)
      cancelar.current = null
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se ha podido copiar: selecciona el texto y cópialo a mano.')
    }
  }

  async function compartir() {
    if (!archivo) return
    try {
      await navigator.share({ files: [archivo], title: archivo.name })
    } catch (e) {
      // Cerrar la hoja de compartir no es un error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    }
  }

  function guardar() {
    if (!archivo) return
    const url = URL.createObjectURL(archivo)
    const a = document.createElement('a')
    a.href = url
    a.download = archivo.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const grabando = progreso !== null
  const puedeCompartir = typeof navigator.share === 'function'

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4" data-testid="laboratorio">
      <div className="flex items-center gap-2">
        <BeakerIcon className="size-6 text-acento" />
        <h2 className="font-serif text-xl">Laboratorio</h2>
      </div>
      <p className="text-sm text-texto-2">
        Mide qué da este móvil en Chrome (cámara, códecs, micrófono, almacenamiento) y graba una prueba de {duracion} s. Nada sale del
        dispositivo. Abre esta página en cada móvil y pega el informe.
      </p>

      <button type="button" onClick={() => void medirTodo()} disabled={!!haciendo || grabando} data-testid="lab-medir" className={`${estiloBoton} bg-acento font-medium text-fondo`}>
        <BeakerIcon className="size-5" />
        {haciendo ?? 'Medir este móvil'}
      </button>

      <div className="flex flex-col gap-3 border-t border-borde pt-4">
        <h3 className="font-medium">Grabación de prueba</h3>
        <label className="flex flex-col gap-1 text-sm text-texto-2">
          Resolución y fps que se piden
          <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} disabled={grabando} data-testid="lab-modo" className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
            {MODOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-texto-2">
          Códec
          <select value={codec} onChange={(e) => setCodec(e.target.value as typeof codec)} disabled={grabando} data-testid="lab-codec" className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
            {CODECS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-texto-2">
          Enfoque y exposición
          <select value={exposicion} onChange={(e) => setExposicion(e.target.value as ModoExposicion)} disabled={grabando} data-testid="lab-exposicion" className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
            {EXPOSICIONES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-sm text-texto-2">
          Cámara
          <div className="flex gap-2">
            <select value={camaraId} onChange={(e) => setCamaraId(e.target.value)} disabled={grabando} data-testid="lab-camara" className="min-w-0 flex-1 rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
              <option value="">La trasera (la que elija Chrome)</option>
              {camaras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void elegirCamara()} disabled={grabando} className="shrink-0 rounded-md border border-borde px-3 text-texto disabled:opacity-40">
              Listar
            </button>
          </div>
        </div>

        {grabando ? (
          <button type="button" onClick={() => cancelar.current?.abort()} data-testid="lab-cancelar" className={estiloBoton}>
            <StopIcon className="size-5" />
            Cancelar ({Math.floor(progreso)} / {duracion} s)
          </button>
        ) : (
          <button type="button" onClick={() => void grabar()} disabled={!!haciendo} data-testid="lab-grabar" className={`${estiloBoton} bg-acento font-medium text-fondo`}>
            <VideoCameraIcon className="size-5" />
            Grabar {duracion} s
          </button>
        )}

        <video ref={vista} autoPlay muted playsInline data-testid="lab-vista" className={`aspect-video w-full rounded-md bg-black object-contain ${flujo ? '' : 'hidden'}`} />

        {archivo && (
          <div className="flex flex-col gap-2" data-testid="lab-resultado">
            <p className="font-mono text-sm text-texto-2">
              {archivo.name} · {(archivo.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => alAbrir(archivo)} data-testid="lab-abrir" className={`${estiloBoton} flex-1 bg-acento font-medium text-fondo`}>
                <FilmIcon className="size-5" />
                Abrir en el visor
              </button>
              {puedeCompartir && (
                <button type="button" onClick={() => void compartir()} className={estiloBoton}>
                  <ShareIcon className="size-5" />
                  Compartir
                </button>
              )}
              <button type="button" onClick={guardar} className={estiloBoton}>
                <ArrowDownTrayIcon className="size-5" />
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" data-testid="lab-error" className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {texto && (
        <div className="flex flex-col gap-2 border-t border-borde pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Informe</h3>
            <button type="button" onClick={() => void copiar()} data-testid="lab-copiar" className="flex items-center gap-2 rounded-md border border-borde px-3 py-2 text-sm text-texto">
              <ClipboardDocumentIcon className="size-5" />
              {copiado ? 'Copiado' : 'Copiar informe'}
            </button>
          </div>
          <textarea readOnly value={texto} rows={14} data-testid="lab-informe" className="w-full rounded-md border border-borde bg-fondo p-3 font-mono text-xs text-texto" />
        </div>
      )}
    </section>
  )
}
