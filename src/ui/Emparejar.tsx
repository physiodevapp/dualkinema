import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
  LinkIcon,
  PlusIcon,
  ShareIcon,
  Square2StackIcon,
  StopIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { encode } from 'uqr'
import type { OrientacionVista } from '../core/geometria/canonico'
import { revisarFps } from '../core/grabacion/revision'
import { formatoCodigo, generarCodigo, normalizarCodigo, urlDeSala } from '../core/sala/codigo'
import { CUENTAS_ATRAS_S, DURACIONES_S, vistasCompatibles } from '../core/sala/doble'
import type { EstadoMovil } from '../core/sala/protocolo'
import { CALIDAD_PITIDO_MINIMA, DURACION_SECUENCIA_S, PITIDO_OTRA_S, VENTANA_DESPUES_S, type Deteccion } from '../core/sincronia/pitido'
import { AVISO_SOFTWARE, calidadInicial } from '../media/codificador'
import { espacio } from '../media/grabaciones'
import { CALIDAD_POR_DEFECTO, datosCamara, type Calidad } from '../media/grabadora'
import { AVISO_MICRO_EXTERNO } from '../media/microfono'
import { ahora } from '../sala/config'
import { useGrabacionDoble, type GrabacionDoble } from '../sala/useGrabacionDoble'
import { useSala, type Conexion, type Sala } from '../sala/useSala'
import { InfoGlosario } from './glosario/Glosario'
import { useCamara } from './useCamara'
import { useCodificador } from './useCodificador'
import { useMicroExterno } from './useMicroExterno'
import { usePantallaEncendida } from './usePantallaEncendida'
import { textoPrevision, textoPrevisionOtro, usePrevisionFps } from './usePrevisionFps'

/*
 * «Grabar con dos móviles» (fase 4, pasos 4b y 5; §4–5 de docs/plan-fase-4.md, D6 y D8): crear una sala (código y QR)
 * o unirse con el código, elegir cómo ve cada móvil a la persona, ver el estado del otro y el reloj común con su
 * precisión, y grabar con los dos a la vez (cuenta atrás, duración, parada sola; `useGrabacionDoble`). Por el relé
 * solo viajan los mensajes de `core/sala/protocolo.ts`.
 */

const VISTAS: readonly { readonly id: string; readonly vista: OrientacionVista; readonly etiqueta: string }[] = [
  { id: 'perfil-izquierda', vista: { plano: 'sagital', mira: 'izquierda' }, etiqueta: 'De perfil, mira a la izquierda' },
  { id: 'perfil-derecha', vista: { plano: 'sagital', mira: 'derecha' }, etiqueta: 'De perfil, mira a la derecha' },
  { id: 'frente', vista: { plano: 'frontal', ve: 'delante' }, etiqueta: 'De frente' },
  { id: 'espalda', vista: { plano: 'frontal', ve: 'detras' }, etiqueta: 'De espaldas' },
]

const idDeVista = (v: OrientacionVista | null): string | null =>
  v === null ? null : (VISTAS.find((x) => JSON.stringify(x.vista) === JSON.stringify(v))?.id ?? null)

const textoVista = (v: OrientacionVista | null): string => (v === null ? 'sin elegir' : (VISTAS.find((x) => x.id === idDeVista(v))?.etiqueta.toLowerCase() ?? '—'))

const TEXTO_CONEXION: Record<Conexion, string> = {
  conectando: 'Conectando con la sala…',
  esperando: 'Esperando al otro móvil…',
  emparejado: 'Conectado con el otro móvil',
  reconectando: 'Se ha cortado la conexión: reconectando…',
  llena: 'La sala está llena (ya hay dos móviles). Crea otra.',
  caducada: 'La sala ha caducado (3 h). Crea otra.',
  cerrado: 'Has salido de la sala.',
}

const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-borde px-3 text-texto disabled:opacity-40'

/** El QR de la dirección de la sala, en negro sobre blanco (los lectores lo necesitan así aunque la app sea oscura). */
function QrSala({ url }: { url: string }) {
  const qr = useMemo(() => encode(url, { ecc: 'M', border: 2 }), [url])
  const camino = useMemo(() => {
    let d = ''
    qr.data.forEach((fila, y) => fila.forEach((negro, x) => negro && (d += `M${x} ${y}h1v1h-1z`)))
    return d
  }, [qr])
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR para unirse a la sala" data-testid="qr-sala" data-url={url} className="size-48 rounded-md bg-white" shapeRendering="crispEdges">
      <path d={camino} fill="#000" />
    </svg>
  )
}

