import { esTramoEstatico, type TramoEstatico } from '../articulaciones/cero'
import { esCalibracion, type CalibracionVista } from '../calibracion/escala'
import type { DefinicionArticulacion, Plano } from '../articulaciones/definicion'
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, MetodoSincronia, ModeloMarcadores, Sincronia } from '../modelo/tipos'
import { esAjustesFiltro, type AjustesFiltro } from '../filtros/tramos'
import { claveHuella, esHuella, type HuellaArchivo } from './huella'
import { empaquetarTrayectoria, errorTrayectoria, recuento, type SerieFrames, type TrayectoriaGuardada } from './trayectorias'

/*
 * Esquema de una sesión guardada en el dispositivo (IndexedDB). Propio de
 * dualkinema, con versión: cada registro lleva `esquema`, y uno de una versión
 * anterior pasa por MIGRACIONES antes de usarse. Uno de una versión más nueva
 * que la app no se abre ni se toca (podría perder datos al reescribirlo).
 *
 * Se guarda en dos partes para que la lista de sesiones no lea las
 * trayectorias de todas:
 *   - CabeceraSesion: lo que muestra la lista y lo que hace falta para
 *     reconocer el vídeo y montar el visor.
 *   - DatosSesion: las trayectorias, por vista y marcador.
 *
 * Lo que llegó en pasos posteriores de la fase 2 tenía su sitio, vacío, desde
 * el principio: `filtro` (paso 4; null = el de por defecto), `ceros` (paso 5:
 * tramo estático por id de articulación; vacío = sin cero de referencia) y
 * `calibracion` (paso 6: escala en el plano; null = sin escala). Ya se
 * rellenan, y lo guardado antes sigue valiendo sin migrar. Rellenarlos
 * no exige cambiar de versión mientras null / {} sigan siendo válidos; un
 * cambio que deje de admitir lo guardado sí: sube ESQUEMA_ACTUAL y añade su
 * migración.
 *
 * Esquema 3 (fase 3, dos vistas): cada vista guarda los marcadores que sigue y
 * cómo se sincronizó, y la sesión cuál es la vista de referencia. Añadir eso
 * con valores por defecto no obligaba a subir la versión, pero una app vieja
 * que abriera una sesión de dos vistas leería solo la primera y, al guardar,
 * borraría la segunda: con el 3, no la abre. Las trayectorias no cambian (cada
 * vista ya guarda las de todos los marcadores del modelo; las que no sigue van
 * vacías).
 */

export const ESQUEMA_ACTUAL = 3

export interface VistaCabecera {
  readonly id: string
  readonly huella: HuellaArchivo
  readonly orientacion: OrientacionVista
  /** Segundos respecto a la vista de referencia (0 con una sola vista). */
  readonly desfase: number
  /** Escala en el plano (paso 6); null = sin escala. */
  readonly calibracion: CalibracionVista | null
  /** Cero de referencia: tramo estático por id de articulación (vacío = sin cero). */
  readonly ceros: Readonly<Record<string, TramoEstatico>>
  /** Marcadores del modelo que se siguen en esta vista (esquema 3). */
  readonly marcadores: readonly IdMarcador[]
  /** Cómo se halló el desfase (esquema 3). */
  readonly sincronia: Sincronia
}

export interface CabeceraSesion {
  readonly esquema: number
  readonly id: string
  readonly nombre: string
  /** ISO 8601. */
  readonly creada: string
  readonly actualizada: string
  readonly modelo: ModeloMarcadores
  readonly vistas: readonly VistaCabecera[]
  /** Id de la vista de referencia (esquema 3): su desfase es 0 y su tiempo es el tiempo común. */
  readonly referencia: string
  /** Ajustes del filtro (paso 4); null = los de por defecto (6 Hz). */
  readonly filtro: AjustesFiltro | null
  /** Para la lista: frames con alguna muestra, con alguna marca a mano y con algo interpolado. */
  readonly resumen: { readonly frames: number; readonly conDatos: number; readonly aMano: number; readonly interpolados: number }
  /** claveHuella de cada vista: índice para buscar las sesiones de un vídeo. */
  readonly claves: readonly string[]
}

export interface DatosSesion {
  readonly esquema: number
  readonly id: string
  /** Por id de vista y de marcador. */
  readonly trayectorias: Readonly<Record<string, Readonly<Record<IdMarcador, TrayectoriaGuardada>>>>
}

export type Lectura<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly motivo: 'nueva' | 'invalida'; readonly detalle: string }

// ---- Crear ----

