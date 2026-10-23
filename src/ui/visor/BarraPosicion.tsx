import type { ReactNode, Ref } from 'react'
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { relativoAlCero, type CeroReferencia } from '../../core/articulaciones/cero'
import BotonPaso from './BotonPaso'
import { fmt, grados, valorEn } from './formato'
import { SALTO } from './useNavegacionFrames'

/** Ancho de la columna de la derecha con el móvil girado (el vídeo grande y la barra fija lo comparten). */
export const ANCHO_COLUMNA_APAISADA = 'max-lg:w-[clamp(18rem,40vw,24rem)]'

interface Props {
  /** La caja de la barra: el visor mide su alto (`--alto-barra`) y lo usa `useMiniGrande`. */
  contenedorRef: Ref<HTMLDivElement>
  /** Tiempo del frame mostrado (s). */
  t: number | null
  /** Frame mostrado (null mientras se decodifica el primero), frame pedido y total. */
  mostrado: number | null
  deseado: number
  total: number
  /** Lo que tardó el último frame en decodificarse (ms) y cómo se consiguió (caché, seguido o clave). */
  msDecodificar: number | null
  lectura: string | null
  /** El deslizador de frames, que en el móvil va en la fila de posición. */
  deslizador: ReactNode
  /** Valores del frame para la fila de valores. */
  anguloFiltrado: number
  cero: CeroReferencia | null
  velocidad: ArrayLike<number>
  aceleracion: ArrayLike<number>
  onMover: (d: number) => void
  /** Móvil girado con el vídeo grande: la barra ocupa solo la columna de la derecha, no todo el ancho. */
  columna?: boolean
}

/**
 * Móvil: barra fija abajo con los botones, la línea de posición y los valores del frame, para no perderlos de vista al
 * hacer scroll. Altura fija (nada de lo que contiene cambia de altura). En pantalla ancha no existe como caja
 * (`contents`): queda en su sitio de siempre.
 */
export default function BarraPosicion({
  contenedorRef,
  t,
  mostrado,
  deseado,
  total,
  msDecodificar,
  lectura,
  deslizador,
  anguloFiltrado,
  cero,
  velocidad,
  aceleracion,
  onMover,
  columna,
}: Props) {
  return (
          <div
            ref={contenedorRef}
            data-testid="barra-fija"
            className={`max-lg:fixed ${columna ? `max-lg:right-0 ${ANCHO_COLUMNA_APAISADA}` : 'max-lg:inset-x-0'} max-lg:bottom-0 max-lg:z-30 max-lg:flex max-lg:flex-col max-lg:gap-1.5 max-lg:border-t max-lg:border-borde max-lg:bg-fondo max-lg:px-4 max-lg:pt-1.5 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:contents`}
          >
            {/* Siempre la misma altura: una línea que no se parte (lo que no cabe se corta). Si el texto
                cambiaba de una a dos líneas (p. ej. «288 ms clave»), los botones de debajo se movían
                y se perdía la pulsación mantenida. En el móvil, sin «t =» ni «frame» y sin los ms (están en la pestaña
                «Vídeo»), con el deslizador de frames en medio: tiempo, deslizador y «frame / total» en una sola fila. */}
            <div className={`flex items-center gap-x-2 font-mono text-sm tabular-nums max-lg:h-7 lg:items-baseline lg:justify-between lg:gap-x-3`} data-testid="posicion">
              <span className="shrink-0 whitespace-nowrap">
                <span className="max-lg:hidden">t = </span>
                <span className="text-acento">{t === null ? '—' : fmt(t, 3)} s</span>
              </span>
              <div className="min-w-0 flex-1 lg:hidden">{deslizador}</div>
              <span className="min-w-0 truncate whitespace-nowrap text-texto-2 max-lg:shrink-0">
                <span className="max-lg:hidden">frame </span>
                {mostrado === null ? '—' : mostrado + 1} / {total}
                {mostrado !== deseado && ' …'}
                {/* A la vista junto a los controles: para ver en el móvil si decodificar se frena al mantener pulsado. */}
                {msDecodificar !== null && (
                  <span data-testid="ms-decodificar" className="max-lg:hidden">
                    {' '}
                    · {fmt(msDecodificar, 0)} ms{lectura && (
                      <>
                        {' '}
                        <span data-testid="lectura" className="text-xs">
                          {lectura}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </span>
            </div>

            {/* Valores del frame actual junto a los controles: en el móvil, el panel «Velocidad y
                cero» queda fuera de la vista mientras se recorre el movimiento. Altura fija y sin
                partir, para no mover los botones (se perdería la pulsación mantenida). */}
            <dl className={`grid grid-cols-4 gap-1 rounded-md border border-borde bg-panel px-2 py-0.5 font-mono tabular-nums`} data-testid="lectura-rapida">
              {(
                [
                  ['Ángulo', Number.isFinite(anguloFiltrado) ? `${grados(anguloFiltrado)}°` : '—', 'rapida-angulo'],
                  ['Relativo', cero && Number.isFinite(anguloFiltrado) ? `${grados(relativoAlCero(anguloFiltrado, cero))}°` : '—', 'rapida-relativo'],
                  ['°/s', valorEn(velocidad, mostrado, 1), 'rapida-velocidad'],
                  ['°/s²', valorEn(aceleracion, mostrado, 0), 'rapida-aceleracion'],
                ] as const
              ).map(([etiqueta, texto, id]) => (
                <div key={id} className="min-w-0 text-center">
                  <dt className="truncate text-[0.65rem] leading-tight text-texto-2">{etiqueta}</dt>
                  <dd className="truncate text-sm leading-tight whitespace-nowrap" data-testid={id}>{texto}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2 lg:order-2">
              <BotonPaso etiqueta={`Retroceder ${SALTO} frames`} accion={() => onMover(-SALTO)}>
                <ChevronDoubleLeftIcon className="size-6" />
              </BotonPaso>
              <BotonPaso etiqueta="Frame anterior" accion={() => onMover(-1)}>
                <ChevronLeftIcon className="size-7" />
              </BotonPaso>
              <BotonPaso etiqueta="Frame siguiente" accion={() => onMover(1)}>
                <ChevronRightIcon className="size-7" />
              </BotonPaso>
              <BotonPaso etiqueta={`Avanzar ${SALTO} frames`} accion={() => onMover(SALTO)}>
                <ChevronDoubleRightIcon className="size-6" />
              </BotonPaso>
            </div>
          </div>
  )
}
