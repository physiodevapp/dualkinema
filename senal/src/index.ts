import { DurableObject } from 'cloudflare:workers'
import { normalizarCodigo } from '../../src/core/sala/codigo'
import { TAMANO_MAXIMO_MENSAJE } from '../../src/core/sala/protocolo'
import { cabe, CIERRE, DURACION_MAXIMA_SALA_MS, gastarFicha, origenPermitido, rolDeUrl, textoAviso, type Cubo, type Rol } from '../../src/core/sala/rele'

/*
 * Relé de salas (fase 4, paso 4). `GET /sala/<código>` con `Upgrade: websocket` une al móvil a la sala de ese código: un
 * Durable Object por código, con la API de hibernación (sin coste mientras nadie habla). Lo que manda uno se reenvía tal
 * cual a los demás (el otro móvil y, si lo hay, el mando: `?rol=mando`); el relé no lo lee ni lo guarda. Las decisiones (quién entra, ritmo, tamaño, orígenes) están en
 * `src/core/sala/rele.ts`, con sus tests.
 */

interface Env {
  SALAS: DurableObjectNamespace
}

interface Adjunto {
  readonly cubo: Cubo | null
  /** Sin él (una conexión de antes de que hubiera mando), un móvil. */
  readonly rol?: Rol
}

const abiertos = (ws: WebSocket[], salvo?: WebSocket) => ws.filter((s) => s !== salvo && s.readyState === WebSocket.OPEN)
const rolDe = (ws: WebSocket): Rol => (ws.deserializeAttachment() as Adjunto | null)?.rol ?? 'movil'
const moviles = (ws: WebSocket[]) => ws.filter((s) => rolDe(s) === 'movil')
const mandos = (ws: WebSocket[]) => ws.filter((s) => rolDe(s) === 'mando')

export class Sala extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const rol = rolDeUrl(req.url)
    const ya = abiertos(this.ctx.getWebSockets())
    const { 0: cliente, 1: servidor } = new WebSocketPair()
    if (!cabe(rol, moviles(ya).length, mandos(ya).length)) {
      // Se abre y se cierra con su código (4001), para que sepa por qué; cerrado antes de devolver la respuesta, el cierre
      // no le llegaba. Sin hibernación: no va a quedarse.
      servidor.accept()
      setTimeout(() => servidor.close(CIERRE.llena, 'sala llena'), 0)
      return new Response(null, { status: 101, webSocket: cliente })
    }
    this.ctx.acceptWebSocket(servidor)
    servidor.serializeAttachment({ cubo: null, rol } satisfies Adjunto)
    if (ya.length === 0 && (await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DURACION_MAXIMA_SALA_MS)
    const nMoviles = moviles(ya).length + (rol === 'movil' ? 1 : 0)
    const hayMando = rol === 'mando' || mandos(ya).length > 0
    servidor.send(textoAviso({ rele: 'bienvenida', ocupantes: nMoviles, mando: hayMando }))
    if (rol === 'movil') for (const s of ya) s.send(textoAviso({ rele: 'entra', ocupantes: nMoviles }))
    else for (const s of moviles(ya)) s.send(textoAviso({ rele: 'mando', presente: true, ocupantes: nMoviles }))
    return new Response(null, { status: 101, webSocket: cliente })
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer): Promise<void> {
    if (typeof mensaje !== 'string' || mensaje.length > TAMANO_MAXIMO_MENSAJE) {
      ws.close(CIERRE.mensaje, 'mensaje no válido')
      return
    }
    const adjunto = (ws.deserializeAttachment() as Adjunto | null) ?? { cubo: null }
    const r = gastarFicha(adjunto.cubo, Date.now())
    ws.serializeAttachment({ cubo: r.cubo, rol: adjunto.rol ?? 'movil' } satisfies Adjunto)
    if (!r.permitido) {
      ws.close(CIERRE.ritmo, 'demasiados mensajes')
      return
    }
    for (const s of abiertos(this.ctx.getWebSockets(), ws)) s.send(mensaje)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.salir(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.salir(ws)
  }

  private async salir(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'adiós')
    } catch {
      // ya cerrado
    }
    const quedan = abiertos(this.ctx.getWebSockets(), ws)
    const nMoviles = moviles(quedan).length
    if (rolDe(ws) === 'mando') for (const s of moviles(quedan)) s.send(textoAviso({ rele: 'mando', presente: false, ocupantes: nMoviles }))
    else for (const s of quedan) s.send(textoAviso({ rele: 'sale', ocupantes: nMoviles }))
    if (quedan.length === 0) await this.ctx.storage.deleteAlarm()
  }

  async alarm(): Promise<void> {
    for (const s of this.ctx.getWebSockets()) s.close(CIERRE.caducada, 'sala caducada')
  }
}

/** El código de `/sala/<código>`; null si no se entiende (también con un `%` mal escrito: daba un 500). */
function codigoDeRuta(trozo: string): string | null {
  try {
    return normalizarCodigo(decodeURIComponent(trozo))
  } catch {
    return null
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/salud') return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    const m = /^\/sala\/([^/]+)$/.exec(url.pathname)
    const codigo = m ? codigoDeRuta(m[1]!) : null
    if (!codigo) return new Response('sala no válida', { status: 400 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('hace falta un WebSocket', { status: 426 })
    if (!origenPermitido(req.headers.get('Origin'))) return new Response('origen no permitido', { status: 403 })
    return env.SALAS.get(env.SALAS.idFromName(codigo)).fetch(req)
  },
}