/** Lo que este móvil cuenta al otro: su cámara (la vista previa), espacio libre, batería, codificador, micrófono y fps. */
function useMiEstado(
  flujo: MediaStream | null,
  grabando: boolean,
  codificador: EstadoMovil['codificador'],
  microExterno: boolean,
  fpsGrabacion: number | null,
): EstadoMovil {
  const [libreMB, setLibreMB] = useState<number | null>(null)
  const [bateria, setBateria] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    void espacio().then((e) => vivo && setLibreMB(e.libre === null ? null : Math.round(e.libre / 1024 / 1024)))
    const n = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
    void n.getBattery?.().then(
      (b) => vivo && setBateria(b.level),
      () => {},
    )
    return () => {
      vivo = false
    }
  }, [])
  return useMemo(() => {
    const c = flujo ? datosCamara(flujo) : null
    return {
      camara: c && c.ancho > 0 ? { ancho: c.ancho, alto: c.alto, fps: Math.round(c.fps) || 30 } : null,
      libreMB,
      bateria,
      grabando,
      codificador,
      microExterno,
      fpsGrabacion: fpsGrabacion === null ? null : Math.round(fpsGrabacion * 10) / 10,
    }
  }, [flujo, libreMB, bateria, grabando, codificador, microExterno, fpsGrabacion])
}

function Aviso({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid={testid}>
      {children}
    </p>
  )
}

