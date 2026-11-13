/*
 * Una persona sintética que anda, vista de perfil (fase 9, D9 de docs/plan-fase-9.md): la verdad de los tests de la marcha.
 *
 * En el marco canónico de la vista (x hacia delante de la persona, y arriba; metros), la cadera va a `altura` del suelo y
 * avanza a `velocidad` (0 = en cinta). Cada pierna sigue unas curvas de marcha típicas en función de la fase del ciclo
 * (0 = su contacto inicial): la flexión de cadera, de rodilla y la flexión dorsal del tobillo; la otra pierna va medio ciclo
 * por detrás. Los ángulos siguen las convenciones del catálogo de perfil (flexión +), con el tronco vertical.
 *
 * La verdad de los eventos (`eventosVerdad`) sale del mismo criterio que la detección (el talón más adelantado y la punta
 * más atrasada respecto a la cadera, D1), buscado con un muestreo muy fino de las curvas: los tests comprueban que la
 * detección lo encuentra con los frames, el ruido, los huecos y el filtro de verdad.
 */
import type { Lado } from '../articulaciones/catalogo'

export interface OpcionesMarcha {
  /** Duración de la zancada (s). */
  readonly zancada: number
  /** Velocidad de avance de la cadera (m/s); 0 = en cinta. */
  readonly velocidad: number
  /** Fase de la pierna derecha en t = 0 (0–1). */
  readonly fase0: number
  /** Altura de la cadera (m). */
  readonly altura: number
  readonly muslo: number
  readonly pierna: number
}

export const MARCHA_DEFECTO: OpcionesMarcha = { zancada: 1.1, velocidad: 1.2, fase0: 0.3, altura: 0.9, muslo: 0.45, pierna: 0.43 }

/** Una campana en la fase (periódica: la distancia a su centro, dando la vuelta al ciclo). */
const gauss = (x: number, c: number, s: number) => {
  const d = ((((x - c) % 1) + 1.5) % 1) - 0.5
  return Math.exp(-((d / s) ** 2))
}

/** Ángulos de una pierna (grados) en la fase `f` (0–1) de su ciclo. */
export function angulosEnFase(f: number): { cadera: number; rodilla: number; tobillo: number } {
  const ph = ((f % 1) + 1) % 1
  // Cadera: flexionada en el contacto, extendida al final del apoyo.
  const cadera = 10 + 22 * Math.cos(2 * Math.PI * (ph - 0.02))
  // Rodilla: la pequeña flexión de la carga y la grande del balanceo (las dos con su vuelta a la extensión).
  const rodilla = 4 + 14 * gauss(ph, 0.14, 0.07) + 56 * gauss(ph, 0.72, 0.13)
  // Tobillo: flexión dorsal en el apoyo, plantar en el despegue.
  const tobillo = 6 * Math.sin(2 * Math.PI * (ph - 0.05)) - 16 * gauss(ph, 0.63, 0.06)
  return { cadera, rodilla, tobillo }
}

interface P {
  x: number
  y: number
}

const dir = (g: number): P => ({ x: Math.sin((g * Math.PI) / 180), y: -Math.cos((g * Math.PI) / 180) })
const mas = (p: P, g: number, l: number): P => {
  const d = dir(g)
  return { x: p.x + d.x * l, y: p.y + d.y * l }
}

/** Los puntos de las dos piernas en el instante `t` (marco canónico, metros). */
export function puntosMarcha(t: number, o: OpcionesMarcha = MARCHA_DEFECTO): { hombro: P } & Record<Lado, { cadera: P; rodilla: P; tobillo: P; talon: P; punta: P }> {
  const cadera = { x: o.velocidad * t, y: o.altura }
  const pierna = (fase: number) => {
    const a = angulosEnFase(fase)
    const muslo = a.cadera
    const tibia = muslo - a.rodilla
    const pie = tibia + 90 + a.tobillo
    const rodilla = mas(cadera, muslo, o.muslo)
    const tobillo = mas(rodilla, tibia, o.pierna)
    return { cadera, rodilla, tobillo, talon: mas(tobillo, pie + 180, 0.06), punta: mas(tobillo, pie, 0.17) }
  }
  const f = o.fase0 + t / o.zancada
  return { hombro: { x: cadera.x, y: cadera.y + 0.5 }, der: pierna(f), izq: pierna(f + 0.5) }
}

export interface EventoVerdad {
  readonly tipo: 'contacto' | 'despegue'
  readonly lado: Lado
  readonly t: number
}

/**
 * Los eventos de verdad entre `t0` y `t1`: los máximos del talón y los mínimos de la punta respecto a la cadera (en x)
 * que son el extremo de su zancada, buscados cada 0,1 ms. Los de menos de 0,4 zancadas de los
 * bordes no se dan (no se sabe si lo son).
 */
export function eventosVerdad(t0: number, t1: number, o: OpcionesMarcha = MARCHA_DEFECTO): EventoVerdad[] {
  const h = 1e-4
  const r: EventoVerdad[] = []
  for (const lado of ['der', 'izq'] as const) {
    const talon = (t: number) => {
      const q = puntosMarcha(t, o)
      return q[lado].talon.x - q[lado].cadera.x
    }
    const punta = (t: number) => {
      const q = puntosMarcha(t, o)
      return -(q[lado].punta.x - q[lado].cadera.x)
    }
    for (const [tipo, f] of [['contacto', talon], ['despegue', punta]] as const) {
      const n = Math.floor((t1 - t0) / h)
      const v = Array.from({ length: n + 1 }, (_, k) => f(t0 + k * h))
      // Solo los que son el extremo de su zancada (los máximos en ±0,4 zancadas; sin los bordes, que no se sabe).
      const ventana = Math.round((0.4 * o.zancada) / h)
      for (let k = ventana; k <= n - ventana; k++) {
        if (!(v[k]! > v[k - 1]! && v[k]! >= v[k + 1]!)) continue
        let esMax = true
        for (let j = k - ventana; j <= k + ventana && esMax; j++) if (v[j]! > v[k]!) esMax = false
        if (!esMax) continue
        // A 0,1 ms de paso la parábola ya no afina nada (y con los valores casi iguales, el redondeo la estropea).
        r.push({ tipo, lado, t: t0 + k * h })
      }
    }
  }
  return r.sort((x, y) => x.t - y.t)
}
