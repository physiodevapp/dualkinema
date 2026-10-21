import { useRepetir } from '../useRepetir'

export default function BotonPaso({ etiqueta, accion, children }: { etiqueta: string; accion: () => void; children: React.ReactNode }) {
  const manejadores = useRepetir(accion)
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      {...manejadores}
      className="flex h-11 flex-1 touch-manipulation lg:h-14 items-center justify-center rounded-md border border-borde bg-panel select-none active:border-acento active:text-acento"
    >
      {children}
    </button>
  )
}
