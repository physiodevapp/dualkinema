import { muestrasSecuencia } from '../core/sincronia/pitido'

/*
 * Lo que suena en la grabación con dos móviles y en la claqueta (fase 4, pasos 5 y 6), con Web Audio. El contexto tiene
 * que crearse o reanudarse tras un toque (norma de los navegadores): sin él no suena nada (la cuenta atrás se ve igual).
 *
 * El pitido de referencia (`core/sincronia/pitido.ts`) se programa en un instante del reloj de la app
 * (`performance.now()`): se pasa al reloj del contexto con la diferencia de ahora y se adelanta la latencia de salida
 * que dice el navegador (`baseLatency` + `outputLatency`), para que suene cuando toca y no decenas de ms después. Lo
 * que quede de error da igual para el desfase (los dos micrófonos graban el mismo sonido); solo tiene que caer dentro
 * de la ventana de búsqueda (VENTANA_ANTES_S antes y VENTANA_DESPUES_S después). La latencia declarada no es toda: en
 * la primera prueba real sonó 190 ms tarde en el Pixel 8 y 340 ms en una tablet antigua.
 */

/** Volumen de la secuencia (0–1): alto, sin llegar a saturar la salida. */
export const VOLUMEN_PITIDO = 0.9

/** Un pitido corto (cuenta atrás). */
export function pitar(ctx: AudioContext | null, hz = 880) {
  if (!ctx || ctx.state !== 'running') return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.25, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  o.frequency.value = hz
  o.connect(g).connect(ctx.destination)
  o.start()
  o.stop(ctx.currentTime + 0.12)
}

/** Programa la secuencia para que suene en `instante` (ms del reloj de la app, que ahora marca `ahora`). false si no puede. */
export function emitirSecuencia(ctx: AudioContext | null, instante: number, ahora: number): boolean {
  if (!ctx || ctx.state !== 'running') return false
  const datos = muestrasSecuencia(ctx.sampleRate)
  const buffer = ctx.createBuffer(1, datos.length, ctx.sampleRate)
  buffer.getChannelData(0).set(datos.map((x) => x * VOLUMEN_PITIDO))
  const fuente = ctx.createBufferSource()
  fuente.buffer = buffer
  fuente.connect(ctx.destination)
  const latencia = (ctx.baseLatency || 0) + ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0)
  fuente.start(Math.max(ctx.currentTime, ctx.currentTime + (instante - ahora) / 1000 - latencia))
  return true
}
