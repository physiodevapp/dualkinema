import { useState, type ReactNode } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline'
import { Frente } from '../FigurasVista'
import { InfoGlosario } from '../glosario/Glosario'
import { useInclinacion } from '../useInclinacion'
import {
  anguloPorDistancias,
  CLAVE_TOMA_B1,
  fueraDeRango,
  leerNumero,
  leerProgreso,
  PASOS_B1,
  PROGRESO_INICIAL,
  RANGOS,
  CASILLAS_GRABACION,
  CASILLAS_POR_PASO,
  desmarcar,
  hechasDelPaso,
  textoMedidas,
  type MedidasB1,
  type ProgresoB1,
} from './medidas'

/*
 * Guía paso a paso de la toma B1 (fase 6, «La toma B1» de docs/plan-fase-6.md): la primera grabación real con dos móviles
 * para el 3D, con la que se comprobará si MediaPipe marca el mismo punto desde los dos flancos. Lo que se marca y lo que se
 * mide se recuerda en este móvil (`medidas.ts`), para poder ir a «Grabar con dos móviles» y volver.
 */

const leer = (): ProgresoB1 => {
  try {
    return leerProgreso(localStorage.getItem(CLAVE_TOMA_B1))
  } catch {
    return PROGRESO_INICIAL
  }
}
const guardar = (p: ProgresoB1) => {
  try {
    localStorage.setItem(CLAVE_TOMA_B1, JSON.stringify(p))
  } catch {
    /* sin almacenamiento: se pierde al salir */
  }
}

const TITULOS = ['Material y gomets', 'Antes de empezar', 'Colocar los móviles', 'Emparejar', 'Grabar', 'Medir con la cinta', 'Después'] as const

