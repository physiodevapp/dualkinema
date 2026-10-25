import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrientacionVista } from '../core/geometria/canonico'
import type { DatosDoble } from '../core/grabacion/metadatos'
import { nombreGrabacion } from '../core/grabacion/revision'
import { aMiReloj, ESPERA_CONFIRMACION_MS, MARGEN_PREPARAR_MS, motivoNoPreparado, vistasCompatibles } from '../core/sala/doble'
import type { Mensaje, MotivoCancelar } from '../core/sala/protocolo'
import { analizarGrabacion, type AnalisisGrabacion } from '../media/grabaciones'
import { CALIDAD_POR_DEFECTO, DURACION_MAXIMA_S, Grabadora } from '../media/grabadora'
import { ahora } from './config'
import type { Sala } from './useSala'

/*
 * La grabación doble vista desde este móvil (fase 4, paso 5; D8 de docs/plan-fase-4.md). Reglas en
 * `core/sala/doble.ts`; aquí los temporizadores y la grabadora.
 *
 * Quien pulsa «Grabar» programa el inicio en su reloj (ahora + cuenta atrás) y espera la confirmación del otro
 * (ESPERA_CONFIRMACION_MS; si no llega, no graba ninguno). Cada uno, en su reloj: prepara la grabadora MARGEN_PREPARAR_MS
 * antes (códec, archivo y metadatos con el inicio y su reloj del otro), suenan pitidos cortos los últimos 3 s (antes de
 * grabar: no quedan en el vídeo), arranca justo en el inicio y para solo al acabar la duración, aunque se corte la
 * conexión. «Parar» en cualquiera de los dos para los dos (`parar`). Todos los instantes, en ms del reloj de la sala
 * (`ahora`).
 */

export type FaseDoble =
  | { readonly f: 'libre'; readonly aviso?: string }
  | { readonly f: 'esperando'; readonly id: string; readonly inicio: number; readonly fin: number | null }
  | { readonly f: 'programada'; readonly id: string; readonly inicio: number; readonly fin: number | null }
  | { readonly f: 'grabando'; readonly id: string; readonly inicio: number; readonly fin: number; readonly arranque: number }
  | { readonly f: 'parando'; readonly id: string }
  | {
      readonly f: 'hecha'
      readonly id: string
      readonly archivo: File
      readonly enAlmacen: boolean
      readonly analisis: AnalisisGrabacion | null
      readonly arranque: number
      readonly aviso?: string
    }

export const TEXTO_MOTIVO: Record<MotivoCancelar, string> = {
  usuario: 'se ha cancelado',
  'sin-camara': 'el otro móvil no tiene la cámara abierta',
  'sin-vista': 'falta elegir las vistas (una de perfil y otra de frente o de espaldas)',
  'sin-reloj': 'el reloj común aún no está medido',
  'sin-espacio': 'al otro móvil le queda poco espacio',
  tarde: 'el aviso llegó demasiado tarde para prepararse',
  ocupado: 'el otro móvil ya estaba grabando o programado',
  version: 'los dos móviles tienen versiones distintas de la app',
  fallo: 'el otro móvil no ha podido grabar',
}

const SUFIJO = (v: OrientacionVista) => (v.plano === 'sagital' ? 'perfil' : v.ve === 'delante' ? 'frente' : 'espalda')

const ocupado = (f: FaseDoble) => f.f === 'esperando' || f.f === 'programada' || f.f === 'grabando' || f.f === 'parando'

/** Un pitido corto (cuenta atrás). Sin contexto de audio desbloqueado, no suena (la cuenta atrás se ve igual). */
function pitar(ctx: AudioContext | null, hz = 880) {
  if (!ctx || ctx.state !== 'running') return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.25, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  o.frequency.value = hz
  o.connect(g).connect(ctx.destination)
  o.start()
  o.stop(ctx.currentTime + 0.12)
}

export interface GrabacionDoble {
  readonly fase: FaseDoble
  /** Programa la grabación de los dos. `duracionS` null: hasta que alguien pare. */
  readonly programar: (cuentaAtrasS: number, duracionS: number | null) => void
  /** Para la grabación (las dos) o cancela la cuenta atrás (las dos). */
  readonly parar: () => void
  /** Vuelve a «libre» tras ver el resultado. */
  readonly otraVez: () => void
}

