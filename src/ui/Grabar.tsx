import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownTrayIcon, ArrowLeftIcon, FilmIcon, ShareIcon, StopIcon, TrashIcon, VideoCameraIcon } from '@heroicons/react/24/outline'
import { nombreGrabacion, revisarFps } from '../core/grabacion/revision'
import { pedirPersistencia } from '../persistencia/almacen'
import {
  abrirGrabacion,
  analizarGrabacion,
  borrarGrabacion,
  espacio,
  listarGrabaciones,
  type AnalisisGrabacion,
  type Espacio,
  type GrabacionGuardada,
} from '../media/grabaciones'
import { CALIDAD_POR_DEFECTO, CALIDADES, Grabadora, datosCamara, type Calidad } from '../media/grabadora'
import { InfoGlosario } from './glosario/Glosario'
import { AVISO_SOFTWARE, calidadInicial } from '../media/codificador'
import { AVISO_MICRO_EXTERNO } from '../media/microfono'
import { useCamara } from './useCamara'
import { useCodificador } from './useCodificador'
import { useMicroExterno } from './useMicroExterno'
import { usePantallaEncendida } from './usePantallaEncendida'

/*
 * «Grabar con este móvil» (fase 4, paso 2; §1–2 de docs/plan-fase-4.md): vista previa de la cámara trasera, grabar y
 * parar, revisión de lo grabado (fps entregados frente a los pedidos) y la lista de grabaciones de este móvil para
 * abrirlas en el visor, compartirlas (Quick Share), guardarlas o borrarlas. Todo en el dispositivo.
 */

