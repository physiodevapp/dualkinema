import { useEffect, useState } from 'react'
import { preverFps, revisarFps, type PrevisionFps } from '../core/grabacion/revision'
import type { Calidad } from '../media/grabadora'

/**
 * Espera tras abrir la cámara antes de medir (la exposición automática se asienta) y cada cuánto se repite (ms): con
 * aviso, a menudo, para que desaparezca poco después de poner más luz; sin aviso, cada minuto, para no cargar el móvil.
 */
const ESPERA_MS = 1500
const REPETIR_MS = 60_000
const REPETIR_CON_AVISO_MS = 10_000

/**
 * A cuántos fps grabaría este móvil (`media/pruebaFps.ts`), medido al abrir la cámara, al cambiar de calidad y cada
 * minuto (la luz cambia), o cada 10 s mientras hay aviso. Solo con `activo`: al dejar de estarlo (se va a grabar) la prueba en marcha se cancela, para
 * no quitarle potencia al codificador de verdad. null mientras no hay medida de esta cámara.
 */
export function usePrevisionFps(flujo: MediaStream | null, calidad: Calidad, activo: boolean): PrevisionFps | null {
  const [r, setR] = useState<{ flujo: MediaStream; p: PrevisionFps } | null>(null)
  useEffect(() => {
    if (!flujo || !activo) return
    const control = new AbortController()
    let reloj: ReturnType<typeof setTimeout>
    const medir = async () => {
      const { probarFps } = await import('../media/pruebaFps')
      const m = await probarFps(flujo, calidad, control.signal)
      if (control.signal.aborted) return
      const p = m ? preverFps(calidad.fps, m.camara, m.codificados) : null
      if (p) setR({ flujo, p })
      reloj = setTimeout(() => void medir(), p?.bajos ? REPETIR_CON_AVISO_MS : REPETIR_MS)
    }
    reloj = setTimeout(() => void medir(), ESPERA_MS)
    return () => {
      control.abort()
      clearTimeout(reloj)
    }
  }, [flujo, calidad, activo])
  return r?.flujo === flujo ? r.p : null
}

const fps = (n: number) => Math.round(n).toLocaleString('es-ES')

/** El aviso para este móvil, o null si grabaría bien. */
export function textoPrevision(p: PrevisionFps | null, calidad: Calidad): string | null {
  if (!p?.bajos) return null
  return p.causa === 'camara'
    ? `La cámara da unos ${fps(p.fps)} fps de los ${calidad.fps}: suele ser por poca luz. Con más luz debería llegar a ${calidad.fps}.`
    : `Este móvil no llega a codificar más de unos ${fps(p.fps)} fps a ${calidad.alto}p. Prueba con menos resolución o usa un móvil más reciente.`
}

/** El aviso del otro móvil de la sala, o null. */
export function textoPrevisionOtro(fpsOtro: number | null, pedidos: number): string | null {
  if (fpsOtro === null || !revisarFps(pedidos, fpsOtro).bajos) return null
  return `El otro móvil grabaría a unos ${fps(fpsOtro)} fps de los ${pedidos}: míralo en su pantalla.`
}
