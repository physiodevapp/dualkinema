import { CALIDADES, CALIDAD_POR_DEFECTO, bitrateDe, type Calidad } from './grabadora'

/*
 * ¿Codifica este móvil el vídeo por hardware? (fase 4, paso 6). Sin codificador por hardware, Chrome codifica por
 * software y no llega a 30 fps: la tablet del usuario (VP9 por software) grabó a 10 fps a 1080p y a 15 a 720p, con la
 * cámara dando 30. La app lo dice antes de grabar, empieza en 720p (que algo ayuda) y en la sala se lo cuenta al otro
 * móvil. Es lo que dice el navegador (`isConfigSupported` con `prefer-hardware`), no una medida: los fps reales se
 * revisan al parar (`revisarFps`).
 */

export type Aceleracion = 'hardware' | 'software'

/** Cadenas de códec con nivel suficiente para 1080p30 (sirven para 720p) y para 4K30. */
const CODECS = [
  { hasta1080: 'avc1.640028', k4: 'avc1.640033' },
  { hasta1080: 'vp09.00.40.08', k4: 'vp09.00.50.08' },
  { hasta1080: 'av01.0.08M.08', k4: 'av01.0.12M.08' },
  { hasta1080: 'hvc1.1.6.L120.B0', k4: 'hvc1.1.6.L150.B0' },
] as const

async function admite(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true
  } catch {
    return false
  }
}

/** Cómo codificaría este móvil a esa calidad: por hardware si algún códec lo admite; null si no codifica o no se sabe. */
export async function aceleracionDe(calidad: Calidad): Promise<Aceleracion | null> {
  if (typeof globalThis.VideoEncoder !== 'function') return null
  const base = { width: calidad.ancho, height: calidad.alto, framerate: calidad.fps, bitrate: bitrateDe(calidad.ancho, calidad.alto, calidad.fps), latencyMode: 'realtime' as const }
  const cadenas = CODECS.map((c) => (calidad.alto > 1080 ? c.k4 : c.hasta1080))
  for (const codec of cadenas) if (await admite({ ...base, codec, hardwareAcceleration: 'prefer-hardware' })) return 'hardware'
  for (const codec of cadenas) if (await admite({ ...base, codec, hardwareAcceleration: 'prefer-software' })) return 'software'
  return null
}

/** La calidad con la que empezar: la de siempre (1080p) si se codifica por hardware; si no, 720p. */
export async function calidadInicial(): Promise<Calidad> {
  return (await aceleracionDe(CALIDAD_POR_DEFECTO)) === 'software' ? CALIDADES[0]! : CALIDAD_POR_DEFECTO
}

export const AVISO_SOFTWARE =
  'Este aparato codifica el vídeo por software: puede grabar a menos de 30 fps (una tablet así grabó a 15 fps a 720p y a 10 a 1080p). Para analizar, mejor un móvil más reciente.'
