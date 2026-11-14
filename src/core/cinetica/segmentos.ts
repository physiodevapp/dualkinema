/*
 * Los segmentos del cuerpo con su masa e inercia (fase 11, D3 de docs/plan-fase-11.md), sobre el esqueleto de la fase 7.
 *
 * Parámetros de Dempster adaptados por Winter («Biomechanics and motor control of human movement», 4.ª ed., 2009,
 * tabla 4.1), los mismos de las proporciones de `core/tresd/sintetico.ts`. Como el esqueleto no tiene brazos ni cabeza,
 * cabeza, brazos y tronco van como un bloque (HAT, del punto medio de las caderas al de los hombros), como en esa tabla:
 *
 * | Segmento | Masa (fracción del cuerpo) | Centro de masas (desde el extremo proximal) | Radio de giro (transversal) |
 * |---|---|---|---|
 * | HAT (caderas → hombros) | 0,678 | 0,626 | 0,496 |
 * | Muslo (cadera → rodilla) | 0,100 | 0,433 | 0,323 |
 * | Pierna (rodilla → tobillo) | 0,0465 | 0,433 | 0,302 |
 * | Pie (tobillo → punta) | 0,0145 | 0,50 | 0,475 |
 *
 * La suma es 1. Todo va **por kilo de masa corporal**: las fuerzas salen en N/kg y los momentos en N·m/kg, la forma
 * habitual de comparar personas, sin pedir el peso. El radio de giro alrededor del eje largo no está en esa tabla: se toma
 * el 45 % del transversal (en de Leva, 1996, va del 40 al 50 % en los segmentos de la pierna); pesa muy poco en lo que se
 * calcula (giros alrededor del eje largo, lentos).
 *
 * Unidades: metros (la postura y las medidas ya pasadas a metros con `enMetros`). Marco del segmento: el de
 * `core/esqueleto/modelo.ts` (x hacia delante, y hacia la izquierda, z a lo largo del segmento hacia arriba; en el pie, x
 * a lo largo del pie).
 */
import type { Lado } from '../articulaciones/catalogo'
import { orientaciones, type Medidas } from '../esqueleto/modelo'
import { vec3, type Vec3 } from '../geometria/vector'
import { aplicar, type Mat3 } from '../tresd/camara'

export type TipoSegmento = 'hat' | 'muslo' | 'pierna' | 'pie'

export interface Inercia {
  /** Fracción de la masa corporal. */
  readonly masa: number
  /** Centro de masas: fracción de la longitud desde el extremo proximal. */
  readonly com: number
  /** Radio de giro alrededor del centro de masas (ejes transversales), fracción de la longitud. */
  readonly giro: number
}

export const INERCIA: Readonly<Record<TipoSegmento, Inercia>> = {
  hat: { masa: 0.678, com: 0.626, giro: 0.496 },
  muslo: { masa: 0.1, com: 0.433, giro: 0.323 },
  pierna: { masa: 0.0465, com: 0.433, giro: 0.302 },
  pie: { masa: 0.0145, com: 0.5, giro: 0.475 },
}

/** El radio de giro alrededor del eje largo, como fracción del transversal. */
export const GIRO_LARGO = 0.45

/** Un segmento en una postura: su centro de masas, su orientación y su inercia por kilo. */
export interface Segmento {
  readonly tipo: TipoSegmento
  readonly lado?: Lado
  /** Fracción de la masa corporal (por kilo: la masa del segmento). */
  readonly masa: number
  readonly com: Vec3
  /** Del segmento al laboratorio. */
  readonly R: Mat3
  /** Momentos principales de inercia en el marco del segmento (kg·m² por kilo de masa corporal): x, y, z. */
  readonly inercia: readonly [number, number, number]
}

/** Los puntos de una postura que hacen falta para la dinámica: centros articulares y apoyos del pie (m). */
export interface PuntosDinamica {
  readonly mitadCaderas: Vec3
  readonly mitadHombros: Vec3
  readonly cadera: Readonly<Record<Lado, Vec3>>
  readonly rodilla: Readonly<Record<Lado, Vec3>>
  readonly tobillo: Readonly<Record<Lado, Vec3>>
  readonly talon: Readonly<Record<Lado, Vec3>>
  readonly punta: Readonly<Record<Lado, Vec3>>
}

export interface CuerpoEnPostura {
  readonly hat: Segmento
  readonly muslo: Readonly<Record<Lado, Segmento>>
  readonly pierna: Readonly<Record<Lado, Segmento>>
  readonly pie: Readonly<Record<Lado, Segmento>>
  /** La orientación de la pelvis (para los ejes de la cadera; su masa va en el HAT). */
  readonly pelvis: Mat3
  readonly puntos: PuntosDinamica
}

