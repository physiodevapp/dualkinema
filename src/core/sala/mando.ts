/*
 * El mando (un ordenador en la sala que maneja los dos móviles; ver `protocolo.ts` y `rele.ts`): lo que sabe de cada
 * móvil, qué falta para poder grabar y a qué móvil manda las órdenes. Solo informa: cada móvil vuelve a comprobar lo
 * suyo al recibir una orden (la grabación doble no se salta ninguna de sus reglas, `doble.ts`).
 */
import type { OrientacionVista } from '../geometria/canonico'
import { ESPACIO_MINIMO_MB, vistasCompatibles } from './doble'
import { VERSION_PROTOCOLO, type EstadoMovil, type MotivoRechazo } from './protocolo'

export interface MovilEnMando {
  readonly id: string
  readonly vista: OrientacionVista | null
  /** null: aún no se ha presentado (`hola`). */
  readonly version: number | null
  readonly estado: EstadoMovil | null
  /** Último mensaje suyo (ms del reloj del mando). */
  readonly visto: number
}

/** Un móvil que no manda nada en este tiempo se da por ido (el estado llega cada 2 s). */
export const SIN_NOTICIAS_MS = 6000

/**
 * Los móviles con noticias recientes (como mucho dos: los últimos), el que entró primero en la sala delante (el «Móvil 1»,
 * normalmente el que la creó; cada móvil dice en su pantalla qué número es); sin saberlo, en el orden en que llegaron al
 * mando.
 */
export function movilesVivos(moviles: readonly MovilEnMando[], ahora: number): MovilEnMando[] {
  const vivos = moviles.filter((m) => ahora - m.visto <= SIN_NOTICIAS_MS).slice(-2)
  const rango = (m: MovilEnMando) => (m.estado?.primero === true ? 0 : m.estado?.primero === false ? 2 : 1)
  return vivos.map((m, i) => ({ m, i })).sort((p, q) => rango(p.m) - rango(q.m) || p.i - q.i).map((x) => x.m)
}

/** Lo que falta para grabar, en el orden en que hay que arreglarlo; vacío si se puede. */
export function faltaParaGrabar(moviles: readonly MovilEnMando[]): string[] {
  if (moviles.length < 2) return [moviles.length === 0 ? 'Faltan los dos móviles: crea la sala en uno y únete con el otro.' : 'Falta el otro móvil.']
  const [a, b] = moviles as [MovilEnMando, MovilEnMando]
  const r: string[] = []
  if (moviles.some((m) => m.version !== null && m.version !== VERSION_PROTOCOLO)) r.push('Algún móvil tiene otra versión de la app: recarga la página en los tres.')
  if (!a.vista || !b.vista) r.push('Falta elegir en cada móvil cómo ve a la persona.')
  else if (!vistasCompatibles(a.vista, b.vista))
    r.push('Las dos vistas no casan: una de perfil y otra de frente o de espaldas, o cada una en un flanco (mirando a lados distintos).')
  if (moviles.some((m) => !m.estado?.camara)) r.push('Algún móvil no tiene la cámara abierta.')
  if (moviles.some((m) => m.estado && m.estado.reloj === null)) r.push('Los móviles aún están midiendo el reloj común.')
  if (moviles.some((m) => m.estado?.libreMB != null && m.estado.libreMB < ESPACIO_MINIMO_MB)) r.push('A algún móvil le queda poco espacio.')
  return r
}

/**
 * A quién se manda «Parar los dos»: a cada móvil que esté grabando (si uno se ha cortado —bloqueado, app en segundo
 * plano— el otro sigue y hay que pararlo a él: el 12-11 la orden iba solo al primero, que ya no grababa, y el otro
 * siguió); si ninguno graba (cuenta atrás), al que recibe las órdenes.
 */
export function destinosParar(moviles: readonly MovilEnMando[]): MovilEnMando[] {
  const grabando = moviles.filter((m) => m.estado?.grabando)
  if (grabando.length) return grabando
  const d = destino(moviles)
  return d ? [d] : []
}

/** Si alguno está grabando (o parando). */
export const grabando = (moviles: readonly MovilEnMando[]): boolean => moviles.some((m) => m.estado?.grabando)

/**
 * El móvil al que se mandan las órdenes de los dos (programar, parar, el encuadre): el primero que llegó. Programar en uno
 * basta (él se lo pide al otro, como si se pulsara «Grabar» en él); lo mismo el encuadre (él pide al otro que mire).
 */
export const destino = (moviles: readonly MovilEnMando[]): MovilEnMando | null => moviles[0] ?? null

/** Lo que se dice en el mando cuando el móvil al que se le pidió grabar no ha podido (`EstadoMovil.rechazo`). */
export const TEXTO_RECHAZO: Record<MotivoRechazo, string> = {
  'sin-camara': 'tiene la cámara cerrada (¿se ha bloqueado la pantalla o la app ha quedado detrás?)',
  'sin-otro': 'no está emparejado con el otro móvil',
  'sin-vista': 'las vistas de los dos móviles no casan',
  'sin-reloj': 'aún se está midiendo el reloj común',
  ocupado: 'ya estaba grabando o con una cuenta atrás',
}

/** El rechazo de una orden que llegó después de pedirla (`antes`: el contador de rechazos del móvil al pedirla). */
export function rechazoNuevo(m: MovilEnMando | null, antes: number): MotivoRechazo | null {
  const r = m?.estado?.rechazo
  return r && r.n > antes ? r.motivo : null
}