export interface EntradaGuardado {
  readonly id: string
  readonly nombre: string
  readonly creada: string
  readonly ahora: string
  readonly modelo: ModeloMarcadores
  /** Ajustes del filtro; sin ellos (o null), los de por defecto. */
  readonly filtro?: AjustesFiltro | null
  readonly vistas: readonly {
    readonly id: string
    readonly huella: HuellaArchivo
    readonly orientacion: OrientacionVista
    readonly series: ReadonlyMap<IdMarcador, SerieFrames>
    /** Tramo estático por id de articulación; sin él, ninguno. */
    readonly ceros?: Readonly<Record<string, TramoEstatico>>
    /** Escala de la vista; sin ella (o null), sin escala. */
    readonly calibracion?: CalibracionVista | null
    /** Desfase respecto a la referencia (s); sin él, 0. */
    readonly desfase?: number
    /** Marcadores que se siguen en la vista; sin ellos, todos los del modelo. */
    readonly marcadores?: readonly IdMarcador[]
    /** Cómo se sincronizó; sin ella, «ninguna». */
    readonly sincronia?: Sincronia
  }[]
  /** Id de la vista de referencia; sin él, la primera. */
  readonly referencia?: string
}

const SIN_SINCRONIA: Sincronia = { metodo: 'ninguna' }

export function prepararGuardado(e: EntradaGuardado): { cabecera: CabeceraSesion; datos: DatosSesion } {
  const trayectorias: Record<string, Record<IdMarcador, TrayectoriaGuardada>> = {}
  let conDatos = 0
  let aMano = 0
  let interpolados = 0
  for (const v of e.vistas) {
    const porMarcador: Record<IdMarcador, TrayectoriaGuardada> = {}
    for (const mk of e.modelo.marcadores) porMarcador[mk.id] = empaquetarTrayectoria(v.series.get(mk.id) ?? [])
    trayectorias[v.id] = porMarcador
    const r = recuento(Object.values(porMarcador), v.huella.frames)
    conDatos += r.conDatos
    aMano += r.aMano
    interpolados += r.interpolados
  }
  const cabecera: CabeceraSesion = {
    esquema: ESQUEMA_ACTUAL,
    id: e.id,
    nombre: e.nombre,
    creada: e.creada,
    actualizada: e.ahora,
    modelo: e.modelo,
    vistas: e.vistas.map((v) => ({
      id: v.id,
      huella: v.huella,
      orientacion: v.orientacion,
      desfase: v.desfase ?? 0,
      calibracion: v.calibracion ?? null,
      ceros: { ...v.ceros },
      marcadores: [...(v.marcadores ?? e.modelo.marcadores.map((mk) => mk.id))],
      sincronia: v.sincronia ?? SIN_SINCRONIA,
    })),
    referencia: e.referencia ?? e.vistas[0]!.id,
    filtro: e.filtro ?? null,
    resumen: { frames: e.vistas.reduce((s, v) => s + v.huella.frames, 0), conDatos, aMano, interpolados },
    claves: e.vistas.map((v) => claveHuella(v.huella)),
  }
  return { cabecera, datos: { esquema: ESQUEMA_ACTUAL, id: e.id, trayectorias } }
}

// ---- Migrar ----

/** Migración de la versión n a la n + 1, para cada parte. */
export type Migraciones = Readonly<Record<number, (registro: Record<string, unknown>) => Record<string, unknown>>>

/*
 * 1 → 2 (paso 3 de la fase 2): huecos rellenados por interpolación. Lo
 * guardado antes no tiene nada interpolado: ceros en el recuento y en cada
 * trayectoria. Si un registro viene dañado, la migración lo deja tal cual y
 * la validación posterior lo rechaza con su motivo.
 */
export const MIGRACIONES_CABECERA: Migraciones = {
  1: (r) => (esObjeto(r.resumen) ? { ...r, resumen: { ...r.resumen, interpolados: 0 } } : r),
  /*
   * 2 → 3 (fase 3): las sesiones de antes tienen una sola vista, que sigue todos
   * los marcadores del modelo, sin sincronizar, y es la referencia. Los mismos
   * valores que pone `prepararGuardado` por defecto: una sesión vieja se lee
   * igual que una nueva de una vista.
   */
  2: (r) => {
    if (!Array.isArray(r.vistas) || !esObjeto(r.modelo) || !Array.isArray(r.modelo.marcadores)) return r
    const ids = (r.modelo.marcadores as unknown[]).map((mk) => (esObjeto(mk) ? mk.id : undefined))
    const vistas = (r.vistas as unknown[]).map((v) => (esObjeto(v) ? { ...v, marcadores: ids, sincronia: { metodo: 'ninguna' } } : v))
    const primera = r.vistas[0] as unknown
    return { ...r, vistas, referencia: esObjeto(primera) ? primera.id : undefined }
  },
}
export const MIGRACIONES_DATOS: Migraciones = {
  1: (r) => {
    if (!esObjeto(r.trayectorias)) return r
    const trayectorias: Record<string, unknown> = {}
    for (const [vista, porMarcador] of Object.entries(r.trayectorias)) {
      if (!esObjeto(porMarcador)) {
        trayectorias[vista] = porMarcador
        continue
      }
      const nueva: Record<string, unknown> = {}
      for (const [id, g] of Object.entries(porMarcador)) {
        nueva[id] = esObjeto(g) && g.indices instanceof Int32Array ? { ...g, interpolado: new Uint8Array(g.indices.length) } : g
      }
      trayectorias[vista] = nueva
    }
    return { ...r, trayectorias }
  },
  // 2 → 3: las trayectorias no cambian.
  2: (r) => r,
}

