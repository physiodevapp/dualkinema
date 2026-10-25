import { leerMensaje, escribirMensaje, type Mensaje } from '../core/sala/protocolo'
import { CIERRE, leerAviso, type AvisoRele } from '../core/sala/rele'

/*
 * El WebSocket con el relé de una sala (fase 4, paso 4b): se reconecta solo (1, 2, 4… hasta 15 s) si se corta, salvo
 * que la sala esté llena o se cierre a propósito. Distingue los avisos del relé (`rele`) de los mensajes del otro móvil
 * (`tipo`, leídos con `leerMensaje`: lo que no se entiende se ignora).
 */

export type EstadoCanal = 'conectando' | 'abierto' | 'reconectando' | 'llena' | 'caducada' | 'cerrado'

export type EventoCanal =
  | { readonly tipo: 'estado'; readonly estado: EstadoCanal }
  | { readonly tipo: 'aviso'; readonly aviso: AvisoRele }
  | { readonly tipo: 'mensaje'; readonly mensaje: Mensaje }

const ESPERA_MAXIMA_MS = 15_000

export class CanalSala {
  private ws: WebSocket | null = null
  private intentos = 0
  private temporizador: ReturnType<typeof setTimeout> | null = null
  private cerrado = false

  constructor(
    private readonly url: string,
    private readonly alEvento: (e: EventoCanal) => void,
  ) {
    this.conectar()
  }

  private conectar() {
    this.alEvento({ tipo: 'estado', estado: this.intentos === 0 ? 'conectando' : 'reconectando' })
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return
      this.intentos = 0
      this.alEvento({ tipo: 'estado', estado: 'abierto' })
    })
    ws.addEventListener('message', (e) => {
      if (this.ws !== ws || typeof e.data !== 'string') return
      const aviso = leerAviso(e.data)
      if (aviso) return this.alEvento({ tipo: 'aviso', aviso })
      const mensaje = leerMensaje(e.data)
      if (mensaje) this.alEvento({ tipo: 'mensaje', mensaje })
    })
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.cerrado) return
      if (e.code === CIERRE.llena) return this.alEvento({ tipo: 'estado', estado: 'llena' })
      if (e.code === CIERRE.caducada) return this.alEvento({ tipo: 'estado', estado: 'caducada' })
      // Cualquier otro cierre (red, pantalla apagada, relé reiniciado): se vuelve a intentar.
      const espera = Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** this.intentos++)
      this.alEvento({ tipo: 'estado', estado: 'reconectando' })
      this.temporizador = setTimeout(() => this.conectar(), espera)
    })
  }

  /** Manda un mensaje al otro móvil; false si ahora no hay conexión (se pierde: los mensajes son de estado y se repiten). */
  enviar(m: Mensaje): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(escribirMensaje(m))
    return true
  }

  cerrar() {
    this.cerrado = true
    if (this.temporizador) clearTimeout(this.temporizador)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(escribirMensaje({ tipo: 'adios' }))
    this.ws?.close(1000, 'adiós')
    this.ws = null
    this.alEvento({ tipo: 'estado', estado: 'cerrado' })
  }
}
