import type { Lado } from '../../core/articulaciones/catalogo'
import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import type { DeteccionPose, IdMarcador, Marcador, TamanoModeloPose } from '../../core/modelo/tipos'
import { esIdPose } from '../../core/pose/puntos'
import { COLORES_MARCADOR, nombreCorto } from '../marcadores'
import AccionesHuecos from './AccionesHuecos'
import AvisoAnclas from './AvisoAnclas'
import BotonesQuitarManual from './BotonesQuitarManual'
import BotonIrAlHueco from './BotonIrAlHueco'
import BotonDetectar from './BotonDetectar'
import BotonSeguir from './BotonSeguir'
import ControlTrayectoria from './ControlTrayectoria'
import { grados } from './formato'
import InterruptorAOjo from './InterruptorAOjo'
import SelectorMarcadores from './SelectorMarcadores'
import type { Aviso } from './useSeguimiento'
import type { ProgresoDeteccion } from './useDeteccionPose'
import { InfoGlosario } from '../glosario/Glosario'

/** «Detectar el cuerpo» (sin marcadores, fase 5): solo en una vista de perfil. */
export interface DeteccionPanel {
  readonly progreso: ProgresoDeteccion | null
  /** Otra cosa ocupa el vídeo (se sigue, o se detecta en la otra vista). */
  readonly deshabilitado: boolean
  /** La última detección (null = todavía no). */
  readonly hecha: DeteccionPose | null
  readonly modelo: TamanoModeloPose
  readonly onModelo: (m: TamanoModeloPose) => void
  readonly onDetectar: () => void
  readonly onParar: () => void
}

const MODELOS: readonly { id: TamanoModeloPose; nombre: string }[] = [
  { id: 'full', nombre: 'Normal (full)' },
  { id: 'heavy', nombre: 'Preciso y lento (heavy, se descarga 30 MB)' },
]

