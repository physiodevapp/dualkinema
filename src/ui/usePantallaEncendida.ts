import { useEffect } from 'react'

/**
 * Mantiene la pantalla encendida mientras el componente que lo llama está montado (Screen Wake Lock); al volver a la app
 * (el navegador lo suelta al ocultarla) lo vuelve a pedir. Con la pantalla apagada, Android corta la cámara y la conexión.
 */
export function usePantallaEncendida() {
  useEffect(() => {
    type Cerrojo = { release(): Promise<void> }
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Cerrojo> } }).wakeLock
    if (!wl) return
    let cerrojo: Cerrojo | null = null
    let vivo = true
    const pedir = () => {
      if (document.visibilityState !== 'visible') return
      wl.request('screen').then(
        (c) => (vivo ? (cerrojo = c) : void c.release()),
        () => {},
      )
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', pedir)
      void cerrojo?.release()
    }
  }, [])
}
