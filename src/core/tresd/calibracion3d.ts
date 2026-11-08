/*
 * «Calibrar en 3D» (fase 6, paso 3; §4, §7 y D10 de docs/plan-fase-6.md): de las correspondencias de las dos vistas a la
 * calibración que se guarda en la sesión (cámaras, escala, error de reproyección por punto del cuerpo) y a lo que se le
 * enseña al usuario (ángulo entre los móviles, distancia, altura de cada uno, campo de visión, comparación con el pitido y
 * avisos), con un informe para copiar. Los puntos 3D no se guardan: se recalculan de las trayectorias 2D y las cámaras.
 */
import { vec3, type Vec3 } from '../geometria/vector'
import { idPose, type ParteCuerpo } from '../pose/puntos'
import { calibrarDosCamaras, type Imagen, type ResultadoCalibracion } from './calibrar'
import { centro, type Camara, type Mat3 } from './camara'
import type { CorrespondenciaEnTiempo } from './correspondencias'
import { alturaSuelo, compararDistancia, escalaPorEstatura } from './escala'

/** Una cámara tal como se guarda (la del mundo de la calibración: A en el origen, B a distancia 1). */
export interface CamaraGuardada {
  readonly f: number
  readonly cx: number
  readonly cy: number
  /** Del mundo a la cámara, por filas. */
  readonly R: readonly number[]
  readonly t: readonly [number, number, number]
}

/** De dónde salen los metros: la estatura escrita, la distancia entre los móviles con cinta, o ninguno (sin metros). */
export type FuenteEscala = 'estatura' | 'cinta' | null

/** Lo que se guarda en la sesión (esquema 6: `calibracion3d`). */
export interface Calibracion3D {
  /** ISO 8601. */
  readonly fecha: string
  /** Ids de la vista A y la B, en el orden de las cámaras. */
  readonly vistas: readonly [string, string]
  /** Tramo de calibración en tiempo común (s); null = toda la toma. */
  readonly tramo: { readonly desde: number; readonly hasta: number } | null
  readonly instantes: number
  readonly correspondencias: number
  readonly camaras: readonly [CamaraGuardada, CamaraGuardada]
  /** Metros por unidad del mundo calibrado (la distancia entre las cámaras es 1); null sin escala. */
  readonly metrosPorUnidad: number | null
  readonly escalaDe: FuenteEscala
  /** Altura del suelo en el mundo calibrado (z); null sin puntos de los pies. */
  readonly suelo: number | null
  readonly errorMediano: number
  readonly errorPorPunto: Readonly<Record<string, number>>
  readonly fraccionBuenas: number
  readonly sinVertical: readonly [boolean, boolean]
  /** Corrección del ajuste a la vertical del acelerómetro de cada móvil (°). */
  readonly correccionVertical: readonly [number, number]
  /** El desfase de cada vista al calibrar (s). Opcional: sin él, no se comprueba. */
  readonly desfases?: readonly [number, number]
}

/** Diferencia de desfase (s) a partir de la cual la sincronía ha cambiado desde la calibración. */
export const CAMBIO_DESFASE_S = 0.001

export interface EntradaCalibrar3D {
  readonly vistas: readonly [string, string]
  readonly correspondencias: readonly CorrespondenciaEnTiempo[]
  readonly imagenes: readonly [Imagen, Imagen]
  readonly verticales: readonly [Vec3 | null, Vec3 | null]
  readonly tramo: { readonly desde: number; readonly hasta: number } | null
  /** Estatura (m) y distancia entre los móviles con cinta (m), si se escribieron. La cinta manda sobre la estatura. */
  readonly estatura: number | null
  readonly distanciaCinta: number | null
  readonly fecha: string
  /** El desfase de cada vista con que se emparejó (s): si la sincronía cambia después, la calibración ya no vale. */
  readonly desfases: readonly [number, number]
}

/** Instantes mínimos para intentar calibrar (con menos, el ajuste no tiene de dónde sacar la focal ni el giro). */
export const INSTANTES_MINIMOS = 30

const guardar = (c: Camara): CamaraGuardada => ({ f: c.f, cx: c.cx, cy: c.cy, R: [...c.R], t: [c.t.x, c.t.y, c.t.z] })
export const camaraDe = (g: CamaraGuardada): Camara => ({ f: g.f, cx: g.cx, cy: g.cy, R: [...g.R] as unknown as Mat3, t: vec3(g.t[0], g.t[1], g.t[2]) })