export default function GuiaTomaB1({ alSalir, alEmparejar }: { alSalir: () => void; alEmparejar: () => void }) {
  const [p, setP] = useState<ProgresoB1>(leer)
  const cambiar = (nuevo: ProgresoB1) => {
    setP(nuevo)
    guardar(nuevo)
  }
  const irA = (paso: number) => cambiar({ ...p, paso: Math.max(0, Math.min(PASOS_B1 - 1, paso)) })
  const marcar = (id: string) => cambiar({ ...p, hechos: p.hechos.includes(id) ? p.hechos.filter((h) => h !== id) : [...p.hechos, id] })
  const medir = (m: Partial<MedidasB1>) => cambiar({ ...p, medidas: { ...p.medidas, ...m } })
  // «Empezar de nuevo» pide un segundo toque.
  const [confirmarReinicio, setConfirmarReinicio] = useState(false)
  const { hechas, total } = hechasDelPaso(p, p.paso)
  const casilla = (id: string, texto: ReactNode) => <Casilla id={id} hecho={p.hechos.includes(id)} alMarcar={() => marcar(id)}>{texto}</Casilla>

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4" data-testid="guia-b1" data-paso={p.paso}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 font-serif text-2xl">
          Toma B1 <InfoGlosario id="toma-prueba-tres-d" tema="la toma B1" className="-my-1.5" />
        </h2>
        <button type="button" onClick={alSalir} className="min-h-11 rounded-md border border-borde px-3 text-sm" data-testid="salir-guia-b1">
          Salir
        </button>
      </div>
      <p className="text-sm text-texto-2">
        Una grabación con dos móviles, uno en cada flanco de la persona, para comprobar el 3D antes de construirlo. Lo que marques y midas se queda en este
        móvil.
      </p>

      <ol className="flex gap-1" aria-label="Pasos">
        {TITULOS.map((t, i) => (
          <li key={t} className="flex-1">
            <button
              type="button"
              onClick={() => irA(i)}
              aria-current={i === p.paso ? 'step' : undefined}
              title={t}
              className={`h-2 w-full rounded-full ${i === p.paso ? 'bg-acento' : i < p.paso ? 'bg-acento/40' : 'bg-borde'}`}
            >
              <span className="sr-only">{`Paso ${i + 1}: ${t}`}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="relative flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid={`paso-b1-${p.paso}`}>
        <p className="flex items-center justify-between gap-2 font-mono text-xs text-texto-2">
          <span>
            Paso {p.paso + 1} de {PASOS_B1}
            {total > 0 && ` · ${hechas} de ${total} hechos`}
          </span>
          {hechas > 0 && (
            <button
              type="button"
              onClick={() => cambiar(desmarcar(p, CASILLAS_POR_PASO[p.paso] ?? []))}
              className="min-h-9 rounded-md border border-borde px-2 font-sans text-xs text-texto"
              data-testid="b1-rehacer-paso"
            >
              Rehacer este paso
            </button>
          )}
        </p>
        <h3 className="text-lg font-medium">{TITULOS[p.paso]}</h3>

        {p.paso === 0 && (
          <>
            <ul className="flex flex-col gap-2">
              {casilla('moviles', 'Los dos móviles cargados (más de la mitad de batería) y con espacio libre.')}
              {casilla('apoyos', 'Dos apoyos firmes a ~1 m de alto (trípode, estantería, una silla con libros): que no se muevan durante la toma.')}
              {casilla('cinta', 'Una cinta métrica de 5 m o más.')}
              {casilla('ropa', 'La persona con ropa ajustada o corta (pantalón corto mejor): el modelo encuentra peor las rodillas bajo ropa ancha.')}
              {casilla('espacio', 'Unos 4 × 4 m despejados, con luz delante de la persona (no a contraluz) y un fondo sin otras personas.')}
            </ul>
            <div className="flex flex-col gap-2 rounded-md border border-borde p-3">
              <p className="font-medium">¿Gomets? Opcionales, pero recomendados</p>
              <p className="text-sm text-texto-2">
                La toma se hace sin marcadores (el 3D usará el cuerpo que detecta el modelo). Pero un gomet es{' '}
                <strong className="text-texto">el mismo punto visto por las dos cámaras</strong>: con ellos se distingue si un error viene de la calibración o
                de que el modelo marca sitios distintos desde cada lado, que es justo lo que mira esta toma.
              </p>
              <div className="flex items-center gap-3">
                <FiguraGomets />
                <ul className="flex flex-col gap-1 text-sm">
                  <li>
                    <strong className="text-texto">Seis, por delante</strong>, tres en cada pierna:
                  </li>
                  <li>· mitad del muslo, por delante;</li>
                  <li>· centro de la rótula;</li>
                  <li>· centro del tobillo por delante (entre los dos maléolos).</li>
                  <li className="text-texto-2">Verdes o azules (los rojos se confunden con la piel). No en el lado de fuera: allí solo los vería una cámara.</li>
                </ul>
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={p.medidas.gomets} onChange={(e) => medir({ gomets: e.target.checked })} data-testid="b1-gomets" className="size-5 accent-acento" />
                Lleva los gomets de delante
              </label>
            </div>
          </>
        )}

        {p.paso === 1 && (
          <ul className="flex flex-col gap-2">
            {casilla('produccion', 'Los dos móviles con la app instalada de producción (la misma versión en los dos).')}
            {casilla('retraso', 'El retraso de la cámara calibrado en los dos («Grabar con este móvil» → calibrar con palmadas). Si ya lo hiciste en la fase 4, vale.')}
            {casilla('fps', 'Los dos graban a 30 fps: en «Grabar con este móvil», que no salga el aviso de «grabaría a pocos fps».')}
            {casilla('auriculares', 'Sin auriculares ni micrófonos externos conectados (el pitido tiene que oírse).')}
            {casilla('wifi', 'Los dos en la misma Wi-Fi (o con buena cobertura): el reloj común va por internet.')}
            {casilla('giro', 'El giro automático de la pantalla, como lo uses siempre, y el móvil en vertical durante toda la toma.')}
          </ul>
        )}

        {p.paso === 2 && (
          <>
            <Planta />
            <ul className="flex flex-col gap-2">
              {casilla('flancos', 'Un móvil en cada flanco, por delante de la persona: cada uno a unos 45° de su frente (unos 90° entre los dos).')}
              {casilla('distancia', 'A unos 3 m de donde estará la persona, los dos a una distancia parecida.')}
              {casilla('altura', 'La lente a ~1 m del suelo (entre la rodilla y la cadera). No hace falta que los dos estén a la misma altura.')}
              {casilla('encuadre', 'La persona entera en las dos imágenes, de la cabeza a los pies, también al dar unos pasos y al agacharse, con algo de margen.')}
              {casilla('firme', 'Cada móvil apoyado y quieto: no lo toques durante la grabación (se programa desde cualquiera de los dos).')}
            </ul>
            <InclinacionEnDirecto />
          </>
        )}

        {p.paso === 3 && (
          <>
            <ul className="flex flex-col gap-2">
              {casilla('sala', 'En un móvil, «Grabar con dos móviles» → crear la sala; en el otro, unirse con el QR o el código.')}
              {casilla('vista-der', 'En el móvil del flanco derecho de la persona: «De perfil, mira a la derecha» (en su imagen la persona mira hacia la derecha).')}
              {casilla('vista-izq', 'En el del flanco izquierdo: «De perfil, mira a la izquierda». La app dice «Un móvil en cada flanco: así se graba para el 3D».')}
              {casilla('reloj', 'Esperar a que salga «Reloj común ± N ms» y unos 20 s más (la deriva).')}
            </ul>
            <p className="text-sm text-texto-2">Esta guía recuerda por dónde ibas: vuelve a ella desde la portada cuando acabes de grabar.</p>
            <button type="button" onClick={alEmparejar} className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-acento px-4 text-acento" data-testid="b1-ir-emparejar">
              <DevicePhoneMobileIcon className="size-5" />
              Ir a «Grabar con dos móviles»
            </button>
          </>
        )}

        {p.paso === 4 && (
          <>
            <p className="text-sm text-texto-2">
              Si algo sale mal en una grabación (un móvil se mueve, alguien se cruza, te equivocas de ejercicio), «Parar los dos» en la sala, «Repetir esta
              grabación» aquí y vuelve a programarla: la otra y todo lo demás se quedan. Las grabaciones sueltas puedes borrarlas después en «Grabaciones de
              este móvil».
            </p>
            <p className="text-sm text-texto-2">
              <strong className="text-texto">Guía por voz:</strong> en la sala, antes de «Grabar con los dos», elige en «Guía por voz» la grabación 1 o la 2:
              el móvil que programa dirá cada gesto en voz alta a su hora (y pone la duración). Sube su volumen multimedia.
            </p>
            <p className="text-sm text-texto-2">
              Dos grabaciones, programadas desde la sala con «Hasta parar» (o 60 s) y una cuenta atrás de 10 s para colocarse. Entre una y otra no muevas los
              móviles.
            </p>
            <div className="flex flex-col gap-2 rounded-md border border-borde p-3">
              <p className="flex items-center justify-between gap-2 font-medium">
                Grabación 1 (~1 min)
                <button
                  type="button"
                  onClick={() => cambiar(desmarcar(p, CASILLAS_GRABACION[1]))}
                  className="min-h-9 rounded-md border border-borde px-2 text-xs font-normal"
                  data-testid="b1-repetir-1"
                >
                  Repetir esta grabación
                </button>
              </p>
              <ul className="flex flex-col gap-2">
                {casilla('t1-quieta', '10 s de pie y quieta, mirando al frente (entre los dos móviles).')}
                {casilla('t1-pasos', '15 s de pasos por la zona: adelante, atrás, a los lados y girando un poco (esto es lo que calibra).')}
                {casilla('t1-sentadilla', 'Sentadilla ×3, despacio, mirando al frente.')}
                {casilla('t1-marcha', 'Marcha en el sitio 10 s, levantando bien las rodillas.')}
              </ul>
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-borde p-3">
              <p className="flex items-center justify-between gap-2 font-medium">
                Grabación 2 (~1 min)
                <button
                  type="button"
                  onClick={() => cambiar(desmarcar(p, CASILLAS_GRABACION[2]))}
                  className="min-h-9 rounded-md border border-borde px-2 text-xs font-normal"
                  data-testid="b1-repetir-2"
                >
                  Repetir esta grabación
                </button>
              </p>
              <ul className="flex flex-col gap-2">
                {casilla('t2-quieta', '5 s de pie y quieta.')}
                {casilla('t2-derecha', 'Sentadilla a una pierna ×3 sobre la derecha.')}
                {casilla('t2-izquierda', 'Sentadilla a una pierna ×3 sobre la izquierda.')}
              </ul>
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-acento/60 p-3">
              <p className="font-medium">Al parar cada una, en los dos móviles</p>
              <ul className="flex flex-col gap-2">
                {casilla('no-movido', 'Que no salga «El móvil se movió durante la grabación». Si sale en alguno, repite esa grabación.')}
                {casilla('pitidos', 'Que se hayan oído los pitidos de los dos.')}
                {casilla('fps-ok', 'Que no avise de pocos fps.')}
              </ul>
            </div>
          </>
        )}

        {p.paso === 5 && <FormularioMedidas medidas={p.medidas} medir={medir} />}

        {p.paso === 6 && (
          <>
            <ul className="flex flex-col gap-2">
              {casilla('compartir', 'Pasa los dos vídeos de un móvil al otro con «Compartir» (Quick Share), desde el resultado o desde «Grabaciones de este móvil».')}
              {casilla('guardar', 'Guárdalos también (botón «Guardar») por si se borra el almacenamiento de la app.')}
              {casilla('copiar', 'Copia las medidas (abajo) y guárdalas con los vídeos.')}
            </ul>
            <p className="text-sm text-texto-2">
              Cuando esté «Calibrar en 3D» (paso 3 de la fase 6), abrirás la pareja con «Abrir con el otro vídeo», detectarás el cuerpo en las dos vistas y
              calibrarás. El informe que salga, junto con estas medidas, es lo que hay que pegarle a Claude.
            </p>
            <CopiarMedidas medidas={p.medidas} />
          </>
        )}
      </section>

      <p className="text-xs text-texto-2">
        Puedes dejarla en cualquier momento y seguir luego (se queda donde estabas), saltar a cualquier paso tocando la barra de arriba y cambiar una medida
        cuando quieras.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => irA(p.paso - 1)}
          disabled={p.paso === 0}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border border-borde disabled:opacity-40"
          data-testid="b1-anterior"
        >
          <ArrowLeftIcon className="size-5" />
          Anterior
        </button>
        <button
          type="button"
          onClick={() => irA(p.paso + 1)}
          disabled={p.paso === PASOS_B1 - 1}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border border-acento bg-acento font-medium text-fondo disabled:opacity-40"
          data-testid="b1-siguiente"
        >
          Siguiente
          <ArrowRightIcon className="size-5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!confirmarReinicio) return setConfirmarReinicio(true)
          setConfirmarReinicio(false)
          cambiar(PROGRESO_INICIAL)
        }}
        onBlur={() => setConfirmarReinicio(false)}
        className={`min-h-11 rounded-md border px-3 text-sm ${confirmarReinicio ? 'border-red-400 text-red-300' : 'border-borde text-texto-2'}`}
        data-testid="b1-reiniciar"
      >
        {confirmarReinicio ? 'Toca otra vez para borrar las casillas y las medidas' : 'Empezar de nuevo (otra toma)'}
      </button>
    </div>
  )
}

