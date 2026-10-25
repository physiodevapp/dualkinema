import { useEffect, useState } from 'react'
import { microExterno } from '../media/microfono'

/** El micrófono externo conectado (`media/microfono.ts`), revisado al abrir la cámara y al conectar o quitar algo. */
export function useMicroExterno(flujo: MediaStream | null): string | null {
  const [externo, setExterno] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const mirar = () => void microExterno(flujo).then((e) => vivo && setExterno(e))
    mirar()
    navigator.mediaDevices?.addEventListener?.('devicechange', mirar)
    return () => {
      vivo = false
      navigator.mediaDevices?.removeEventListener?.('devicechange', mirar)
    }
  }, [flujo])
  return externo
}
