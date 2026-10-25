/*
 * Lo poco del entorno de Cloudflare Workers que usa el relé, declarado a mano (sin añadir @cloudflare/workers-types por
 * cuatro tipos). Si se usa algo más, se declara aquí.
 */
declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
  readonly storage: {
    setAlarm(cuando: number): Promise<void>
    deleteAlarm(): Promise<void>
    getAlarm(): Promise<number | null>
  }
}

interface DurableObjectStub {
  fetch(req: Request): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(nombre: string): unknown
  get(id: unknown): DurableObjectStub
}

interface WebSocket {
  accept(): void
  serializeAttachment(v: unknown): void
  deserializeAttachment(): unknown
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface ResponseInit {
  webSocket?: WebSocket
}
