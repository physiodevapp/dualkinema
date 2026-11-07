/*
 * La voz del guion de una grabación doble (`core/grabacion/guionVoz.ts`): la síntesis de voz del propio navegador
 * (`speechSynthesis`), en castellano si el móvil tiene una voz así. Chrome para Android usa la voz del sistema: no se
 * envía nada a ningún sitio. Sin síntesis de voz, no suena nada (la grabación sigue igual).
 */

export const HAY_VOZ = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

function vozEnCastellano(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis.getVoices()
  return voces.find((v) => v.lang === 'es-ES') ?? voces.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null
}

/** Dice un texto; corta lo que estuviera diciendo antes (cada frase es la que toca ahora). Devuelve si se ha podido. */
export function hablar(texto: string): boolean {
  if (!HAY_VOZ) return false
  try {
    const s = window.speechSynthesis
    s.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    const voz = vozEnCastellano()
    if (voz) u.voice = voz
    u.lang = voz?.lang ?? 'es-ES'
    u.rate = 1
    u.volume = 1
    s.speak(u)
    return true
  } catch {
    return false
  }
}

/** Calla (al parar o cancelar). */
export function callar() {
  if (!HAY_VOZ) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* nada */
  }
}
