import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { DeteccionPose, IdMarcador, Muestra2D, TamanoModeloPose } from '../../core/modelo/tipos'
import { corregirLados } from '../../core/pose/cambiosLado'
import { trayectoriasPose, type FramePose } from '../../core/pose/puntos'
import type { VideoAbierto } from '../../media/video'
import type { AlWorkerPose, DelWorkerPose } from '../../workers/protocolo'
import type { Aviso } from './useSeguimiento'

/** Lo que se ve mientras se detecta: cargando el modelo, recorriendo el vídeo o la pasada hacia atrás. */
export type ProgresoDeteccion =
  | { fase: 'cargando'; texto?: string }
  | {
      fase: 'delante' | 'atras'
      fraccion: number
      /** En qué va (y en CPU, con cuántos hilos), los frames por segundo y lo que queda (s), en cuanto se sabe. */
      delegado?: 'GPU' | 'CPU'
      hilos?: number
      ritmo?: number
      restanteS?: number
    }

/** Salto (fracción del alto del vídeo) a partir del cual cambiar de lado de un frame al siguiente cuenta como intercambio. */
const UMBRAL_LADO = 0.05
/**
 * De frente, separación de las caderas (fracción del alto) a partir de la cual se decide su lado: las caderas de una
 * persona de frente están a un 5–15 % del alto de la imagen; por debajo (de lado, muy lejos) no se toca nada.
 */
const UMBRAL_LADO_FRENTE = 0.02


/** RTMPose (fase 6) solo con `?rtmpose` en la dirección, mientras es un experimento. */
/** `?rtmpose=cpu`: RTMPose en la CPU (con sus hilos) aunque haya GPU, para comparar la velocidad de las dos. */
const RTMPOSE_EN_CPU = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rtmpose') === 'cpu'
export const HAY_RTMPOSE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('rtmpose')

export const MODELOS_POSE: readonly { id: TamanoModeloPose; nombre: string }[] = [
  { id: 'full', nombre: 'Normal (full)' },
  { id: 'heavy', nombre: 'Preciso y lento (heavy, se descarga 30 MB)' },
  ...(HAY_RTMPOSE
    ? [
        { id: 'rtmpose-s' as const, nombre: 'RTMPose-s (experimental, 27 MB)' },
        { id: 'rtmpose-m' as const, nombre: 'RTMPose-m (experimental, 60 MB)' },
      ]
    : []),
]

/** «Solo 1 de cada N frames» (RTMPose, para comparar deprisa con «Calibrar en 3D»). */
export const PASO_COMPARAR = 4

export const esRtmpose = (m: TamanoModeloPose) => m === 'rtmpose-s' || m === 'rtmpose-m'
/** Tiempo que se espera a que el worker conteste a «cancelar» antes de cerrarlo sin más (ms): un frame tarda < 0,1 s. */
const ESPERA_CANCELAR_MS = 5000

interface Opciones {
  readonly video: VideoAbierto
  readonly orientacion: OrientacionVista
  /** Al recuperar: la última detección guardada. */
  readonly inicial?: DeteccionPose | null
  /** Mutadores del almacén (`AlmacenTrayectorias`). */
  readonly aplicarPose: (lote: readonly FramePose[]) => void
  readonly fusionar: (nuevas: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>) => void
  /** La vista pasa a seguir los puntos del modelo (la sesión los añade a sus marcadores). */
  readonly alEmpezar: () => void
  readonly setAviso: Dispatch<SetStateAction<Aviso | null>>
}

/**
 * «Detectar el cuerpo» (fase 5, paso 3): MediaPipe Pose recorre el vídeo entero en un worker (`workers/pose.worker.ts`),
 * creado al pedirlo y cerrado al acabar o al cancelar (su WASM y el modelo ocupan bastante). Lo detectado se ve en
 * seguida (cada lote va al almacén sin pisar lo marcado a mano); al acabar, las piernas se ponen en su lado
 * (`corregirLados`) y la detección entera se junta con lo que había (`fusionar`). Lo de la última detección (modelo,
 * GPU o CPU, recuentos) se guarda con la vista.
 */
