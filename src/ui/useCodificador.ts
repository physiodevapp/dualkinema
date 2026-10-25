import { useEffect, useState } from 'react'
import { aceleracionDe, type Aceleracion } from '../media/codificador'
import type { Calidad } from '../media/grabadora'

/** Cómo codificaría este móvil a esa calidad (`media/codificador.ts`); null mientras no se sabe. */
export function useCodificador(calidad: Calidad): Aceleracion | null {
  const [r, setR] = useState<{ id: string; a: Aceleracion | null } | null>(null)
  useEffect(() => {
    let vivo = true
    void aceleracionDe(calidad).then((a) => vivo && setR({ id: calidad.id, a }))
    return () => {
      vivo = false
    }
  }, [calidad])
  return r?.id === calidad.id ? r.a : null
}