const sumar = (a: Vec3, b: Vec3) => vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const entre = (a: Vec3, b: Vec3, f: number) => vec3(a.x + f * (b.x - a.x), a.y + f * (b.y - a.y), a.z + f * (b.z - a.z))
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const s = (l: Lado) => (l === 'izq' ? 1 : -1)

/** La postura y las medidas en metros (posición de la pelvis y longitudes por `k` metros por unidad). */
export function enMetros(q: readonly number[], m: Medidas, k: number): { q: number[]; m: Medidas } {
  const r = [...q]
  r[0] = q[0]! * k
  r[1] = q[1]! * k
  r[2] = q[2]! * k
  return {
    q: r,
    m: {
      anchoCaderas: m.anchoCaderas * k,
      muslo: m.muslo * k,
      pierna: m.pierna * k,
      talon: { x: m.talon.x * k, z: m.talon.z * k },
      punta: { x: m.punta.x * k, z: m.punta.z * k },
      tronco: m.tronco * k,
      anchoHombros: m.anchoHombros * k,
    },
  }
}

function segmento(tipo: TipoSegmento, proximal: Vec3, distal: Vec3, R: Mat3, lado?: Lado): Segmento {
  const p = INERCIA[tipo]
  const L = dist(proximal, distal)
  const t = p.masa * (p.giro * L) ** 2
  const l = p.masa * (GIRO_LARGO * p.giro * L) ** 2
  // El eje largo es z, salvo en el pie (x).
  const inercia: [number, number, number] = tipo === 'pie' ? [l, t, t] : [t, t, l]
  return { tipo, ...(lado ? { lado } : {}), masa: p.masa, com: entre(proximal, distal, p.com), R, inercia }
}

/** Los segmentos de una postura (en metros: ver `enMetros`). */
export function cuerpoDePostura(q: readonly number[], m: Medidas): CuerpoEnPostura {
  const o = orientaciones(q)
  const origen = vec3(q[0]!, q[1]!, q[2]!)
  const mitadHombros = sumar(origen, aplicar(o.tronco, vec3(0, 0, m.tronco)))
  const pts = { cadera: {}, rodilla: {}, tobillo: {}, talon: {}, punta: {} } as Record<'cadera' | 'rodilla' | 'tobillo' | 'talon' | 'punta', Record<Lado, Vec3>>
  const muslo = {} as Record<Lado, Segmento>
  const pierna = {} as Record<Lado, Segmento>
  const pie = {} as Record<Lado, Segmento>
  for (const l of ['der', 'izq'] as const) {
    const cadera = sumar(origen, aplicar(o.pelvis, vec3(0, (s(l) * m.anchoCaderas) / 2, 0)))
    const rodilla = sumar(cadera, aplicar(o.muslo[l], vec3(0, 0, -m.muslo)))
    const tobillo = sumar(rodilla, aplicar(o.pierna[l], vec3(0, 0, -m.pierna)))
    const talon = sumar(tobillo, aplicar(o.pie[l], vec3(m.talon.x, 0, m.talon.z)))
    const punta = sumar(tobillo, aplicar(o.pie[l], vec3(m.punta.x, 0, m.punta.z)))
    pts.cadera[l] = cadera
    pts.rodilla[l] = rodilla
    pts.tobillo[l] = tobillo
    pts.talon[l] = talon
    pts.punta[l] = punta
    muslo[l] = segmento('muslo', cadera, rodilla, o.muslo[l], l)
    pierna[l] = segmento('pierna', rodilla, tobillo, o.pierna[l], l)
    pie[l] = segmento('pie', tobillo, punta, o.pie[l], l)
  }
  return {
    hat: segmento('hat', origen, mitadHombros, o.tronco),
    muslo,
    pierna,
    pie,
    pelvis: o.pelvis,
    puntos: { mitadCaderas: origen, mitadHombros, ...pts },
  }
}

/** Todos los segmentos de un cuerpo, en un orden fijo. */
export const segmentosDe = (c: CuerpoEnPostura): Segmento[] => [c.hat, c.muslo.der, c.muslo.izq, c.pierna.der, c.pierna.izq, c.pie.der, c.pie.izq]

/** El centro de masas del cuerpo entero (m). */
export function centroDeMasas(c: CuerpoEnPostura): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  let total = 0
  for (const sg of segmentosDe(c)) {
    x += sg.masa * sg.com.x
    y += sg.masa * sg.com.y
    z += sg.masa * sg.com.z
    total += sg.masa
  }
  return vec3(x / total, y / total, z / total)
}