/**
 * Lleva un registro a la versión `actual` aplicando las migraciones en orden.
 * Separada de las constantes para poder probarla con una cadena inventada.
 */
export function migrar(v: unknown, migraciones: Migraciones, actual: number): Lectura<Record<string, unknown>> {
  if (typeof v !== 'object' || v === null) return mal('no es un objeto')
  let r = v as Record<string, unknown>
  const version = r.esquema
  if (!Number.isInteger(version) || (version as number) < 1) return mal('sin versión de esquema')
  if ((version as number) > actual) {
    return { ok: false, motivo: 'nueva', detalle: `guardada con el esquema ${version as number}; esta versión de la app solo entiende hasta el ${actual}` }
  }
  for (let n = version as number; n < actual; n++) {
    const paso = migraciones[n]
    if (!paso) return mal(`falta la migración del esquema ${n} al ${n + 1}`)
    r = { ...paso(r), esquema: n + 1 }
  }
  return { ok: true, valor: r }
}

// ---- Leer y validar ----

const mal = (detalle: string): { ok: false; motivo: 'invalida'; detalle: string } => ({ ok: false, motivo: 'invalida', detalle })
const esTexto = (v: unknown): v is string => typeof v === 'string'
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esFecha = (v: unknown) => esTexto(v) && !Number.isNaN(Date.parse(v))
const PLANOS: readonly Plano[] = ['sagital', 'frontal', 'transversal']

function errorOrientacion(v: unknown): string | null {
  if (!esObjeto(v)) return 'orientación no válida'
  if (v.plano === 'sagital' && (v.mira === 'izquierda' || v.mira === 'derecha')) return null
  if (v.plano === 'frontal' && (v.ve === 'delante' || v.ve === 'detras')) return null
  return 'orientación no válida'
}

function errorModelo(v: unknown): string | null {
  if (!esObjeto(v) || !Array.isArray(v.marcadores) || !Array.isArray(v.articulaciones)) return 'modelo de marcadores no válido'
  const ids = new Set<string>()
  for (const m of v.marcadores as unknown[]) {
    if (!esObjeto(m) || !esTexto(m.id) || !esTexto(m.nombre) || (m.color !== undefined && !esTexto(m.color))) return 'marcador no válido'
    if (ids.has(m.id)) return `marcador repetido: ${m.id}`
    ids.add(m.id)
  }
  if (ids.size === 0) return 'el modelo no tiene marcadores'
  const segmento = (s: unknown) => esObjeto(s) && esTexto(s.desde) && esTexto(s.hasta) && ids.has(s.desde) && ids.has(s.hasta)
  for (const a of v.articulaciones as unknown[]) {
    const d = a as Partial<Record<keyof DefinicionArticulacion, unknown>>
    if (
      !esObjeto(a) || !esTexto(d.id) || !esTexto(d.nombre) || !PLANOS.includes(d.plano as Plano) ||
      !segmento(d.proximal) || !segmento(d.distal) || (d.signo !== 1 && d.signo !== -1) ||
      typeof d.cero !== 'number' || !Number.isFinite(d.cero) || !esTexto(d.positivo) || !esTexto(d.negativo)
    ) {
      return `articulación no válida${esObjeto(a) && esTexto(a.id) ? `: ${a.id}` : ''}`
    }
  }
  return null
}

const METODOS: readonly MetodoSincronia[] = ['ninguna', 'evento', 'audio', 'manual']
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function errorSincronia(v: unknown): string | null {
  if (!esObjeto(v) || !METODOS.includes(v.metodo as MetodoSincronia)) return 'sincronía no válida'
  if (v.evento !== undefined && !(esObjeto(v.evento) && esNumero(v.evento.referencia) && esNumero(v.evento.vista))) return 'evento de sincronía no válido'
  if (v.audio !== undefined && !(esObjeto(v.audio) && esNumero(v.audio.calidad) && v.audio.calidad >= 0 && esNumero(v.audio.desfase))) {
    return 'sincronía por audio no válida'
  }
  return null
}