/** Los puntos 3D de las correspondencias de una parte del cuerpo y lado, por instante. */
function porInstante(c: readonly CorrespondenciaEnTiempo[], puntos: readonly Vec3[], id: string): Map<number, Vec3> {
  const r = new Map<number, Vec3>()
  c.forEach((x, k) => {
    if (x.id === id && Number.isFinite(puntos[k]?.x)) r.set(x.t, puntos[k]!)
  })
  return r
}

/** La escala por la estatura: el hombro y el tobillo del mismo lado en el mismo instante. */
function escalaDeEstatura(estatura: number, c: readonly CorrespondenciaEnTiempo[], r: ResultadoCalibracion): number | null {
  const pares: { hombro: Vec3; tobillo: Vec3 }[] = []
  for (const lado of ['izq', 'der'] as const) {
    const h = porInstante(c, r.puntos, idPose('hombro', lado))
    const t = porInstante(c, r.puntos, idPose('tobillo', lado))
    for (const [ti, hombro] of h) {
      const tobillo = t.get(ti)
      if (tobillo) pares.push({ hombro, tobillo })
    }
  }
  return escalaPorEstatura(estatura, pares)
}

/** Calibra con las correspondencias. null si no hay bastantes instantes. */
export function calibrar3D(e: EntradaCalibrar3D): Calibracion3D | null {
  const instantes = new Set(e.correspondencias.map((c) => c.t)).size
  if (instantes < INSTANTES_MINIMOS) return null
  const r = calibrarDosCamaras({ correspondencias: e.correspondencias, imagenes: e.imagenes, verticales: e.verticales })
  const pies = (['talon', 'punta'] as const satisfies readonly ParteCuerpo[]).flatMap((parte) =>
    (['izq', 'der'] as const).flatMap((lado) => [...porInstante(e.correspondencias, r.puntos, idPose(parte, lado)).values()]),
  )
  const suelo = alturaSuelo(pies)
  const base = distancia(centro(r.camaras[0]), centro(r.camaras[1]))
  let metrosPorUnidad: number | null = null
  let escalaDe: FuenteEscala = null
  if (e.distanciaCinta && e.distanciaCinta > 0 && base > 0) {
    metrosPorUnidad = e.distanciaCinta / base
    escalaDe = 'cinta'
  } else if (e.estatura && e.estatura > 0) {
    metrosPorUnidad = escalaDeEstatura(e.estatura, e.correspondencias, r)
    escalaDe = metrosPorUnidad ? 'estatura' : null
  }
  const resultado: Calibracion3D = {
    fecha: e.fecha,
    vistas: e.vistas,
    tramo: e.tramo,
    instantes,
    correspondencias: e.correspondencias.length,
    camaras: [guardar(r.camaras[0]), guardar(r.camaras[1])],
    metrosPorUnidad,
    escalaDe,
    suelo: Number.isFinite(suelo) ? suelo : null,
    errorMediano: r.errorMediano,
    errorPorPunto: Object.fromEntries(r.errorPorPunto),
    fraccionBuenas: r.fraccionBuenas,
    sinVertical: r.sinVertical,
    correccionVertical: r.correccionVertical,
    desfases: e.desfases,
  }
  // Una calibración degenerada (todo sin triangular, el ajuste divergió) no se devuelve: guardada, la sesión no se abriría.
  return esCalibracion3D(resultado) ? resultado : null
}

const distancia = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const grados = (r: number) => (r * 180) / Math.PI

/** Campo de visión sobre el lado largo de la imagen (°) con una focal. */
export const campoDeVision = (f: number, imagen: Imagen): number => grados(2 * Math.atan(Math.max(imagen.ancho, imagen.alto) / 2 / f))

/** Campo de visión razonable de la cámara principal de un móvil (°): fuera de esto la focal ha salido mal. */
export const CAMPO_MIN = 40
export const CAMPO_MAX = 90
/** Error de reproyección mediano alto, como fracción del lado largo de la imagen (≈ 7,7 px a 1920). */
export const ERROR_ALTO = 0.004

export type Aviso3D =
  | { readonly tipo: 'residuo'; readonly px: number }
  | { readonly tipo: 'punto'; readonly id: string; readonly px: number }
  | { readonly tipo: 'sinVertical'; readonly vistas: readonly number[] }
  | { readonly tipo: 'movido'; readonly vistas: readonly number[] }
  | { readonly tipo: 'focal'; readonly vista: number; readonly campo: number }
  | { readonly tipo: 'pitido'; readonly calibrada: number; readonly medida: number; readonly diferencia: number }
  | { readonly tipo: 'sinSincronizar' }
  | { readonly tipo: 'reloj' }

