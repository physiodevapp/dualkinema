/*
 * Lo del 3D que se guarda con la sesión además de la calibración (pedido por el usuario el 11-11): el esqueleto ajustado
 * (fase 7), para no tener que volver a ajustarlo al reabrir, y lo que se mira en «Ángulos en 3D» (la fuente, la
 * articulación y el cero de cada una). Los dos son opcionales y no suben el esquema: una sesión sin ellos se lee igual, y lo
 * que no se pueda leer se descarta (se vuelve a ajustar o a elegir) sin rechazar la sesión.
 *
 * El esqueleto vale mientras no cambien los puntos 3D de los que salió: se guarda con la huella de esos puntos
 * (`huellaTrayectorias3D`) y, al reabrir, si los puntos de ahora dan otra (se ha corregido un punto, cambiado la
 * sincronía o recalibrado), no se usa y se avisa de que hay que volver a ajustarlo.
 */
import { esTramoEstatico, type TramoEstatico } from '../articulaciones/cero'
import type { Lado } from '../articulaciones/catalogo'
import type { ResultadoEsqueleto } from '../esqueleto/sesion'
import { CORTES_DINAMICA_HZ } from '../cinetica/dinamica'
import { leerMarcha, type MarchaGuardada } from '../marcha/guardado'
import { N_GRADOS, type Medidas } from '../esqueleto/modelo'
import type { IdMarcador } from '../modelo/tipos'
import type { Trayectorias3D } from '../tresd/puntos3d'

/** Lo que se mira en «Ángulos en 3D». */
export interface Ajustes3D {
  readonly fuente: 'puntos' | 'esqueleto'
  /** La articulación elegida de cada fuente (sin ella, la primera). */
  readonly articulacion?: string
  /** Tramo del cero por id de articulación 3D o del esqueleto. */
  readonly ceros: Readonly<Record<string, TramoEstatico>>
  /** La marcha en 3D (lo corregido a mano); sin ella, no se buscaron los ciclos. */
  readonly marcha?: MarchaGuardada
  /** La cinética (fase 11): el modo y el corte del dinámico; sin ella, no se está mirando. */
  readonly cinetica?: AjustesCinetica
}

export interface AjustesCinetica {
  readonly modo: 'cuasiestatica' | 'dinamica'
  /** Corte del filtro en el modo dinámico (uno de `CORTES_DINAMICA_HZ`). */
  readonly corteHz: number
  /** La masa de la persona (kg), opcional (D8): con ella, también en N y N·m. */
  readonly masa?: number
}

/** La masa que se admite (kg). */
export const MASA_MIN = 15
export const MASA_MAX = 250

/** La cinética guardada, si se puede leer; si no, null (no se está mirando). */
export function leerCinetica(v: unknown): AjustesCinetica | null {
  if (!esObjeto(v) || (v.modo !== 'cuasiestatica' && v.modo !== 'dinamica')) return null
  if (typeof v.corteHz !== 'number' || !(CORTES_DINAMICA_HZ as readonly number[]).includes(v.corteHz)) return null
  // Una masa ilegible se descarta sola.
  const masa = esNumero(v.masa) && v.masa >= MASA_MIN && v.masa <= MASA_MAX ? v.masa : null
  return { modo: v.modo, corteHz: v.corteHz, ...(masa !== null ? { masa } : {}) }
}

/** El esqueleto empaquetado en arrays tipados (IndexedDB los guarda tal cual). */
export interface EsqueletoGuardado {
  /** La huella de los puntos 3D sin filtrar de los que salió. */
  readonly huella: string
  readonly tiempos: Float64Array
  readonly medidas: Medidas
  readonly asimetria: Readonly<Record<'muslo' | 'pierna' | 'pie', number>>
  /** N_GRADOS por frame; un frame sin ajuste, todo NaN. */
  readonly posturas: Float64Array
  readonly errores: Float64Array
  /** Bit 0: la rotación de la cadera derecha se ve; bit 1: la izquierda. */
  readonly rotacion: Uint8Array
  /** Los puntos de `vistas`, en orden. */
  readonly ids: readonly IdMarcador[]
  /** En cuántas vistas se vio cada punto en cada frame (ids.length por frame); 255 = no consta. */
  readonly vistas: Uint8Array
  /** Las posturas suavizadas de toda la toma (fase 11, D12), como `posturas`; opcional (los guardados de antes no las tienen). */
  readonly suavizadas?: Float64Array
}

