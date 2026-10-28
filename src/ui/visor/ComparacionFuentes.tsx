import { useEffect, useMemo, useState } from 'react'
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { TramoEstatico } from '../../core/articulaciones/cero'
import type { Comparacion, ComparacionFuentes as Resumen } from '../../core/pose/comparar'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt, grados } from './formato'
import GraficaTiempo, { type SerieGrafica } from './GraficaTiempo'

interface Props {
  /** Las dos medidas filtradas, un valor por frame (NaN = sin valor). */
  gomets: Float64Array
  sinMarcadores: Float64Array
  resumen: Resumen
  /** El tramo del cero con que se compara relativo al cero (null = sin cero). */
  tramo: TramoEstatico | null
  /** El informe para copiar (`core/pose/informe.ts`). */
  informe: string
  /** Tiempo de cada frame en el eje X (con dos vistas, el tiempo común). */
  tiempos: readonly number[]
  mostrado: number | null
  onBuscar: (t: number) => void
}

const linea = (c: Comparacion) =>
  `diferencia media ${grados(c.media)}° · DE ${grados(c.de)}° · ECM sin la diferencia media ${grados(c.ecmSinSesgo)}° · ` +
  `recorrido ${grados(c.rangoA.max - c.rangoA.min)}° con gomets y ${grados(c.rangoB.max - c.rangoB.min)}° sin marcadores · correlación ${fmt(c.correlacion, 2)}`

/**
 * Gomets frente a sin marcadores de la misma articulación (fase 5, paso 3b; D5): las dos curvas filtradas superpuestas,
 * gomets en ámbar y sin marcadores en claro, y lo que se apartan: a pelo (los puntos son otros: el gomet va sobre una
 * referencia ósea y el modelo da un centro articular aproximado, así que se espera una diferencia más o menos constante)
 * y relativo al cero de cada una, que quita esa diferencia. Con el informe para copiar (validación, paso 5).
 */
export default function ComparacionFuentes({ gomets, sinMarcadores, resumen, tramo, informe, tiempos, mostrado, onBuscar }: Props) {
  // «Copiado» solo mientras lo copiado es el informe de ahora, y unos segundos: si cambia (un cero, otra articulación) o
  // pasa el tiempo, el botón vuelve a «Copiar el informe» (antes se quedaba en «Copiado» y parecía que ya no copiaba).
  const [copiado, setCopiado] = useState<string | null>(null)
  useEffect(() => {
    if (copiado === null) return
    const id = setTimeout(() => setCopiado(null), 2000)
    return () => clearTimeout(id)
  }, [copiado])
  const xs = useMemo(() => Array.from(tiempos), [tiempos])
  const series = useMemo<SerieGrafica[]>(() => {
    const comoLinea = (v: Float64Array) => Array.from(v, (x) => (Number.isFinite(x) ? x : null))
    return [
      { id: 'gomets', color: 'acento', valores: comoLinea(gomets), ancho: 2, visible: true },
      { id: 'sin-marcadores', color: 'texto', valores: comoLinea(sinMarcadores), ancho: 2, visible: true },
    ]
  }, [gomets, sinMarcadores])
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(informe)
      setCopiado(informe)
    } catch {
      setCopiado(null)
    }
  }
  const { directa, relativa } = resumen
  return (
    <section className="relative flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="comparacion-fuentes">
      <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
        <span>
          <span className="text-acento">Gomets</span> frente a <span className="text-texto">sin marcadores</span>
        </span>
        <InfoGlosario id="comparar-fuentes" tema="por qué no dan lo mismo y cómo se comparan" className="-my-1.5" />
      </h2>
      <GraficaTiempo
        xs={xs}
        series={series}
        desde={xs[0] ?? 0}
        hasta={xs[xs.length - 1] ?? 0}
        indice={mostrado}
        unidad={grados}
        altoMinimo={20}
        alto={160}
        etiqueta="La misma articulación con gomets y sin marcadores"
        testid="grafica-fuentes"
        onBuscar={onBuscar}
      />
      {directa ? (
        <>
          <p className="text-sm" data-testid="comparacion-directa">
            <span className="text-texto-2">A pelo:</span> {linea(directa)}
          </p>
          <p className="text-sm" data-testid="comparacion-relativa">
            <span className="text-texto-2">Relativo al cero{tramo ? ` (${fmt(tramo.desde, 2)}–${fmt(tramo.hasta, 2)} s)` : ''}:</span>{' '}
            {relativa ? linea(relativa) : 'sin cero de referencia. Ponlo en «Velocidad y cero» para quitar la diferencia constante.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-texto-2" data-testid="comparacion-directa">
          Aún no hay frames con las dos medidas: hace falta detectar el cuerpo y seguir los gomets.
        </p>
      )}
      <button type="button" onClick={copiar} className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-2 text-sm">
        <ClipboardDocumentIcon className="size-5" /> {copiado === informe ? 'Copiado' : 'Copiar el informe'}
      </button>
    </section>
  )
}