function Casilla({ id, hecho, alMarcar, children }: { id: string; hecho: boolean; alMarcar: () => void; children: ReactNode }) {
  return (
    <li>
      <label className="flex min-h-11 cursor-pointer items-start gap-3" data-testid={`b1-casilla-${id}`} data-hecho={hecho}>
        <input type="checkbox" checked={hecho} onChange={alMarcar} className="mt-1 size-5 shrink-0 accent-acento" />
        <span className={hecho ? 'text-texto-2' : ''}>{children}</span>
      </label>
    </li>
  )
}

/** Dónde van los seis gomets de delante, sobre la figura de frente. */
function FiguraGomets() {
  const puntos = [
    [41, 131],
    [41, 146],
    [40.6, 175],
  ]
  return (
    <div className="relative shrink-0 text-texto">
      <Frente ve="delante" />
      <svg viewBox="0 0 100 196" className="absolute inset-0 h-32" aria-hidden="true">
        {puntos.flatMap(([x, y]) => [x!, 100 - x!].map((cx) => <circle key={`${cx}-${y}`} cx={cx} cy={y} r={2.6} className="fill-acento stroke-fondo" strokeWidth={0.8} />))}
      </svg>
    </div>
  )
}

/** Vista desde arriba: la persona mirando hacia arriba del dibujo y un móvil en cada flanco por delante. */
function Planta() {
  // Persona en (100, 130); móviles a 90 unidades (≈ 3 m), a ±45° de su frente.
  const r = 90
  const movil = (s: number) => ({ x: 100 + s * r * Math.SQRT1_2, y: 130 - r * Math.SQRT1_2 })
  const [izq, der] = [movil(-1), movil(1)].map((m) => ({ x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 }))
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 160" className="w-full max-w-xs text-texto" role="img" aria-label="Vista desde arriba: un móvil a cada lado por delante de la persona, a unos 3 m y 90° entre ellos">
        {[izq, der].map((m, k) => (
          <g key={k}>
            <line x1={100} y1={130} x2={m!.x} y2={m!.y} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
            <rect x={m!.x - 6} y={m!.y - 9} width={12} height={18} rx={2} className="fill-acento" transform={`rotate(${k === 0 ? 45 : -45} ${m!.x} ${m!.y})`} />
          </g>
        ))}
        <path d={`M ${100 - 22} ${130 - 22} A 31 31 0 0 1 ${100 + 22} ${130 - 22}`} fill="none" stroke="currentColor" strokeOpacity={0.6} />
        <text x={100} y={92} textAnchor="middle" fontSize={10} fill="currentColor">
          90°
        </text>
        <circle cx={100} cy={130} r={9} fill="currentColor" fillOpacity={0.85} />
        <path d="M 100 112 L 95 120 L 105 120 Z" fill="currentColor" />
        <text x={100} y={152} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.7}>
          persona (mira hacia arriba)
        </text>
        <text x={izq!.x} y={izq!.y - 14} textAnchor="middle" fontSize={9} fill="currentColor">
          izquierdo
        </text>
        <text x={der!.x} y={der!.y - 14} textAnchor="middle" fontSize={9} fill="currentColor">
          derecho
        </text>
        <text x={55} y={98} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.7}>
          ~3 m
        </text>
      </svg>
      <figcaption className="text-xs text-texto-2">Vista desde arriba. «Derecho» e «izquierdo» son los flancos de la persona.</figcaption>
    </figure>
  )
}

