import { useCallback, useEffect, useState } from 'react'
import { hayVersionNueva, leerVersion } from './versionApp'

/** Cada cuánto se comprueba mientras la app está a la vista. */
const CADA_MS = 10 * 60 * 1000

/**
 * ¿Hay publicada una versión más nueva que la de esta app? Pide `/version.json`
 * (sin caché) al abrir, al volver a la app (cambiar de pestaña, volver desde las
 * recientes de Android) y cada 10 minutos mientras se ve. Instalada, la app no
 * tiene barra ni botón de recargar y puede seguir abierta con una versión vieja.
 * Un fallo (sin conexión, servidor de desarrollo) no avisa de nada.
 *
 * El aviso se puede descartar: no vuelve a salir hasta que se publique otra versión distinta.
 */
export function useVersionNueva(): { nueva: boolean; descartar: () => void } {
  const [publicada, setPublicada] = useState<string | null>(null)
  const [descartada, setDescartada] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const comprobar = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        if (!r.ok) return
        const v = leerVersion(await r.json())
        if (vivo && v && hayVersionNueva(__COMMIT__, v)) setPublicada(v.commit)
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
  const descartar = useCallback(() => setDescartada(publicada), [publicada])
  return { nueva: publicada !== null && publicada !== descartada, descartar }
}
