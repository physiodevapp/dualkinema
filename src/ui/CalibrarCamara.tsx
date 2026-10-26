import { useEffect, useRef, useState } from 'react'
import { CheckIcon, StopIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { retrasoDeCamara, type Golpe, type MarcaPalmada } from '../core/grabacion/calibracion'
import { borrarCalibracion, framesEntre, guardarCalibracion, leerCalibracion, palmadasDe, type CalibracionGuardada, type FrameVisto } from '../media/calibracionCamara'
import { borrarGrabacion } from '../media/grabaciones'
import { Grabadora, type Calidad } from '../media/grabadora'
import { InfoGlosario } from './glosario/Glosario'

/*
 * Calibrar el retraso de la cámara de este móvil (fase 4, paso 8; `core/grabacion/calibracion.ts`). Se graban unas
 * palmadas delante de la cámara; la app encuentra cada una en el sonido y enseña los frames de alrededor; se toca el
 * primero con las manos juntas. El retraso (con su cota) se guarda en el móvil y la grabadora lo descuenta a cada frame.
 * La grabación de la calibración se borra al acabar.
 */

/** Lo que dura como mucho la grabación de la calibración (s). */
const DURACION_MAXIMA_S = 20
/** Frames que se enseñan alrededor del sonido de cada palmada (s antes y después). */
const ANTES_S = 0.15
const DESPUES_S = 0.25

type Fase =
  | { readonly f: 'libre'; readonly aviso?: string }
  | { readonly f: 'grabando'; readonly g: Grabadora }
  | { readonly f: 'analizando' }
  | { readonly f: 'marcar'; readonly archivo: File; readonly golpes: readonly Golpe[]; readonly frames: readonly (readonly FrameVisto[])[] }

const ms = (v: number) => `${Math.round(v)} ms`

export default function CalibrarCamara({
  flujo,
  calidad,
  ocupado,
  alCambiar,
}: {
  flujo: MediaStream | null
  calidad: Calidad
  ocupado: boolean
  /** Avisa de si se está calibrando (grabando, analizando o marcando): la pantalla de grabar no debe hacer nada a la vez. */
  alCambiar: (calibrando: boolean) => void
}) {
  const [guardada, setGuardada] = useState<CalibracionGuardada | null>(() => leerCalibracion())
  const [fase, setFase] = useState<Fase>({ f: 'libre' })
  const enMarcha = fase.f !== 'libre'
  useEffect(() => alCambiar(enMarcha), [alCambiar, enMarcha])
  // La grabación en curso, para cancelarla si se sale a mitad.
  const grabando = useRef<Grabadora | null>(null)
  const [marcas, setMarcas] = useState<Readonly<Record<number, MarcaPalmada>>>({})
  const nombre = useRef<string | null>(null)
  const parada = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Al salir, no queda nada grabando ni el archivo de la calibración.
  useEffect(
    () => () => {
      if (parada.current) clearTimeout(parada.current)
      const g = grabando.current
      const n = nombre.current
      // Primero se cancela (cierra el archivo) y después se borra: con el archivo abierto, borrarlo puede fallar.
      void (g ? g.cancelar() : Promise.resolve()).finally(() => n && borrarGrabacion(n).catch(() => {}))
    },
    [],
  )

  const terminar = async () => {
    if (nombre.current) await borrarGrabacion(nombre.current).catch(() => {})
    nombre.current = null
    setMarcas({})
  }

  const empezar = async () => {
    if (!flujo) return
    nombre.current = `calibracion-${crypto.randomUUID().slice(0, 8)}.mp4`
    try {
      const g = await Grabadora.empezar(flujo, calidad, nombre.current, crypto.randomUUID(), { calibrando: true })
      grabando.current = g
      setFase({ f: 'grabando', g })
      parada.current = setTimeout(() => void parar(g), DURACION_MAXIMA_S * 1000)
    } catch (e) {
      await terminar()
      setFase({ f: 'libre', aviso: `No se ha podido grabar: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const parar = async (g: Grabadora) => {
    if (parada.current) clearTimeout(parada.current)
    parada.current = null
    grabando.current = null
    setFase({ f: 'analizando' })
    try {
      const { archivo } = await g.parar()
      const golpes = await palmadasDe(archivo)
      if (!golpes.length) {
        await terminar()
        return setFase({ f: 'libre', aviso: 'No se oye ninguna palmada. Vuelve a probar, con palmadas secas y sin más ruido alrededor.' })
      }
      const frames = await Promise.all(golpes.map((p) => framesEntre(archivo, p.t - ANTES_S, p.t + DESPUES_S)))
      setMarcas({})
      setFase({ f: 'marcar', archivo, golpes, frames })
    } catch (e) {
      await terminar()
      setFase({ f: 'libre', aviso: `No se ha podido analizar: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const resultado = retrasoDeCamara(Object.values(marcas))

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="calibrar-camara" data-fase={fase.f} data-guardada={guardada?.ms ?? ''}>
      <h3 className="flex items-center gap-1 font-medium">
        Retraso de la cámara <InfoGlosario id="retraso-camara" tema="el retraso de la cámara" className="-my-1.5" />
      </h3>
      {fase.f === 'libre' && (
        <>
          <p className="font-mono text-sm text-texto-2" data-testid="calibracion-guardada">
            {guardada
              ? `Calibrada: ${ms(guardada.ms)} ± ${ms(guardada.cotaMs)} (${guardada.palmadas} palmadas, ${new Date(guardada.fecha).toLocaleDateString('es-ES')})`
              : 'Sin calibrar: el vídeo puede ir unas decenas de ms tarde respecto al sonido.'}
          </p>
          {fase.aviso && <p className="rounded-md border border-acento/60 p-3 text-sm">{fase.aviso}</p>}
          <p className="text-sm text-texto-2">
            Ponte a 1–2 m de la cámara, con buena luz, y da 3 a 5 palmadas secas separadas un segundo, con las manos bien a la vista. Luego, para.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void empezar()} disabled={!flujo || ocupado} data-testid="calibrar-empezar" className="flex items-center gap-2 rounded-md border border-acento px-3 py-2 text-acento disabled:opacity-40">
              <VideoCameraIcon className="size-5" /> {guardada ? 'Volver a calibrar' : 'Calibrar la cámara'}
            </button>
            {guardada && (
              <button
                type="button"
                onClick={() => {
                  borrarCalibracion()
                  setGuardada(null)
                }}
                className="rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
              >
                Quitar la calibración
              </button>
            )}
          </div>
        </>
      )}
      {fase.f === 'grabando' && (
        <button type="button" onClick={() => void parar(fase.g)} data-testid="calibrar-parar" className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400 text-red-300">
          <StopIcon className="size-5" /> Ya he dado las palmadas: parar
        </button>
      )}
      {fase.f === 'analizando' && <p role="status">Buscando las palmadas…</p>}
      {fase.f === 'marcar' && (
        <>
          <p className="text-sm">
            En cada palmada, toca el <strong>primer frame con las manos juntas</strong>. Si alguna no se ve bien, déjala sin marcar.
          </p>
          {fase.golpes.map((golpe, i) => (
            <div key={golpe.t} className="flex flex-col gap-1" data-testid="palmada">
              <p className="font-mono text-xs text-texto-2">
                Palmada {i + 1}: el sonido empieza a {golpe.t.toLocaleString('es-ES', { maximumFractionDigits: 3 })} s
              </p>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {fase.frames[i]!.map((fr, k, todos) => {
                  const elegido = marcas[i]?.juntas === fr.t
                  return (
                    <button
                      key={fr.t}
                      type="button"
                      onClick={() => setMarcas((m) => ({ ...m, [i]: { sonido: golpe.t, antes: todos[k - 1]?.t ?? fr.t - 1 / 30, juntas: fr.t } }))}
                      data-testid="frame-palmada"
                      data-t={fr.t}
                      className={`shrink-0 rounded-md border-2 ${elegido ? 'border-acento' : 'border-transparent'}`}
                    >
                      <img src={fr.imagen} alt={`Frame a ${fr.t.toFixed(3)} s`} className="h-28 w-auto rounded" />
                      <span className="block font-mono text-[10px] text-texto-2">{Math.round((fr.t - golpe.t) * 1000)} ms</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {resultado && (
            <p className="font-mono text-sm" data-testid="calibracion-resultado" data-ms={resultado.ms} data-cota={resultado.cotaMs}>
              Retraso de la imagen: {ms(resultado.ms)} ± {ms(resultado.cotaMs)} ({resultado.palmadas} palmadas)
              {resultado.incoherente && ' · las palmadas no casan entre sí: revisa los frames marcados'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!resultado}
              onClick={() => {
                setGuardada(guardarCalibracion(resultado!))
                void terminar()
                setFase({ f: 'libre' })
              }}
              data-testid="calibrar-guardar"
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-acento px-3 py-2 font-medium text-fondo disabled:opacity-40"
            >
              <CheckIcon className="size-5" /> Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                void terminar()
                setFase({ f: 'libre' })
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-borde px-3 py-2"
            >
              <XMarkIcon className="size-5" /> Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
