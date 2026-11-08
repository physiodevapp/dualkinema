/*
 * El monigote 3D (fase 6, paso 5): proyección ortográfica de la escena (los puntos del cuerpo, el suelo y las dos cámaras)
 * vista desde un azimut y una elevación que se cambian con el dedo, sin librería 3D (son 14 puntos y unas líneas). Lo que no
 * es dibujar va aquí: proyectar, encuadrar toda la toma de una vez (para que el monigote no salte de tamaño) y las líneas de
 * cada cámara (una pirámide con el vértice en su centro, hacia donde mira).
 */
import { vec3, type Vec3 } from '../geometria/vector'
import { centro, type Camara } from './camara'

/** Desde dónde se mira: azimut alrededor de la vertical (rad, 0 = desde +x, delante de la persona) y elevación sobre el suelo. */
export interface PuntoDeVista {
  readonly azimut: number
  readonly elevacion: number
}

export const VISTA_INICIAL: PuntoDeVista = { azimut: (-35 * Math.PI) / 180, elevacion: (15 * Math.PI) / 180 }
export const ELEVACION_MIN = (-5 * Math.PI) / 180
export const ELEVACION_MAX = (85 * Math.PI) / 180

/**
 * Un punto en la pantalla (u hacia la derecha, v hacia arriba, sin escala) y su profundidad (mayor = más cerca de quien
 * mira), con la proyección ortográfica desde `vista`.
 */
export function proyectarOrto(p: Vec3, vista: PuntoDeVista): { readonly u: number; readonly v: number; readonly prof: number } {
  const ca = Math.cos(vista.azimut)
  const sa = Math.sin(vista.azimut)
  const ce = Math.cos(vista.elevacion)
  const se = Math.sin(vista.elevacion)
  // Hacia quien mira: d = (ce·ca, ce·sa, se). Derecha de la pantalla: z × d normalizado = (−sa, ca, 0). Arriba: d × derecha.
  const u = -sa * p.x + ca * p.y
  const v = -se * ca * p.x - se * sa * p.y + ce * p.z
  const prof = ce * ca * p.x + ce * sa * p.y + se * p.z
  return { u, v, prof }
}

/** La escala y el centro que meten todos los `puntos` (finitos) en un lienzo de ancho × alto con un margen (px). */
export function encuadre(puntos: readonly Vec3[], vista: PuntoDeVista, ancho: number, alto: number, margen = 16): { readonly escala: number; readonly u0: number; readonly v0: number } {
  let [umin, umax, vmin, vmax] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const p of puntos) {
    if (![p.x, p.y, p.z].every(Number.isFinite)) continue
    const q = proyectarOrto(p, vista)
    umin = Math.min(umin, q.u)
    umax = Math.max(umax, q.u)
    vmin = Math.min(vmin, q.v)
    vmax = Math.max(vmax, q.v)
  }
  if (!Number.isFinite(umin)) return { escala: 1, u0: 0, v0: 0 }
  const escala = Math.min((ancho - 2 * margen) / Math.max(umax - umin, 1e-6), (alto - 2 * margen) / Math.max(vmax - vmin, 1e-6))
  return { escala, u0: (umin + umax) / 2, v0: (vmin + vmax) / 2 }
}

/** De la proyección a px del lienzo (y hacia abajo). */
export const aLienzo = (q: { readonly u: number; readonly v: number }, e: ReturnType<typeof encuadre>, ancho: number, alto: number) => ({
  x: ancho / 2 + (q.u - e.u0) * e.escala,
  y: alto / 2 - (q.v - e.v0) * e.escala,
})

/**
 * Las aristas de una cámara dibujada como pirámide: el vértice en su centro y la base a `tamano` delante, con la proporción
 * de su imagen. `aMundo` lleva cada punto del mundo de la calibración al de la escena (escala, suelo, marco).
 */
export function aristasCamara(c: Camara, ancho: number, alto: number, tamano: number, aMundo: (X: Vec3) => Vec3): (readonly [Vec3, Vec3])[] {
  const C = centro(c)
  // Del marco de la cámara al mundo: X = Rᵀ (Xc − t); para direcciones, Rᵀ·d.
  const dir = (x: number, y: number, z: number) => vec3(c.R[0] * x + c.R[3] * y + c.R[6] * z, c.R[1] * x + c.R[4] * y + c.R[7] * z, c.R[2] * x + c.R[5] * y + c.R[8] * z)
  const esquina = (sx: number, sy: number) => {
    const d = dir((sx * ancho) / 2 / c.f, (sy * alto) / 2 / c.f, 1)
    return vec3(C.x + d.x * tamano, C.y + d.y * tamano, C.z + d.z * tamano)
  }
  const base = [esquina(-1, -1), esquina(1, -1), esquina(1, 1), esquina(-1, 1)]
  const V = aMundo(C)
  const B = base.map(aMundo)
  return [...B.map((b) => [V, b] as const), ...B.map((b, i) => [b, B[(i + 1) % 4]!] as const)]
}

export type Encuadre2D = ReturnType<typeof encuadre>

/** Lo más cerca que se puede ir: la altura del cuerpo ocupa este número de veces el alto del lienzo. */
export const ZOOM_MAX_CUERPOS = 2
/** A partir de cuánto más cerca que el encuadre de la persona la vista sigue del todo a la pelvis. */
export const SEGUIR_DESDE = 1.5

/**
 * El encuadre con zoom del monigote. `escala` (px por unidad) va de la de `escena` (las cámaras y el suelo: lo más
 * alejado) a `escalaMax` (lo más cerca); `persona` es el de la persona en toda la toma (el de partida). Entre la escena y
 * la persona, el centro pasa de uno al otro; más cerca que la persona, va hacia la pelvis del frame (`pelvis`, ya
 * proyectada; sin ella, el de la persona) para que no se salga del recuadro al moverse.
 */
export function encuadreConZoom(escena: Encuadre2D, persona: Encuadre2D, pelvis: { readonly u: number; readonly v: number } | null, escala: number, escalaMax: number): Encuadre2D {
  const s = Math.min(Math.max(escala, escena.escala), Math.max(escalaMax, persona.escala, escena.escala))
  const mezcla = (a: Encuadre2D | { u0: number; v0: number }, b: { u0: number; v0: number }, t: number) => ({ u0: a.u0 + (b.u0 - a.u0) * t, v0: a.v0 + (b.v0 - a.v0) * t })
  if (s <= persona.escala) {
    const rango = Math.log(persona.escala / escena.escala)
    const t = rango > 1e-9 ? Math.log(s / escena.escala) / rango : 1
    return { escala: s, ...mezcla(escena, persona, Math.min(1, Math.max(0, t))) }
  }
  if (!pelvis) return { escala: s, u0: persona.u0, v0: persona.v0 }
  const t = Math.min(1, (s / persona.escala - 1) / (SEGUIR_DESDE - 1))
  return { escala: s, ...mezcla(persona, { u0: pelvis.u, v0: pelvis.v }, t) }
}

/** La escala más cercana: que `alturaCuerpo` (unidades de la escena) ocupe `ZOOM_MAX_CUERPOS` veces `alto` (px). */
export const escalaMaxima = (alturaCuerpo: number, alto: number): number => (alturaCuerpo > 0 ? (ZOOM_MAX_CUERPOS * alto) / alturaCuerpo : Infinity)