/** Lo que se enseña de una calibración. */
export interface Resumen3D {
  /** Ángulo entre los dos móviles visto desde la persona, en el plano horizontal (°). */
  readonly anguloCamaras: number
  /** Distancia entre los móviles (m, o en unidades de la calibración sin escala). */
  readonly distanciaCamaras: number
  readonly enMetros: boolean
  /** Altura de cada cámara sobre el suelo (m; null sin escala o sin suelo). */
  readonly alturas: readonly [number | null, number | null]
  readonly campos: readonly [number, number]
  readonly focales: readonly [number, number]
  /** El punto del cuerpo que peor casa entre las dos vistas. */
  readonly peorPunto: { readonly id: string; readonly px: number } | null
  readonly avisos: readonly Aviso3D[]
}

export interface ContextoResumen {
  readonly imagenes: readonly [Imagen, Imagen]
  /** Distancia entre los móviles medida por el pitido de la grabación doble (m), si la hay. */
  readonly distanciaPitido: number | null
  /** Si cada móvil se movió durante la toma (de sus sensores). */
  readonly movido: readonly [boolean, boolean]
  readonly metodoSincronia: string
}

/** El resumen y los avisos de una calibración. */
export function resumir3D(c: Calibracion3D, ctx: ContextoResumen): Resumen3D {
  const [A, B] = [camaraDe(c.camaras[0]), camaraDe(c.camaras[1])]
  const [cA, cB] = [centro(A), centro(B)]
  const base = distancia(cA, cB)
  const k = c.metrosPorUnidad ?? 1
  // La persona: el punto de los ejes ópticos más cercano entre los dos (donde miran las dos cámaras), en horizontal.
  const persona = cruceEjes(A, B)
  const hA = vec3(cA.x - persona.x, cA.y - persona.y, 0)
  const hB = vec3(cB.x - persona.x, cB.y - persona.y, 0)
  const anguloCamaras = grados(Math.acos(Math.max(-1, Math.min(1, (hA.x * hB.x + hA.y * hB.y) / (Math.hypot(hA.x, hA.y) * Math.hypot(hB.x, hB.y))))))
  const alturas: [number | null, number | null] = [cA, cB].map((p) => (c.metrosPorUnidad && c.suelo !== null ? (p.z - c.suelo) * c.metrosPorUnidad : null)) as [number | null, number | null]
  const campos: [number, number] = [campoDeVision(A.f, ctx.imagenes[0]), campoDeVision(B.f, ctx.imagenes[1])]
  const puntos = Object.entries(c.errorPorPunto).filter(([, v]) => Number.isFinite(v))
  const peor = puntos.length ? puntos.reduce((a, b) => (b[1] > a[1] ? b : a)) : null
  const avisos: Aviso3D[] = []
  const ladoLargo = Math.max(ctx.imagenes[0].ancho, ctx.imagenes[0].alto, ctx.imagenes[1].ancho, ctx.imagenes[1].alto)
  if (c.errorMediano > ERROR_ALTO * ladoLargo) avisos.push({ tipo: 'residuo', px: c.errorMediano })
  // Un punto que casa mucho peor que el resto (el doble de la mediana de todos y por encima del umbral): el detector no lo
  // pone en el mismo sitio desde los dos lados (la cadera, sobre todo).
  if (peor && peor[1] > 2 * Math.max(c.errorMediano, 1) && peor[1] > ERROR_ALTO * ladoLargo) avisos.push({ tipo: 'punto', id: peor[0], px: peor[1] })
  const sinV = [0, 1].filter((i) => c.sinVertical[i])
  if (sinV.length) avisos.push({ tipo: 'sinVertical', vistas: sinV })
  const movidos = [0, 1].filter((i) => ctx.movido[i])
  if (movidos.length) avisos.push({ tipo: 'movido', vistas: movidos })
  campos.forEach((campo, vista) => {
    if (campo < CAMPO_MIN || campo > CAMPO_MAX) avisos.push({ tipo: 'focal', vista, campo })
  })
  if (ctx.distanciaPitido && c.metrosPorUnidad && c.escalaDe !== 'cinta') {
    const cmp = compararDistancia(base * k, ctx.distanciaPitido)
    if (!cmp.casa) avisos.push({ tipo: 'pitido', calibrada: base * k, medida: ctx.distanciaPitido, diferencia: cmp.diferencia })
  }
  if (ctx.metodoSincronia === 'ninguna') avisos.push({ tipo: 'sinSincronizar' })
  else if (ctx.metodoSincronia === 'reloj') avisos.push({ tipo: 'reloj' })
  return {
    anguloCamaras,
    distanciaCamaras: base * k,
    enMetros: c.metrosPorUnidad !== null,
    alturas,
    campos,
    focales: [A.f, B.f],
    peorPunto: peor ? { id: peor[0], px: peor[1] } : null,
    avisos,
  }
}

