/* eslint-disable react-hooks/refs --
 * Patrón «lo último en una ref» (`actual`, `datos`): el guardado lee siempre lo último al disparar sin rehacer los
 * efectos, y la transacción tiene que crearse de forma síncrona (ver CLAUDE.md, «Persistencia»). Código anterior al
 * refactor. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TramoEstatico } from '../../core/articulaciones/cero'
import type { CalibracionVista } from '../../core/calibracion/escala'
import type { OrientacionVista } from '../../core/geometria/canonico'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../../core/modelo/tipos'
import { prepararGuardado } from '../../core/persistencia/esquema'
import type { HuellaArchivo } from '../../core/persistencia/huella'
import { guardarSesion, pedirPersistencia } from '../../persistencia/almacen'

/** Espera tras el último cambio antes de guardar. */
const ESPERA_MS = 1000
/** Con cambios seguidos (siguiendo), como mucho este tiempo sin guardar. */
const MAXIMO_MS = 3000

export interface SesionAbierta {
  readonly id: string
  readonly nombre: string
  /** ISO 8601. */
  readonly creada: string
  readonly vistaId: string
}

export type EstadoGuardado =
  | { readonly estado: 'nada' }
  /** Sesión recuperada y sin cambios desde entonces: ya está guardada. */
  | { readonly estado: 'recuperado' }
  | { readonly estado: 'pendiente' }
  | { readonly estado: 'guardado'; readonly hora: Date }
  | { readonly estado: 'error'; readonly mensaje: string }

interface Opciones {
  readonly sesion: SesionAbierta
  readonly huella: HuellaArchivo
  readonly orientacion: OrientacionVista
  readonly modelo: ModeloMarcadores
  /** Las series de las trayectorias (el mapa del almacén, modificado en sitio): se leen al guardar. */
  readonly series: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>
  readonly filtro: AjustesFiltro
  /** Tramo estático del cero de referencia por id de articulación. */
  readonly ceros: Readonly<Record<string, TramoEstatico>>
  /** Escala de la vista (null = sin escala). */
  readonly calibracion: CalibracionVista | null
  /** Cambia con cada modificación de lo que se guarda (trayectorias, ajustes, ceros o escala); solo crece. */
  readonly version: number
  /** La sesión viene de lo guardado (no es nueva). */
  readonly recuperada: boolean
}

/**
 * Guarda la sesión en el dispositivo sin que haya que pedirlo: ESPERA_MS
 * después del último cambio (MAXIMO_MS como mucho mientras sigue), y en
 * seguida al ocultar la página (cambiar de app, apagar la pantalla) o al
 * cerrar el visor. No crea la sesión hasta que hay algo marcado o una escala;
 * una vez creada, quitarlo todo también se guarda (si no, volvería al recuperar).
 */
export function useGuardado({ sesion, huella, orientacion, modelo, series: seriesTrayectorias, filtro, ceros, calibracion, version, recuperada }: Opciones): EstadoGuardado {
  const [estado, setEstado] = useState<EstadoGuardado>({ estado: recuperada ? 'recuperado' : 'nada' })
  // La versión con que se montó ya está guardada (vacía o recuperada).
  const guardada = useRef(version)
  const actual = useRef(version)
  actual.current = version
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primerCambio = useRef(0)
  const persistenciaPedida = useRef(false)
  // La sesión ya está en el dispositivo: a partir de ahí, quitarlo todo también se guarda.
  const existe = useRef(recuperada)
  // Lo que se lee al guardar: siempre lo último, sin rehacer los efectos.
  const datos = useRef({ sesion, huella, orientacion, modelo, filtro, ceros, calibracion })
  datos.current = { sesion, huella, orientacion, modelo, filtro, ceros, calibracion }

  const guardar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
    const v = actual.current
    if (v === guardada.current) return
    const series = seriesTrayectorias
    // Calibrar antes de marcar también es trabajo que no se debe perder.
    const hayAlgo = datos.current.calibracion !== null || [...series.values()].some((s) => s.some((m) => m !== undefined))
    if (!hayAlgo && !existe.current) {
      guardada.current = v
      setEstado({ estado: 'nada' })
      return
    }
    const { sesion, huella, orientacion, modelo, filtro, ceros, calibracion } = datos.current
    // Se serializa ahora: las trayectorias cambian en sitio.
    const { cabecera, datos: tray } = prepararGuardado({
      id: sesion.id,
      nombre: sesion.nombre,
      creada: sesion.creada,
      ahora: new Date().toISOString(),
      modelo,
      filtro,
      vistas: [{ id: sesion.vistaId, huella, orientacion, series, ceros, calibracion }],
    })
    guardada.current = v
    existe.current = true
    guardarSesion(cabecera, tray).then(
      () => {
        if (!persistenciaPedida.current) {
          persistenciaPedida.current = true
          void pedirPersistencia()
        }
        if (actual.current === v) setEstado({ estado: 'guardado', hora: new Date() })
      },
      (e: unknown) => {
        // Se reintenta con el siguiente cambio.
        guardada.current = -1
        setEstado({ estado: 'error', mensaje: e instanceof Error ? e.message : String(e) })
      },
    )
  }, [seriesTrayectorias])

  // Cada cambio programa un guardado.
  useEffect(() => {
    if (version === guardada.current) return
    const ahora = Date.now()
    if (!temporizador.current) primerCambio.current = ahora
    else clearTimeout(temporizador.current)
    temporizador.current = setTimeout(guardar, Math.max(0, Math.min(ESPERA_MS, MAXIMO_MS - (ahora - primerCambio.current))))
    // Lo que todavía no se ha guardado se avisa tras el render, no durante él.
    setEstado((e) => (e.estado === 'pendiente' ? e : { estado: 'pendiente' }))
  }, [version, guardar])

  // Al ocultar la página o cerrar el visor, se guarda ya.
  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') guardar()
    }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', guardar)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', guardar)
      guardar()
    }
  }, [guardar])

  return estado
}
