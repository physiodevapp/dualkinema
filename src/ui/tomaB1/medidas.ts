/*
 * La toma B1 (fase 6, «La toma B1» de docs/plan-fase-6.md): lo que el usuario apunta con la cinta y por dónde va de la
 * guía, recordado en este dispositivo (`localStorage`) para poder ir a la sala y volver. Nada del paciente: medidas de
 * la colocación y la estatura, que solo salen del móvil si el usuario copia el texto.
 */

export const CLAVE_TOMA_B1 = 'dualkinema.tomaB1'

/** Lo que se mide con la cinta (m, salvo el ángulo en °); null si aún no se ha apuntado. */
export interface MedidasB1 {
  readonly distanciaMoviles: number | null
  /** Móvil en el flanco derecho de la persona (en su imagen la persona mira a la derecha). */
  readonly distanciaDerecho: number | null
  readonly alturaDerecho: number | null
  /** Móvil en el flanco izquierdo (en su imagen la persona mira a la izquierda). */
  readonly distanciaIzquierdo: number | null
  readonly alturaIzquierdo: number | null
  readonly angulo: number | null
  readonly estatura: number | null
  /** Si lleva los gomets de delante (opcionales). */
  readonly gomets: boolean
}

export interface ProgresoB1 {
  /** Paso de la guía en que se quedó (0…PASOS_B1 − 1). */
  readonly paso: number
  /** Ids de las casillas marcadas. */
  readonly hechos: readonly string[]
  readonly medidas: MedidasB1
}

export const PASOS_B1 = 7

export const MEDIDAS_VACIAS: MedidasB1 = {
  distanciaMoviles: null,
  distanciaDerecho: null,
  alturaDerecho: null,
  distanciaIzquierdo: null,
  alturaIzquierdo: null,
  angulo: null,
  estatura: null,
  gomets: false,
}

export const PROGRESO_INICIAL: ProgresoB1 = { paso: 0, hechos: [], medidas: MEDIDAS_VACIAS }

/** Rangos razonables de cada medida: fuera de ellos, probablemente se ha escrito mal (cm en lugar de m, por ejemplo). */
export const RANGOS: Record<Exclude<keyof MedidasB1, 'gomets'>, readonly [number, number]> = {
  distanciaMoviles: [0.5, 10],
  distanciaDerecho: [0.5, 10],
  alturaDerecho: [0.1, 2.5],
  distanciaIzquierdo: [0.5, 10],
  alturaIzquierdo: [0.1, 2.5],
  angulo: [10, 180],
  estatura: [1, 2.3],
}

/** Lo que escribe el usuario, como número: admite coma decimal; vacío o ilegible, null. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (t === '') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

/** Si una medida apuntada se sale de lo razonable (para avisar; se guarda igual). */
export const fueraDeRango = (clave: keyof typeof RANGOS, valor: number | null): boolean =>
  valor !== null && (valor < RANGOS[clave][0] || valor > RANGOS[clave][1])

const numeroONull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/** Lo guardado, validado: lo ilegible o ajeno vuelve al principio. */
export function leerProgreso(texto: string | null): ProgresoB1 {
  if (!texto) return PROGRESO_INICIAL
  let v: unknown
  try {
    v = JSON.parse(texto)
  } catch {
    return PROGRESO_INICIAL
  }
  if (typeof v !== 'object' || v === null) return PROGRESO_INICIAL
  const o = v as Record<string, unknown>
  const paso = Number.isInteger(o.paso) && (o.paso as number) >= 0 && (o.paso as number) < PASOS_B1 ? (o.paso as number) : 0
  const hechos = Array.isArray(o.hechos) ? o.hechos.filter((h): h is string => typeof h === 'string' && h.length <= 40).slice(0, 50) : []
  const m = (typeof o.medidas === 'object' && o.medidas !== null ? o.medidas : {}) as Record<string, unknown>
  const medidas: MedidasB1 = {
    distanciaMoviles: numeroONull(m.distanciaMoviles),
    distanciaDerecho: numeroONull(m.distanciaDerecho),
    alturaDerecho: numeroONull(m.alturaDerecho),
    distanciaIzquierdo: numeroONull(m.distanciaIzquierdo),
    alturaIzquierdo: numeroONull(m.alturaIzquierdo),
    angulo: numeroONull(m.angulo),
    estatura: numeroONull(m.estatura),
    gomets: m.gomets === true,
  }
  return { paso, hechos, medidas }
}

const f = (x: number | null, unidad: string) => (x === null ? '—' : `${x.toLocaleString('es-ES', { maximumFractionDigits: 3 })} ${unidad}`)

/** El texto para copiar y pegar con el informe de la calibración (paso 3). */
export function textoMedidas(m: MedidasB1): string {
  return [
    'Toma B1 — medidas con cinta',
    `Distancia entre los móviles: ${f(m.distanciaMoviles, 'm')}`,
    `Móvil del flanco derecho (la persona mira a la derecha en su imagen): a ${f(m.distanciaDerecho, 'm')} de la persona, lente a ${f(m.alturaDerecho, 'm')} del suelo`,
    `Móvil del flanco izquierdo (la persona mira a la izquierda en su imagen): a ${f(m.distanciaIzquierdo, 'm')} de la persona, lente a ${f(m.alturaIzquierdo, 'm')} del suelo`,
    `Ángulo entre los móviles: ${f(m.angulo, '°')}`,
    `Estatura: ${f(m.estatura, 'm')}`,
    `Gomets de delante: ${m.gomets ? 'sí' : 'no'}`,
  ].join('\n')
}

/**
 * El ángulo entre los dos móviles visto desde la persona a partir de las tres distancias (teorema del coseno):
 * cos θ = (d₁² + d₂² − D²) / (2·d₁·d₂). null si falta alguna o no forman un triángulo.
 */
export function anguloPorDistancias(m: MedidasB1): number | null {
  const { distanciaDerecho: a, distanciaIzquierdo: b, distanciaMoviles: c } = m
  if (a === null || b === null || c === null || !(a > 0 && b > 0 && c > 0)) return null
  const cos = (a * a + b * b - c * c) / (2 * a * b)
  if (cos < -1 || cos > 1) return null
  return (Math.acos(cos) * 180) / Math.PI
}
