import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import { equivalenteGomets, fuenteDe } from '../../core/pose/catalogo'
import { InfoGlosario } from '../glosario/Glosario'

interface Props {
  /** Las articulaciones que se pueden mirar en la vista (las de su plano). */
  articulaciones: readonly DefinicionArticulacion[]
  elegida: DefinicionArticulacion
  onElegir: (id: string) => void
  deshabilitado: boolean
}

/** Lo que mide igual con las dos fuentes va junto: la de gomets y la sin marcadores equivalente. */
const claveDe = (a: DefinicionArticulacion) => (fuenteDe(a) === 'sinMarcadores' ? (equivalenteGomets(a.id) ?? a.id) : a.id)
/** «Rodilla derecha (flexo-extensión) sin marcadores» → «Rodilla derecha». */
const nombreCorto = (a: DefinicionArticulacion) => a.nombre.replace(/\s*sin marcadores$/, '').replace(/\s*\(.*\)$/, '')

/**
 * Qué articulación se mira en la vista (fase 5, paso 3b): una fila con cada una (rodilla, cadera, tobillo, tronco…) y,
 * si la elegida se mide con gomets y sin marcadores, otra fila para elegir la fuente (por defecto, los gomets: D5). Solo
 * aparece con más de una.
 */
export default function SelectorArticulacion({ articulaciones, elegida, onElegir, deshabilitado }: Props) {
  const grupos: DefinicionArticulacion[][] = []
  for (const a of articulaciones) {
    const g = grupos.find((x) => claveDe(x[0]!) === claveDe(a))
    if (g) g.push(a)
    else grupos.push([a])
  }
  const grupoElegido = grupos.find((g) => g.includes(elegida))
  // Al cambiar de articulación se va a la de gomets si la hay (mandan los gomets).
  const primeraDe = (g: DefinicionArticulacion[]) => g.find((a) => fuenteDe(a) === 'gomets') ?? g[0]!
  const conTronco = articulaciones.some((a) => a.id.includes('tronco'))
  const boton = (activo: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${activo ? 'border-acento text-texto' : 'border-borde text-texto-2'}`
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="selector-articulacion">
      <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
        Articulación
        {conTronco && <InfoGlosario id="inclinacion-tronco" tema="la inclinación del tronco" className="-my-1.5" />}
      </h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Articulación">
        {grupos.map((g) => {
          const activo = g === grupoElegido
          return (
            <button
              key={claveDe(g[0]!)}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={deshabilitado}
              onClick={() => !activo && onElegir(primeraDe(g).id)}
              className={boton(activo)}
            >
              {nombreCorto(g[0]!)}
            </button>
          )
        })}
      </div>
      {grupoElegido && grupoElegido.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Fuente">
          <span className="text-sm text-texto-2">Fuente</span>
          {grupoElegido.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a === elegida}
              disabled={deshabilitado}
              onClick={() => onElegir(a.id)}
              className={boton(a === elegida)}
            >
              {fuenteDe(a) === 'gomets' ? 'Gomets' : 'Sin marcadores'}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
