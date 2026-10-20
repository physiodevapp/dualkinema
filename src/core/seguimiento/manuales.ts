import type { IdMarcador, Muestra2D } from '../modelo/tipos'

/** Trayectorias por marcador: una muestra (o nada) por frame. */
export type SeriesPorMarcador = ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>

/**
 * Frames (índices, ascendentes y sin repetir) posteriores a `despuesDe` en los que algún marcador tiene una marca a mano.
 * «Seguir desde aquí» las usa como anclas: toma esa posición como cierta y sigue desde ella, así que una marca de prueba o
 * equivocada (sobre todo una colocada «a ojo» lejos del gomet) hace perder el gomet en los frames siguientes.
 */
export function framesConMarcaManual(series: SeriesPorMarcador, despuesDe: number): number[] {
  const frames = new Set<number>()
  for (const serie of series.values()) {
    for (let i = Math.max(0, despuesDe + 1); i < serie.length; i++) if (serie[i]?.editadoManual) frames.add(i)
  }
  return [...frames].sort((a, b) => a - b)
}

/**
 * Quita las marcas a mano posteriores a `despuesDe` (en sitio) y devuelve cuántas. Los frames quedan sin muestra, no
 * «perdidos»: no se restaura lo que había seguido antes de marcar, para eso está «Seguir desde aquí».
 */
export function quitarMarcasManuales(series: Map<IdMarcador, (Muestra2D | undefined)[]>, despuesDe: number): number {
  let quitadas = 0
  for (const serie of series.values()) {
    for (let i = Math.max(0, despuesDe + 1); i < serie.length; i++) {
      if (serie[i]?.editadoManual) {
        serie[i] = undefined
        quitadas++
      }
    }
  }
  return quitadas
}
