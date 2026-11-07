import { useEffect, useState } from 'react'
import { aEjesCamara, anguloPantalla, inclinacion } from '../core/sensores/sensores'
import { vec3 } from '../core/geometria/vector'

/** Muestras que se promedian (a ~60 Hz, medio segundo). */
const MUESTRAS = 30

/**
 * La inclinación de la cámara trasera de este móvil en directo (fase 6): cabeceo (+ mirando hacia abajo) y alabeo (°),
 * con la media del último medio segundo del acelerómetro y el mismo paso a ejes de la cámara que al grabar
 * (`core/sensores`). null mientras no llegue nada (un ordenador no lo da).
 */
export function useInclinacion(activo = true): { readonly cabeceo: number; readonly alabeo: number } | null {
  const [valor, setValor] = useState<{ cabeceo: number; alabeo: number } | null>(null)
  useEffect(() => {
    if (!activo || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return
    const ultimas: [number, number, number][] = []
    let ultimoAviso = 0
    const alMover = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x === null || a.y === null || a.z === null) return
      ultimas.push([a.x, a.y, a.z])
      if (ultimas.length > MUESTRAS) ultimas.shift()
      // Como mucho unas 5 veces por segundo, para no repintar a 60 Hz.
      if (e.timeStamp - ultimoAviso < 200) return
      ultimoAviso = e.timeStamp
      const n = ultimas.length
      const m = ultimas.reduce((s, v) => [s[0] + v[0] / n, s[1] + v[1] / n, s[2] + v[2] / n], [0, 0, 0])
      // La aceleración con gravedad en reposo apunta hacia arriba: abajo es la opuesta.
      const c = aEjesCamara([-m[0]!, -m[1]!, -m[2]!], anguloPantalla(screen.orientation?.angle ?? 0))
      const k = Math.hypot(c.x, c.y, c.z)
      if (k > 0) setValor(inclinacion(vec3(c.x / k, c.y / k, c.z / k)))
    }
    window.addEventListener('devicemotion', alMover)
    return () => window.removeEventListener('devicemotion', alMover)
  }, [activo])
  return valor
}