function errorVista(v: unknown): string | null {
  if (!esObjeto(v) || !esTexto(v.id)) return 'vista sin id'
  if (!esHuella(v.huella)) return `huella no válida en la vista ${v.id}`
  const o = errorOrientacion(v.orientacion)
  if (o) return `${o} en la vista ${v.id}`
  if (typeof v.desfase !== 'number' || !Number.isFinite(v.desfase)) return `desfase no válido en la vista ${v.id}`
  if (v.calibracion !== null && !esCalibracion(v.calibracion)) return `calibración no válida en la vista ${v.id}`
  if (!esObjeto(v.ceros) || !Object.values(v.ceros).every(esTramoEstatico)) return `ceros no válidos en la vista ${v.id}`
  if (!Array.isArray(v.marcadores) || v.marcadores.length === 0 || !v.marcadores.every(esTexto)) return `marcadores no válidos en la vista ${v.id}`
  if (new Set(v.marcadores).size !== v.marcadores.length) return `marcadores repetidos en la vista ${v.id}`
  const s = errorSincronia(v.sincronia)
  if (s) return `${s} en la vista ${v.id}`
  return null
}

/** Lee una cabecera de IndexedDB: migra, valida y devuelve el motivo si no sirve. */
export function leerCabecera(v: unknown): Lectura<CabeceraSesion> {
  const m = migrar(v, MIGRACIONES_CABECERA, ESQUEMA_ACTUAL)
  if (!m.ok) return m
  const c = m.valor
  if (!esTexto(c.id) || !c.id) return mal('sin id')
  if (!esTexto(c.nombre)) return mal('sin nombre')
  if (!esFecha(c.creada) || !esFecha(c.actualizada)) return mal('fechas no válidas')
  const em = errorModelo(c.modelo)
  if (em) return mal(em)
  if (!Array.isArray(c.vistas) || c.vistas.length === 0) return mal('sin vistas')
  for (const vista of c.vistas as unknown[]) {
    const ev = errorVista(vista)
    if (ev) return mal(ev)
  }
  const vistas = c.vistas as VistaCabecera[]
  const articulaciones = new Set((c.modelo as ModeloMarcadores).articulaciones.map((a) => a.id))
  const marcadores = new Set((c.modelo as ModeloMarcadores).marcadores.map((m) => m.id))
  for (const vista of vistas) {
    const ajena = Object.keys(vista.ceros).find((id) => !articulaciones.has(id))
    if (ajena) return mal(`cero de referencia de una articulación que no está en el modelo: ${ajena}`)
    const entre = vista.calibracion?.entre
    if (entre && (!marcadores.has(entre.desde) || !marcadores.has(entre.hasta))) return mal('escala entre marcadores que no están en el modelo')
    const fuera = vista.marcadores.find((id) => !marcadores.has(id))
    if (fuera) return mal(`la vista ${vista.id} sigue un marcador que no está en el modelo: ${fuera}`)
  }
  if (new Set(vistas.map((x) => x.id)).size !== vistas.length) return mal('vistas repetidas')
  const referencia = vistas.find((x) => x.id === c.referencia)
  if (!referencia) return mal('la vista de referencia no es ninguna de las vistas')
  if (referencia.desfase !== 0) return mal('la vista de referencia tiene desfase')
  if (c.filtro !== null && !esAjustesFiltro(c.filtro)) return mal('filtro no válido')
  const r = c.resumen
  if (!esObjeto(r) || ![r.frames, r.conDatos, r.aMano, r.interpolados].every((n) => Number.isInteger(n) && (n as number) >= 0)) return mal('resumen no válido')
  const claves = vistas.map((x) => claveHuella(x.huella))
  const guardadas = c.claves
  if (!Array.isArray(guardadas) || guardadas.length !== claves.length || claves.some((k, i) => guardadas[i] !== k)) {
    return mal('claves de huella que no corresponden a las vistas')
  }
  return { ok: true, valor: c as unknown as CabeceraSesion }
}

/** Lee las trayectorias de una sesión y las valida contra su cabecera (ya leída). */
export function leerDatos(v: unknown, cabecera: CabeceraSesion): Lectura<DatosSesion> {
  const m = migrar(v, MIGRACIONES_DATOS, ESQUEMA_ACTUAL)
  if (!m.ok) return m
  const d = m.valor
  if (d.id !== cabecera.id) return mal('las trayectorias son de otra sesión')
  if (!esObjeto(d.trayectorias)) return mal('sin trayectorias')
  for (const vista of cabecera.vistas) {
    const porMarcador = d.trayectorias[vista.id]
    if (!esObjeto(porMarcador)) return mal(`faltan las trayectorias de la vista ${vista.id}`)
    for (const mk of cabecera.modelo.marcadores) {
      const e = errorTrayectoria(porMarcador[mk.id], vista.huella.frames)
      if (e) return mal(`trayectoria de ${mk.id}: ${e}`)
    }
  }
  return { ok: true, valor: d as unknown as DatosSesion }
}
