/*
 * ¿Se ve a la persona entera en la cámara? (fase 6, asistente de colocación, D9 de docs/plan-fase-6.md). Con los dos
 * móviles colocados y la persona ya en su sitio, nadie mira las pantallas: cada móvil pasa su vista previa por el detector
 * del cuerpo unas veces por segundo, se lo cuenta al otro por la sala y uno de los dos lo dice en voz alta.
 *
 * Con los 33 puntos de MediaPipe (normalizados 0–1 a la imagen): la cabeza (nariz y ojos), los pies (talones y puntas) y
 * los dos lados tienen que quedar dentro de la imagen con un margen; un punto fuera de la imagen MediaPipe lo extrapola con
 * poca visibilidad, así que un punto poco visible cuenta como cortado.
 */

/** Un punto de MediaPipe normalizado a la imagen. */
export interface PuntoNorm {
  readonly x: number
  readonly y: number
  readonly visibility?: number
}

/** Lo que se corta: la cabeza, los pies o un lado de la imagen. */
export type Corte = 'cabeza' | 'pies' | 'izquierda' | 'derecha'
export const CORTES: readonly Corte[] = ['cabeza', 'pies', 'izquierda', 'derecha']

export type Encuadre = { readonly persona: false } | { readonly persona: true; readonly cortes: readonly Corte[] }

/** Margen a cada borde (fracción de la imagen) y visibilidad mínima para dar un punto por visto. */
export const MARGEN = 0.03
export const VISIBLE = 0.5

const CABEZA = [0, 2, 5] // nariz, ojos
const PIES = [29, 30, 31, 32] // talones y puntas
const CUERPO = [11, 12, 23, 24, 25, 26, 27, 28] // hombros, caderas, rodillas, tobillos

const visto = (p: PuntoNorm | undefined) => !!p && (p.visibility ?? 0) >= VISIBLE && Number.isFinite(p.x) && Number.isFinite(p.y)

/** Si se ve a la persona entera en una imagen (los 33 puntos de MediaPipe, o null sin nadie). */
export function revisarEncuadre(puntos: readonly PuntoNorm[] | null): Encuadre {
  if (!puntos || puntos.length < 33) return { persona: false }
  // Hay alguien si se ve la mayor parte del tronco y las piernas.
  if (CUERPO.filter((i) => visto(puntos[i])).length < 4) return { persona: false }
  const cortes: Corte[] = []
  const dentroY = (p: PuntoNorm) => p.y >= MARGEN && p.y <= 1 - MARGEN
  if (!CABEZA.some((i) => visto(puntos[i]) && dentroY(puntos[i]!))) cortes.push('cabeza')
  if (!PIES.every((i) => visto(puntos[i]) && dentroY(puntos[i]!))) cortes.push('pies')
  const xs = [...CABEZA, ...PIES, ...CUERPO].map((i) => puntos[i]).filter((p): p is PuntoNorm => !!p && Number.isFinite(p.x))
  if (xs.some((p) => p.x < MARGEN)) cortes.push('izquierda')
  if (xs.some((p) => p.x > 1 - MARGEN)) cortes.push('derecha')
  return { persona: true, cortes }
}

export const enteraEn = (e: Encuadre | null): boolean => !!e && e.persona && e.cortes.length === 0

/** Lo que falta en una cámara, dicho («no se te ven los pies ni la cabeza»). */
function queFalta(e: Encuadre): string {
  if (!e.persona) return 'no te ve'
  const partes: string[] = []
  if (e.cortes.includes('cabeza')) partes.push('la cabeza')
  if (e.cortes.includes('pies')) partes.push('los pies')
  const lados = e.cortes.filter((c) => c === 'izquierda' || c === 'derecha')
  const conjuncion = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ni ${xs.at(-1)}` : xs[0]!)
  const ves = partes.length ? `no se ${partes.length > 1 || partes[0] === 'los pies' ? 'te ven' : 'te ve'} ${conjuncion(partes)}` : ''
  const corta = lados.length ? `te corta por ${lados.length === 2 ? 'los dos lados' : `la ${lados[0]} de la imagen`}` : ''
  return [ves, corta].filter(Boolean).join(' y ')
}

/**
 * La frase que se dice con lo de los dos móviles (`este` y `otro`; null si no se sabe todavía). Cuando todo está bien,
 * «Se te ve entero en los dos móviles».
 */
export function fraseEncuadre(este: Encuadre | null, otro: Encuadre | null): string {
  if (enteraEn(este) && enteraEn(otro)) return 'Se te ve entero en los dos móviles.'
  const partes: string[] = []
  if (este && !enteraEn(este)) partes.push(`En este móvil ${queFalta(este)}`)
  else if (este) partes.push('En este móvil se te ve entero')
  if (otro && !enteraEn(otro)) partes.push(`en el otro móvil ${queFalta(otro)}`)
  else if (otro) partes.push('en el otro se te ve entero')
  else partes.push('del otro móvil no sé nada todavía')
  const t = partes.join('; ')
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`
}

/** Para mandarlo al otro móvil y leerlo de él (campo a campo, lo desconocido se descarta). */
export function leerEncuadre(v: unknown): Encuadre | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (o.persona === false) return { persona: false }
  if (o.persona !== true || !Array.isArray(o.cortes)) return null
  const cortes = CORTES.filter((c) => (o.cortes as unknown[]).includes(c))
  return { persona: true, cortes }
}

/**
 * Un resultado se da por bueno cuando se repite (`VECES` comprobaciones seguidas iguales): un frame suelto mal detectado,
 * o la persona a medio entrar, no cambia lo que se dice.
 */
export const VECES = 2
export const igual = (a: Encuadre | null, b: Encuadre | null): boolean =>
  !!a && !!b && a.persona === b.persona && (!a.persona || (b.persona && a.cortes.join() === b.cortes.join()))
