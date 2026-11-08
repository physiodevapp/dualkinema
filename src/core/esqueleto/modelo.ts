/*
 * El esqueleto de la fase 7 (D1 y D5 de docs/plan-fase-7.md): una cadena cinemática de miembro inferior y tronco con 21
 * grados de libertad y su cinemática directa (de la postura a los 12 puntos del modelo sin marcadores).
 *
 * Marco del laboratorio (el de `core/tresd/puntos3d.ts`): x hacia delante de la persona al empezar, y hacia su izquierda,
 * z hacia arriba. Marco de cada segmento en su postura neutra (de pie, mirando a +x): los mismos ejes. Los giros de cada
 * articulación son una secuencia de Cardan que coincide con el sistema de coordenadas articulares de Grood y Suntay (ISB):
 * primero alrededor del eje mediolateral del segmento proximal (flexión), después del eje flotante anteroposterior
 * (abducción), por último del eje largo del segmento distal (rotación). Así los ángulos clínicos son los propios
 * parámetros, con sus signos fijados por `modelo.test.ts`. El tobillo es la excepción: primero el giro del pie alrededor
 * del eje largo de la pierna (progresión) y después la flexión dorsal, para que la flexión dorsal sea la del plano del pie:
 *
 * - Pelvis respecto al laboratorio: rumbo (alrededor de z, + hacia la izquierda), anteversión (+ la pelvis se inclina
 *   hacia delante) y oblicuidad (+ cadera izquierda más alta, como en 2D).
 * - Cadera: flexión (+ muslo hacia delante), abducción (+ hacia fuera, en las dos piernas) y rotación (+ interna).
 * - Rodilla: flexión (+). Tobillo: flexión dorsal (+) y progresión del pie respecto a la pierna (+ punta hacia fuera).
 * - Tronco respecto a la pelvis: flexión (+ hacia delante), inclinación lateral (+ a la izquierda, como en 2D) y rotación
 *   (+ hacia la izquierda).
 */
import type { Lado } from '../articulaciones/catalogo'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { aplicar, multiplicar, rotacion, type Mat3 } from '../tresd/camara'

/** Los 21 grados de libertad, en este orden (rad salvo la posición, en las unidades de las longitudes). */
export const GRADOS = [
  'pelvisX',
  'pelvisY',
  'pelvisZ',
  'pelvisRumbo',
  'pelvisAnteversion',
  'pelvisOblicuidad',
  'caderaFlexDer',
  'caderaAbdDer',
  'caderaRotDer',
  'caderaFlexIzq',
  'caderaAbdIzq',
  'caderaRotIzq',
  'rodillaDer',
  'rodillaIzq',
  'tobilloDorsalDer',
  'tobilloProgresionDer',
  'tobilloDorsalIzq',
  'tobilloProgresionIzq',
  'troncoFlex',
  'troncoLateral',
  'troncoRot',
] as const
export type Grado = (typeof GRADOS)[number]
export const N_GRADOS = GRADOS.length
export const indiceGrado = (g: Grado): number => GRADOS.indexOf(g)

/** Las medidas de la persona (D2): simétricas, en m o en las unidades de la calibración. */
export interface Medidas {
  /** Entre los centros de las dos caderas. */
  readonly anchoCaderas: number
  readonly muslo: number
  readonly pierna: number
  /** El talón y la punta en el marco del pie (x hacia delante, z hacia arriba), desde el tobillo. */
  readonly talon: { readonly x: number; readonly z: number }
  readonly punta: { readonly x: number; readonly z: number }
  /** Del punto medio de las caderas al de los hombros, de pie. */
  readonly tronco: number
  readonly anchoHombros: number
}

const X = vec3(1, 0, 0)
const Y = vec3(0, 1, 0)
const Z = vec3(0, 0, 1)
const R = (eje: Vec3, a: number): Mat3 => rotacion(eje, a)
const sumar = (a: Vec3, b: Vec3) => vec3(a.x + b.x, a.y + b.y, a.z + b.z)
/** +1 para la izquierda (+y), −1 para la derecha. */
const s = (l: Lado) => (l === 'izq' ? 1 : -1)