const MB = 1024 * 1024
const formatoMB = (bytes: number) => `${(bytes / MB).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
const formatoReloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const formatoFecha = (ms: number) => new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Menos de esto libre: se avisa antes de grabar (un minuto a 1080p son unos 55 MB). */
const ESPACIO_MINIMO = 300 * MB

interface Resultado {
  readonly archivo: File
  readonly enAlmacen: boolean
  readonly analisis: AnalisisGrabacion | null
  readonly fpsPedidos: number
}

async function compartir(archivo: File, alError: (m: string) => void) {
  try {
    if (!navigator.canShare?.({ files: [archivo] })) throw new Error('no')
    await navigator.share({ files: [archivo], title: archivo.name })
  } catch (e) {
    // Cerrar la hoja de compartir no es un error.
    if (e instanceof DOMException && e.name === 'AbortError') return
    alError('Este navegador no puede compartir el archivo: usa «Guardar».')
  }
}

function guardar(archivo: File) {
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = archivo.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-borde px-3 text-sm text-texto disabled:opacity-40'

export default function Grabar({ alAbrir, alSalir }: { alAbrir: (archivo: File) => void; alSalir: () => void }) {
  usePantallaEncendida()
  const [calidad, setCalidad] = useState<Calidad>(CALIDAD_POR_DEFECTO)
  const [grabadora, setGrabadora] = useState<Grabadora | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [lista, setLista] = useState<GrabacionGuardada[]>([])
  const [disco, setDisco] = useState<Espacio | null>(null)
  const [aBorrar, setABorrar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const vista = useRef<HTMLVideoElement>(null)
  const grabadoraRef = useRef<Grabadora | null>(null)

  const refrescar = useCallback(async () => {
    try {
      setLista(await listarGrabaciones())
      setDisco(await espacio())
    } catch (e) {
      setError(`No se puede leer el almacenamiento de la app: ${mensajeDe(e)}`)
    }
  }, [])

  useEffect(() => {
    // Que Android no borre las grabaciones si se queda sin espacio (Chrome decide sin preguntar).
    void pedirPersistencia().then(() => refrescar())
  }, [refrescar])

  // La cámara se abre al entrar, al cambiar de calidad (no mientras se graba: el selector está desactivado) y al volver
  // a la app si Android la apagó.
  const { flujo, error: errorCamara } = useCamara(calidad)
  const codificador = useCodificador(calidad)
  const microExterno = useMicroExterno(flujo)

  // Sin codificador por hardware se empieza en 720p (a 1080p no llega ni a la mitad de los fps), salvo que ya se haya
  // elegido otra.
  const elegida = useRef(false)
  useEffect(() => {
    void calidadInicial().then((c) => !elegida.current && setCalidad(c))
  }, [])

  useEffect(() => {
    if (vista.current) vista.current.srcObject = flujo
  }, [flujo])

  // Al salir a mitad de una grabación, se descarta.
  useEffect(() => () => void grabadoraRef.current?.cancelar(), [])

  const parar = useCallback(async () => {
    const g = grabadoraRef.current
    if (!g) return
    grabadoraRef.current = null
    setOcupado(true)
    try {
      const t = await g.parar()
      setGrabadora(null)
      let analisis: AnalisisGrabacion | null = null
      try {
        analisis = await analizarGrabacion(t.archivo)
      } catch (e) {
        setError(`Grabado, pero no se ha podido revisar: ${mensajeDe(e)}`)
      }
      setResultado({ archivo: t.archivo, enAlmacen: t.enAlmacen, analisis, fpsPedidos: calidad.fps })
      await refrescar()
    } catch (e) {
      setGrabadora(null)
      setError(`No se ha podido terminar la grabación: ${mensajeDe(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [calidad.fps, refrescar])

  // Reloj de la grabación, parada a la duración máxima y si el codificador falla.
  useEffect(() => {
    if (!grabadora) return
    const inicio = performance.now()
    const reloj = setInterval(() => {
      const s = (performance.now() - inicio) / 1000
      setSegundos(s)
      if (s >= grabadora.duracionMaxima) void parar()
    }, 250)
    grabadora.error.catch((e) => {
      if (grabadoraRef.current !== grabadora) return
      grabadoraRef.current = null
      setGrabadora(null)
      void grabadora.cancelar()
      setError(`La grabación se ha interrumpido: ${mensajeDe(e)}`)
    })
    return () => clearInterval(reloj)
  }, [grabadora, parar])

  async function grabar() {
    if (!flujo) return
    setError(null)
    setResultado(null)
    setOcupado(true)
    try {
      const g = await Grabadora.empezar(flujo, calidad, nombreGrabacion(new Date()), crypto.randomUUID())
      grabadoraRef.current = g
      setSegundos(0)
      setGrabadora(g)
    } catch (e) {
      setError(`No se ha podido empezar a grabar: ${mensajeDe(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function conGuardada(nombre: string, f: (archivo: File) => void | Promise<void>) {
    try {
      await f(await abrirGrabacion(nombre))
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  async function borrar(nombre: string) {
    setABorrar(null)
    try {
      await borrarGrabacion(nombre)
      if (resultado?.archivo.name === nombre) setResultado(null)
      await refrescar()
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  const grabando = grabadora !== null
  const camara = flujo ? datosCamara(flujo) : null
  const puedeCompartir = typeof navigator.share === 'function'
  const poco = disco?.libre != null && disco.libre < ESPACIO_MINIMO
  const total = lista.reduce((s, g) => s + g.tamano, 0)
  const revision = resultado?.analisis ? revisarFps(resultado.fpsPedidos, resultado.analisis.fpsMediano) : null

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4" data-testid="grabar">
      <div className="flex items-center gap-2">
        <button type="button" onClick={alSalir} disabled={grabando || ocupado} aria-label="Volver" title="Volver" className="flex size-11 items-center justify-center rounded-md border border-borde disabled:opacity-40">
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 className="font-serif text-2xl">Grabar con este móvil</h2>
        <InfoGlosario id="grabacion" tema="grabar con este móvil" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
        <video ref={vista} autoPlay muted playsInline data-testid="grabar-vista" className="max-h-[55dvh] w-full rounded-md bg-black object-contain" />
        <p className="font-mono text-xs text-texto-2" data-testid="grabar-camara">
          {camara ? `${camara.ancho}×${camara.alto} a ${Math.round(camara.fps)} fps · ${camara.nombre}` : 'Abriendo la cámara…'}
        </p>
        {errorCamara && <p className="text-sm text-red-300">No se puede abrir la cámara: {errorCamara}</p>}
        <label className="flex flex-col gap-1 text-sm text-texto-2">
          Resolución (a 30 fps)
          <select
            value={calidad.id}
            onChange={(e) => {
              setError(null)
              elegida.current = true
              setCalidad(CALIDADES.find((c) => c.id === e.target.value) ?? CALIDAD_POR_DEFECTO)
            }}
            disabled={grabando || ocupado}
            data-testid="grabar-calidad"
            className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto"
          >
            {CALIDADES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {codificador === 'software' && (
          <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="grabar-aviso-codificador">
            {AVISO_SOFTWARE}
          </p>
        )}
        {microExterno && (
          <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="grabar-aviso-micro">
            {AVISO_MICRO_EXTERNO}
          </p>
        )}
        {poco && (
          <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="grabar-poco-espacio">
            Queda poco espacio para la app ({formatoMB(disco!.libre!)}): un minuto a 1080p ocupa unos 55 MB.
          </p>
        )}
        {grabando ? (
          <button type="button" onClick={() => void parar()} disabled={ocupado} data-testid="grabar-parar" className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-red-400 font-medium text-red-300 disabled:opacity-40">
            <StopIcon className="size-6" />
            Parar · <span className="font-mono">{formatoReloj(segundos)}</span>
            <span className="font-mono text-xs text-texto-2">/ {formatoReloj(grabadora.duracionMaxima)}</span>
          </button>
        ) : (
          <button type="button" onClick={() => void grabar()} disabled={!flujo || ocupado} data-testid="grabar-empezar" className="flex min-h-14 items-center justify-center gap-2 rounded-md bg-acento font-medium text-fondo disabled:opacity-40">
            <VideoCameraIcon className="size-6" />
            {ocupado ? 'Un momento…' : 'Grabar'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" data-testid="grabar-error" className="rounded-md border border-red-400/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {resultado && (
        <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="grabar-resultado" data-metadatos={resultado.analisis?.metadatos ? 'sí' : 'no'}>
          <h3 className="font-medium">Grabado</h3>
          {resultado.analisis && (
            <p className="font-mono text-sm text-texto-2" data-testid="grabar-revision">
              {resultado.analisis.ancho}×{resultado.analisis.alto} · <span data-testid="grabar-frames">{resultado.analisis.frames}</span> frames ·{' '}
              {resultado.analisis.duracion.toLocaleString('es-ES', { maximumFractionDigits: 1 })} s ·{' '}
              <span data-testid="grabar-fps">{resultado.analisis.fpsMediano.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span> fps
              {resultado.analisis.conAudio ? ' · con sonido' : ' · sin sonido'}
            </p>
          )}
          {revision?.bajos && (
            <p className="flex items-start gap-1 rounded-md border border-acento/60 p-3 text-sm" data-testid="grabar-aviso-fps">
              <span>
                La cámara ha dado {resultado.analisis!.fpsMediano.toLocaleString('es-ES', { maximumFractionDigits: 1 })} fps de los {resultado.fpsPedidos}{' '}
                pedidos. Puede ser poca luz (la cámara alarga la exposición y da menos fps): prueba con más luz delante de la persona y vuelve a grabar.
              </span>
              <InfoGlosario id="grabacion" tema="los fps de la grabación" className="-my-1.5" />
            </p>
          )}
          {!resultado.enAlmacen && (
            <p className="text-sm text-texto-2">
              Este navegador no deja guardarla en el almacenamiento de la app: solo está en memoria hasta que la guardes o la compartas.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => alAbrir(resultado.archivo)} data-testid="grabar-abrir" className={`${boton} flex-1 border-acento bg-acento font-medium text-fondo`}>
              <FilmIcon className="size-5" />
              Abrir en el visor
            </button>
            {puedeCompartir && (
              <button type="button" onClick={() => void compartir(resultado.archivo, setError)} className={boton}>
                <ShareIcon className="size-5" />
                Compartir
              </button>
            )}
            <button type="button" onClick={() => guardar(resultado.archivo)} className={boton}>
              <ArrowDownTrayIcon className="size-5" />
              Guardar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="grabaciones">
        <h3 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Grabaciones de este móvil</h3>
        <p className="text-sm text-texto-2">
          Se guardan en el almacenamiento de la app, en este móvil, y no salen de él.
          {disco && !disco.persistente && ' Android podría borrarlas si se queda sin espacio: compártelas o guárdalas para ponerlas a salvo.'}
          {lista.length > 0 && ` Ocupan ${formatoMB(total)}.`}
        </p>
        {lista.length === 0 ? (
          <p className="text-sm text-texto-2" data-testid="grabaciones-vacia">
            Todavía no hay ninguna.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lista.map((g) => (
              <li key={g.nombre} className="flex flex-col gap-2 border-t border-borde pt-3 first:border-t-0 first:pt-0" data-testid="grabacion" data-bytes={g.tamano}>
                <p className="font-mono text-xs break-all">{g.nombre}</p>
                <p className="text-xs text-texto-2">
                  {formatoFecha(g.modificada)} · {formatoMB(g.tamano)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void conGuardada(g.nombre, alAbrir)} disabled={grabando} className={boton}>
                    <FilmIcon className="size-5" />
                    Abrir
                  </button>
                  {puedeCompartir && (
                    <button type="button" onClick={() => void conGuardada(g.nombre, (f) => compartir(f, setError))} className={boton}>
                      <ShareIcon className="size-5" />
                      Compartir
                    </button>
                  )}
                  <button type="button" onClick={() => void conGuardada(g.nombre, guardar)} data-testid="grabacion-guardar" className={boton}>
                    <ArrowDownTrayIcon className="size-5" />
                    Guardar
                  </button>
                  {aBorrar === g.nombre ? (
                    <button type="button" onClick={() => void borrar(g.nombre)} data-testid="grabacion-confirmar-borrar" className={`${boton} border-red-400 text-red-300`}>
                      <TrashIcon className="size-5" />
                      ¿Borrar? Sí
                    </button>
                  ) : (
                    <button type="button" onClick={() => setABorrar(g.nombre)} disabled={grabando} data-testid="grabacion-borrar" className={boton}>
                      <TrashIcon className="size-5" />
                      Borrar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
