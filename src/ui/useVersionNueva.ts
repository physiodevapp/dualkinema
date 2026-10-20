import { useEffect, useState } from 'react'
import { hayVersionNueva, leerVersion } from './versionApp'

/** Cada cuánto se comprueba mientras la app está a la vista. */
const CADA_MS = 10 * 60 * 1000

/**
 * ¿Hay publicada una versión más nueva que la de esta app? Pide `/version.json`
 * (sin caché) al abrir, al volver a la app (cambiar de pestaña, volver desde las
 * recientes de Android) y cada 10 minutos mientras se ve. Instalada, la app no
 * tiene barra ni botón de recargar y puede seguir abierta con una versión vieja.
 * Un fallo (sin conexión, servidor de desarrollo) no avisa de nada.
 */
export function useVersionNueva(): boolean {
  const [nueva, setNueva] = useState(false)
  useEffect(() => {
    let vivo = true
    const comprobar = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        if (!r.ok) return
        if (vivo && hayVersionNueva(__COMMIT__, leerVersion(await r.json()))) setNueva(true)
      } catch {
        /* sin conexión o no es JSON: no se sabe, no se avisa */
      }
    }
    void comprobar()
    const intervalo = setInterval(() => void comprobar(), CADA_MS)
    document.addEventListener('visibilitychange', comprobar)
    window.addEventListener('pageshow', comprobar)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', comprobar)
      window.removeEventListener('pageshow', comprobar)
    }
  }, [])
  return nueva
}
