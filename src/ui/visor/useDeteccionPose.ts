import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { DeteccionPose, IdMarcador, Muestra2D, TamanoModeloPose } from '../../core/modelo/tipos'
import { corregirLados } from '../../core/pose/cambiosLado'
import { trayectoriasPose, type FramePose } from '../../core/pose/puntos'
import type { VideoAbierto } from '../../media/video'
import type { AlWorkerPose, DelWorkerPose } from '../../workers/protocolo'
import type { Aviso } from './useSeguimiento'

/** Lo que se ve mientras se detecta: cargando el modelo, recorriendo el vídeo o la pasada hacia atrás. */
export type ProgresoDeteccion = { fase: 'cargando' } | { fase: 'delante' | 'atras'; fraccion: number }

/** Salto (fracción del alto del vídeo) a partir del cual cambiar de lado de un frame al siguiente cuenta como intercambio. */
const UMBRAL_LADO = 0.05

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
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])

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
    const w = new Worker(new URL('../../workers/pose.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const frames = new Map<number, FramePose>()
    let delegado: 'GPU' | 'CPU' = 'GPU'
    let avisoDelegado: string | undefined
    const modelo = modeloPose
    setProgreso({ fase: 'cargando' })
    setAviso(null)
    const cerrar = () => {
      w.terminate()
      if (worker.current === w) worker.current = null
      setProgreso(null)
    }
    w.onmessage = (e: MessageEvent<DelWorkerPose>) => {
      if (worker.current !== w) return
      const m = e.data
      const u = ultimo.current
      if (m.tipo === 'listo') {
        delegado = m.delegado
        avisoDelegado = m.avisoDelegado
        setProgreso({ fase: 'delante', fraccion: 0 })
      } else if (m.tipo === 'frames') {
        // El tiempo de cada frame es el de la tabla del visor (por su índice): todas las trayectorias de la vista llevan los
        // mismos instantes y el ángulo se empareja por ellos.
        const lote = m.lote.filter((f) => f.indice >= 0 && f.indice < total).map((f) => ({ indice: f.indice, t: tabla.tiempos[f.indice]!, puntos: f.puntos }))
        for (const f of lote) frames.set(f.indice, f)
        u.aplicarPose(lote)
        setProgreso({ fase: m.atras ? 'atras' : 'delante', fraccion: m.progreso })
      } else if (m.tipo === 'fin') {
        // Las piernas, en su lado; luego, todo lo detectado sustituye lo de antes (salvo lo marcado a mano).
        const correccion = corregirLados(trayectoriasPose(frames.values(), total), u.orientacion, tabla.tiempos, UMBRAL_LADO * info.alto)
        u.fusionar(correccion.series)
        const cuenta = (tramos: readonly { desde: number; hasta: number }[]) => tramos.reduce((s, t) => s + t.hasta - t.desde + 1, 0)
        const conPersona = [...frames.values()].filter((f) => f.puntos).length
        const intercambiados = cuenta(correccion.intercambiados)
        const dudosos = cuenta(correccion.dudosos)
        setDeteccion({ modelo, libreria: __MEDIAPIPE__, delegado, fecha: new Date().toISOString(), conPersona, intercambiados, dudosos })
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
    w.postMessage({ tipo: 'detectar', archivo: video.archivo, modelo, delegado: 'GPU' } satisfies AlWorkerPose)
  }, [video, modeloPose, alEmpezar, setAviso])

  const pararDeteccion = useCallback(() => worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorkerPose), [])

  return { detectando: progreso !== null, progresoDeteccion: progreso, deteccion, revDeteccion, modeloPose, setModeloPose, detectar, pararDeteccion }
}
