import type { Plano3D } from '../../core/tresd/angulos3d'
import type { Angulos3D } from './useAngulos3D'

const NOMBRE_PLANO: Record<Plano3D, string> = { sagital: 'Sagital', frontal: 'Frontal', transversal: 'Transversal', entreSegmentos: 'Entre segmentos' }

/** La articulación 3D que se mira, por planos (la misma en «Análisis» y en la gráfica central: el estado es de `useAngulos3D`). */
export default function SelectorArticulacion3D({ t3, testid }: { t3: Angulos3D; testid: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-texto-2">
      Articulación
      <select value={t3.elegida} onChange={(e) => t3.setElegida(e.target.value)} className="rounded-md border border-borde bg-fondo px-2 py-2 text-sm text-texto" data-testid={testid}>
        {(['sagital', 'frontal', 'transversal', 'entreSegmentos'] as const).filter((plano) => t3.lista.some((x) => x.plano === plano)).map((plano) => (
          <optgroup key={plano} label={NOMBRE_PLANO[plano]}>
            {t3.lista
              .filter((x) => x.plano === plano)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre.replace(/ en 3D$/, '').replace(/ \(esqueleto\)$/, '')}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