const NO_CONSTA = 255

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Huella de unos puntos 3D: cambia si cambia cualquier coordenada (redondeada a una millonésima, para que el mismo
 * cálculo en el mismo navegador dé siempre la misma), calidad, tiempo o punto. Dos FNV-1a de 32 bits.
 */
export function huellaTrayectorias3D(tr: Trayectorias3D): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ 0x5bd1e995
  const mezclar = (n: number) => {
    // Los NaN y los infinitos, como un valor aparte.
    const v = Number.isFinite(n) ? Math.round(n * 1e6) : -0x7fffffff
    const bajo = v | 0
    const alto = Math.floor(v / 4294967296) | 0
    for (const w of [bajo, alto]) {
      for (let k = 0; k < 4; k++) {
        const b = (w >>> (k * 8)) & 0xff
        h1 = Math.imul(h1 ^ b, 0x01000193)
        h2 = Math.imul(h2 ^ b, 0x01000193) ^ (h1 >>> 13)
      }
    }
  }
  const texto = (s: string) => {
    for (let k = 0; k < s.length; k++) mezclar(s.charCodeAt(k))
  }
  mezclar(tr.tiempos.length)
  for (const t of tr.tiempos) mezclar(t)
  texto(tr.enMetros ? 'm' : 'u')
  for (const id of [...tr.series.keys()].sort()) {
    texto(id)
    for (const p of tr.series.get(id)!) {
      if (!p) mezclar(Number.NaN)
      else {
        mezclar(p.x)
        mezclar(p.y)
        mezclar(p.z)
        mezclar(p.calidad)
      }
    }
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return `${hex(h1)}${hex(h2)}`
}

const aPlano = (qs: readonly (readonly number[] | null)[], n: number): Float64Array => {
  const r = new Float64Array(n * N_GRADOS).fill(Number.NaN)
  qs.forEach((q, i) => {
    if (q) for (let g = 0; g < N_GRADOS; g++) r[i * N_GRADOS + g] = q[g] ?? Number.NaN
  })
  return r
}
const dePlano = (a: Float64Array, n: number): (number[] | null)[] =>
  Array.from({ length: n }, (_, i) => {
    const q = [...a.subarray(i * N_GRADOS, (i + 1) * N_GRADOS)]
    return q.every(Number.isFinite) ? q : null
  })

export function empaquetarEsqueleto(r: ResultadoEsqueleto, huella: string): EsqueletoGuardado {
  const n = r.tiempos.length
  const posturas = aPlano(r.posturas, n)
  const ids = [...new Set(r.vistas.flatMap((v) => Object.keys(v)))].sort()
  const vistas = new Uint8Array(n * ids.length).fill(NO_CONSTA)
  r.vistas.forEach((v, i) => ids.forEach((id, k) => {
    const c = v[id]
    if (c !== undefined) vistas[i * ids.length + k] = Math.max(0, Math.min(254, Math.round(c)))
  }))
  return {
    huella,
    tiempos: Float64Array.from(r.tiempos),
    medidas: r.medidas,
    asimetria: r.asimetria,
    posturas,
    errores: Float64Array.from(r.errores),
    rotacion: Uint8Array.from(r.rotacionVisible, (x) => (x.der ? 1 : 0) | (x.izq ? 2 : 0)),
    ids,
    vistas,
    ...(r.suavizadas ? { suavizadas: aPlano(r.suavizadas, n) } : {}),
  }
}

