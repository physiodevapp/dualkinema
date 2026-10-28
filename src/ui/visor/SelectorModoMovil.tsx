import { PresentationChartLineIcon, VideoCameraIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { MODOS_MOVIL, type ModoMovil } from './preferencias'

/** Alto de la fila del selector (px): el visor lo descuenta del alto que reparte. */
export const ALTO_SELECTOR_PX = 44

type Icono = ComponentType<SVGProps<SVGSVGElement>>

const MODOS: Readonly<Record<ModoMovil, { nombre: string; iconos: readonly [Icono, Icono] }>> = {
  vg: { nombre: 'Vídeo y gráfica', iconos: [VideoCameraIcon, PresentationChartLineIcon] },
  vh: { nombre: 'Vídeo y herramientas', iconos: [VideoCameraIcon, WrenchScrewdriverIcon] },
  gh: { nombre: 'Gráfica y herramientas', iconos: [PresentationChartLineIcon, WrenchScrewdriverIcon] },
}

interface Props {
  readonly modo: ModoMovil
  readonly onModo: (m: ModoMovil) => void
}

/**
 * Qué dos zonas se ven en el móvil (vista mixta): vídeo y gráfica, vídeo y herramientas, o gráfica y herramientas. Nunca
 * las tres a la vez (no se veía bien ninguna). Siempre a la vista y con la elegida resaltada, para saber dónde se está y
 * cómo volver sin gestos que recordar.
 */
export default function SelectorModoMovil({ modo, onModo }: Props) {
  return (
    <div role="group" aria-label="Qué se ve en pantalla" data-testid="selector-modo" className="flex shrink-0 gap-2 pb-2 max-lg:order-0" style={{ height: ALTO_SELECTOR_PX }}>
      {MODOS_MOVIL.map((m) => {
        const { nombre, iconos } = MODOS[m]
        const [A, B] = iconos
        return (
          <button
            key={m}
            type="button"
            aria-pressed={modo === m}
            aria-label={nombre}
            title={nombre}
            data-testid={`modo-${m}`}
            onClick={() => onModo(m)}
            className={`flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border text-xs ${modo === m ? 'border-acento bg-acento/10 text-texto' : 'border-borde text-texto-2'}`}
          >
            <A className="size-5" aria-hidden="true" />
            <span aria-hidden="true">+</span>
            <B className="size-5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
