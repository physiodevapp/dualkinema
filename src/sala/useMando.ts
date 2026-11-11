import { useCallback, useEffect, useRef, useState } from 'react'
import { movilesVivos, type MovilEnMando } from '../core/sala/mando'
import { soloEstado, type Orden } from '../core/sala/protocolo'
import { REGISTRO_MAXIMO, sucesosNuevos, type EntradaRegistro } from '../core/sala/sucesos'
import { CanalSala, type EstadoCanal } from './canal'
import { urlRele } from './config'

/*
 * El mando visto desde el ordenador: se une a la sala como mando (`?rol=mando`; el relé no lo cuenta como móvil), oye a
 * los dos móviles (cada uno se presenta con su id en `hola` y `estado`) y les manda órdenes. No hace pings ni graba, y al
 * salir no dice «adiós» (un móvil lo tomaría por el otro móvil). Por aquí no pasa vídeo: solo el estado de cada móvil.
 */

export interface Mando {
  readonly conexion: EstadoCanal
  /** Los móviles con noticias recientes, en el orden en que llegaron. */
  readonly moviles: readonly MovilEnMando[]
  /** Manda una orden a un móvil; false si ahora no hay conexión. */
  readonly ordenar: (para: string, orden: Orden) => boolean
  /** Lo que ha pasado al grabar en los móviles desde que se abrió el mando, lo más reciente primero. */
  readonly registro: readonly EntradaRegistro[]
}

/** Cada cuánto se miran los móviles sin noticias (ms). */
const REPASO_MS = 1000

export function useMando(codigo: string): Mando {
  const [conexion, setConexion] = useState<EstadoCanal>('conectando')
  const [todos, setTodos] = useState<readonly MovilEnMando[]>([])
  const [reloj, setReloj] = useState(() => performance.now())
  const canal = useRef<CanalSala | null>(null)
  const [registro, setRegistro] = useState<readonly EntradaRegistro[]>([])

  useEffect(() => {
    // El último suceso visto de cada móvil (por su id).
    const ultimos = new Map<string, number>()
    // Actualiza un móvil por su id (lo añade si es nuevo, al final).
    const poner = (id: string, cambio: (m: MovilEnMando) => MovilEnMando) =>
      setTodos((ms) => {
        const previo = ms.find((m) => m.id === id) ?? { id, vista: null, version: null, estado: null, visto: 0 }
        const nuevo = { ...cambio(previo), visto: performance.now() }
        return ms.some((m) => m.id === id) ? ms.map((m) => (m.id === id ? nuevo : m)) : [...ms, nuevo]
      })
    const c = new CanalSala(
      `${urlRele()}/sala/${codigo}?rol=mando`,
      (e) => {
        if (e.tipo === 'estado') setConexion(e.estado)
        else if (e.tipo === 'aviso') {
          // Sale un móvil: el relé no dice cuál; el que se fue deja de mandar y se cae solo (`movilesVivos`).
          if (e.aviso.rele === 'bienvenida' && e.aviso.ocupantes === 0) setTodos([])
        } else {
          const m = e.mensaje
          if (m.tipo === 'hola' && m.movil) poner(m.movil, (p) => ({ ...p, vista: m.vista, version: m.version }))
          else if (m.tipo === 'estado' && m.movil) {
            const id = m.movil
            poner(id, (p) => ({ ...p, estado: soloEstado(m) }))
            const { nuevos, ultimo } = sucesosNuevos(m.sucesos, ultimos.get(id))
            ultimos.set(id, ultimo)
            if (nuevos.length) {
              const hora = Date.now()
              setRegistro((r) => [...nuevos.map((suceso) => ({ movil: id, hora, suceso })).reverse(), ...r].slice(0, REGISTRO_MAXIMO))
            }
          }
        }
      },
      false,
    )
    canal.current = c
    const repaso = setInterval(() => setReloj(performance.now()), REPASO_MS)
    return () => {
      clearInterval(repaso)
      c.cerrar()
      canal.current = null
    }
  }, [codigo])

  const ordenar = useCallback((para: string, orden: Orden) => canal.current?.enviar({ tipo: 'orden', para, ...orden }) ?? false, [])

  return { conexion, moviles: movilesVivos(todos, reloj), ordenar, registro }
}
