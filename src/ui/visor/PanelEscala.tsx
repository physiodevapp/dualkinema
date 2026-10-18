import {
  crearEscala,
  distanciaPx,
  incertidumbreRelativa,
  INCERTIDUMBRE_AVISO,
  metrosDesdeCm,
  metrosPorPx,
  OBJETOS_CALIBRACION,
  type CalibracionVista,
  type ObjetoCalibracion,
  type Punto2D,
} from '../../core/calibracion/escala'

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * Objetos para calibrar (decisión D4: la app no impone uno). El objeto no
 * cambia el cálculo: da una longitud de partida, un consejo y queda anotado
 * con la escala.
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
}

/** Calibración en curso: los extremos tocados en el vídeo y la longitud escrita. */
export interface BorradorEscala {
  readonly objeto: ObjetoCalibracion
  readonly a: Punto2D | null
  readonly b: Punto2D | null
  /** Instante del frame en que se tocó el último extremo. */
  readonly t: number | null
  /** Longitud en cm, tal como se escribe. */
  readonly longitud: string
}

/** El borrador como escala válida, o el motivo por el que todavía no lo es. */
export function escalaDeBorrador(b: BorradorEscala) {
  if (!b.a || !b.b || b.t === null) return { ok: false as const, motivo: b.a ? 'Toca el otro extremo del objeto en el vídeo.' : 'Toca un extremo del objeto en el vídeo.' }
  const longitudM = metrosDesdeCm(b.longitud)
  if (longitudM === null) return { ok: false as const, motivo: 'Escribe la longitud entre los dos extremos, en cm.' }
  return crearEscala({ objeto: b.objeto, a: b.a, b: b.b, longitudM, t: b.t })
}

interface Props {
  calibracion: CalibracionVista | null
  borrador: BorradorEscala | null
  /** Frame (1-based) en que se marcó la escala guardada. */
  frameCalibracion: number | null
  onEmpezar: () => void
  onBorrador: (b: BorradorEscala) => void
  onGuardar: () => void
  onCancelar: () => void
  onQuitar: () => void
  onIrAlFrame: () => void
  deshabilitado?: boolean
}

function Precision({ a, b }: { a: Punto2D; b: Punto2D }) {
  const u = incertidumbreRelativa(a, b)
  return (
    <>
      <p className="font-mono text-xs text-texto-2" data-testid="escala-precision">
        Precisión por el marcado: ± {fmt(u * 100, 1)} %
      </p>
      {u > INCERTIDUMBRE_AVISO && (
        <p className="text-xs text-acento" data-testid="escala-aviso-corto">
          El objeto ocupa solo {fmt(distanciaPx(a, b), 0)} px: un píxel de error al marcar cada extremo ya cambia la escala más
          de un 1 %. Mejor un objeto más largo o la cámara más cerca.
        </p>
      )}
    </>
  )
}

/**
 * Escala en metros (paso 6 de la fase 2): se tocan los dos extremos de un
 * objeto de longitud conocida en el vídeo y se escribe su longitud.
 */
export default function PanelEscala({ calibracion, borrador, frameCalibracion, onEmpezar, onBorrador, onGuardar, onCancelar, onQuitar, onIrAlFrame, deshabilitado }: Props) {
  const boton = 'rounded-md border border-borde px-3 py-2 text-sm disabled:opacity-40'
  const resultado = borrador ? escalaDeBorrador(borrador) : null

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-escala">
      <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Escala</h2>

      {borrador ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Objeto de calibración">
            {OBJETOS_CALIBRACION.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={borrador.objeto === o}
                onClick={() => onBorrador({ ...borrador, objeto: o, longitud: OBJETOS[o].cm || borrador.longitud })}
                className={`rounded-md border px-2 py-2 text-sm ${borrador.objeto === o ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
              >
                {OBJETOS[o].nombre}
              </button>
            ))}
          </div>
          <p className="text-xs text-texto-2">{OBJETOS[borrador.objeto].consejo}</p>

          <p className="text-sm" data-testid="escala-estado">
            {!borrador.a
              ? 'Toca un extremo del objeto en el vídeo. Mantén el dedo para ver la lupa y suelta justo en el extremo.'
              : !borrador.b
                ? 'Ahora toca el otro extremo.'
                : `Extremos a ${fmt(distanciaPx(borrador.a, borrador.b), 1)} px. Para corregir uno, toca cerca de él.`}
          </p>
          {borrador.a && borrador.b && <Precision a={borrador.a} b={borrador.b} />}

          <label className="flex items-center gap-2 text-sm">
            <span className="text-texto-2">Longitud entre los extremos</span>
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

          {resultado && !resultado.ok && borrador.a && borrador.b && <p className="text-xs text-acento">{resultado.motivo}</p>}
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
      ) : calibracion ? (
        <>
          <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 font-mono text-sm">
            <dt className="font-sans text-texto-2">{OBJETOS[calibracion.objeto].nombre}</dt>
            <dd className="text-right" data-testid="escala-objeto">
              {fmt(calibracion.longitudM * 100, 1)} cm = {fmt(distanciaPx(calibracion.a, calibracion.b), 1)} px
            </dd>
            <dt className="font-sans text-texto-2">1 px</dt>
            <dd className="text-right text-acento" data-testid="escala-mm-px">
              {fmt(metrosPorPx(calibracion) * 1000, 2)} mm
            </dd>
          </dl>
          <Precision a={calibracion.a} b={calibracion.b} />
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
            (cinta métrica, palo, regla…) en el plano del movimiento, toca sus dos extremos y escribe su longitud.
          </p>
          <button type="button" className={`${boton} self-start`} disabled={deshabilitado} onClick={onEmpezar}>
            Calibrar escala
          </button>
        </>
      )}
    </section>
  )
}