export function useGrabacionDoble(
  sala: Sala,
  flujo: MediaStream | null,
  vista: OrientacionVista | null,
  otraVista: OrientacionVista | null,
  libreMB: number | null,
  audio: AudioContext | null,
): GrabacionDoble {
  const [fase, setFaseEstado] = useState<FaseDoble>({ f: 'libre' })
  const faseRef = useRef<FaseDoble>(fase)
  const setFase = useCallback((f: FaseDoble) => {
    faseRef.current = f
    setFaseEstado(f)
  }, [])
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([])
  const preparada = useRef<Promise<Awaited<ReturnType<typeof Grabadora.preparar>> | null> | null>(null)
  const grabadora = useRef<Grabadora | null>(null)
  // Lo que cambia y leen los temporizadores y los mensajes.
  const vivo = useRef({ sala, flujo, vista, otraVista, libreMB, audio })
  useEffect(() => {
    vivo.current = { sala, flujo, vista, otraVista, libreMB, audio }
  })

  const limpiar = useCallback(() => {
    for (const t of temporizadores.current) clearTimeout(t)
    temporizadores.current = []
  }, [])
  const en = useCallback((instante: number, f: () => void) => {
    temporizadores.current.push(setTimeout(f, Math.max(0, instante - ahora())))
  }, [])

  /** Descarta lo preparado y no arrancado. */
  const descartarPreparada = useCallback(async () => {
    const p = await preparada.current
    preparada.current = null
    await p?.descartar()
  }, [])

  const terminar = useCallback(
    async (id: string, arranque: number) => {
      limpiar()
      const g = grabadora.current
      grabadora.current = null
      if (!g) return
      setFase({ f: 'parando', id })
      try {
        const t = await g.parar()
        const analisis = await analizarGrabacion(t.archivo).catch(() => null)
        setFase({ f: 'hecha', id, archivo: t.archivo, enAlmacen: t.enAlmacen, analisis, arranque })
      } catch (e) {
        setFase({ f: 'libre', aviso: `No se ha podido terminar la grabación: ${e instanceof Error ? e.message : String(e)}` })
      }
    },
    [limpiar, setFase],
  )

  /** Lo de este móvil una vez acordado el inicio (en mi reloj). */
  const prepararYArrancar = useCallback(
    (id: string, inicio: number, fin: number | null) => {
      const { sala: s, flujo: f, vista: v, audio: a } = vivo.current
      if (!f || !v) {
        s.enviar({ tipo: 'cancelar', grabacion: id, motivo: f ? 'sin-vista' : 'sin-camara' })
        setFase({ f: 'libre', aviso: `No se graba: ${f ? 'falta elegir la vista de este móvil' : 'la cámara de este móvil no está abierta'}.` })
        return
      }
      setFase({ f: 'programada', id, inicio, fin })
      en(inicio - MARGEN_PREPARAR_MS, () => {
        const reloj = s.relojAhora()
        const deriva = s.derivaAhora()
        const doble: DatosDoble = {
          id,
          vista: v,
          inicio,
          relojOtro: reloj ? { desfase: reloj.desfase, cota: reloj.cota } : null,
          deriva: deriva ? { ppm: deriva.ppm, errorPpm: deriva.errorPpm } : null,
        }
        const nombre = nombreGrabacion(new Date(Date.now() + (inicio - ahora()))).replace('.mp4', `-${SUFIJO(v)}.mp4`)
        preparada.current = Grabadora.preparar(f, CALIDAD_POR_DEFECTO, nombre, crypto.randomUUID(), doble).catch(() => null)
      })
      for (const s3 of [3, 2, 1]) en(inicio - s3 * 1000, () => pitar(a))
      en(inicio, async () => {
        const p = await preparada.current
        preparada.current = null
        if (faseRef.current.f !== 'programada' || faseRef.current.id !== id) return void p?.descartar()
        try {
          if (!p) throw new Error('no se ha podido preparar la grabación')
          const g = await p.arrancar()
          grabadora.current = g
          const arranque = ahora()
          const finReal = Math.min(fin ?? Infinity, inicio + DURACION_MAXIMA_S * 1000)
          setFase({ f: 'grabando', id, inicio, fin: finReal, arranque })
          en(finReal, () => void terminar(id, arranque))
          g.error.catch(() => {
            if (grabadora.current !== g) return
            vivo.current.sala.enviar({ tipo: 'cancelar', grabacion: id, motivo: 'fallo' })
            void terminar(id, arranque)
          })
        } catch (e) {
          vivo.current.sala.enviar({ tipo: 'cancelar', grabacion: id, motivo: 'fallo' })
          setFase({ f: 'libre', aviso: `Este móvil no ha podido grabar: ${e instanceof Error ? e.message : String(e)}` })
        }
      })
    },
    [en, setFase, terminar],
  )

  // Mensajes del otro móvil.
  const escuchar = sala.escuchar
  useEffect(
    () =>
      escuchar((m: Mensaje) => {
        const f = faseRef.current
        const { sala: s, flujo: fl, vista: v, otraVista: ov, libreMB: libre } = vivo.current
        if (m.tipo === 'programar') {
          const reloj = s.relojAhora()
          const inicio = reloj ? aMiReloj(m.inicio, reloj.desfase) : NaN
          const motivo = motivoNoPreparado({
            camara: fl !== null,
            vistas: vistasCompatibles(v, ov),
            reloj: reloj !== null,
            libreMB: libre,
            ocupado: ocupado(f),
            faltan: inicio - ahora(),
          })
          if (motivo) {
            s.enviar({ tipo: 'cancelar', grabacion: m.grabacion, motivo })
            if (!ocupado(f)) setFase({ f: 'libre', aviso: `El otro móvil ha pedido grabar, pero ${TEXTO_MOTIVO[motivo]}: no se graba.` })
            return
          }
          s.enviar({ tipo: 'confirmar', grabacion: m.grabacion })
          prepararYArrancar(m.grabacion, inicio, m.duracion === null ? null : inicio + m.duracion * 1000)
        } else if (m.tipo === 'confirmar' && f.f === 'esperando' && f.id === m.grabacion) {
          limpiar()
          prepararYArrancar(f.id, f.inicio, f.fin)
        } else if (m.tipo === 'cancelar' && 'id' in f && f.id === m.grabacion) {
          if (f.f === 'esperando' || f.f === 'programada') {
            limpiar()
            void descartarPreparada()
            setFase({ f: 'libre', aviso: `No se graba: ${TEXTO_MOTIVO[m.motivo]}.` })
          }
          // Grabando: el otro ha fallado, pero este sigue (su vídeo vale para una vista).
        } else if (m.tipo === 'parar' && 'id' in f && f.id === m.grabacion) {
          if (f.f === 'grabando') void terminar(f.id, f.arranque)
          else if (f.f === 'programada') {
            limpiar()
            void descartarPreparada()
            setFase({ f: 'libre', aviso: 'El otro móvil ha cancelado la cuenta atrás.' })
          }
        }
      }),
    [escuchar, prepararYArrancar, limpiar, descartarPreparada, terminar, setFase],
  )

  // Al salir de la pantalla, nada se queda grabando ni preparado.
  useEffect(
    () => () => {
      limpiar()
      void descartarPreparada()
      void grabadora.current?.cancelar()
    },
    [limpiar, descartarPreparada],
  )

  const programar = useCallback(
    (cuentaAtrasS: number, duracionS: number | null) => {
      if (ocupado(faseRef.current)) return
      const id = crypto.randomUUID()
      const inicio = ahora() + cuentaAtrasS * 1000
      const fin = duracionS === null ? null : inicio + duracionS * 1000
      if (!vivo.current.sala.enviar({ tipo: 'programar', grabacion: id, inicio, duracion: duracionS })) {
        setFase({ f: 'libre', aviso: 'No hay conexión con el otro móvil: no se graba.' })
        return
      }
      setFase({ f: 'esperando', id, inicio, fin })
      en(ahora() + ESPERA_CONFIRMACION_MS, () => {
        if (faseRef.current.f !== 'esperando' || faseRef.current.id !== id) return
        vivo.current.sala.enviar({ tipo: 'cancelar', grabacion: id, motivo: 'tarde' })
        setFase({ f: 'libre', aviso: 'El otro móvil no ha contestado: no se graba.' })
      })
    },
    [en, setFase],
  )

  const parar = useCallback(() => {
    const f = faseRef.current
    if (f.f === 'grabando') {
      vivo.current.sala.enviar({ tipo: 'parar', grabacion: f.id, fin: ahora() })
      void terminar(f.id, f.arranque)
    } else if (f.f === 'programada' || f.f === 'esperando') {
      vivo.current.sala.enviar({ tipo: 'cancelar', grabacion: f.id, motivo: 'usuario' })
      limpiar()
      void descartarPreparada()
      setFase({ f: 'libre', aviso: 'Cancelado.' })
    }
  }, [terminar, limpiar, descartarPreparada, setFase])

  const otraVez = useCallback(() => setFase({ f: 'libre' }), [setFase])

  return { fase, programar, parar, otraVez }
}
