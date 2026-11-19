import { useCallback, useEffect, useRef, useState } from 'react'
import { ESCUCHA_S, MARGEN_INICIO_MS, PITA_PRIMERO_S, PITA_SEGUNDO_S, distanciaEntre, medirEnEscucha, type MedidaPropia, type ResultadoDistancia } from '../core/grabacion/distancia'
import { aMiReloj } from '../core/sala/doble'
import type { Mensaje } from '../core/sala/protocolo'
import { escuchar } from '../media/escucha'
import { ahora } from './config'
import { emitirSecuencia } from './sonido'
import type { Sala } from './useSala'

/** Cuánto se espera lo que oyó el otro después de acabar de escuchar (ms). */
const ESPERA_OTRO_MS = 6000

interface Medida {
  readonly id: string
  propia: MedidaPropia | null | undefined
  otra: MedidaPropia | null | undefined
}

/**
 * La distancia entre los dos móviles por el pitido, antes de grabar (`core/grabacion/distancia.ts`). `medir` la pide: este
 * móvil pita primero y el otro después; los dos escuchan y se cuentan lo que oyeron. Lo mismo si la pide el otro (este
 * pita después). No se mide mientras se graba (`ocupado`).
 */
export function useDistancia(sala: Sala, flujo: MediaStream | null, audio: AudioContext | null, ocupado: boolean) {
  const [midiendo, setMidiendo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDistancia | null>(null)
  const actual = useRef<Medida | null>(null)
  const vivo = useRef({ sala, flujo, audio, ocupado })
  useEffect(() => {
    vivo.current = { sala, flujo, audio, ocupado }
  })
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cerrar = useCallback((m: Medida, r: ResultadoDistancia) => {
    if (actual.current !== m) return
    actual.current = null
    if (espera.current) clearTimeout(espera.current)
    setResultado(r)
    setMidiendo(false)
  }, [])

  const combinar = useCallback(
    (m: Medida) => {
      if (m.propia === undefined || m.otra === undefined) return
      if (!m.propia || !m.otra) return cerrar(m, { fallo: 'no-oido' })
      cerrar(m, distanciaEntre(m.propia, m.otra))
    },
    [cerrar],
  )

  /** Escucha desde ya hasta el final, pita a su hora y cuenta al otro lo que oyó. */
  const escucharYPitar = useCallback(
    (m: Medida, inicio: number, primero: boolean) => {
      const { audio: ctx, flujo: fl } = vivo.current
      const pista = fl?.getAudioTracks().find((p) => p.readyState === 'live')
      if (!ctx || ctx.state !== 'running' || !pista) {
        vivo.current.sala.enviar({ tipo: 'distanciaOida', medida: m.id, fallo: 'sin-audio' })
        return cerrar(m, { fallo: 'sin-audio' })
      }
      setMidiendo(true)
      setResultado(null)
      emitirSecuencia(ctx, inicio + (primero ? PITA_PRIMERO_S : PITA_SEGUNDO_S) * 1000, ahora())
      void escuchar(pista, inicio + ESCUCHA_S * 1000, inicio, ahora, () => actual.current !== m).then((oido) => {
        if (actual.current !== m) return
        const propia = oido ? medirEnEscucha(oido, primero) : null
        m.propia = propia
        vivo.current.sala.enviar(propia ? { tipo: 'distanciaOida', medida: m.id, dif: propia.dif, calidad: propia.calidad } : { tipo: 'distanciaOida', medida: m.id, fallo: 'no-oido' })
        if (m.otra === undefined) espera.current = setTimeout(() => cerrar(m, { fallo: 'sin-respuesta' }), ESPERA_OTRO_MS)
        combinar(m)
      })
    },
    [cerrar, combinar],
  )

  const medir = useCallback(() => {
    if (vivo.current.ocupado || actual.current) return
    const m: Medida = { id: crypto.randomUUID(), propia: undefined, otra: undefined }
    actual.current = m
    const inicio = ahora() + MARGEN_INICIO_MS
    if (!vivo.current.sala.enviar({ tipo: 'distancia', medida: m.id, inicio })) return cerrar(m, { fallo: 'sin-respuesta' })
    escucharYPitar(m, inicio, true)
  }, [cerrar, escucharYPitar])

  const { escuchar: oir } = sala
  useEffect(
    () =>
      oir((msg: Mensaje) => {
        if (msg.tipo === 'distancia') {
          const reloj = vivo.current.sala.relojAhora()
          if (vivo.current.ocupado || actual.current || !reloj) {
            vivo.current.sala.enviar({ tipo: 'distanciaOida', medida: msg.medida, fallo: 'sin-audio' })
            return
          }
          const m: Medida = { id: msg.medida, propia: undefined, otra: undefined }
          actual.current = m
          escucharYPitar(m, aMiReloj(msg.inicio, reloj.desfase), false)
        } else if (msg.tipo === 'distanciaOida') {
          const m = actual.current
          if (!m || m.id !== msg.medida) return
          if ('fallo' in msg) {
            if (msg.fallo === 'sin-audio') return cerrar(m, { fallo: 'sin-audio' })
            m.otra = null
          } else m.otra = { dif: msg.dif, calidad: msg.calidad }
          combinar(m)
        }
      }),
    [oir, escucharYPitar, combinar, cerrar],
  )
  useEffect(
    () => () => {
      actual.current = null
      if (espera.current) clearTimeout(espera.current)
    },
    [],
  )

  return { midiendo, resultado, medir }
}
