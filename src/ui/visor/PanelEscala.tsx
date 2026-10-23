import {
  crearEscala,
  distanciaPx,
  incertidumbreEscala,
  INCERTIDUMBRE_AVISO,
  metrosDesdeCm,
  metrosPorPx,
  OBJETOS_CALIBRACION,
  type CalibracionVista,
  type Desfase,
  type EntreMarcadores,
  type ObjetoCalibracion,
  type Punto2D,
  type ResultadoEntre,
} from '../../core/calibracion/escala'
import type { ConstanciaSegmento } from '../../core/calibracion/segmentos'
import type { IdMarcador } from '../../core/modelo/tipos'
import { InfoGlosario } from '../glosario/Glosario'

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const conSigno = (n: number, d: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}`

/**
 * Objetos para calibrar (decisión D4: la app no impone uno). El objeto no
 * cambia el cálculo: da una longitud de partida, un consejo y queda anotado
 * con la escala. «Entre dos marcadores» sí cambia de dónde salen los
 * extremos: de la posición media de dos gomets ya seguidos en un tramo quieto.
 */
export const OBJETOS: Record<ObjetoCalibracion, { nombre: string; cm: string; consejo: string }> = {
  cinta: {
    nombre: 'Cinta métrica',
    cm: '100',
    consejo:
      'Extiéndela a lo largo del movimiento, justo donde se mueve la persona (no más cerca ni más lejos de la cámara), y toca dos marcas lo más separadas posible.',
  },
  palo: {
    nombre: 'Palo',
    cm: '100',
    consejo: 'Sujétalo junto a la pierna, a la misma distancia de la cámara, sin inclinarlo hacia ella ni alejarlo. Toca sus dos puntas.',
  },
  regla: {
    nombre: 'Regla',
    cm: '30',
    consejo:
      'Cuanto más corta, menos precisa: ocupa pocos píxeles y un píxel de error al marcar pesa más. Si puedes, usa algo de 1 m. Ponla en el plano del movimiento.',
  },
  otro: {
    nombre: 'Otro',
    cm: '',
    consejo: 'Cualquier objeto rígido de longitud conocida, en el plano del movimiento y sin inclinarlo hacia la cámara.',
  },
  marcadores: {
    nombre: 'Entre dos marcadores',
    cm: '',
    consejo:
      'Mide con cinta la distancia entre los centros de los dos gomets, de pie y en la misma postura del tramo elegido. Mejor rodilla–tobillo que el muslo: el gomet del trocánter se mueve más sobre la piel. En ese tramo la pierna debe estar quieta y paralela a la cámara. Ese segmento ya no se podrá medir con el vídeo.',
  },
}

type Tramo = { readonly desde: number; readonly hasta: number }

/** Calibración en curso: los extremos tocados (o los marcadores y el tramo) y la longitud escrita. */
export interface BorradorEscala {
  readonly objeto: ObjetoCalibracion
  readonly a: Punto2D | null
  readonly b: Punto2D | null
  /** Instante del frame de los dos extremos (siempre el mismo: `tocarExtremo`). */
  readonly t: number | null
  /** El último toque empezó de nuevo porque los extremos eran de otro frame. */
  readonly otroFrame?: boolean
  /** Longitud en cm, tal como se escribe. */
  readonly longitud: string
  /** Con «Entre dos marcadores»: cuáles y en qué tramo se promedian. */
  readonly entre: { readonly desde: IdMarcador; readonly hasta: IdMarcador } | null
  readonly tramo: Tramo | null
}

/**
 * El borrador como escala válida, o el motivo por el que todavía no lo es.
 * `medicion`: la posición media de los dos marcadores en el tramo (solo con
 * «Entre dos marcadores»).
 */
export function escalaDeBorrador(b: BorradorEscala, medicion: ResultadoEntre | null) {
  const longitudM = metrosDesdeCm(b.longitud)
  if (b.objeto === 'marcadores') {
    if (!b.entre || !b.tramo || !medicion) return { ok: false as const, motivo: 'Elige los dos marcadores y el tramo.' }
    if (!medicion.ok) return medicion
    if (longitudM === null) return { ok: false as const, motivo: 'Escribe la distancia que mediste entre los dos gomets, en cm.' }
    const entre: EntreMarcadores = { ...b.entre, tramo: b.tramo, muestras: medicion.muestras, dispersionPx: medicion.dispersionPx }
    return crearEscala({ objeto: 'marcadores', a: medicion.a, b: medicion.b, longitudM, t: b.tramo.desde, entre })
  }
  if (!b.a || !b.b || b.t === null) return { ok: false as const, motivo: b.a ? 'Toca el otro extremo del objeto en el vídeo.' : 'Toca un extremo del objeto en el vídeo.' }
  if (longitudM === null) return { ok: false as const, motivo: 'Escribe la longitud entre los dos extremos, en cm.' }
  return crearEscala({ objeto: b.objeto, a: b.a, b: b.b, longitudM, t: b.t })
}

interface Segmento {
  readonly desde: IdMarcador
  readonly hasta: IdMarcador
  readonly nombre: string
}

interface Props {
  calibracion: CalibracionVista | null
  borrador: BorradorEscala | null
  /** Con «Entre dos marcadores»: lo medido con el borrador actual. */
  medicion: ResultadoEntre | null
  /** Frames del vídeo en el tramo del borrador (con o sin marcadores). */
  framesTramo: number | null
  /** Por qué la escala guardada entre marcadores ya no corresponde a lo seguido ahora (null: sigue valiendo). */
  desfase: Desfase | null
  /** Segmentos que se pueden usar para calibrar y cuya longitud se vigila. */
  segmentos: readonly Segmento[]
  /** Tramos que se ofrecen para promediar: el del cero de referencia, los primeros 2 s y el frame actual. */
  tramos: { readonly cero: Tramo | null; readonly primeros: Tramo | null; readonly actual: number | null }
  /** Longitud de cada segmento a lo largo del vídeo (con las coordenadas filtradas). */
  constancia: readonly { readonly segmento: Segmento; readonly c: ConstanciaSegmento | null }[]
  /** Frame (1-based) en que se marcó la escala guardada. */
  frameCalibracion: number | null
  onEmpezar: () => void
  onBorrador: (b: BorradorEscala) => void
  onGuardar: () => void
  onCancelar: () => void
  onQuitar: () => void
  onIrAlFrame: () => void
  /** Ir al frame i (0-based). */
  onIr: (i: number) => void
  deshabilitado?: boolean
}

function Precision({ c, cinta }: { c: Pick<CalibracionVista, 'a' | 'b' | 'entre'>; cinta?: boolean }) {
  const u = incertidumbreEscala(c)
  return (
    <>
      <p className="font-mono text-xs text-texto-2" data-testid="escala-precision">
        Precisión por el marcado: ± {fmt(u * 100, 1)} %
      </p>
      {cinta && (
        <p className="text-xs text-texto-2">
          A eso se suma tu medida con cinta: 5 mm de error sobre 40 cm ya son un 1,2 %. Con un pie de rey, mucho menos.
        </p>
      )}
      {u > INCERTIDUMBRE_AVISO && (
        <p className="text-xs text-acento" data-testid="escala-aviso-corto">
          El objeto ocupa solo {fmt(distanciaPx(c.a, c.b), 0)} px: un píxel de error al marcar cada extremo ya cambia la escala más
          de un 1 %. Mejor un objeto más largo o la cámara más cerca.
        </p>
      )}
    </>
  )
}

const mismoTramo = (a: Tramo | null, b: Tramo | null) => !!a && !!b && Math.abs(a.desde - b.desde) < 1e-9 && Math.abs(a.hasta - b.hasta) < 1e-9

/**
 * Escala en metros (paso 6 de la fase 2): se tocan los dos extremos de un
 * objeto de longitud conocida en el vídeo, o se eligen dos marcadores, y se
 * escribe la longitud. Debajo, cuánto cambia la longitud de cada segmento a
 * lo largo del vídeo.
 */
export default function PanelEscala({
  calibracion,
  borrador,
  medicion,
  framesTramo,
  desfase,
  segmentos,
  tramos,
  constancia,
  frameCalibracion,
  onEmpezar,
  onBorrador,
  onGuardar,
  onCancelar,
  onQuitar,
  onIrAlFrame,
  onIr,
  deshabilitado,
}: Props) {
  const boton = 'rounded-md border border-borde px-3 py-2 text-sm disabled:opacity-40'
  const opcion = (activa: boolean) => `rounded-md border px-2 py-2 text-sm ${activa ? 'border-acento text-texto' : 'border-borde text-texto-2'}`
  const resultado = borrador ? escalaDeBorrador(borrador, medicion) : null
  const nombreSegmento = (e: { desde: IdMarcador; hasta: IdMarcador }) =>
    segmentos.find((s) => s.desde === e.desde && s.hasta === e.hasta)?.nombre ?? `${e.desde} – ${e.hasta}`
  const mPx = calibracion ? metrosPorPx(calibracion) : null
  const opcionesTramo: { nombre: string; tramo: Tramo }[] = [
    ...(tramos.cero ? [{ nombre: 'Tramo del cero', tramo: tramos.cero }] : []),
    ...(tramos.primeros ? [{ nombre: 'Primeros 2 s', tramo: tramos.primeros }] : []),
    ...(tramos.actual !== null ? [{ nombre: 'Este frame', tramo: { desde: tramos.actual, hasta: tramos.actual } }] : []),
  ]

  const editar = borrador && (
    <>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Objeto de calibración">
        {OBJETOS_CALIBRACION.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={borrador.objeto === o}
            onClick={() => onBorrador({ ...borrador, objeto: o, longitud: OBJETOS[o].cm })}
            className={`${opcion(borrador.objeto === o)} ${o === 'marcadores' ? 'col-span-2' : ''}`}
          >
            {OBJETOS[o].nombre}
          </button>
        ))}
      </div>
      <p className="text-xs text-texto-2">{OBJETOS[borrador.objeto].consejo}</p>

      {borrador.objeto === 'marcadores' ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-texto-2">Marcadores</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Segmento de calibración">
              {segmentos.map((s) => (
                <button
                  key={`${s.desde}-${s.hasta}`}
                  type="button"
                  role="radio"
                  aria-checked={borrador.entre?.desde === s.desde && borrador.entre.hasta === s.hasta}
                  onClick={() => onBorrador({ ...borrador, entre: { desde: s.desde, hasta: s.hasta } })}
                  className={opcion(borrador.entre?.desde === s.desde && borrador.entre.hasta === s.hasta)}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-texto-2">
              Promediar en {borrador.tramo ? <span className="font-mono">{fmt(borrador.tramo.desde, 2)}–{fmt(borrador.tramo.hasta, 2)} s</span> : '…'}
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tramo de calibración">
              {opcionesTramo.map(({ nombre, tramo }) => (
                <button
                  key={nombre}
                  type="button"
                  role="radio"
                  aria-checked={mismoTramo(borrador.tramo, tramo)}
                  onClick={() => onBorrador({ ...borrador, tramo })}
                  className={opcion(mismoTramo(borrador.tramo, tramo))}
                >
                  {nombre}
                </button>
              ))}
            </div>
          </div>
          {medicion?.ok ? (
            <>
              <p className="text-sm" data-testid="escala-estado">
                Distancia media: <span className="font-mono">{fmt(distanciaPx(medicion.a, medicion.b), 1)} px</span> en {medicion.muestras}{' '}
                frame{medicion.muestras === 1 ? '' : 's'} (varía ± {fmt(medicion.dispersionPx, 1)} px)
              </p>
              {framesTramo !== null && medicion.muestras < framesTramo && (
                <p className="text-xs text-acento" data-testid="escala-pocos-frames">
                  Solo {medicion.muestras} de los {framesTramo} frames del tramo tienen los dos marcadores. Sigue los gomets antes de
                  calibrar («Seguir desde aquí») para promediar todo el tramo.
                </p>
              )}
              {medicion.dispersionPx > 0.01 * distanciaPx(medicion.a, medicion.b) && (
                <p className="text-xs text-acento">
                  En ese tramo la distancia cambia más de un 1 %: no parece quieto o los gomets se deslizan. Elige otro tramo.
                </p>
              )}
              <Precision c={{ a: medicion.a, b: medicion.b, entre: { ...borrador.entre!, tramo: borrador.tramo!, muestras: medicion.muestras, dispersionPx: medicion.dispersionPx } }} cinta />
            </>
          ) : (
            <p className="text-sm text-acento" data-testid="escala-estado">
              {medicion?.motivo ?? 'Elige los dos marcadores y el tramo.'}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm" data-testid="escala-estado">
            {!borrador.a
              ? 'Toca un extremo del objeto en el vídeo. Mantén el dedo para ver la lupa y suelta justo en el extremo.'
              : !borrador.b
                ? borrador.otroFrame
                  ? 'Has cambiado de frame: los dos extremos tienen que ser del mismo (el objeto podría haberse movido), así que ese toque empieza de nuevo. Ahora toca el otro extremo en este frame.'
                  : 'Ahora toca el otro extremo.'
                : `Extremos a ${fmt(distanciaPx(borrador.a, borrador.b), 1)} px. Para corregir uno, toca cerca de él.`}
          </p>
          {borrador.a && borrador.b && <Precision c={{ a: borrador.a, b: borrador.b }} />}
        </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <span className="text-texto-2">{borrador.objeto === 'marcadores' ? 'Distancia medida' : 'Longitud entre los extremos'}</span>
        <input
          type="text"
          inputMode="decimal"
          value={borrador.longitud}
          onChange={(e) => onBorrador({ ...borrador, longitud: e.target.value })}
          aria-label="Longitud en cm"
          className="w-20 rounded-md border border-borde bg-fondo px-2 py-1 text-right font-mono"
        />
        <span className="text-texto-2">cm</span>
      </label>

      {resultado && !resultado.ok && (borrador.objeto === 'marcadores' ? medicion?.ok : borrador.a && borrador.b) && (
        <p className="text-xs text-acento">{resultado.motivo}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-acento px-3 py-2 text-sm font-medium text-fondo disabled:opacity-40"
          disabled={deshabilitado || !resultado?.ok}
          onClick={onGuardar}
        >
          Guardar escala
        </button>
        <button type="button" className={`${boton} text-texto-2`} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </>
  )

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-escala">
      <h2 className="flex items-center gap-1 font-mono text-xs tracking-wider text-texto-2 uppercase">
        Escala <InfoGlosario id="escala" tema="la escala y su precisión" className="-my-1.5" />
      </h2>

      {editar ||
        (calibracion ? (
          <>
            <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 font-mono text-sm">
              <dt className="font-sans text-texto-2">{calibracion.entre ? nombreSegmento(calibracion.entre) : OBJETOS[calibracion.objeto].nombre}</dt>
              <dd className="text-right" data-testid="escala-objeto">
                {fmt(calibracion.longitudM * 100, 1)} cm = {fmt(distanciaPx(calibracion.a, calibracion.b), 1)} px
              </dd>
              <dt className="font-sans text-texto-2">1 px</dt>
              <dd className="text-right text-acento" data-testid="escala-mm-px">
                {fmt(metrosPorPx(calibracion) * 1000, 2)} mm
              </dd>
            </dl>
            {calibracion.entre && (
              <p className="text-xs text-texto-2">
                Posición media de los dos gomets en {calibracion.entre.muestras} frame{calibracion.entre.muestras === 1 ? '' : 's'} (
                {fmt(calibracion.entre.tramo.desde, 2)}–{fmt(calibracion.entre.tramo.hasta, 2)} s), tal como estaban al guardar. Si corriges
                esos marcadores, pulsa «Rehacer».
              </p>
            )}
            {desfase && (
              <p className="text-xs text-acento" data-testid="escala-rehacer">
                {desfase.motivo === 'sin-marcadores'
                  ? 'Ya no están los dos marcadores en el tramo de la escala: las velocidades en m/s siguen usando la distancia de cuando se guardó. Rehazla en otro tramo o quítala.'
                  : desfase.motivo === 'frames'
                    ? desfase.ahora > desfase.antes
                      ? `Al guardar solo había ${desfase.antes} frame${desfase.antes === 1 ? '' : 's'} con los dos marcadores en el tramo; ahora hay ${desfase.ahora}. Pulsa «Rehacer» y guarda para promediarlos todos.`
                      : `Al guardar había ${desfase.antes} frames con los dos marcadores en el tramo; ahora hay ${desfase.ahora} (se han quitado marcas o lo interpolado, que no cuenta). Pulsa «Rehacer» y guarda.`
                    : `Los marcadores del tramo han cambiado desde que se guardó: la distancia media es ahora ${fmt(desfase.ahoraPx, 1)} px (era ${fmt(desfase.antesPx, 1)}, ${desfase.cambio > 0 ? '+' : '−'}${fmt(Math.abs(desfase.cambio) * 100, 1)} %). Pulsa «Rehacer» y guarda.`}
              </p>
            )}
            <Precision c={calibracion} cinta={!!calibracion.entre} />
            <p className="text-xs text-texto-2">
              Solo vale para lo que se mueve en el plano del objeto: a 3 m de la cámara, 10 cm más cerca o más lejos ya cambian la
              escala un 3 %. Sin corrección de lente (fase 6), los bordes de la imagen tienen algo de distorsión. Los ángulos no
              dependen de la escala.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boton} disabled={deshabilitado} onClick={onEmpezar}>
                Rehacer
              </button>
              {frameCalibracion !== null && (
                <button type="button" className={boton} onClick={onIrAlFrame}>
                  Ver en el frame {frameCalibracion}
                </button>
              )}
              <button type="button" className={`${boton} text-texto-2`} disabled={deshabilitado} onClick={onQuitar}>
                Quitar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-texto-2">
              Sin escala: las velocidades de los marcadores van en px/s. Para pasarlas a m/s, graba un objeto de longitud conocida
              (cinta métrica, palo, regla…) en el plano del movimiento y toca sus dos extremos, o mide con cinta la distancia entre
              dos gomets.
            </p>
            <button type="button" className={`${boton} self-start`} disabled={deshabilitado} onClick={onEmpezar}>
              Calibrar escala
            </button>
          </>
        ))}

      {constancia.some((s) => s.c) && (
        <div className="flex flex-col gap-2 border-t border-borde pt-3">
          <h3 className="flex items-center gap-1 text-sm">
            Longitud de los segmentos <InfoGlosario id="segmentos" tema="la longitud de los segmentos" className="-my-1.5" />
          </h3>
          {constancia.map(({ segmento, c }) =>
            c ? (
              <div key={`${segmento.desde}-${segmento.hasta}`} className="flex flex-col gap-1" data-testid={`constancia-${segmento.desde}-${segmento.hasta}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="text-texto-2">{segmento.nombre}</span>
                  <span className="font-mono" data-testid="constancia-longitud">
                    {fmt(c.referenciaPx, 1)} px{mPx !== null && ` · ${fmt(c.referenciaPx * mPx * 100, 1)} cm`}
                  </span>
                </p>
                <p className="font-mono text-xs text-texto-2">
                  varía <span data-testid="constancia-rms">± {fmt(c.rms * 100, 1)} %</span> · máx.{' '}
                  <span data-testid="constancia-max">{conSigno(c.maxRel * 100, 1)} %</span>{' '}
                  <button type="button" className="underline decoration-dotted" onClick={() => onIr(c.indiceMax)}>
                    en el frame {c.indiceMax + 1}
                  </button>
                </p>
                {c.fuera > 0 && (
                  <p className="text-xs text-acento" data-testid="constancia-fuera">
                    {c.fuera} de {c.muestras} frames se apartan más de un {fmt(c.umbral * 100, 0)} %.
                  </p>
                )}
              </div>
            ) : null,
          )}
          <p className="text-xs text-texto-2">
            Distancia entre los gomets en la imagen (mediana, con lo filtrado). Debería no cambiar: si cambia, en esos frames el
            segmento sale del plano de la cámara (se ve más corto), los gomets se deslizan sobre la piel o el seguimiento falla. Ahí
            la escala y los ángulos son menos fiables. En una sentadilla, el gomet de la rodilla se desliza algo al flexionar.
          </p>
        </div>
      )}
    </section>
  )
}