/** Las orientaciones de cada segmento (del segmento al laboratorio) de una postura. */
export interface Orientaciones {
  readonly pelvis: Mat3
  readonly muslo: Readonly<Record<Lado, Mat3>>
  readonly pierna: Readonly<Record<Lado, Mat3>>
  readonly pie: Readonly<Record<Lado, Mat3>>
  readonly tronco: Mat3
}

export function orientaciones(q: readonly number[]): Orientaciones {
  const v = (g: Grado) => q[indiceGrado(g)]!
  const pelvis = multiplicar(multiplicar(R(Z, v('pelvisRumbo')), R(Y, v('pelvisAnteversion'))), R(X, v('pelvisOblicuidad')))
  const lado = (l: Lado) => {
    const L = l === 'der' ? 'Der' : 'Izq'
    // Flexión: el muslo hacia delante es un giro negativo alrededor de +y. Abducción: hacia fuera (−y en la derecha, +y en
    // la izquierda) es un giro de signo s alrededor de +x. Rotación interna: la cara anterior hacia dentro, giro −s sobre z.
    const muslo = multiplicar(multiplicar(multiplicar(pelvis, R(Y, -v(`caderaFlex${L}` as Grado))), R(X, s(l) * v(`caderaAbd${L}` as Grado))), R(Z, -s(l) * v(`caderaRot${L}` as Grado)))
    const pierna = multiplicar(muslo, R(Y, v(`rodilla${L}` as Grado)))
    // Progresión hacia fuera: giro de signo s sobre el eje largo de la pierna; flexión dorsal: la punta sube (giro − sobre y).
    const pie = multiplicar(multiplicar(pierna, R(Z, s(l) * v(`tobilloProgresion${L}` as Grado))), R(Y, -v(`tobilloDorsal${L}` as Grado)))
    return { muslo, pierna, pie }
  }
  const der = lado('der')
  const izq = lado('izq')
  // Tronco: flexión hacia delante = giro + sobre y (el eje vertical se va hacia +x); inclinación a la izquierda = giro −
  // sobre x; rotación a la izquierda = giro + sobre z.
  const tronco = multiplicar(multiplicar(multiplicar(pelvis, R(Y, v('troncoFlex'))), R(X, -v('troncoLateral'))), R(Z, v('troncoRot')))
  return { pelvis, muslo: { der: der.muslo, izq: izq.muslo }, pierna: { der: der.pierna, izq: izq.pierna }, pie: { der: der.pie, izq: izq.pie }, tronco }
}

/** Los 12 puntos del modelo sin marcadores (`pose_<parte>_<lado>`) de una postura. */
export function puntosDePostura(q: readonly number[], m: Medidas): Map<IdMarcador, Vec3> {
  const o = orientaciones(q)
  const origen = vec3(q[0]!, q[1]!, q[2]!)
  const r = new Map<IdMarcador, Vec3>()
  for (const l of ['der', 'izq'] as const) {
    const cadera = sumar(origen, aplicar(o.pelvis, vec3(0, (s(l) * m.anchoCaderas) / 2, 0)))
    const rodilla = sumar(cadera, aplicar(o.muslo[l], vec3(0, 0, -m.muslo)))
    const tobillo = sumar(rodilla, aplicar(o.pierna[l], vec3(0, 0, -m.pierna)))
    r.set(idPose('cadera', l), cadera)
    r.set(idPose('rodilla', l), rodilla)
    r.set(idPose('tobillo', l), tobillo)
    r.set(idPose('talon', l), sumar(tobillo, aplicar(o.pie[l], vec3(m.talon.x, 0, m.talon.z))))
    r.set(idPose('punta', l), sumar(tobillo, aplicar(o.pie[l], vec3(m.punta.x, 0, m.punta.z))))
    r.set(idPose('hombro', l), sumar(origen, aplicar(o.tronco, vec3(0, (s(l) * m.anchoHombros) / 2, m.tronco))))
  }
  return r
}

/** La postura neutra (de pie, mirando a +x) con la pelvis en `origen`. */
export const posturaNeutra = (origen: Vec3 = vec3(0, 0, 0)): number[] => {
  const q = new Array<number>(N_GRADOS).fill(0)
  q[0] = origen.x
  q[1] = origen.y
  q[2] = origen.z
  return q
}
