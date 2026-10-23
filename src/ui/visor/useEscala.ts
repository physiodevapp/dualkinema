import { useMemo, useState } from 'react'
import { tramoInicial, type TramoEstatico } from '../../core/articulaciones/cero'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import { escalaDesfasada, medirEntreMarcadores, type CalibracionVista } from '../../core/calibracion/escala'
import type { IdMarcador } from '../../core/modelo/tipos'
import { indiceMasCercano, type TablaFrames } from '../../core/tiempo/tablaFrames'
import { fmt } from './formato'
import { escalaDeBorrador, OBJETOS, type BorradorEscala } from './PanelEscala'
import { tocarExtremo as tocarExtremoEscala } from './toquesEscala'
import type { SeriesTrayectorias } from './useTrayectorias'

interface Opciones {
  readonly tabla: TablaFrames
  readonly articulacion: DefinicionArticulacion
  readonly series: SeriesTrayectorias
  /** Contador de cambios de las trayectorias (el `version` de `useTrayectorias`). */
  readonly version: number
  /** Al recuperar: la escala de la vista (null o sin dar = sin escala). */
  readonly calibracionInicial?: CalibracionVista | null
  /** Frame mostrado (null mientras se decodifica el primero) e ir a un frame: de `useNavegacionFrames`. */
  readonly mostrado: number | null
  readonly ir: (i: number) => void
}

/**
 * La escala de la vista: la guardada (con `revCalibracion` para el guardado) y, mientras se calibra, el borrador con
 * los extremos tocados; los toques en el vídeo, la medida entre dos marcadores (la del borrador y la guardada, medida
 * otra vez con lo seguido ahora) y el aviso si ya no corresponde, y empezar, rehacer, guardar y quitar.
 */
export function useEscala({ tabla, articulacion, series, version, calibracionInicial, mostrado, ir }: Opciones) {
  // Escala (paso 6): la guardada y, mientras se calibra, el borrador con los extremos tocados.
  const [calibracion, setCalibracion] = useState<CalibracionVista | null>(calibracionInicial ?? null)
  const [revCalibracion, setRevCalibracion] = useState(0)
  const [borrador, setBorrador] = useState<BorradorEscala | null>(null)
  const calibrando = borrador !== null
  // Calibrar tocando los extremos (con «Entre dos marcadores» no se toca el vídeo).
  const tocandoEscala = calibrando && borrador.objeto !== 'marcadores'

  // ---- Escala: tocar los dos extremos del objeto ----
  const frameCalibracion = useMemo(() => (calibracion ? indiceMasCercano(tabla, calibracion.t) : null), [calibracion, tabla])
  const tocarExtremo = (x: number, y: number) => {
    if (mostrado === null || !borrador) return
    // Los dos extremos, del mismo frame: un toque en otro empieza de nuevo.
    setBorrador(tocarExtremoEscala(borrador, { x, y }, tabla.tiempos[mostrado]!))
  }
  // Con «Entre dos marcadores»: posición media de los dos en el tramo, con lo seguido ahora.
  const medicion = useMemo(() => {
    void version
    if (borrador?.objeto !== 'marcadores' || !borrador.entre || !borrador.tramo) return null
    const serie = (id: IdMarcador) => series.get(id) ?? []
    return medirEntreMarcadores(serie(borrador.entre.desde), serie(borrador.entre.hasta), borrador.tramo)
  }, [borrador, version, series])
  // La guardada, medida otra vez con lo seguido ahora: si se calibró antes de seguir, hay más frames.
  const medicionGuardada = useMemo(() => {
    void version
    const entre = calibracion?.entre
    if (!entre) return null
    return medirEntreMarcadores(series.get(entre.desde) ?? [], series.get(entre.hasta) ?? [], entre.tramo)
  }, [calibracion, version, series])
  // Si lo seguido cambió en el tramo desde que se guardó (más o menos frames, marcadores corregidos), se avisa.
  const desfase = useMemo(() => (calibracion ? escalaDesfasada(calibracion, medicionGuardada) : null), [calibracion, medicionGuardada])
  const framesTramo = useMemo(() => {
    const tr = borrador?.tramo
    if (!tr) return null
    return tabla.tiempos.reduce((n, t) => (t >= tr.desde && t <= tr.hasta ? n + 1 : n), 0)
  }, [borrador?.tramo, tabla])
  /** Empezar a calibrar, o rehacer la guardada. `tramoCero`: el tramo del cero de referencia, si hay. */
  const empezarEscala = (tramoCero: TramoEstatico | undefined) => {
    // Por defecto, el segmento distal (rodilla–tobillo: el gomet del trocánter se desliza más) y el tramo del cero o los primeros 2 s.
    const entre = calibracion?.entre ? { desde: calibracion.entre.desde, hasta: calibracion.entre.hasta } : { desde: articulacion.distal.desde, hasta: articulacion.distal.hasta }
    const tramo = calibracion?.entre?.tramo ?? tramoCero ?? tramoInicial(tabla.tiempos)
    if (!calibracion) {
      setBorrador({ objeto: 'cinta', a: null, b: null, t: null, longitud: OBJETOS.cinta.cm, entre, tramo })
      return
    }
    // Rehacer: se parte de lo guardado, en su frame, para ajustar un extremo o la longitud.
    const longitud = fmt(calibracion.longitudM * 100, 1).replace(/,0$/, '')
    setBorrador({ objeto: calibracion.objeto, a: calibracion.a, b: calibracion.b, t: calibracion.t, longitud, entre, tramo })
    if (frameCalibracion !== null) ir(frameCalibracion)
  }
  const guardarEscala = () => {
    const r = borrador && escalaDeBorrador(borrador, medicion)
    if (!r?.ok) return
    setCalibracion(r.valor)
    setRevCalibracion((v) => v + 1)
    setBorrador(null)
  }
  const quitarEscala = () => {
    setCalibracion(null)
    setRevCalibracion((v) => v + 1)
  }

  return {
    calibracion,
    revCalibracion,
    borrador,
    setBorrador,
    calibrando,
    tocandoEscala,
    frameCalibracion,
    tocarExtremo,
    medicion,
    desfase,
    framesTramo,
    empezarEscala,
    guardarEscala,
    quitarEscala,
  }
}