interface Props {
  /** Pierna que ve la cámara. */
  lado: Lado
  /** Vista de frente: se ven las dos piernas (no «la que ve la cámara»). */
  frontal?: boolean
  marcadores: readonly Marcador[]
  /** Estado de cada marcador en el frame mostrado, en el orden de `marcadores`. */
  estadosMarcadores: readonly string[]
  seleccionado: IdMarcador | null
  onElegirMarcador: (id: IdMarcador | null) => void
  siguiendo: boolean
  colocarAOjo: boolean
  onCambiarAOjo: () => void
  listoParaSeguir: boolean
  /** La vista sigue gomets: sin ellos (solo los puntos del modelo) no hay «Seguir desde aquí». */
  conGomets: boolean
  /** «Detectar el cuerpo»; null en una vista de frente (llega en el paso 4). */
  deteccion: DeteccionPanel | null
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
  frontal = false,
  marcadores,
  estadosMarcadores,
  seleccionado,
  onElegirMarcador,
  siguiendo,
  colocarAOjo,
  onCambiarAOjo,
  listoParaSeguir,
  conGomets,
  deteccion,
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
  // Mientras se detecta el cuerpo, como mientras se sigue, no se marca.
  const ocupado = siguiendo || !!deteccion?.progreso
  const elegido = seleccionado ? marcadores.find((x) => x.id === seleccionado) : undefined
  return (
            <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
                  Marcadores <InfoGlosario id="calidad" tema="seguido, dudoso, perdido y a mano" className="-my-1.5" />
                </h2>
                <span className="text-sm text-texto-2">pierna {lado === 'izq' ? 'izquierda' : 'derecha'}{frontal ? '' : ' (la que ve la cámara)'}</span>
                {frontal && <InfoGlosario id="fppa" tema="el FPPA de la rodilla y dónde van los gomets" className="-my-1.5" />}
              </div>

              <SelectorMarcadores marcadores={marcadores} estados={estadosMarcadores} seleccionado={seleccionado} siguiendo={ocupado} onElegir={onElegirMarcador} />

              <p className="text-sm text-texto-2">
                {siguiendo
                  ? 'Siguiendo los gomets…'
                  : deteccion?.progreso
                    ? 'Detectando el cuerpo en cada frame del vídeo…'
                    : elegido && esIdPose(elegido.id)
                      ? `Toca el punto (${nombreCorto(elegido.nombre).toLowerCase()}) en la imagen: queda justo donde sueltas el dedo, a mano (los puntos del modelo no tienen gomet que buscar). Usa la lupa para afinar.`
                      : elegido && colocarAOjo
                        ? `A ojo: el ${nombreCorto(elegido.nombre).toLowerCase()} queda justo donde sueltas el dedo, sin ajustarse a ningún gomet. Usa la lupa para afinar.`
                        : elegido
                          ? `Toca el ${nombreCorto(elegido.nombre).toLowerCase()} en la imagen. Mantén el dedo para ver la lupa: cuando el gomet salga rodeado por un anillo, suelta y el marcador irá a su centro.`
                          : !conGomets
                            ? deteccion?.hecha
                              ? 'Para corregir un punto del modelo, elígelo y tócalo en la imagen.'
                              : 'Pulsa «Detectar el cuerpo»: el móvil busca a la persona en cada frame, sin marcadores.'
                            : listoParaSeguir
                              ? 'Los tres marcadores están en este frame: ya puedes seguir. Para corregir uno, elígelo y arrástralo con la lupa.'
                              : 'Elige un marcador para colocarlo o corregirlo en este frame.'}
              </p>

              {conGomets && <InterruptorAOjo activo={colocarAOjo} deshabilitado={ocupado} onCambiar={onCambiarAOjo} />}

              {/* Quitar una marca a mano equivocada de cualquier marcador, en este frame, sin elegirlo antes. */}
              {marcasManualesAqui.length > 0 && !ocupado && (
                <div className="flex flex-wrap gap-2">
                  <BotonesQuitarManual marcas={marcasManualesAqui} siguiendo={ocupado} frame={mostrado} onQuitar={onQuitarManual} claseExtra="" />
                </div>
              )}

              {conGomets && (
                <>
                  <AvisoAnclas frames={framesAnclas} siguiendo={siguiendo} onQuitar={onQuitarMarcasPosteriores} />
                  <BotonSeguir siguiendo={siguiendo} progreso={progresoSeguimiento} listo={listoParaSeguir} onSeguir={onSeguir} onParar={onParar} />
                </>
              )}

              {deteccion && (
                <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="detectar-cuerpo">
                  <p className="flex items-center gap-1 text-sm text-texto-2">
                    Sin marcadores: el cuerpo se detecta en el propio móvil (el vídeo no sale de él).
                    <InfoGlosario id="sin-marcadores" tema="cómo se detecta el cuerpo sin marcadores" className="-my-1.5" />
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    Modelo
                    <select
                      value={deteccion.modelo}
                      disabled={ocupado}
                      onChange={(e) => deteccion.onModelo(e.target.value as TamanoModeloPose)}
                      className="min-w-0 flex-1 rounded-md border border-borde bg-fondo px-2 py-1"
                    >
                      {MODELOS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <BotonDetectar
                    progreso={deteccion.progreso}
                    deshabilitado={deteccion.deshabilitado}
                    principal={!conGomets}
                    hecha={!!deteccion.hecha}
                    onDetectar={deteccion.onDetectar}
                    onParar={deteccion.onParar}
                  />
                  {deteccion.hecha && !deteccion.progreso && (
                    <p className="font-mono text-xs text-texto-2" data-testid="deteccion-hecha">
                      {deteccion.hecha.modelo} · {deteccion.hecha.delegado} · persona en {deteccion.hecha.conPersona} frames
                      {deteccion.hecha.intercambiados > 0 && ` · ${deteccion.hecha.intercambiados} con las piernas corregidas`}
                      {deteccion.hecha.dudosos > 0 && ` · ${deteccion.hecha.dudosos} dudosos`}
                    </p>
                  )}
                </div>
              )}

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

              {!ocupado && (huecosCortos > 0 || hayInterpolados) && (
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