/** El punto medio del tramo más corto entre los ejes ópticos de las dos cámaras (hacia donde miran las dos). */
function cruceEjes(A: Camara, B: Camara): Vec3 {
  const p = centro(A)
  const q = centro(B)
  const d = vec3(A.R[6], A.R[7], A.R[8])
  const e = vec3(B.R[6], B.R[7], B.R[8])
  const w = vec3(p.x - q.x, p.y - q.y, p.z - q.z)
  const a = 1
  const b = d.x * e.x + d.y * e.y + d.z * e.z
  const c = 1
  const dd = d.x * w.x + d.y * w.y + d.z * w.z
  const ee = e.x * w.x + e.y * w.y + e.z * w.z
  const den = a * c - b * b
  // Ejes casi paralelos: a 3 unidades delante de A (la distancia típica a la persona con los móviles a ~90°).
  const s = den > 1e-9 ? (b * ee - c * dd) / den : 3
  const u = den > 1e-9 ? (a * ee - b * dd) / den : 0
  return vec3((p.x + s * d.x + q.x + u * e.x) / 2, (p.y + s * d.y + q.y + u * e.y) / 2, (p.z + s * d.z + q.z + u * e.z) / 2)
}

const NOMBRE_PUNTO: Record<ParteCuerpo, { readonly nombre: string; readonly femenino: boolean }> = {
  hombro: { nombre: 'hombro', femenino: false },
  cadera: { nombre: 'cadera', femenino: true },
  rodilla: { nombre: 'rodilla', femenino: true },
  tobillo: { nombre: 'tobillo', femenino: false },
  talon: { nombre: 'talón', femenino: false },
  punta: { nombre: 'punta del pie', femenino: true },
}

/** «la cadera izquierda» de `pose_cadera_izq`, con su artículo si se pide (o el id tal cual si no es un punto del modelo). */
export function nombrePunto(id: string, conArticulo = false): string {
  const m = /^pose_([a-z]+)_(izq|der)$/.exec(id)
  const p = m ? NOMBRE_PUNTO[m[1] as ParteCuerpo] : undefined
  if (!m || !p) return id
  const lado = m[2] === 'izq' ? (p.femenino ? 'izquierda' : 'izquierdo') : p.femenino ? 'derecha' : 'derecho'
  return `${conArticulo ? (p.femenino ? 'la ' : 'el ') : ''}${p.nombre} ${lado}`
}

const num = (x: number, d: number) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

/** El texto de un aviso. `vistas` da el nombre de cada una («A», «B»). */
export function textoAviso(a: Aviso3D, nombres: readonly [string, string] = ['A', 'B']): string {
  const lista = (vs: readonly number[]) => vs.map((v) => nombres[v as 0 | 1]).join(' y ')
  switch (a.tipo) {
    case 'residuo':
      return `Error de reproyección alto (${num(a.px, 1)} px): las dos vistas no casan bien. Revisa la sincronía y que los dos móviles estuvieran quietos.`
    case 'punto':
      {
      const n = nombrePunto(a.id, true)
      return `${n.charAt(0).toUpperCase()}${n.slice(1)} casa peor que el resto (${num(a.px, 1)} px): el detector no marca ese punto en el mismo sitio desde los dos lados.`
    }
    case 'sinVertical':
      return `Sin el acelerómetro de ${lista(a.vistas)}: se ha supuesto el móvil en vertical sin inclinar. La calibración es peor; graba con la app para que lo guarde.`
    case 'movido':
      return `El móvil ${lista(a.vistas)} se movió durante la toma: la calibración no vale para todo el vídeo. Elige un tramo en que estuviera quieto o repite la toma.`
    case 'focal':
      return `El campo de visión de ${nombres[a.vista as 0 | 1]} sale de ${num(a.campo, 0)}°, fuera de lo normal en un móvil: la focal no se ha podido estimar bien (la persona se movió poco o siempre a la misma distancia).`
    case 'pitido':
      return `La distancia entre los móviles de la calibración (${num(a.calibrada, 2)} m) no casa con la del pitido (${num(a.medida, 2)} m; ${a.diferencia > 0 ? '+' : ''}${num(a.diferencia * 100, 0)} %). Revisa la estatura o escribe la distancia medida con cinta.`
    case 'sinSincronizar':
      return 'Las vistas no están sincronizadas: se ha supuesto que empezaron a la vez. Sincronízalas antes en «Sincronizar las vistas».'
    case 'reloj':
      return 'Sincronizadas por el reloj (± varias decenas de ms): en los movimientos rápidos las dos vistas no ven el mismo instante. Mejor por el pitido.'
  }
}

