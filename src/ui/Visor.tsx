import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { conRodillaFrontal, modeloRodilla3 } from '../core/articulaciones/catalogo'
import type { OrientacionVista } from '../core/geometria/canonico'
import { AJUSTES_FILTRO_DEFECTO, type AjustesFiltro } from '../core/filtros/tramos'
import type { ModeloMarcadores, Sincronia } from '../core/modelo/tipos'
import type { VideoAbierto } from '../media/video'
import { ladoDeVista } from './marcadores'
import AnfitrionVista from './visor/AnfitrionVista'
import CuerpoVisor from './visor/CuerpoVisor'
import { esPestana, guardarPestana, leerPestana, PESTANA_DEFECTO } from './visor/preferencias'
import type { SesionAbierta } from './visor/useGuardado'
import { useCursorComun } from './visor/useCursorComun'
import type { EntradaVista, VistaViva } from './visor/vistas'

interface Props {
  /** Las vistas de la sesión, la de referencia primero. */
  vistas: readonly EntradaVista[]
  sesion: SesionAbierta
  /** Al recuperar una sesión: su modelo, tal como se guardó. */
  modelo?: ModeloMarcadores
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  filtro?: AjustesFiltro | null
  avisoInicial?: string
  /** Se ha abierto otro vídeo como vista nueva de la sesión. */
  onAnadirVista: (video: VideoAbierto, orientacion: OrientacionVista) => void
}

interface PropsAnfitriones {
  readonly entradas: readonly EntradaVista[]
  readonly acumuladas: readonly VistaViva[]
  readonly modelo: ModeloMarcadores
  readonly filtro: AjustesFiltro
  readonly avisoInicial?: string
  readonly activaId: string
  readonly alCambiarFrame: (id: string, frame: number) => void
  readonly children: (vistas: readonly VistaViva[]) => ReactNode
}

/** Una vista dentro de otra: cada una con sus hooks, y el último nivel pinta con todas. */
function Anfitriones({ entradas, acumuladas, modelo, filtro, avisoInicial, activaId, alCambiarFrame, children }: PropsAnfitriones) {
  const [primera, ...resto] = entradas
  return (
    <AnfitrionVista entrada={primera!} modelo={modelo} filtro={filtro} avisoInicial={avisoInicial} activa={primera!.id === activaId} alCambiarFrame={alCambiarFrame}>
      {(vista) =>
        resto.length ? (
          <Anfitriones entradas={resto} acumuladas={[...acumuladas, vista]} modelo={modelo} filtro={filtro} activaId={activaId} alCambiarFrame={alCambiarFrame}>
            {children}
          </Anfitriones>
        ) : (
          children([...acumuladas, vista])
        )
      }
    </AnfitrionVista>
  )
}

/**
 * La sesión del visor: el modelo de marcadores, las vistas abiertas (cada una con sus hooks en un `AnfitrionVista`), la
 * vista activa con el cursor común y la pestaña abierta. `CuerpoVisor` pinta la vista activa y se ocupa de lo común
 * (reparto de la pantalla y guardado).
 */
export default function Visor({ vistas, sesion, modelo: modeloGuardado, filtro, avisoInicial, onAnadirVista }: Props) {
  // Un único modelo por sesión con todos los marcadores (D4): la rodilla con 3 gomets en la pierna que ve la cámara de la
  // vista de referencia (lateral) y, para una vista de frente, sus 3 marcadores y el FPPA de esa rodilla. Cada vista sigue
  // los suyos (`modeloDeVista`). Una sesión recuperada parte del que se guardó con ella. Se fija al abrir, ya con lo de la
  // vista de frente, para que no cambie al añadirla (lo de cada vista depende de él).
  const lado = ladoDeVista(vistas[0]!.orientacion)
  const modelo = useMemo(() => conRodillaFrontal(modeloGuardado ?? modeloRodilla3(lado), lado), [modeloGuardado, lado])
  const recuperada = !!vistas[0]!.inicial
  const cursor = useCursorComun(vistas[0]!.id)
  // El desfase y la sincronía de cada vista cambian al sincronizar: se guardan aquí, sobre lo que traía cada vista.
  const [sinc, setSinc] = useState<Readonly<Record<string, { desfase: number; sincronia: Sincronia }>>>({})
  // Sube con cada cambio, para que el guardado se entere.
  const [revSinc, setRevSinc] = useState(0)
  const fijarSincronia = useCallback((id: string, desfase: number, sincronia: Sincronia) => {
    setSinc((s) => ({ ...s, [id]: { desfase, sincronia } }))
    setRevSinc((n) => n + 1)
  }, [])
  const entradas = useMemo(() => vistas.map((v) => (sinc[v.id] ? { ...v, ...sinc[v.id] } : v)), [vistas, sinc])
  // Un solo filtro para toda la sesión: las vistas se comparan con el mismo corte y se guarda uno (cada vista lo limita a
  // 0,4·sus fps). Vive aquí, como la sincronía, y no en cada vista: antes cada una tenía el suyo y solo se guardaba el de A.
  const [ajustes, setAjustes] = useState<AjustesFiltro>(filtro ?? AJUSTES_FILTRO_DEFECTO)
  const [revAjustes, setRevAjustes] = useState(0)
  const cambiarAjustes = useCallback((a: AjustesFiltro) => {
    setAjustes(a)
    setRevAjustes((n) => n + 1)
  }, [])
  // Pestañas de herramientas. Con un vídeo nuevo (nada marcado todavía) se empieza en «Marcar»; al recuperar un trabajo,
  // en la pestaña que se usó. Viven aquí (no en el cuerpo) para no perderse al abrir otra vista.
  const [pestana, setPestanaAbierta] = useState<string>(() => (recuperada ? leerPestana() : PESTANA_DEFECTO))
  const setPestana = (id: string) => {
    setPestanaAbierta(id)
    if (esPestana(id)) guardarPestana(id)
  }
  return (
    <Anfitriones entradas={entradas} acumuladas={[]} modelo={modelo} filtro={ajustes} avisoInicial={avisoInicial} activaId={cursor.activaId} alCambiarFrame={cursor.propagar}>
      {(vivas) => (
        <CuerpoVisor
          vistas={vivas}
          activa={Math.max(0, vivas.findIndex((w) => w.id === cursor.activaId))}
          sesion={sesion}
          modelo={modelo}
          lado={lado}
          recuperada={recuperada}
          // Una vista recién añadida (sin lo guardado) hace que la sesión con las dos aún no esté guardada.
          sinGuardar={vistas.length > 1 && vistas.some((v) => !v.inicial)}
          pestana={pestana}
          onPestana={setPestana}
          fuera={cursor.fuera}
          registrarVistas={cursor.registrar}
          sincronizarVistas={cursor.sincronizar}
          enlazarCursor={cursor.enlazar}
          onSincronia={fijarSincronia}
          revSinc={revSinc}
          ajustes={ajustes}
          onCambiarAjustes={cambiarAjustes}
          revAjustes={revAjustes}
          onElegirVista={cursor.elegirActiva}
          onAnadirVista={onAnadirVista}
        />
      )}
    </Anfitriones>
  )
}
