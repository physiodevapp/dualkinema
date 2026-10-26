import { useEffect, useRef, useState } from 'react'
import { SpeakerWaveIcon } from '@heroicons/react/24/outline'
import { emitirSecuencia, pitar } from '../sala/sonido'
import { InfoGlosario } from './glosario/Glosario'

/*
 * Pitido de claqueta (fase 4, paso 6): el mismo pitido de la grabación doble, desde un solo móvil, para dos cámaras
 * arrancadas a mano (la app de cámara de cada móvil). Tras una cuenta atrás de 3 s suena la secuencia; después,
 * «Sincronizar por el audio» la encuentra en los dos vídeos. Sin el otro móvil no hay ida y vuelta: queda el retraso
 * de la distancia (el móvil que pita, a la misma distancia de las dos cámaras, lo anula).
 */

const CUENTA_S = 3

export default function Claqueta() {
  const ctx = useRef<AudioContext | null>(null)
  const [estado, setEstado] = useState<'libre' | number | 'hecho' | 'sin-sonido'>('libre')
  // En marcha desde el toque (el botón se desactiva un poco después: dos toques seguidos programaban dos secuencias).
  const enMarcha = useRef(false)
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => temporizadores.current.forEach(clearTimeout), [])

  const empezar = async () => {
    if (enMarcha.current) return
    enMarcha.current = true
    ctx.current ??= new AudioContext()
    if (ctx.current.state === 'suspended') await ctx.current.resume().catch(() => {})
    const c = ctx.current
    if (c.state !== 'running') {
      enMarcha.current = false
      return setEstado('sin-sonido')
    }
    const en = (f: () => void, ms: number) => void temporizadores.current.push(setTimeout(f, Math.max(0, ms)))
    const t0 = performance.now()
    for (let s = CUENTA_S; s > 0; s--) {
      const espera = t0 + (CUENTA_S - s) * 1000 - performance.now()
      en(() => {
        setEstado(s)
        pitar(c)
      }, espera)
    }
    const instante = t0 + CUENTA_S * 1000
    // Se programa un poco antes para que suene a su hora exacta; «Ha sonado», cuando ya ha sonado.
    en(() => emitirSecuencia(c, instante, performance.now()), instante - 300 - performance.now())
    en(() => {
      setEstado('hecho')
      enMarcha.current = false
    }, instante + 600 - performance.now())
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void empezar()}
        disabled={typeof estado === 'number'}
        data-testid="claqueta"
        data-estado={estado}
        className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-texto disabled:opacity-40"
      >
        <SpeakerWaveIcon className="size-5" />
        {typeof estado === 'number' ? `Pitido en ${estado}…` : 'Pitido de claqueta'}
      </button>
      <p className="flex items-center gap-1 text-sm text-texto-2">
        {estado === 'sin-sonido'
          ? 'El navegador no deja sonar ahora: vuelve a tocar.'
          : estado === 'hecho'
            ? 'Ha sonado. Al abrir los dos vídeos, «Sincronizar por el audio» lo encontrará.'
            : 'Para dos cámaras puestas a grabar a mano: toca con este móvil a la misma distancia de las dos.'}
        <InfoGlosario id="pitido" tema="el pitido de claqueta" className="-my-1.5" />
      </p>
    </div>
  )
}
