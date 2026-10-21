import type { Lado } from '../../core/articulaciones/catalogo'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import type { IdMarcador, Marcador } from '../../core/modelo/tipos'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'
import AccionesHuecos from './AccionesHuecos'
import AvisoAnclas from './AvisoAnclas'
import BotonesQuitarManual from './BotonesQuitarManual'
import BotonIrAlHueco from './BotonIrAlHueco'
import BotonSeguir from './BotonSeguir'
import ControlTrayectoria from './ControlTrayectoria'
import { grados } from './formato'
import InterruptorAOjo from './InterruptorAOjo'
import SelectorMarcadores from './SelectorMarcadores'
import type { Aviso } from './useSeguimiento'

interface Props {
  /** Pierna que ve la cámara. */
  lado: Lado
  marcadores: readonly Marcador[]
  /** Estado de cada marcador en el frame mostrado, en el orden de `marcadores`. */
  estadosMarcadores: readonly string[]
  seleccionado: IdMarcador | null
  onElegirMarcador: (id: IdMarcador | null) => void
  siguiendo: boolean
  colocarAOjo: boolean
  onCambiarAOjo: () => void
  listoParaSeguir: boolean
  /** Marcadores con una marca a mano en el frame mostrado, con su posición en el modelo. */
  marcasManualesAqui: readonly { mk: Marcador; k: number }[]
  mostrado: number | null
  onQuitarManual: (id: IdMarcador, frame: number) => void
  /** Frames (0-based) con una marca a mano posterior al mostrado. */
  framesAnclas: readonly number[]
  onQuitarMarcasPosteriores: () => void
  progresoSeguimiento: number
  onSeguir: () => void
  onParar: () => void
  aviso: Aviso | null
  onIr: (frame: number) => void
  /** Huecos cortos que se pueden rellenar. */
  huecosCortos: number
  hayInterpolados: boolean
  onRellenarHuecos: () => void
  onQuitarInterpolados: () => void
  trayectoriaCompleta: boolean
  onTrayectoriaCompleta: (activa: boolean) => void
  conTrayectoria: ReadonlySet<IdMarcador>
  onElegirTrayectoria: (id: IdMarcador) => void
  articulacion: Pick<DefinicionArticulacion, 'nombre' | 'positivo' | 'negativo'>
  /** Ángulo del frame mostrado (NaN = sin valor) y el mismo redondeado a la décima que se muestra. */
  angulo: number
  anguloRedondeado: number
}

/** Pestaña «Marcar»: marcadores, seguimiento, avisos, huecos cortos, trayectoria completa y el ángulo del frame. */
export default function PanelMarcar({
  lado,
  marcadores,
  estadosMarcadores,
  seleccionado,
  onElegirMarcador,
  siguiendo,
  colocarAOjo,
  onCambiarAOjo,
  listoParaSeguir,
  marcasManualesAqui,
  mostrado,
  onQuitarManual,
  framesAnclas,
  onQuitarMarcasPosteriores,
  progresoSeguimiento,
  onSeguir,
  onParar,
  aviso,
  onIr,
  huecosCortos,
  hayInterpolados,
  onRellenarHuecos,
  onQuitarInterpolados,
  trayectoriaCompleta,
  onTrayectoriaCompleta,
  conTrayectoria,
  onElegirTrayectoria,
  articulacion,
  angulo,
  anguloRedondeado,
}: Props) {
  return (
            <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Marcadores</h2>
                <span className="text-sm text-texto-2">pierna {lado === 'izq' ? 'izquierda' : 'derecha'} (la que ve la cámara)</span>
              </div>

              <SelectorMarcadores marcadores={marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={siguiendo} onElegir={onElegirMarcador} />

              <p className="text-sm text-texto-2">
                {siguiendo
                  ? 'Siguiendo los gomets…'
                  : seleccionado && colocarAOjo
                    ? `A ojo: el ${nombreCorto(marcadores.find((x) => x.id === seleccionado)!.nombre).toLowerCase()} queda justo donde sueltas el dedo, sin ajustarse a ningún gomet. Usa la lupa para afinar.`
                    : seleccionado
                      ? `Toca el ${nombreCorto(marcadores.find((x) => x.id === seleccionado)!.nombre).toLowerCase()} en la imagen. Mantén el dedo para ver la lupa: cuando el gomet salga rodeado por un anillo, suelta y el marcador irá a su centro.`
                      : listoParaSeguir
                        ? 'Los tres marcadores están en este frame: ya puedes seguir. Para corregir uno, elígelo y arrástralo con la lupa.'
                        : 'Elige un marcador para colocarlo o corregirlo en este frame.'}
              </p>

              <InterruptorAOjo activo={colocarAOjo} deshabilitado={siguiendo} onCambiar={onCambiarAOjo} />

              {/* Quitar una marca a mano equivocada de cualquier marcador, en este frame, sin elegirlo antes. */}
              {marcasManualesAqui.length > 0 && !siguiendo && (
                <div className="flex flex-wrap gap-2">
                  <BotonesQuitarManual marcas={marcasManualesAqui} siguiendo={siguiendo} frame={mostrado} onQuitar={onQuitarManual} claseExtra="" />
                </div>
              )}

              <AvisoAnclas frames={framesAnclas} siguiendo={siguiendo} onQuitar={onQuitarMarcasPosteriores} />

              <BotonSeguir siguiendo={siguiendo} progreso={progresoSeguimiento} listo={listoParaSeguir} onSeguir={onSeguir} onParar={onParar} />

              {aviso && (
                <div className="flex flex-col gap-2 rounded-md border border-acento/50 p-3 text-sm" role="status">
                  <p data-testid="aviso">{aviso.texto}</p>
                  {aviso.detalle && (
                    <details className="text-texto-2">
                      <summary className="cursor-pointer">Por qué (para diagnosticar)</summary>
                      <pre className="mt-1 font-mono text-xs whitespace-pre-wrap">{aviso.detalle}</pre>
                    </details>
                  )}
                  {aviso.irA !== undefined && <BotonIrAlHueco frame={aviso.irA} onIr={onIr} />}
                </div>
              )}

              {!siguiendo && (huecosCortos > 0 || hayInterpolados) && (
                <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="huecos-cortos">
                  <AccionesHuecos huecosCortos={huecosCortos} hayInterpolados={hayInterpolados} onRellenar={onRellenarHuecos} onQuitarInterpolados={onQuitarInterpolados} />
                </div>
              )}

              <ControlTrayectoria
                activa={trayectoriaCompleta}
                onActiva={onTrayectoriaCompleta}
                marcadores={marcadores.map((mk, k) => ({ id: mk.id, nombre: nombreCorto(mk.nombre), color: COLORES_MARCADOR[k % COLORES_MARCADOR.length]! }))}
                elegidos={conTrayectoria}
                onElegir={onElegirTrayectoria}
              />

              <div className="flex items-baseline justify-between border-t border-borde pt-3">
                <span className="text-texto-2">{nombreCorto(articulacion.nombre.replace(/\s*\(.*\)$/, ''))}</span>
                <span className="font-mono text-2xl" data-testid="angulo">
                  {Number.isNaN(angulo) ? '—' : `${grados(angulo)}°`}
                  {anguloRedondeado !== 0 && !Number.isNaN(angulo) && (
                    <span className="ml-2 text-sm text-texto-2">{anguloRedondeado > 0 ? articulacion.positivo : articulacion.negativo}</span>
                  )}
                </span>
              </div>
            </section>
  )
}
