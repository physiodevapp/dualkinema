/*
 * Una persona sintética de verdad conocida para probar el 3D (fase 6, «Pruebas» de docs/plan-fase-6.md): los 12 puntos
 * del modelo sin marcadores (hombros, caderas, rodillas, tobillos, talones y puntas) en 3D a lo largo del tiempo, con
 * las proporciones de Winter (Drillis y Contini) para una estatura, haciendo unos pasos por la zona, sentadillas y marcha
 * en el sitio, con los ángulos de cada instante conocidos. Mundo: z hacia arriba, suelo en z = 0, metros.
 */
import { vec3, type Vec3 } from '../geometria/vector'
import type { Lado as LadoPose } from '../articulaciones/catalogo'
import type { ParteCuerpo } from '../pose/puntos'

/** Proporciones de la estatura H (Winter, «Biomechanics and motor control of human movement», fig. 4.1). */
export const PROPORCIONES = {
  hombro: 0.818,
  cadera: 0.53,
  rodilla: 0.285,
  tobillo: 0.039,
  anchoCaderas: 0.191,
  anchoHombros: 0.259,
  pie: 0.152,
} as const

export interface ParametrosSinteticos {
  readonly estatura: number
  /** fps de la toma. */
  readonly fps: number
  /** Duración (s). */
  readonly duracion: number
}

/** Lo que pasa en cada instante: dónde está la pelvis, hacia dónde mira y los ángulos de cada pierna (rad). */
export interface EstadoSintetico {
  readonly pelvis: Vec3
  /** Hacia dónde mira la persona: ángulo en el plano horizontal desde +x (rad). */
  readonly rumbo: number
  /** Flexión de cadera (muslo hacia delante +), de rodilla (+) y del tronco hacia delante (+), por lado (rad). */
  readonly caderaFlex: Readonly<Record<LadoPose, number>>
  readonly rodillaFlex: Readonly<Record<LadoPose, number>>
  readonly troncoFlex: number
}

export type PuntosSinteticos = ReadonlyMap<`${ParteCuerpo}_${LadoPose}`, Vec3>

/**
 * El guion por defecto: 0–6 s, unos pasos por la zona (la pelvis da una vuelta de 0,6 m de radio mirando a la cámara);
 * 6–12 s, dos sentadillas (rodilla hasta 90°); 12–18 s, marcha en el sitio. Pensado para calibrar con lo del principio.
 */
export function estadoEn(t: number, H: number): EstadoSintetico {
  const alturaPelvis = PROPORCIONES.cadera * H
  if (t < 6) {
    const a = (2 * Math.PI * t) / 6
    const paso = Math.sin(4 * a) * 0.35
    return {
      pelvis: vec3(0.6 * Math.cos(a), 0.4 * Math.sin(a), alturaPelvis - 0.01),
      rumbo: Math.PI / 2 + 0.3 * Math.sin(a),
      caderaFlex: { der: paso, izq: -paso },
      rodillaFlex: { der: Math.max(0, paso) * 1.2 + 0.05, izq: Math.max(0, -paso) * 1.2 + 0.05 },
      troncoFlex: 0.05,
    }
  }
  if (t < 12) {
    const fase = (1 - Math.cos((2 * Math.PI * (t - 6)) / 3)) / 2 // 0 → 1 → 0 cada 3 s
    const rodilla = (Math.PI / 2) * fase
    const cadera = 0.95 * rodilla
    // Con los pies en el suelo, la pelvis baja lo que acortan muslo y pierna (aproximado: la pierna se inclina la mitad).
    const muslo = (PROPORCIONES.cadera - PROPORCIONES.rodilla) * H
    const pierna = (PROPORCIONES.rodilla - PROPORCIONES.tobillo) * H
    const z = PROPORCIONES.tobillo * H + pierna * Math.cos(rodilla - cadera) + muslo * Math.cos(cadera)
    return { pelvis: vec3(0, -0.2 * fase, z), rumbo: Math.PI / 2, caderaFlex: { der: cadera, izq: cadera }, rodillaFlex: { der: rodilla, izq: rodilla }, troncoFlex: 0.5 * fase }
  }
  const a = (2 * Math.PI * (t - 12)) / 1.2
  const sube = Math.max(0, Math.sin(a))
  const baja = Math.max(0, -Math.sin(a))
  return {
    pelvis: vec3(0, 0, alturaPelvis - 0.01),
    rumbo: Math.PI / 2,
    caderaFlex: { der: sube * 0.8, izq: baja * 0.8 },
    rodillaFlex: { der: sube * 1.2, izq: baja * 1.2 },
    troncoFlex: 0.03,
  }
}

/** Los 12 puntos de un estado (y los ángulos de verdad, que van en el propio estado). */
export function puntosDe(e: EstadoSintetico, H: number): PuntosSinteticos {
  const P = PROPORCIONES
  const delante = vec3(Math.cos(e.rumbo), Math.sin(e.rumbo), 0)
  // La derecha de la persona: mirando hacia `delante` con z arriba, delante × z.
  const derecha = vec3(delante.y, -delante.x, 0)
  const sumar = (a: Vec3, b: Vec3, k = 1) => vec3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k)
  // Un segmento que cuelga hacia abajo girado `ang` hacia delante.
  const haciaAbajo = (ang: number) => vec3(delante.x * Math.sin(ang), delante.y * Math.sin(ang), -Math.cos(ang))
  const r = new Map<`${ParteCuerpo}_${LadoPose}`, Vec3>()
  const tronco = vec3(delante.x * Math.sin(e.troncoFlex), delante.y * Math.sin(e.troncoFlex), Math.cos(e.troncoFlex))
  const medioHombros = sumar(e.pelvis, tronco, (P.hombro - P.cadera) * H)
  for (const lado of ['der', 'izq'] as const) {
    const s = lado === 'der' ? 1 : -1
    const cadera = sumar(e.pelvis, derecha, (s * P.anchoCaderas * H) / 2)
    const rodilla = sumar(cadera, haciaAbajo(e.caderaFlex[lado]), (P.cadera - P.rodilla) * H)
    // La pierna: el muslo girado hacia atrás lo que se flexiona la rodilla.
    const tobillo = sumar(rodilla, haciaAbajo(e.caderaFlex[lado] - e.rodillaFlex[lado]), (P.rodilla - P.tobillo) * H)
    const talon = sumar(sumar(tobillo, delante, -0.25 * P.pie * H), vec3(0, 0, -P.tobillo * H * 0.8))
    const punta = sumar(talon, delante, P.pie * H)
    r.set(`hombro_${lado}`, sumar(medioHombros, derecha, (s * P.anchoHombros * H) / 2))
    r.set(`cadera_${lado}`, cadera)
    r.set(`rodilla_${lado}`, rodilla)
    r.set(`tobillo_${lado}`, tobillo)
    r.set(`talon_${lado}`, talon)
    r.set(`punta_${lado}`, punta)
  }
  return r
}

/** Instantes de la toma (s), a `fps` exactos. */
export const instantes = (p: ParametrosSinteticos): number[] => Array.from({ length: Math.floor(p.duracion * p.fps) }, (_, k) => k / p.fps)

/** Ruido gaussiano reproducible (Box–Muller sobre un generador lineal congruente). */
export function generadorRuido(semilla = 1): () => number {
  let s = semilla >>> 0 || 1
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s + 1) / 4294967297
  }
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())
}
