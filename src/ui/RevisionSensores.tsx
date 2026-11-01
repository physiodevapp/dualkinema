import { inclinacion, movimiento, verticalCamara, type Sensores } from '../core/sensores/sensores'
import { InfoGlosario } from './glosario/Glosario'

const grados = (x: number) => `${x.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}°`

/**
 * Lo que dicen los sensores de una grabación al pararla (fase 6, paso 1): la inclinación de la cámara y, si el móvil se
 * movió durante la toma, un aviso (no vale para 3D; para 2D, sí, aunque el fondo se mueva). Nada si no hay sensores.
 */
export function RevisionSensores({ sensores }: { readonly sensores: Sensores | undefined }) {
  if (!sensores) return null
  const v = verticalCamara(sensores)
  const inc = v ? inclinacion(v) : null
  const mov = movimiento(sensores)
  return (
    <>
      {inc && (
        <p
          className="flex items-center gap-1 font-mono text-xs text-texto-2"
          data-testid="revision-sensores"
          data-cabeceo={inc.cabeceo.toFixed(2)}
          data-alabeo={inc.alabeo.toFixed(2)}
          data-movido={mov ? mov.motivos.join(' ') : ''}
        >
          Cámara {inc.cabeceo >= 0 ? 'mirando hacia abajo' : 'mirando hacia arriba'} {grados(Math.abs(inc.cabeceo))} · girada {grados(inc.alabeo)}
          <InfoGlosario id="sensores" tema="los sensores al grabar" className="-my-1.5" />
        </p>
      )}
      {mov && (
        <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid="aviso-movido">
          {mov.motivos.includes('pantalla')
            ? 'La pantalla giró durante la grabación'
            : `El móvil se movió durante la grabación${mov.instantes.length ? ` (hacia los ${mov.instantes.slice(0, 3).map((t) => `${t} s`).join(', ')}${mov.instantes.length > 3 ? '…' : ''})` : ''}${mov.motivos.includes('vertical') && mov.cambioVertical !== null ? `; su inclinación cambió ${grados(mov.cambioVertical)}` : ''}`}
          . Esta toma sirve para medir en 2D, pero no para el 3D: apoya el móvil en algo firme y que no se mueva.
        </p>
      )}
    </>
  )
}
