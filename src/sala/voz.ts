/*
 * La voz del guion de una grabación doble (`core/grabacion/guionVoz.ts`): la síntesis de voz del propio navegador
 * (`speechSynthesis`), en castellano si el móvil tiene una voz así. Chrome para Android usa la voz del sistema: no se
 * envía nada a ningún sitio. Sin síntesis de voz, no suena nada (la grabación sigue igual).
 */

export const HAY_VOZ = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'
const hayVoz = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

function vozEnCastellano(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis.getVoices()
  return voces.find((v) => v.lang === 'es-ES') ?? voces.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null
}

function frase(texto: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(texto)
  const voz = vozEnCastellano()
  if (voz) u.voice = voz
  u.lang = voz?.lang ?? 'es-ES'
  u.rate = 1
  u.volume = 1
  return u
}

/** Lo que espera a que acabe la frase en curso (`anunciar`): solo la última. */
let pendiente: string | null = null
/** Lo que se está diciendo ahora con `anunciar` (null si nada). */
let diciendo: string | null = null

/** Dice un texto; corta lo que estuviera diciendo antes (cada frase es la que toca ahora). Devuelve si se ha podido. */
export function hablar(texto: string): boolean {
  if (!hayVoz()) return false
  try {
    pendiente = null
    diciendo = null
    const s = window.speechSynthesis
    s.cancel()
    s.speak(frase(texto))
    return true
  } catch {
    return false
  }
}

/**
 * Dice un texto sin cortar la frase en curso (pedido el 12-11 para el encuadre: las frases se pisaban). Si ya se está
 * diciendo algo, espera a que acabe y entonces dice la última que se haya pedido (las de en medio se pierden: ya no
 * valen). La misma frase que se está diciendo no se repite al acabar.
 */
export function anunciar(texto: string): boolean {
  if (!hayVoz()) return false
  try {
    const s = window.speechSynthesis
    // Se mira lo que dice el navegador (no solo `diciendo`): si un aviso de fin no llega, no se queda callado para siempre.
    if (s.speaking || s.pending) {
      pendiente = texto === diciendo ? null : texto
      return true
    }
    decir(texto)
    return true
  } catch {
    return false
  }
}

function decir(texto: string) {
  const u = frase(texto)
  diciendo = texto
  const siguiente = () => {
    if (diciendo !== texto) return
    diciendo = null
    const p = pendiente
    pendiente = null
    if (p !== null) decir(p)
  }
  u.onend = siguiente
  u.onerror = siguiente
  window.speechSynthesis.speak(u)
}

/** Calla (al parar o cancelar). */
export function callar() {
  if (!hayVoz()) return
  pendiente = null
  diciendo = null
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* nada */
  }
}