const formatoReloj = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function compartir(archivo: File) {
  try {
    if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: archivo.name })
  } catch {
    // Cerrar la hoja de compartir no es un error.
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

/** Programar, la cuenta atrás, grabando y el resultado de la grabación doble. */
function TarjetaGrabar({ doble, puede, alAbrirDoble }: { doble: GrabacionDoble; puede: boolean; alAbrirDoble: (archivo: File) => void }) {
  const [cuenta, setCuenta] = useState<number>(10)
  const [duracion, setDuracion] = useState<number | null>(30)
  const [, setTic] = useState(0)
  const { fase } = doble
  const enMarcha = fase.f === 'programada' || fase.f === 'grabando' || fase.f === 'esperando'
  // Refresca la cuenta atrás y el reloj de la grabación.
  useEffect(() => {
    if (!enMarcha) return
    const t = setInterval(() => setTic((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [enMarcha])

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="grabar-doble" data-fase={fase.f}>
      <h3 className="font-medium">Grabar con los dos</h3>
      {fase.f === 'libre' && (
        <>
          {fase.aviso && (
            <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="aviso-grabacion">
              {fase.aviso}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-texto-2">
              Cuenta atrás
              <select value={cuenta} onChange={(e) => setCuenta(Number(e.target.value))} data-testid="cuenta-atras-s" className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
                {CUENTAS_ATRAS_S.map((c) => (
                  <option key={c} value={c}>
                    {c} s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-texto-2">
              Duración
              <select
                value={duracion ?? 'parar'}
                onChange={(e) => setDuracion(e.target.value === 'parar' ? null : Number(e.target.value))}
                data-testid="duracion-s"
                className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto"
              >
                {DURACIONES_S.map((d) => (
                  <option key={d ?? 'parar'} value={d ?? 'parar'}>
                    {d === null ? 'Hasta parar' : `${d} s`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => doble.programar(cuenta, duracion)}
            disabled={!puede}
            data-testid="grabar-los-dos"
            className={`${boton} min-h-14 border-acento bg-acento font-medium text-fondo`}
          >
            <VideoCameraIcon className="size-6" />
            Grabar con los dos
          </button>
          {!puede && <p className="text-sm text-texto-2">Hace falta el reloj común medido y una vista de perfil y otra de frente o de espaldas.</p>}
        </>
      )}
      {fase.f === 'esperando' && <p data-testid="esperando-confirmacion">Esperando a que el otro móvil confirme…</p>}
      {fase.f === 'programada' && (
        <>
          <p className="text-center font-mono text-6xl" data-testid="cuenta-atras">
            {Math.max(0, Math.ceil((fase.inicio - ahora()) / 1000))}
          </p>
          <p className="text-center text-sm text-texto-2">Empiezan a grabar los dos a la vez. Ponte en tu sitio.</p>
        </>
      )}
      {fase.f === 'grabando' && (
        <p className="flex items-center justify-center gap-2 font-mono text-2xl" data-testid="grabando-doble">
          <span className="size-3 rounded-full bg-red-500" />
          {formatoReloj(ahora() - fase.inicio)} / {formatoReloj(fase.fin - fase.inicio)}
        </p>
      )}
      {(fase.f === 'programada' || fase.f === 'grabando' || fase.f === 'esperando') && (
        <button type="button" onClick={doble.parar} data-testid="parar-doble" className={`${boton} min-h-14 border-red-400 text-red-300`}>
          <StopIcon className="size-6" />
          {fase.f === 'grabando' ? 'Parar los dos' : 'Cancelar'}
        </button>
      )}
      {fase.f === 'parando' && <p>Terminando el vídeo…</p>}
      {fase.f === 'hecha' && <ResultadoDoble fase={fase} otraVez={doble.otraVez} alAbrirDoble={alAbrirDoble} />}
    </div>
  )
}

const oido = (d: Deteccion | null | undefined) => d != null && d.calidad >= CALIDAD_PITIDO_MINIMA
const textoPitido = (d: Deteccion | null | undefined) =>
  oido(d) ? `oído (calidad ${d!.calidad.toLocaleString('es-ES', { maximumFractionDigits: 1 })})` : 'no se oye bien'

/** Si este vídeo ha oído los dos pitidos de ida y vuelta, y qué hacer si no. */
function PitidosDoble({ fase }: { fase: Extract<GrabacionDoble['fase'], { f: 'hecha' }> }) {
  const p = fase.pitidos
  const corta = (fase.analisis?.duracion ?? Infinity) < PITIDO_OTRA_S + DURACION_SECUENCIA_S + VENTANA_DESPUES_S
  const consejo = corta
    ? 'La grabación ha sido demasiado corta para los pitidos: suenan en los 3 primeros segundos.'
    : !fase.pito
      ? 'Este móvil no ha podido pitar: toca su pantalla antes de grabar (el navegador no deja sonar sin un toque).'
      : !oido(p?.propio)
        ? 'No se oye bien el pitido de este móvil: sube su volumen multimedia y desconecta los auriculares.'
        : !oido(p?.otro)
          ? 'No se oye bien el pitido del otro móvil: sube el volumen multimedia de los dos o acércalos.'
          : null
  return (
    <div className="flex flex-col gap-2" data-testid="pitidos-doble" data-pito={fase.pito} data-propio={p?.propio?.calidad ?? ''} data-otro={p?.otro?.calidad ?? ''}>
      <p className="flex items-center gap-1 font-mono text-sm text-texto-2">
        Pitidos: el de este móvil {textoPitido(p?.propio)} · el del otro {textoPitido(p?.otro)}
        <InfoGlosario id="pitido" tema="el pitido de ida y vuelta" className="-my-1.5" />
      </p>
      {consejo && <Aviso testid="aviso-pitidos">{consejo}</Aviso>}
    </div>
  )
}

function ResultadoDoble({
  fase,
  otraVez,
  alAbrirDoble,
}: {
  fase: Extract<GrabacionDoble['fase'], { f: 'hecha' }>
  otraVez: () => void
  alAbrirDoble: (archivo: File) => void
}) {
  const a = fase.analisis
  const revision = a ? revisarFps(30, a.fpsMediano) : null
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="resultado-doble"
      data-doble-id={a?.metadatos?.doble?.id ?? ''}
      data-inicio={a?.metadatos?.doble?.inicio ?? ''}
      data-arranque={fase.arranque}
      data-frames={a?.frames ?? ''}
      data-tiempos={fase.tiempos}
      data-plan-pitidos={a?.metadatos?.doble?.pitidos ? JSON.stringify(a.metadatos.doble.pitidos) : ''}
    >
      <p className="font-mono text-xs break-all">{fase.archivo.name}</p>
      {fase.aviso && (
        <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="aviso-interrumpida">
          {fase.aviso}
        </p>
      )}
      {a && (
        <p className="font-mono text-sm text-texto-2">
          {a.frames} frames · {a.duracion.toLocaleString('es-ES', { maximumFractionDigits: 1 })} s ·{' '}
          {a.fpsMediano.toLocaleString('es-ES', { maximumFractionDigits: 1 })} fps{a.conAudio ? ' · con sonido' : ' · sin sonido'}
        </p>
      )}
      {revision?.bajos && (
        <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="aviso-fps-doble">
          Ha grabado a {a!.fpsMediano.toLocaleString('es-ES', { maximumFractionDigits: 1 })} fps de los 30 pedidos. Puede ser poca luz o que este aparato no da para más.
        </p>
      )}
      <PitidosDoble fase={fase} />
      <p className="text-sm text-texto-2">
        Está en «Grabaciones de este móvil». Para analizar los dos vídeos juntos, pasa el de un móvil al otro con «Compartir» (Quick Share) y, en el que lo
        recibe, «Abrir con el otro vídeo».
      </p>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && (
          <button type="button" onClick={() => void compartir(fase.archivo)} className={boton}>
            <ShareIcon className="size-5" />
            Compartir
          </button>
        )}
        <button type="button" onClick={() => guardar(fase.archivo)} data-testid="guardar-doble" className={boton}>
          <ArrowDownTrayIcon className="size-5" />
          Guardar
        </button>
        <button type="button" onClick={() => alAbrirDoble(fase.archivo)} data-testid="abrir-con-otro" className={boton}>
          <Square2StackIcon className="size-5" />
          Abrir con el otro vídeo
        </button>
        <button type="button" onClick={otraVez} data-testid="grabar-otra-vez" className={boton}>
          Grabar otra vez
        </button>
      </div>
    </div>
  )
}

/** La sala ya abierta (con su código). */
function EnSala({ codigo, alSalir, alAbrirDoble }: { codigo: string; alSalir: () => void; alAbrirDoble: (archivo: File) => void }) {
  usePantallaEncendida()
  const [vista, setVista] = useState<OrientacionVista | null>(null)
  // 1080p, o 720p si este móvil codifica por software (no llega a 30 fps: algo ayuda).
  const [calidad, setCalidad] = useState<Calidad>(CALIDAD_POR_DEFECTO)
  useEffect(() => {
    void calidadInicial().then(setCalidad)
  }, [])
  const codificador = useCodificador(calidad)
  // Vista previa para encuadrar (y para decirle al otro qué da la cámara); se reabre si Android la apaga.
  const { flujo, error: errorCamara } = useCamara(calidad)
  const microExterno = useMicroExterno(flujo)
  const video = useRef<HTMLVideoElement>(null)
  // Los pitidos de la cuenta atrás necesitan un contexto de audio creado tras un toque (norma de los navegadores).
  const [audio, setAudio] = useState<AudioContext | null>(null)
  const [grabando, setGrabando] = useState(false)
  // A cuántos fps grabaría (paso 9): se mide sin nada en marcha y se le cuenta al otro.
  const [enMarcha, setEnMarcha] = useState(false)
  const prevision = usePrevisionFps(flujo, calidad, !enMarcha)
  const miEstado = useMiEstado(flujo, grabando, codificador, microExterno !== null, prevision?.fps ?? null)
  const sala: Sala = useSala(codigo, vista, miEstado)
  const doble = useGrabacionDoble(sala, flujo, vista, sala.otro?.vista ?? null, miEstado.libreMB, audio, calidad)
  const ocupado = doble.fase.f === 'esperando' || doble.fase.f === 'programada' || doble.fase.f === 'grabando' || doble.fase.f === 'parando'
  if (grabando !== (doble.fase.f === 'grabando')) setGrabando(doble.fase.f === 'grabando')
  if (enMarcha !== ocupado) setEnMarcha(ocupado)

  useEffect(() => {
    if (video.current) video.current.srcObject = flujo
  }, [flujo])

  const url = urlDeSala(location.origin, codigo)
  const { otro, reloj, deriva } = sala
  const emparejado = sala.conexion === 'emparejado'
  const mismoPlano = vista && otro?.vista && vista.plano === otro.vista.plano
  const camaraOtro = otro?.estado?.camara

  return (
    <div
      className="flex flex-col gap-4"
      onPointerDown={() => {
        if (audio) return void (audio.state === 'suspended' && audio.resume())
        const Ctx = window.AudioContext
        if (Ctx) setAudio(new Ctx())
      }}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-panel p-4">
        <p className="text-sm text-texto-2">Código de la sala</p>
        <p className="font-mono text-4xl tracking-widest" data-testid="codigo-sala">
          {formatoCodigo(codigo)}
        </p>
        {!emparejado && (
          <>
            <QrSala url={url} />
            <p className="text-center text-sm text-texto-2">
              En el otro móvil, escanea el QR con la cámara o abre la app y escribe el código en «Grabar con dos móviles».
            </p>
          </>
        )}
        <p className="flex items-center gap-1 font-medium" role="status" data-testid="conexion" data-conexion={sala.conexion}>
          {TEXTO_CONEXION[sala.conexion]}
          <InfoGlosario id="emparejar" tema="grabar con dos móviles" className="-my-1.5" />
        </p>
      </div>

      {sala.versionDistinta && (
        <Aviso testid="aviso-version">
          El otro móvil tiene otra versión de la app. Recarga la página en los dos (con «Recargar» si sale el aviso de versión nueva).
        </Aviso>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
        <h3 className="font-medium">¿Cómo ve este móvil a la persona?</h3>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vista de este móvil">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={idDeVista(vista) === v.id}
              onClick={() => setVista(v.vista)}
              disabled={ocupado}
              data-testid={`vista-${v.id}`}
              className={`${boton} text-sm ${idDeVista(vista) === v.id ? 'border-acento bg-acento/15' : ''}`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
        <video ref={video} autoPlay muted playsInline className={`max-h-[40dvh] w-full rounded-md bg-black object-contain ${flujo ? '' : 'hidden'}`} />
        {errorCamara && <p className="text-sm text-red-300">No se puede abrir la cámara: {errorCamara}</p>}
        {prevision && (
          <p className="font-mono text-xs text-texto-2" data-testid="prevision-fps" data-fps={prevision.fps} data-causa={prevision.causa ?? ''}>
            Grabaría a unos {Math.round(prevision.fps)} fps
          </p>
        )}
        {textoPrevision(prevision, calidad) && <Aviso testid="aviso-fps-previsto">{textoPrevision(prevision, calidad)}</Aviso>}
        {!prevision && codificador === 'software' && <Aviso testid="aviso-codificador">{AVISO_SOFTWARE}</Aviso>}
        {microExterno && <Aviso testid="aviso-micro">{AVISO_MICRO_EXTERNO}</Aviso>}
      </div>

      {emparejado && (
        <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="otro-movil">
          <h3 className="font-medium">El otro móvil</h3>
          <p className="text-sm" data-testid="otro-vista">
            Vista: {textoVista(otro?.vista ?? null)}
          </p>
          <p className="font-mono text-xs text-texto-2" data-testid="otro-estado">
            {camaraOtro ? `Cámara ${camaraOtro.ancho}×${camaraOtro.alto} a ${camaraOtro.fps} fps` : 'Cámara sin abrir'}
            {otro?.estado?.libreMB != null && ` · ${otro.estado.libreMB.toLocaleString('es-ES')} MB libres`}
            {otro?.estado?.bateria != null && ` · batería ${Math.round(otro.estado.bateria * 100)} %`}
            {otro?.estado?.codificador === 'software' && ' · vídeo por software'}
            {otro?.estado?.fpsGrabacion != null && ` · grabaría a ${Math.round(otro.estado.fpsGrabacion)} fps`}
          </p>
          {textoPrevisionOtro(otro?.estado?.fpsGrabacion ?? null, 30) && (
            <Aviso testid="aviso-fps-otro">{textoPrevisionOtro(otro?.estado?.fpsGrabacion ?? null, 30)}</Aviso>
          )}
          {otro?.estado?.fpsGrabacion == null && otro?.estado?.codificador === 'software' && (
            <Aviso testid="aviso-codificador-otro">El otro móvil codifica el vídeo por software: puede grabar a menos de 30 fps.</Aviso>
          )}
          {otro?.estado?.microExterno && (
            <Aviso testid="aviso-micro-otro">El otro móvil tiene unos auriculares o un micrófono externo conectados: que los desconecte, o no se oirá su pitido.</Aviso>
          )}
          <p className="flex items-center gap-1 font-mono text-sm" data-testid="reloj-comun" data-desfase={reloj?.desfase} data-cota={reloj?.cota} data-metodo={reloj?.metodo}>
            {reloj ? `Reloj común ± ${reloj.cota < 1 ? reloj.cota.toFixed(1) : Math.round(reloj.cota)} ms` : 'Midiendo el reloj común…'}
            {deriva && ` · deriva ${Math.round(deriva.ppm)} ± ${Math.round(deriva.errorPpm)} ppm`}
            <InfoGlosario id="reloj-comun" tema="el reloj común" className="-my-1.5" />
          </p>
        </div>
      )}

      {emparejado && mismoPlano && (
        <Aviso testid="aviso-vistas">
          Los dos móviles están {vista!.plano === 'sagital' ? 'de perfil' : 'de frente o de espaldas'}: uno tiene que ver a la persona de perfil y el otro de frente.
        </Aviso>
      )}

      {((emparejado && vistasCompatibles(vista, otro?.vista ?? null)) || doble.fase.f !== 'libre') && (
        <TarjetaGrabar doble={doble} alAbrirDoble={alAbrirDoble} puede={emparejado && reloj !== null && vistasCompatibles(vista, otro?.vista ?? null) && flujo !== null} />
      )}

      <button
        type="button"
        onClick={() => {
          sala.salir()
          alSalir()
        }}
        disabled={ocupado}
        data-testid="salir-sala"
        className={boton}
      >
        <ArrowRightOnRectangleIcon className="size-5" />
        Salir de la sala
      </button>
    </div>
  )
}

/** Pon (o quita) el código de la sala en la dirección: al recargar se vuelve a la misma sala. */
function dejarEnLaDireccion(codigo: string | null) {
  const p = new URLSearchParams(location.search)
  if (codigo) p.set('sala', codigo)
  else p.delete('sala')
  const q = p.toString()
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}`)
}

interface Props {
  readonly codigoInicial: string | null
  readonly alSalir: () => void
  /** Abrir como grabación doble lo que acaba de grabar este móvil (después se elige el vídeo del otro). */
  readonly alAbrirDoble: (archivo: File) => void
}

export default function Emparejar({ codigoInicial, alSalir, alAbrirDoble }: Props) {
  const [codigo, setCodigo] = useState<string | null>(codigoInicial)
  const [escrito, setEscrito] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entrar = (c: string) => {
    dejarEnLaDireccion(c)
    setCodigo(c)
  }
  const salir = () => {
    dejarEnLaDireccion(null)
    alSalir()
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4" data-testid="emparejar">
      <div className="flex items-center gap-2">
        <button type="button" onClick={salir} aria-label="Volver" title="Volver" className="flex size-11 items-center justify-center rounded-md border border-borde">
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 className="font-serif text-2xl">Grabar con dos móviles</h2>
      </div>

      {codigo ? (
        <EnSala
          key={codigo}
          codigo={codigo}
          alSalir={salir}
          alAbrirDoble={(archivo) => {
            dejarEnLaDireccion(null)
            alAbrirDoble(archivo)
          }}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4">
          <p className="text-sm text-texto-2">
            Un móvil crea la sala y el otro se une con el QR o el código. Por internet solo viajan mensajes de control y marcas de tiempo: los
            vídeos se quedan en cada móvil.
          </p>
          <button
            type="button"
            onClick={() => entrar(generarCodigo((n) => crypto.getRandomValues(new Uint8Array(n))))}
            data-testid="crear-sala"
            className={`${boton} min-h-14 border-acento bg-acento font-medium text-fondo`}
          >
            <PlusIcon className="size-5" />
            Crear una sala
          </button>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const c = normalizarCodigo(escrito)
              if (!c) return setError('Ese código no es válido: son 6 letras y números (sin 0, O, 1, I ni L).')
              setError(null)
              entrar(c)
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-texto-2">
              O únete a la del otro móvil
              <input
                value={escrito}
                onChange={(e) => setEscrito(e.target.value)}
                placeholder="ABC-DEF"
                autoCapitalize="characters"
                autoComplete="off"
                data-testid="codigo-escrito"
                className="rounded-md border border-borde bg-fondo px-3 py-3 font-mono text-lg tracking-widest text-texto"
              />
            </label>
            <button type="submit" data-testid="unirse-sala" className={boton}>
              <LinkIcon className="size-5" />
              Unirme
            </button>
            {error && (
              <p role="alert" data-testid="error-codigo" className="text-sm text-red-300">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </section>
  )
}
