import type { OrientacionVista } from '../core/geometria/canonico'

type Sagital = Extract<OrientacionVista, { plano: 'sagital' }>

/** Silueta de perfil muy simple que mira hacia `mira`. */
function Perfil({ mira }: { mira: Sagital['mira'] }) {
  return (
    <svg viewBox="0 0 60 100" className="h-24" aria-hidden="true" style={{ transform: mira === 'izquierda' ? 'scaleX(-1)' : undefined }}>
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="30" cy="14" r="9" />
        <path d="M37 13 l5 3 -5 2" />
        <path d="M30 24 L30 58 M30 32 L42 46 M30 58 L36 78 L32 96 M30 58 L24 78 L22 96 M32 96 L42 96 M22 96 L32 96" />
      </g>
    </svg>
  )
}

export default function ElegirOrientacion({ onElegir }: { onElegir: (o: OrientacionVista) => void }) {
  const opciones: { mira: Sagital['mira']; texto: string }[] = [
    { mira: 'izquierda', texto: 'Mira a la izquierda' },
    { mira: 'derecha', texto: 'Mira a la derecha' },
  ]
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4">
      <div>
        <h2 className="font-serif text-2xl">¿Hacia dónde mira la persona?</h2>
        <p className="mt-1 text-texto-2">
          En el vídeo de perfil. Fija el signo de los ángulos (flexión positiva) sea cual sea el lado grabado, y
          qué pierna se marca: la que ve la cámara (si mira a la derecha, su pierna izquierda).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {opciones.map(({ mira, texto }) => (
          <button
            key={mira}
            type="button"
            onClick={() => onElegir({ plano: 'sagital', mira })}
            className="flex flex-col items-center gap-2 rounded-md border border-borde px-3 py-4 text-texto hover:border-acento focus-visible:border-acento"
          >
            <Perfil mira={mira} />
            {texto}
          </button>
        ))}
      </div>
    </section>
  )
}
