/*
 * Preferencias de la interfaz que se recuerdan en este dispositivo (`localStorage`), como el reparto del alto entre el
 * vídeo y la gráfica (`reparto.ts`): la pestaña de herramientas abierta y las series que se ven en la gráfica completa.
 * No son de la sesión ni del vídeo: valen para cualquiera y no tocan el esquema guardado. Sin almacenamiento (modo
 * privado) o con algo ilegible, se usa lo de por defecto. Lo que se lee se valida: un valor viejo o ajeno no rompe nada.
 */

export const PESTANAS = ['marcar', 'analisis', 'escala', 'video'] as const
export type IdPestana = (typeof PESTANAS)[number]

export const PESTANA_DEFECTO: IdPestana = 'marcar'
export const CLAVE_PESTANA = 'dualkinema.pestana'
export const CLAVE_SERIES = 'dualkinema.seriesVisibles'
export const CLAVE_COMPARACION = 'dualkinema.comparacion'

/** Cómo se comparan las dos vistas: una gráfica por vista (alineadas en el tiempo común) o las dos en la misma. */
export const MODOS_COMPARACION = ['alineadas', 'superpuestas'] as const
export type ModoComparacion = (typeof MODOS_COMPARACION)[number]
export const MODO_COMPARACION_DEFECTO: ModoComparacion = 'alineadas'

/** El modo guardado, o el de por defecto si no hay o no es uno de los dos. */
export const comparacionDeTexto = (v: string | null): ModoComparacion => MODOS_COMPARACION.find((m) => m === v) ?? MODO_COMPARACION_DEFECTO

export const esPestana = (v: unknown): v is IdPestana => typeof v === 'string' && (PESTANAS as readonly string[]).includes(v)

/** La pestaña guardada, o la de por defecto si no hay o no es una de las cuatro. */
export const pestanaDeTexto = (v: string | null): IdPestana => (esPestana(v) ? v : PESTANA_DEFECTO)

/**
 * Las series visibles guardadas (JSON de `{ id: boolean }`) sobre las de por defecto: solo valen los valores booleanos
 * de un objeto; lo demás se ignora. Una serie que no está guardada conserva su valor por defecto.
 */
export function seriesDeTexto(v: string | null, defecto: Readonly<Record<string, boolean>>): Record<string, boolean> {
  if (!v) return { ...defecto }
  let guardado: unknown
  try {
    guardado = JSON.parse(v)
  } catch {
    return { ...defecto }
  }
  if (typeof guardado !== 'object' || guardado === null || Array.isArray(guardado)) return { ...defecto }
  const r = { ...defecto }
  for (const [id, visible] of Object.entries(guardado)) if (typeof visible === 'boolean') r[id] = visible
  return r
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento (modo privado): se usa solo esta vez.
  }
}

export const leerPestana = (): IdPestana => pestanaDeTexto(leer(CLAVE_PESTANA))
export const guardarPestana = (id: IdPestana) => guardar(CLAVE_PESTANA, id)

export const leerSeriesVisibles = (defecto: Readonly<Record<string, boolean>>) => seriesDeTexto(leer(CLAVE_SERIES), defecto)
export const guardarSeriesVisibles = (visibles: Readonly<Record<string, boolean>>) => guardar(CLAVE_SERIES, JSON.stringify(visibles))

export const leerModoComparacion = (): ModoComparacion => comparacionDeTexto(leer(CLAVE_COMPARACION))
export const guardarModoComparacion = (m: ModoComparacion) => guardar(CLAVE_COMPARACION, m)
