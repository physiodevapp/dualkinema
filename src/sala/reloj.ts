import { estimarDeriva, type Deriva } from '../core/reloj/deriva'
import { estimarDesfase, type EstimacionReloj, type Intercambio } from '../core/reloj/desfase'
import type { Mensaje } from '../core/sala/protocolo'

/*
 * El reloj común de la sala (fase 4, paso 4b; D7): pings al otro móvil, respuestas a los suyos y la estimación del desfase
 * entre los dos relojes con el núcleo (`core/reloj/`). Cada móvil mide el del otro, así que cualquiera puede programar.
 *
 * Al emparejar (o cuando el otro vuelve a entrar: su reloj ha cambiado de origen) manda una ráfaga de RAFAGA pings cada
 * INTERVALO_RAFAGA_MS, y después uno por segundo. El desfase sale de los últimos VENTANA intercambios (unos 30 s); la
 * deriva, de todos los que hay desde que entró el otro.
 */

export const RAFAGA = 30
export const INTERVALO_RAFAGA_MS = 50
export const INTERVALO_MS = 1000
export const VENTANA = 30
/** Intercambios que se guardan (unos 10 min a uno por segundo): bastan para la deriva y no crecen sin límite. */
export const MAXIMO_GUARDADOS = 600
/** Un ping sin respuesta en este tiempo se olvida (la respuesta tardía no se usa). */
export const CADUCIDAD_PING_MS = 5000

export class RelojSala {
  private intercambios: Intercambio[] = []
  private pendientes = new Map<number, number>()
  private siguienteId = 1
  private temporizador: ReturnType<typeof setTimeout> | null = null
  private enRafaga = 0

  constructor(
    private readonly enviar: (m: Mensaje) => boolean,
    private readonly ahora: () => number,
  ) {}

  /** Empieza de cero (el otro acaba de entrar o volver a entrar) con una ráfaga de pings. */
  reiniciar() {
    this.intercambios = []
    this.pendientes.clear()
    this.enRafaga = RAFAGA
    this.programar(0)
  }

  parar() {
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
  }

  private programar(ms: number) {
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = setTimeout(() => this.pingear(), ms)
  }

  private pingear() {
    const t1 = this.ahora()
    for (const [id, t] of this.pendientes) if (t1 - t > CADUCIDAD_PING_MS) this.pendientes.delete(id)
    const id = this.siguienteId++
    if (this.enviar({ tipo: 'ping', id, t1 })) this.pendientes.set(id, t1)
    if (this.enRafaga > 0) this.enRafaga--
    this.programar(this.enRafaga > 0 ? INTERVALO_RAFAGA_MS : INTERVALO_MS)
  }

  /** Mensajes del reloj que llegan del otro móvil. */
  recibir(m: Mensaje) {
    if (m.tipo === 'ping') {
      const t2 = this.ahora()
      this.enviar({ tipo: 'pong', id: m.id, t1: m.t1, t2, t3: this.ahora() })
    } else if (m.tipo === 'pong') {
      const t4 = this.ahora()
      const t1 = this.pendientes.get(m.id)
      // Solo se acepta la respuesta a un ping propio y vivo, con su mismo t1 (no uno de antes de reiniciar).
      if (t1 === undefined || t1 !== m.t1) return
      this.pendientes.delete(m.id)
      this.intercambios.push({ t1, t2: m.t2, t3: m.t3, t4 })
      if (this.intercambios.length > MAXIMO_GUARDADOS) this.intercambios.splice(0, this.intercambios.length - MAXIMO_GUARDADOS)
    }
  }

  /** Reloj del otro − el mío (ms) con su cota; null hasta el primer intercambio. */
  estimacion(): EstimacionReloj | null {
    return estimarDesfase(this.intercambios.slice(-VENTANA))
  }

  deriva(): Deriva | null {
    return estimarDeriva(this.intercambios)
  }

  get numero(): number {
    return this.intercambios.length
  }
}
