import { useEffect, useMemo, useRef, useState } from 'react'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { Deriva } from '../core/reloj/deriva'
import type { EstimacionReloj } from '../core/reloj/desfase'
import { VERSION_PROTOCOLO, type EstadoMovil, type Mensaje } from '../core/sala/protocolo'
import { CanalSala, type EstadoCanal } from './canal'
import { ahora, urlRele } from './config'
import { RelojSala } from './reloj'

/*
 * Una sala de emparejamiento vista desde este móvil (fase 4, paso 4b): la conexión con el relé, lo que se sabe del otro
 * móvil (su vista, su estado, su versión de la app) y el reloj común. Se monta una vez por código (el componente que
 * la usa va con `key={codigo}`).
 *
 * Cuándo se manda qué: `hola` (versión y vista) al conectar, al entrar el otro y al cambiar de vista; `estado` (cámara,
 * espacio, batería) cada ESTADO_CADA_MS. Los pings los lleva `RelojSala`, que empieza de cero cada vez que el otro
 * entra (su reloj puede tener otro origen si ha recargado la página).
 */

export type Conexion = 'conectando' | 'esperando' | 'emparejado' | 'reconectando' | 'llena' | 'caducada' | 'cerrado'

export interface OtroMovil {
  readonly vista: OrientacionVista | null
  readonly version: number
  readonly estado: EstadoMovil | null
}

export interface Sala {
  readonly conexion: Conexion
  readonly otro: OtroMovil | null
  readonly reloj: EstimacionReloj | null
  readonly deriva: Deriva | null
  /** El otro móvil habla otra versión del protocolo: hay que recargar la app en los dos. */
  readonly versionDistinta: boolean
  readonly salir: () => void
  /** Manda un mensaje al otro móvil; false si ahora no hay conexión. */
  readonly enviar: (m: Mensaje) => boolean
  /** La estimación del reloj del otro en este instante (no la que se muestra, que se refresca cada segundo). */
  readonly relojAhora: () => EstimacionReloj | null
  readonly derivaAhora: () => Deriva | null
  /** Oye los mensajes de la grabación (programar, confirmar, parar, cancelar). Devuelve cómo dejar de oír. */
  readonly escuchar: (oyente: (m: Mensaje) => void) => () => void
}

const DE_GRABACION = new Set<Mensaje['tipo']>(['programar', 'confirmar', 'parar', 'cancelar'])

const ESTADO_CADA_MS = 2000
const RELOJ_CADA_MS = 1000

const deCanal = (e: EstadoCanal): Conexion | null =>
  e === 'conectando' || e === 'reconectando' || e === 'llena' || e === 'caducada' || e === 'cerrado' ? e : null

export function useSala(codigo: string, vista: OrientacionVista | null, miEstado: EstadoMovil): Sala {
  const [conexion, setConexion] = useState<Conexion>('conectando')
  const [otro, setOtro] = useState<OtroMovil | null>(null)
  const [reloj, setReloj] = useState<EstimacionReloj | null>(null)
  const [deriva, setDeriva] = useState<Deriva | null>(null)
  const canal = useRef<CanalSala | null>(null)
  const relojRef = useRef<RelojSala | null>(null)
  const oyentes = useRef(new Set<(m: Mensaje) => void>())
  // Lo último que hay que mandar, para los temporizadores y los avisos (que no se vuelven a crear al cambiar).
  const vistaRef = useRef(vista)
  const estadoRef = useRef(miEstado)
  useEffect(() => {
    estadoRef.current = miEstado
  }, [miEstado])

  useEffect(() => {
    const hola = () => canal.current?.enviar({ tipo: 'hola', version: VERSION_PROTOCOLO, vista: vistaRef.current })
    const estado = () => canal.current?.enviar({ tipo: 'estado', ...estadoRef.current })
    const relojSala = new RelojSala((m: Mensaje) => canal.current?.enviar(m) ?? false, ahora)
    relojRef.current = relojSala

    const c = new CanalSala(`${urlRele()}/sala/${codigo}`, (e) => {
      if (e.tipo === 'estado') {
        if (e.estado === 'abierto') hola()
        const conx = deCanal(e.estado)
        if (conx) {
          setConexion(conx)
          if (conx !== 'conectando') {
            setOtro(null)
            relojSala.parar()
          }
        }
      } else if (e.tipo === 'aviso') {
        if (e.aviso.rele === 'sale' || (e.aviso.rele === 'bienvenida' && e.aviso.ocupantes < 2)) {
          setConexion('esperando')
          setOtro(null)
          setReloj(null)
          setDeriva(null)
          relojSala.parar()
        } else {
          // Somos dos: el que estaba se presenta al que llega, y los dos empiezan el reloj de cero.
          setConexion('emparejado')
          if (e.aviso.rele === 'entra') hola()
          estado()
          relojSala.reiniciar()
        }
      } else {
        const m = e.mensaje
        if (m.tipo === 'hola') setOtro((o) => ({ vista: m.vista, version: m.version, estado: o?.estado ?? null }))
        else if (m.tipo === 'estado') {
          const recibido: EstadoMovil = {
            camara: m.camara,
            libreMB: m.libreMB,
            bateria: m.bateria,
            grabando: m.grabando,
            codificador: m.codificador,
            microExterno: m.microExterno,
            fpsGrabacion: m.fpsGrabacion,
          }
          setOtro((o) => ({ vista: o?.vista ?? null, version: o?.version ?? VERSION_PROTOCOLO, estado: recibido }))
        } else if (m.tipo === 'ping' || m.tipo === 'pong') relojSala.recibir(m)
        else if (m.tipo === 'adios') setOtro(null)
        else if (DE_GRABACION.has(m.tipo)) for (const o of oyentes.current) o(m)
      }
    })
    canal.current = c

    const cadaEstado = setInterval(estado, ESTADO_CADA_MS)
    const cadaReloj = setInterval(() => {
      setReloj(relojSala.estimacion())
      setDeriva(relojSala.deriva())
    }, RELOJ_CADA_MS)
    return () => {
      clearInterval(cadaEstado)
      clearInterval(cadaReloj)
      relojSala.parar()
      c.cerrar()
      canal.current = null
      relojRef.current = null
    }
  }, [codigo])

  // Al cambiar de vista, el otro se entera enseguida.
  useEffect(() => {
    vistaRef.current = vista
    canal.current?.enviar({ tipo: 'hola', version: VERSION_PROTOCOLO, vista })
  }, [vista])

  // Solo leen refs: las mismas en cada render (quien se suscribe con `escuchar` no se rehace).
  const acciones = useMemo(
    () => ({
      salir: () => canal.current?.cerrar(),
      enviar: (m: Mensaje) => canal.current?.enviar(m) ?? false,
      relojAhora: () => relojRef.current?.estimacion() ?? null,
      derivaAhora: () => relojRef.current?.deriva() ?? null,
      escuchar: (oyente: (m: Mensaje) => void) => {
        oyentes.current.add(oyente)
        return () => void oyentes.current.delete(oyente)
      },
    }),
    [],
  )

  return { conexion, otro, reloj, deriva, versionDistinta: otro !== null && otro.version !== VERSION_PROTOCOLO, ...acciones }
}