const esMedidas = (m: unknown): m is Medidas =>
  esObjeto(m) &&
  (['anchoCaderas', 'muslo', 'pierna', 'tronco', 'anchoHombros'] as const).every((k) => esNumero(m[k])) &&
  (['talon', 'punta'] as const).every((k) => esObjeto(m[k]) && esNumero((m[k] as Record<string, unknown>).x) && esNumero((m[k] as Record<string, unknown>).z))

/** Lo guardado otra vez como resultado del ajuste, con su huella; null si no se puede leer (se descarta). */
export function desempaquetarEsqueleto(g: unknown): { resultado: ResultadoEsqueleto; huella: string } | null {
  if (!esObjeto(g) || typeof g.huella !== 'string') return null
  const { tiempos, posturas, errores, rotacion, vistas, ids, medidas, asimetria } = g
  if (!(tiempos instanceof Float64Array) || !(posturas instanceof Float64Array) || !(errores instanceof Float64Array)) return null
  if (!(rotacion instanceof Uint8Array) || !(vistas instanceof Uint8Array)) return null
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return null
  if (!esMedidas(medidas) || !esObjeto(asimetria) || !(['muslo', 'pierna', 'pie'] as const).every((k) => esNumero(asimetria[k]))) return null
  const n = tiempos.length
  if (n === 0 || posturas.length !== n * N_GRADOS || errores.length !== n || rotacion.length !== n || vistas.length !== n * ids.length) return null
  const resultado: ResultadoEsqueleto = {
    tiempos: [...tiempos],
    medidas,
    asimetria: asimetria as ResultadoEsqueleto['asimetria'],
    posturas: dePlano(posturas, n),
    errores: [...errores],
    rotacionVisible: [...rotacion].map((b): Record<Lado, boolean> => ({ der: (b & 1) !== 0, izq: (b & 2) !== 0 })),
    vistas: Array.from({ length: n }, (_, i) => {
      const v: Record<IdMarcador, number> = {}
      ids.forEach((id: string, k) => {
        const c = vistas[i * ids.length + k]!
        if (c !== NO_CONSTA) v[id] = c
      })
      return v
    }),
    // Las suavizadas, si están y se pueden leer (si no, la cinética pide volver a ajustar).
    ...(g.suavizadas instanceof Float64Array && g.suavizadas.length === n * N_GRADOS ? { suavizadas: dePlano(g.suavizadas, n) } : {}),
  }
  return { resultado, huella: g.huella }
}

/** Lo que se mira en «Ángulos en 3D», si se puede leer; si no, null (se empieza como siempre). */
export function leerAjustes3D(v: unknown): Ajustes3D | null {
  if (!esObjeto(v) || (v.fuente !== 'puntos' && v.fuente !== 'esqueleto')) return null
  if (v.articulacion !== undefined && typeof v.articulacion !== 'string') return null
  if (!esObjeto(v.ceros) || !Object.values(v.ceros).every(esTramoEstatico)) return null
  // La marcha y la cinética ilegibles se descartan solas (lo demás se conserva).
  const marcha = leerMarcha(v.marcha)
  const cinetica = leerCinetica(v.cinetica)
  return {
    fuente: v.fuente,
    ...(v.articulacion !== undefined ? { articulacion: v.articulacion } : {}),
    ceros: v.ceros as Record<string, TramoEstatico>,
    ...(marcha ? { marcha } : {}),
    ...(cinetica ? { cinetica } : {}),
  }
}

/** Bytes de los arrays del esqueleto (para lo que ocupa la sesión). */
export const bytesEsqueleto = (g: EsqueletoGuardado): number => g.tiempos.byteLength + g.posturas.byteLength + g.errores.byteLength + g.rotacion.byteLength + g.vistas.byteLength + (g.suavizadas?.byteLength ?? 0)
