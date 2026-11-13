/*
 * Barrera de red en el código (fase 10, D1 de docs/plan-fase-10.md): nada sale del dispositivo, tampoco el registro de uso
 * que la librería de MediaPipe intenta mandar a `odml.pa.googleapis.com` (está en `vision_bundle` de
 * @mediapipe/tasks-vision 1.1.0; lo vio orbicula). Se pone antes de cargar MediaPipe en cada worker que lo usa: cambia
 * `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` y `EventSource` por versiones que solo dejan pasar lo del
 * propio sitio (y `data:` / `blob:`) y lo de la lista blanca. Es la segunda barrera; la primera es la CSP de `_headers`.
 */

/** Lo único de otro sitio que la app descarga a propósito: el modelo *heavy* de MediaPipe (no cabe en Cloudflare). */
export const PERMITIDOS_FUERA: readonly string[] = ['https://storage.googleapis.com/mediapipe-models/']

/** Si una dirección puede pedirse desde `base` (la del worker o la página). */
export function permitida(url: string, base: string, fuera: readonly string[] = PERMITIDOS_FUERA): boolean {
  let u: URL
  try {
    u = new URL(url, base)
  } catch {
    return false
  }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return true
  if (u.origin === new URL(base).origin) return true
  return fuera.some((p) => u.href.startsWith(p))
}

const MENSAJE = 'dualkinema no hace llamadas de red a otros sitios (privacidad)'

/** El host de una dirección, para contarlo (sin la ruta ni la consulta). */
const hostDe = (url: string, base: string) => {
  try {
    return new URL(url, base).host || 'desconocido'
  } catch {
    return 'dirección no válida'
  }
}

/**
 * Pone la barrera en `scope` (`self` en un worker). Devuelve los hosts a los que se intentó llamar. Idempotente: si ya
 * está puesta, no la vuelve a poner.
 */
export function instalarBarreraRed(scope: typeof globalThis, alBloquear?: (host: string) => void): { bloqueados: Set<string> } {
  const marca = scope as unknown as { __barreraRed?: { bloqueados: Set<string> } }
  if (marca.__barreraRed) return marca.__barreraRed
  const bloqueados = new Set<string>()
  const base = scope.location?.href ?? 'http://localhost/'
  const bloquear = (url: string) => {
    const host = hostDe(url, base)
    bloqueados.add(host)
    alBloquear?.(host)
  }
  if (typeof scope.fetch === 'function') {
    const original = scope.fetch.bind(scope)
    scope.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      if (!permitida(url, base)) {
        bloquear(url)
        return Promise.reject(new TypeError(MENSAJE))
      }
      return original(entrada, init)
    }) as typeof fetch
  }
  if (typeof scope.XMLHttpRequest === 'function') {
    const abrir = scope.XMLHttpRequest.prototype.open
    scope.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metodo: string, url: string | URL, ...resto: unknown[]) {
      const href = String(url)
      if (!permitida(href, base)) {
        bloquear(href)
        throw new TypeError(MENSAJE)
      }
      return (abrir as (...a: unknown[]) => void).call(this, metodo, url, ...resto)
    } as typeof abrir
  }
  const nav = scope.navigator as Navigator | undefined
  if (nav && typeof nav.sendBeacon === 'function') {
    const enviar = nav.sendBeacon.bind(nav)
    nav.sendBeacon = (url: string | URL, datos?: BodyInit | null) => {
      if (!permitida(String(url), base)) {
        bloquear(String(url))
        return false
      }
      return enviar(url, datos)
    }
  }
  for (const nombre of ['WebSocket', 'EventSource'] as const) {
    const Original = (scope as unknown as Record<string, unknown>)[nombre] as (new (url: string | URL, ...r: unknown[]) => object) | undefined
    if (typeof Original !== 'function') continue
    const Envuelta = function (url: string | URL, ...resto: unknown[]) {
      if (!permitida(String(url), base)) {
        bloquear(String(url))
        throw new TypeError(MENSAJE)
      }
      return new Original(url, ...resto)
    }
    Envuelta.prototype = Original.prototype
    ;(scope as unknown as Record<string, unknown>)[nombre] = Envuelta
  }
  marca.__barreraRed = { bloqueados }
  return marca.__barreraRed
}
