import { useCallback, useEffect, useRef } from 'react'

/**
 * Pulsar y mantener: ejecuta `accion` al pulsar y, si se mantiene, la repite
 * cada `cada` ms tras una espera inicial. Devuelve los manejadores del botón.
 */
export function useRepetir(accion: () => void, espera = 350, cada = 70) {
  const accionRef = useRef(accion)
  const temporizador = useRef<number | undefined>(undefined)

  useEffect(() => {
    accionRef.current = accion
  }, [accion])

  const parar = useCallback(() => {
    window.clearTimeout(temporizador.current)
    window.clearInterval(temporizador.current)
    temporizador.current = undefined
  }, [])

  useEffect(() => parar, [parar])

  const empezar = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      parar()
      accionRef.current()
      temporizador.current = window.setTimeout(() => {
        temporizador.current = window.setInterval(() => accionRef.current(), cada)
      }, espera)
    },
    [parar, espera, cada],
  )

  return {
    onPointerDown: empezar,
    onPointerUp: parar,
    onPointerLeave: parar,
    onPointerCancel: parar,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}
