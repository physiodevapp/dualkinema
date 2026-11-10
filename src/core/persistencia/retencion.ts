/*
 * Cuánto tiempo y cuántas sesiones se guardan en el dispositivo. Son datos de
 * personas que pueden quedarse meses en un móvil compartido, así que las
 * sesiones caducan solas y hay un máximo. Este archivo es lo único que decide
 * qué se borra (función pura, sin IndexedDB): `persistencia/almacen.ts` solo la
 * llama y ejecuta los borrados.
 *
 * Reglas:
 *  - Cada guardado fija `expiraEn` = momento del guardado + DIAS_CADUCIDAD días
 *    (renueva la caducidad). Una sesión con `expiraEn` ya pasado se borra, con
 *    sus trayectorias.
 *  - Se conservan las MAX_SESIONES más recientes (por último guardado); las más
 *    antiguas se borran. Con la misma fecha de guardado decide el id (el mayor
 *    cuenta como más reciente), para que el resultado no dependa del orden en
 *    que lleguen las cabeceras.
 *  - Las sesiones protegidas (la que se está guardando y la que está abierta)
 *    no se borran nunca, ni por caducidad ni por el máximo, y ocupan sitio
 *    dentro del máximo.
 *  - Sesiones de un esquema más nuevo que el de esta app (o ilegibles): esta
 *    versión no puede fiarse de sus campos (`actualizada`, `expiraEn`), ni
 *    tocarlas sin riesgo de perder datos que una app más nueva sí entiende. No
 *    se borran solas ni por el máximo ni por el tiempo, y no cuentan para el
 *    máximo: se listan aparte para que se puedan borrar a mano (también las
 *    borra «Borrar todo lo guardado»). `almacen.ts` ni siquiera las pasa a esta
 *    función; si llegara una, se ignora.
 */

/** Sesiones que se conservan (las más recientes por último guardado). */
export const MAX_SESIONES = 5
/** Días que una sesión sigue guardada desde su último guardado. */
export const DIAS_CADUCIDAD = 30

export const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Cuándo caduca (ms) una sesión guardada en `momento` (ms). */
export const caducaEn = (momento: number): number => momento + DIAS_CADUCIDAD * MS_POR_DIA

/** Lo que hace falta de una cabecera para decidir qué se borra. */
export interface Retenible {
  readonly id: string
  readonly esquema: number
  /** ISO 8601: último guardado. */
  readonly actualizada: string
  /** ms: cuándo caduca. */
  readonly expiraEn: number
}

export interface EntradaRetencion {
  readonly cabeceras: readonly Retenible[]
  /** ms (`Date.now()`). */
  readonly ahora: number
  /** Ids que no se borran nunca: la sesión que se guarda y la que está abierta. */
  readonly protegidas: readonly (string | null | undefined)[]
  /** `ESQUEMA_ACTUAL` de la app: las cabeceras de un esquema mayor se ignoran. */
  readonly esquemaActual: number
  /** Para probar con otro máximo; por defecto MAX_SESIONES. */
  readonly max?: number
}

const instante = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Ids de las sesiones que hay que borrar (con sus trayectorias), en orden estable. */
export function sesionesABorrar({ cabeceras, ahora, protegidas, esquemaActual, max = MAX_SESIONES }: EntradaRetencion): string[] {
  const resguardo = new Set(protegidas.filter((p): p is string => typeof p === 'string'))
  const legibles = cabeceras.filter((c) => c.esquema <= esquemaActual)
  const aBorrar: string[] = []

  // 1. Caducadas (salvo las protegidas).
  const vigentes: Retenible[] = []
  for (const c of legibles) {
    if (c.expiraEn <= ahora && !resguardo.has(c.id)) aBorrar.push(c.id)
    else vigentes.push(c)
  }

  // 2. Exceso sobre el máximo: primero las protegidas, luego las más recientes.
  const protegidasVigentes = vigentes.filter((c) => resguardo.has(c.id))
  const otras = vigentes
    .filter((c) => !resguardo.has(c.id))
    .sort((a, b) => instante(b.actualizada) - instante(a.actualizada) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  const sitio = Math.max(0, max - protegidasVigentes.length)
  for (const c of otras.slice(sitio)) aBorrar.push(c.id)

  return aBorrar.sort()
}

/** «Se guardan solo en este móvil, sin el vídeo. Se conservan 5 y se borran solas a los 30 días.» */
export const textoAvisoRetencion = (max = MAX_SESIONES, dias = DIAS_CADUCIDAD) =>
  `Se guardan solo en este móvil, sin el vídeo. Se conservan ${max} y se borran solas a los ${dias} días.`
