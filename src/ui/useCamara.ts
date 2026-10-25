import { useEffect, useState } from 'react'
import { abrirCamara, type Calidad } from '../media/grabadora'

/*
 * La cámara (y el micrófono) para grabar, abierta mientras el componente esté montado (fase 4).
 *
 * Android apaga la cámara cuando la app pasa a segundo plano (otra app, la pantalla apagada): sus pistas quedan
 * terminadas y no vuelven solas, y Mediabunny no puede grabar con ellas («Input track cannot be ended»). Por eso, en
 * cuanto una pista termina, `flujo` pasa a null (nadie graba ni anuncia una cámara muerta) y se vuelve a abrir al estar
 * la app otra vez a la vista. Cambiar de calidad también la vuelve a abrir.
 */
export function useCamara(calidad: Calidad): { readonly flujo: MediaStream | null; readonly error: string | null } {
  const [flujo, setFlujo] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Sube para volver a abrirla.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    let abierto: MediaStream | null = null
    let esperandoVista = false
    const reabrirAlVolver = () => {
      if (document.visibilityState !== 'visible' || !esperandoVista) return
      esperandoVista = false
      setIntento((n) => n + 1)
    }
    const alTerminar = () => {
      if (!vivo || !abierto) return
      abierto.getTracks().forEach((t) => t.stop())
      setFlujo(null)
      // Visible (Android a veces la corta sin ocultar la app): se reabre ya; si no, al volver.
      esperandoVista = true
      reabrirAlVolver()
    }
    document.addEventListener('visibilitychange', reabrirAlVolver)
    abrirCamara(calidad).then(
      (f) => {
        if (!vivo) return f.getTracks().forEach((t) => t.stop())
        abierto = f
        for (const t of f.getTracks()) t.addEventListener('ended', alTerminar)
        setError(null)
        setFlujo(f)
        // Pudo terminar mientras se abría.
        if (f.getTracks().some((t) => t.readyState === 'ended')) alTerminar()
      },
      (e) => vivo && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', reabrirAlVolver)
      if (abierto) for (const t of abierto.getTracks()) {
        t.removeEventListener('ended', alTerminar)
        t.stop()
      }
      setFlujo(null)
    }
  }, [calidad, intento])

  return { flujo, error }
}