/** El informe para copiar (sin nombres de archivo ni nada del paciente). */
export function informe3D(c: Calibracion3D, r: Resumen3D, ctx: { readonly estatura: number | null; readonly distanciaPitido: number | null; readonly metodoSincronia: string; readonly nombres?: readonly [string, string] }): string {
  const nombres = ctx.nombres ?? ['A', 'B']
  const u = r.enMetros ? ' m' : ' (sin escala: unidades de la distancia entre móviles)'
  const lineas = [
    'dualkinema · calibración 3D con la persona',
    `fecha: ${c.fecha}`,
    `tramo: ${c.tramo ? `${num(c.tramo.desde, 2)}–${num(c.tramo.hasta, 2)} s` : 'toda la toma'} · ${c.instantes} instantes · ${c.correspondencias} correspondencias`,
    `sincronía: ${ctx.metodoSincronia}`,
    `error de reproyección mediano: ${num(c.errorMediano, 2)} px · bajo 3 px: ${num(c.fraccionBuenas * 100, 0)} %`,
    'error por punto (px):',
    ...Object.entries(c.errorPorPunto)
      .sort((a, b) => b[1] - a[1])
      .map(([id, px]) => `  ${nombrePunto(id)}: ${num(px, 2)}`),
    `ángulo entre los móviles (desde la persona): ${num(r.anguloCamaras, 1)}°`,
    `distancia entre los móviles: ${num(r.distanciaCamaras, 2)}${u}`,
    `escala: ${c.escalaDe === 'cinta' ? 'distancia con cinta' : c.escalaDe === 'estatura' ? `estatura ${num(ctx.estatura ?? NaN, 2)} m` : 'ninguna'}`,
    `pitido: ${ctx.distanciaPitido ? `${num(ctx.distanciaPitido, 2)} m` : '—'}`,
    ...[0, 1].map((i) => {
      const h = r.alturas[i]
      return `${nombres[i as 0 | 1]}: focal ${num(r.focales[i]!, 0)} px (campo ${num(r.campos[i]!, 1)}°), altura ${h === null || h === undefined ? '—' : `${num(h, 2)} m`}, vertical ${c.sinVertical[i] ? 'supuesta (sin acelerómetro)' : `del acelerómetro, corregida ${num(c.correccionVertical[i]!, 2)}°`}`
    }),
    ...(r.avisos.length ? ['avisos:', ...r.avisos.map((a) => `  - ${textoAviso(a, nombres)}`)] : ['avisos: ninguno']),
  ]
  return lineas.join('\n')
}

/** Validación de lo guardado (esquema 6). */
export function esCalibracion3D(v: unknown): v is Calibracion3D {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  const finito = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
  const esCamara = (x: unknown) => {
    if (typeof x !== 'object' || x === null) return false
    const k = x as Record<string, unknown>
    return [k.f, k.cx, k.cy].every(finito) && Array.isArray(k.R) && k.R.length === 9 && k.R.every(finito) && Array.isArray(k.t) && k.t.length === 3 && k.t.every(finito)
  }
  const par = (x: unknown, f: (y: unknown) => boolean) => Array.isArray(x) && x.length === 2 && x.every(f)
  const tramo = c.tramo === null || (typeof c.tramo === 'object' && finito((c.tramo as Record<string, unknown>).desde) && finito((c.tramo as Record<string, unknown>).hasta))
  return (
    typeof c.fecha === 'string' &&
    !Number.isNaN(Date.parse(c.fecha)) &&
    par(c.vistas, (x) => typeof x === 'string') &&
    tramo &&
    Number.isInteger(c.instantes) &&
    Number.isInteger(c.correspondencias) &&
    par(c.camaras, esCamara) &&
    (c.metrosPorUnidad === null || (finito(c.metrosPorUnidad) && (c.metrosPorUnidad as number) > 0)) &&
    (c.escalaDe === null || c.escalaDe === 'estatura' || c.escalaDe === 'cinta') &&
    (c.suelo === null || finito(c.suelo)) &&
    finito(c.errorMediano) &&
    typeof c.errorPorPunto === 'object' &&
    c.errorPorPunto !== null &&
    Object.values(c.errorPorPunto).every(finito) &&
    finito(c.fraccionBuenas) &&
    par(c.sinVertical, (x) => typeof x === 'boolean') &&
    par(c.correccionVertical, finito) &&
    (c.desfases === undefined || par(c.desfases, finito)) &&
    ((c.camaras as unknown[]) ?? []).every((k) => (k as { f: number }).f > 0)
  )
}