/** La inclinación de este móvil en directo, para colocarlo. */
function InclinacionEnDirecto() {
  const inc = useInclinacion()
  if (!inc) {
    return <p className="text-sm text-texto-2">La inclinación en directo sale en un móvil (este dispositivo no da el acelerómetro).</p>
  }
  const bienCabeceo = Math.abs(inc.cabeceo) <= 10
  const bienAlabeo = Math.abs(inc.alabeo) <= 3
  const g = (x: number) => `${Math.abs(x).toLocaleString('es-ES', { maximumFractionDigits: 0 })}°`
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border p-3 ${bienCabeceo && bienAlabeo ? 'border-borde' : 'border-acento/60'}`}
      data-testid="b1-inclinacion"
      data-cabeceo={inc.cabeceo.toFixed(1)}
      data-alabeo={inc.alabeo.toFixed(1)}
    >
      <p className="flex items-center gap-1 font-medium">
        Este móvil, ahora <InfoGlosario id="sensores" tema="la inclinación de la cámara" className="-my-1.5" />
      </p>
      <p className="font-mono text-sm">
        {inc.cabeceo >= 0 ? 'Mira hacia abajo' : 'Mira hacia arriba'} {g(inc.cabeceo)} {bienCabeceo ? '✓' : '· mejor menos de 10°'}
      </p>
      <p className="font-mono text-sm">
        Imagen girada {g(inc.alabeo)} {bienAlabeo ? '✓' : `· gíralo un poco ${inc.alabeo > 0 ? 'en sentido horario' : 'en sentido antihorario'}`}
      </p>
      <p className="text-xs text-texto-2">Ábrela también en el otro móvil para colocarlo, o míralo al parar la grabación.</p>
    </div>
  )
}

const CAMPOS: readonly { clave: keyof typeof RANGOS; etiqueta: string; unidad: string }[] = [
  { clave: 'distanciaMoviles', etiqueta: 'Distancia entre los dos móviles', unidad: 'm' },
  { clave: 'distanciaDerecho', etiqueta: 'Móvil del flanco derecho → persona', unidad: 'm' },
  { clave: 'alturaDerecho', etiqueta: 'Altura de su lente sobre el suelo', unidad: 'm' },
  { clave: 'distanciaIzquierdo', etiqueta: 'Móvil del flanco izquierdo → persona', unidad: 'm' },
  { clave: 'alturaIzquierdo', etiqueta: 'Altura de su lente sobre el suelo', unidad: 'm' },
  { clave: 'angulo', etiqueta: 'Ángulo entre los móviles (si lo sabes)', unidad: '°' },
  { clave: 'estatura', etiqueta: 'Estatura de la persona', unidad: 'm' },
]

function FormularioMedidas({ medidas, medir }: { medidas: MedidasB1; medir: (m: Partial<MedidasB1>) => void }) {
  const angulo = anguloPorDistancias(medidas)
  return (
    <>
      <p className="text-sm text-texto-2">
        En metros (con coma o punto). Las distancias a la persona, hasta donde estaba de pie al empezar; la altura, del suelo al centro de la lente.
      </p>
      <div className="flex flex-col gap-3">
        {CAMPOS.map(({ clave, etiqueta, unidad }) => (
          <Campo key={clave} clave={clave} etiqueta={etiqueta} unidad={unidad} valor={medidas[clave]} alCambiar={(v) => medir({ [clave]: v })} />
        ))}
      </div>
      {angulo !== null && (
        <p className="font-mono text-sm" data-testid="b1-angulo-calculado">
          Con las tres distancias, el ángulo entre los móviles visto desde la persona sale de {angulo.toLocaleString('es-ES', { maximumFractionDigits: 0 })}°.
        </p>
      )}
      <CopiarMedidas medidas={medidas} />
    </>
  )
}

function Campo({ clave, etiqueta, unidad, valor, alCambiar }: { clave: keyof typeof RANGOS; etiqueta: string; unidad: string; valor: number | null; alCambiar: (v: number | null) => void }) {
  // El texto se edita libre (con coma); lo guardado es el número que se lee de él.
  const [texto, setTexto] = useState(valor === null ? '' : String(valor).replace('.', ','))
  const raro = fueraDeRango(clave, valor)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm">{etiqueta}</span>
      <span className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            alCambiar(leerNumero(e.target.value))
          }}
          data-testid={`b1-medida-${clave}`}
          className="min-h-11 w-32 rounded-md border border-borde bg-fondo px-3 font-mono"
        />
        <span className="font-mono text-sm text-texto-2">{unidad}</span>
        {raro && <span className="text-sm text-acento">¿Seguro? Se espera entre {RANGOS[clave][0].toLocaleString('es-ES')} y {RANGOS[clave][1].toLocaleString('es-ES')} {unidad}</span>}
      </span>
    </label>
  )
}

function CopiarMedidas({ medidas }: { medidas: MedidasB1 }) {
  const [copiado, setCopiado] = useState(false)
  const texto = textoMedidas(medidas)
  return (
    <div className="flex flex-col gap-2">
      <pre className="overflow-x-auto rounded-md border border-borde bg-fondo p-3 font-mono text-xs whitespace-pre-wrap" data-testid="b1-texto-medidas">
        {texto}
      </pre>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(texto).then(
            () => setCopiado(true),
            () => setCopiado(false),
          )
        }
        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-borde"
        data-testid="b1-copiar"
      >
        {copiado ? <CheckCircleIcon className="size-5 text-acento" /> : <ClipboardDocumentIcon className="size-5" />}
        {copiado ? 'Copiado' : 'Copiar las medidas'}
      </button>
    </div>
  )
}
