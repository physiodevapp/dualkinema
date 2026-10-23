import { SparklesIcon } from '@heroicons/react/24/outline'
import { HUECO_MAX_S } from '../../core/seguimiento/interpolar'
import { fmt } from './formato'
import { InfoGlosario } from '../glosario/Glosario'

interface Props {
  /** Huecos cortos que se pueden rellenar. */
  huecosCortos: number
  hayInterpolados: boolean
  onRellenar: () => void
  onQuitarInterpolados: () => void
  /** Versión de la tira del vídeo grande (botones pequeños, sin explicación); sin ella, la del panel «Marcar». */
  compacto?: boolean
}

/** «Rellenar N huecos cortos» y «Quitar lo interpolado»; el contenedor y cuándo se ofrecen lo decide quien lo usa. */
export default function AccionesHuecos({ huecosCortos, hayInterpolados, onRellenar, onQuitarInterpolados, compacto }: Props) {
  if (compacto) {
    return (
      <>
        {huecosCortos > 0 && (
          <button type="button" onClick={onRellenar} className="flex items-center gap-2 rounded-md border border-interpolado/60 px-3 py-2 text-sm text-interpolado">
            <SparklesIcon className="size-4" /> Rellenar {huecosCortos} hueco{huecosCortos === 1 ? '' : 's'} corto{huecosCortos === 1 ? '' : 's'}
          </button>
        )}
        {hayInterpolados && (
          <button type="button" onClick={onQuitarInterpolados} className="rounded-md border border-borde px-3 py-2 text-sm text-texto-2">
            Quitar lo interpolado
          </button>
        )}
      </>
    )
  }
  return (
    <>
      {huecosCortos > 0 && (
        <>
          <button
            type="button"
            onClick={onRellenar}
            className="flex items-center justify-center gap-2 rounded-md border border-interpolado/60 px-4 py-3 text-interpolado"
          >
            <SparklesIcon className="size-5" /> Rellenar {huecosCortos} hueco{huecosCortos === 1 ? '' : 's'} corto
            {huecosCortos === 1 ? '' : 's'}
          </button>
          <p className="text-xs text-texto-2">
            Huecos de {fmt(HUECO_MAX_S, 1)} s o menos entre dos posiciones fiables. Se rellenan con una curva suave que
            sigue el movimiento de antes y de después, y quedan marcados como interpolados.{' '}
            <InfoGlosario id="huecos" tema="los huecos y lo interpolado" className="-my-1.5 align-middle" />
          </p>
        </>
      )}
      {hayInterpolados && (
        <button type="button" onClick={onQuitarInterpolados} className="self-start rounded-md border border-borde px-3 py-2 text-sm text-texto-2">
          Quitar lo interpolado
        </button>
      )}
    </>
  )
}