export function useDeteccionPose({ video, orientacion, inicial, aplicarPose, fusionar, alEmpezar, setAviso }: Opciones) {
  const [progreso, setProgreso] = useState<ProgresoDeteccion | null>(null)
  const [deteccion, setDeteccion] = useState<DeteccionPose | null>(inicial ?? null)
  // Sube con cada detección terminada, para que el guardado se entere.
  const [revDeteccion, setRevDeteccion] = useState(0)
  const [modeloPose, setModeloPose] = useState<TamanoModeloPose>('full')
  const [soloAlgunos, setSoloAlgunos] = useState(false)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  // Cerrar el worker en marcha sin esperarle (al parar mientras carga, o si no responde a «cancelar»).
  const cortar = useRef<(() => void) | null>(null)
  const fase = useRef<ProgresoDeteccion['fase'] | null>(null)
  useEffect(() => {
    fase.current = progreso?.fase ?? null
  })

  // Lo último, para los manejadores del worker (se crean una vez por detección).
  const ultimo = useRef({ orientacion, fusionar, aplicarPose, setAviso })
  useEffect(() => {
    ultimo.current = { orientacion, fusionar, aplicarPose, setAviso }
  })

  const detectar = useCallback(() => {
    if (worker.current) return
    alEmpezar()
    const { tabla, info } = video
    const total = tabla.tiempos.length
    // RTMPose (experimento `?rtmpose`, fase 6) habla el mismo protocolo que MediaPipe, en su propio worker.
    const w = esRtmpose(modeloPose)
      ? new Worker(new URL('../../workers/rtmpose.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('../../workers/pose.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const frames = new Map<number, FramePose>()
    let delegado: 'GPU' | 'CPU' = 'GPU'
    let avisoDelegado: string | undefined
    let libreria = __MEDIAPIPE__
    let hilos: number | undefined
    let inicio = 0
    let procesados = 0
    const modelo = modeloPose
    const paso = esRtmpose(modeloPose) && soloAlgunos ? PASO_COMPARAR : 1
    setProgreso({ fase: 'cargando' })
    setAviso(null)
    const cerrar = () => {
      w.terminate()
      if (worker.current === w) worker.current = null
      if (cortar.current === cortarEste) cortar.current = null
      setProgreso(null)
    }
    // Parar mientras se carga el modelo (el *heavy* son 30 MB) o con un worker que ya no responde: se cierra sin más;
    // lo detectado hasta ahí se queda en el almacén como al ir llegando.
    const cortarEste = () => {
      if (worker.current !== w) return
      ultimo.current.setAviso({ texto: 'Detección parada antes de terminar: lo detectado hasta ahí se queda, sin corregir las piernas.' })
      cerrar()
    }
    cortar.current = cortarEste
    w.onmessage = (e: MessageEvent<DelWorkerPose>) => {
      if (worker.current !== w) return
      const m = e.data
      const u = ultimo.current
      if (m.tipo === 'cargando') {
        setProgreso({ fase: 'cargando', texto: m.texto })
      } else if (m.tipo === 'listo') {
        delegado = m.delegado
        avisoDelegado = m.avisoDelegado
        if (m.libreria) libreria = m.libreria
        hilos = m.hilos
        inicio = performance.now()
        setProgreso({ fase: 'delante', fraccion: 0, delegado, ...(hilos ? { hilos } : {}) })
      } else if (m.tipo === 'frames') {
        // El tiempo de cada frame es el de la tabla del visor (por su índice): todas las trayectorias de la vista llevan los
        // mismos instantes y el ángulo se empareja por ellos.
        const lote = m.lote.filter((f) => f.indice >= 0 && f.indice < total).map((f) => ({ indice: f.indice, t: tabla.tiempos[f.indice]!, puntos: f.puntos }))
        for (const f of lote) frames.set(f.indice, f)
        u.aplicarPose(lote)
        procesados += lote.length
        const s = (performance.now() - inicio) / 1000
        // Lo que queda, por lo que ha costado lo hecho (solo hacia delante: la pasada hacia atrás es corta).
        const restanteS = !m.atras && m.progreso > 0.02 && s > 3 ? (s * (1 - m.progreso)) / m.progreso : undefined
        setProgreso({
          fase: m.atras ? 'atras' : 'delante',
          fraccion: m.progreso,
          delegado,
          ...(hilos ? { hilos } : {}),
          ...(s > 1 ? { ritmo: procesados / s } : {}),
          ...(restanteS !== undefined ? { restanteS } : {}),
        })
      } else if (m.tipo === 'fin') {
        // Las piernas, en su lado; luego, todo lo detectado sustituye lo de antes (salvo lo marcado a mano).
        const correccion = corregirLados(trayectoriasPose(frames.values(), total), u.orientacion, tabla.tiempos, (u.orientacion.plano === 'frontal' ? UMBRAL_LADO_FRENTE : UMBRAL_LADO) * info.alto)
        u.fusionar(correccion.series)
        const cuenta = (tramos: readonly { desde: number; hasta: number }[]) => tramos.reduce((s, t) => s + t.hasta - t.desde + 1, 0)
        const conPersona = [...frames.values()].filter((f) => f.puntos).length
        const intercambiados = cuenta(correccion.intercambiados)
        const dudosos = cuenta(correccion.dudosos)
        setDeteccion({ modelo, libreria, delegado, fecha: new Date().toISOString(), conPersona, intercambiados, dudosos })
        setRevDeteccion((n) => n + 1)
        const partes = [
          `${m.motivo === 'final' ? 'Cuerpo detectado' : 'Detección parada'}: persona en ${conPersona} de ${total} frames`,
          ...(m.recuperados ? [`${m.recuperados} recuperados recorriendo el vídeo hacia atrás`] : []),
          ...(intercambiados ? [`piernas intercambiadas corregidas en ${intercambiados} frames`] : []),
          ...(dudosos ? [`en ${dudosos} frames no se sabe cuál es cada pierna: quedan dudosas (no se usan), corrígelas a mano si hace falta`] : []),
        ]
        u.setAviso({ texto: `${partes.join('; ')}.`, ...(avisoDelegado ? { detalle: avisoDelegado } : {}) })
        cerrar()
      } else {
        u.setAviso({ texto: `No se ha podido detectar el cuerpo: ${m.mensaje}` })
        cerrar()
      }
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      if (worker.current !== w) return
      ultimo.current.setAviso({ texto: `No se ha podido detectar el cuerpo: ${ev.message || 'no se ha podido cargar el proceso. Recarga la página.'}` })
      cerrar()
    }
    w.postMessage({ tipo: 'detectar', archivo: video.archivo, modelo, delegado: esRtmpose(modelo) && RTMPOSE_EN_CPU ? 'CPU' : 'GPU', ...(paso > 1 ? { paso } : {}) } satisfies AlWorkerPose)
  }, [video, modeloPose, soloAlgunos, alEmpezar, setAviso])

  const pararDeteccion = useCallback(() => {
    const w = worker.current
    if (!w) return
    if (fase.current === 'cargando') {
      cortar.current?.()
      return
    }
    w.postMessage({ tipo: 'cancelar' } satisfies AlWorkerPose)
    const corta = cortar.current
    setTimeout(() => {
      if (worker.current === w) corta?.()
    }, ESPERA_CANCELAR_MS)
  }, [])

  return { detectando: progreso !== null, progresoDeteccion: progreso, deteccion, revDeteccion, modeloPose, setModeloPose, soloAlgunos, setSoloAlgunos, detectar, pararDeteccion }
}
