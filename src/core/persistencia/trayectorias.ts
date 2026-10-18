import type { Muestra2D } from '../modelo/tipos'

/**
 * Trayectoria de un marcador tal como se guarda: solo los frames con muestra,
 * en arrays tipados paralelos (IndexedDB los guarda tal cual, sin pasar por
 * JSON, y ocupan una fracción de un array de objetos).
 *
 * Se guarda todo exacto (Float64), sin redondear, para que el trabajo
 * recuperado dé los mismos ángulos. Un marcador perdido se guarda como
 * muestra con x, y = NaN y calidad 0, distinto de un frame sin muestra
 * (nunca seguido), que simplemente no aparece en `indices`.
 */
export interface TrayectoriaGuardada {
  /** Índice del frame de cada muestra, estrictamente creciente. */
  readonly indices: Int32Array
  readonly t: Float64Array
  readonly x: Float64Array
  readonly y: Float64Array
  readonly calidad: Float64Array
  /** 1 si se marcó a mano. */
  readonly manual: Uint8Array
  /** 1 si se rellenó por interpolación (desde el esquema 2). */
  readonly interpolado: Uint8Array
}

/** Serie en memoria del visor: una muestra (o nada) por frame. */
export type SerieFrames = readonly (Muestra2D | undefined)[]

export function empaquetarTrayectoria(serie: SerieFrames): TrayectoriaGuardada {
  let n = 0
  for (const m of serie) if (m) n++
  const g = {
    indices: new Int32Array(n),
    t: new Float64Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    calidad: new Float64Array(n),
    manual: new Uint8Array(n),
    interpolado: new Uint8Array(n),
  }
  let k = 0
  serie.forEach((m, i) => {
    if (!m) return
    g.indices[k] = i
    g.t[k] = m.t
    g.x[k] = m.x
    g.y[k] = m.y
    g.calidad[k] = m.calidad
    g.manual[k] = m.editadoManual ? 1 : 0
    g.interpolado[k] = m.interpolado ? 1 : 0
    k++
  })
  return g
}

/** Vuelve a la serie del visor, con `frames` posiciones. */
export function desempaquetarTrayectoria(g: TrayectoriaGuardada, frames: number): (Muestra2D | undefined)[] {
  const serie: (Muestra2D | undefined)[] = new Array(frames)
  for (let k = 0; k < g.indices.length; k++) {
    const m: Muestra2D = { t: g.t[k]!, x: g.x[k]!, y: g.y[k]!, calidad: g.calidad[k]!, editadoManual: g.manual[k] === 1 }
    serie[g.indices[k]!] = g.interpolado[k] === 1 ? { ...m, interpolado: true } : m
  }
  return serie
}

/** Motivo por el que una trayectoria leída no es válida, o null si lo es. */
export function errorTrayectoria(v: unknown, frames: number): string | null {
  if (typeof v !== 'object' || v === null) return 'no es un objeto'
  const g = v as Record<string, unknown>
  const tipos: [keyof TrayectoriaGuardada, new (n: number) => ArrayLike<number>][] = [
    ['indices', Int32Array],
    ['t', Float64Array],
    ['x', Float64Array],
    ['y', Float64Array],
    ['calidad', Float64Array],
    ['manual', Uint8Array],
    ['interpolado', Uint8Array],
  ]
  for (const [campo, tipo] of tipos) if (!(g[campo] instanceof tipo)) return `«${campo}» no es ${tipo.name}`
  const t = g as unknown as TrayectoriaGuardada
  const n = t.indices.length
  for (const [campo] of tipos) if (t[campo].length !== n) return `«${campo}» no tiene ${n} valores`
  for (let k = 0; k < n; k++) {
    const i = t.indices[k]!
    if (i < 0 || i >= frames) return `frame ${i} fuera del vídeo (${frames} frames)`
    if (k > 0 && i <= t.indices[k - 1]!) return 'frames desordenados o repetidos'
    if (!Number.isFinite(t.t[k])) return `tiempo no válido en el frame ${i}`
    const c = t.calidad[k]!
    if (!(c >= 0 && c <= 1)) return `calidad fuera de 0–1 en el frame ${i}`
    if (t.manual[k]! > 1) return `«manual» no es 0 ni 1 en el frame ${i}`
    if (t.interpolado[k]! > 1) return `«interpolado» no es 0 ni 1 en el frame ${i}`
    if (t.interpolado[k] && t.manual[k]) return `marcado a mano e interpolado a la vez en el frame ${i}`
    // Perdido = NaN en x e y; si hay posición, las dos coordenadas son números.
    if (Number.isNaN(t.x[k]) !== Number.isNaN(t.y[k])) return `posición a medias en el frame ${i}`
    if (!Number.isNaN(t.x[k]) && !(Number.isFinite(t.x[k]) && Number.isFinite(t.y[k]))) return `posición infinita en el frame ${i}`
  }
  return null
}

/** Frames con alguna muestra, con alguna marca a mano y con algo interpolado, entre todas las trayectorias. */
export function recuento(
  trayectorias: readonly TrayectoriaGuardada[],
  frames: number,
): { conDatos: number; aMano: number; interpolados: number } {
  const datos = new Uint8Array(frames)
  const mano = new Uint8Array(frames)
  const interp = new Uint8Array(frames)
  for (const g of trayectorias) {
    for (let k = 0; k < g.indices.length; k++) {
      datos[g.indices[k]!] = 1
      if (g.manual[k]) mano[g.indices[k]!] = 1
      if (g.interpolado[k]) interp[g.indices[k]!] = 1
    }
  }
  const suma = (a: Uint8Array) => a.reduce((s, b) => s + b, 0)
  return { conDatos: suma(datos), aMano: suma(mano), interpolados: suma(interp) }
}
