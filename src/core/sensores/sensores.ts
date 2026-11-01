/*
 * Los sensores del móvil durante una grabación (fase 6, paso 1; D1 de docs/plan-fase-6.md): el acelerómetro da la
 * vertical de la cámara (para el 3D calibrado con la persona) y, con el giróscopo, si el móvil se ha movido durante la
 * toma (entonces no vale para 3D). No se guardan las muestras: un resumen por ventanas de 1 s, que va en el JSON de
 * dualkinema del MP4 (`grabacion/metadatos.ts`).
 *
 * Ejes del aparato (los de `DeviceMotionEvent`, fijos al móvil en su orientación natural, de pie): x hacia la derecha de
 * la pantalla, y hacia arriba, z saliendo de la pantalla hacia quien la mira. `accelerationIncludingGravity` en reposo
 * apunta **hacia arriba** (la reacción a la gravedad): de pie, (0, +9,8, 0); tumbado boca arriba, (0, 0, +9,8).
 *
 * Ejes de la cámara trasera (los de la imagen tal como se ve, y los del 3D de la fase 6): x hacia la derecha de la
 * imagen, y hacia abajo de la imagen, z hacia donde mira la cámara (sale por la espalda del móvil).
 */
import { vec3, type Vec3 } from '../geometria/vector'

/** Duración de cada ventana del resumen (s). */
export const VENTANA_S = 1

/** El resumen de una ventana de 1 s. */
export interface VentanaSensores {
  /** Inicio de la ventana en el tiempo del vídeo (s; negativa antes de empezar a grabar, durante la cuenta atrás). */
  readonly t: number
  /** Muestras en la ventana. */
  readonly n: number
  /** Media de la aceleración con gravedad, en ejes del aparato (m/s²). */
  readonly g: readonly [number, number, number]
  /** Desviación típica del módulo de la aceleración con gravedad (m/s²): sacudidas. */
  readonly de: number
  /** Giro máximo en la ventana (°/s, módulo de `rotationRate`); null si el móvil no lo da. */
  readonly giroMax: number | null
}

/** Lo que se guarda de los sensores con cada grabación. */
export interface Sensores {
  /** Giro de la pantalla al empezar (°, `screen.orientation.angle`): de él depende cómo se ve la imagen respecto al aparato. */
  readonly pantalla: 0 | 90 | 180 | 270
  /** Si la pantalla giró durante la grabación (la imagen deja de casar con los ejes del principio). */
  readonly giroPantalla: boolean
  readonly ventanas: readonly VentanaSensores[]
}

export const ANGULOS_PANTALLA = [0, 90, 180, 270] as const

/** El ángulo de la pantalla redondeado a uno de los cuatro (cualquier otro valor, 0). */
export function anguloPantalla(a: number): Sensores['pantalla'] {
  const r = ((Math.round(a / 90) * 90) % 360 + 360) % 360
  return (ANGULOS_PANTALLA as readonly number[]).includes(r) ? (r as Sensores['pantalla']) : 0
}

/**
 * Junta las muestras de `devicemotion` en ventanas de `VENTANA_S`, contadas desde el origen (el tiempo 0 del vídeo, en el
 * reloj de la página). Lógica pura: el navegador le pasa cada muestra.
 */
export class AcumuladorSensores {
  private readonly ventanas = new Map<number, { n: number; sx: number; sy: number; sz: number; sm: number; sm2: number; giro: number | null }>()
  private pantallaInicial: Sensores['pantalla'] | null = null
  private giroPantalla = false

  // Muestras que llegan antes de saber el origen (se preparan los sensores antes de arrancar la grabación).
  private pendientes: Parameters<AcumuladorSensores['anadir']>[] = []

  /** `origenMs`: el tiempo 0 del vídeo en el reloj de la página; si aún no se sabe, se fija después (`fijarOrigen`). */
  constructor(private origenMs: number | null = null) {}

  /** Fija el tiempo 0 del vídeo (ms, reloj de la página) y coloca lo que había llegado antes. */
  fijarOrigen(origenMs: number) {
    this.origenMs = origenMs
    const p = this.pendientes
    this.pendientes = []
    for (const m of p) this.anadir(...m)
  }

  /** Una muestra: instante en el reloj de la página (ms), aceleración con gravedad (m/s²) y giro (°/s) si lo hay. */
  anadir(tMs: number, ax: number, ay: number, az: number, giro: { alpha: number; beta: number; gamma: number } | null) {
    if (![tMs, ax, ay, az].every(Number.isFinite)) return
    if (this.origenMs === null) {
      this.pendientes.push([tMs, ax, ay, az, giro])
      return
    }
    const k = Math.floor((tMs - this.origenMs) / 1000 / VENTANA_S)
    let v = this.ventanas.get(k)
    if (!v) {
      v = { n: 0, sx: 0, sy: 0, sz: 0, sm: 0, sm2: 0, giro: null }
      this.ventanas.set(k, v)
    }
    const m = Math.hypot(ax, ay, az)
    v.n++
    v.sx += ax
    v.sy += ay
    v.sz += az
    v.sm += m
    v.sm2 += m * m
    if (giro && [giro.alpha, giro.beta, giro.gamma].every(Number.isFinite)) {
      const g = Math.hypot(giro.alpha, giro.beta, giro.gamma)
      v.giro = Math.max(v.giro ?? 0, g)
    }
  }

  /** El giro de la pantalla en cada momento: el primero se guarda y cualquier cambio después se anota. */
  pantalla(angulo: number) {
    const a = anguloPantalla(angulo)
    if (this.pantallaInicial === null) this.pantallaInicial = a
    else if (a !== this.pantallaInicial) this.giroPantalla = true
  }

  /** El resumen desde `desdeS` (s del vídeo) hasta `hastaS`; null si no ha llegado ninguna muestra. */
  resumen(desdeS = -Infinity, hastaS = Infinity): Sensores | null {
    const ventanas: VentanaSensores[] = [...this.ventanas]
      .filter(([k]) => k * VENTANA_S >= desdeS - VENTANA_S && k * VENTANA_S < hastaS)
      .sort(([a], [b]) => a - b)
      .map(([k, v]) => {
        const media = v.sm / v.n
        const varianza = Math.max(0, v.sm2 / v.n - media * media)
        return {
          t: k * VENTANA_S,
          n: v.n,
          g: [redondear(v.sx / v.n, 3), redondear(v.sy / v.n, 3), redondear(v.sz / v.n, 3)] as const,
          de: redondear(Math.sqrt(varianza), 3),
          giroMax: v.giro === null ? null : redondear(v.giro, 1),
        }
      })
    if (!ventanas.length) return null
    return { pantalla: this.pantallaInicial ?? 0, giroPantalla: this.giroPantalla, ventanas }
  }
}

const redondear = (x: number, decimales: number) => Math.round(x * 10 ** decimales) / 10 ** decimales

/**
 * Un vector de los ejes del aparato a los de la cámara trasera, con la pantalla girada `pantalla` grados (en sentido
 * antihorario, el de `screen.orientation.angle`: con 90, la parte de arriba del móvil queda a la izquierda). La imagen
 * del vídeo va con la pantalla (Android entrega los frames girados con ella): primero se gira el vector al marco de la
 * pantalla (x a la derecha, y hacia arriba, tal como se ve), y de ahí a la cámara (y hacia abajo, z hacia atrás del
 * móvil). **Pendiente de validar con vídeos** que la imagen siga a la pantalla en todos los móviles.
 */
export function aEjesCamara(v: readonly [number, number, number], pantalla: Sensores['pantalla']): Vec3 {
  const th = (pantalla * Math.PI) / 180
  const c = Math.round(Math.cos(th))
  const s = Math.round(Math.sin(th))
  const xs = v[0] * c - v[1] * s
  const ys = v[0] * s + v[1] * c
  // (+ 0: sin ceros negativos)
  return vec3(xs + 0, -ys + 0, -v[2] + 0)
}

/** Una ventana es «quieta» si no hay sacudidas ni giro apreciables. */
export const DE_QUIETO = 0.15 // m/s²
export const GIRO_QUIETO = 3 // °/s
/** La vertical cambia más que esto entre el principio y el final: el móvil se ha movido (°). */
export const CAMBIO_VERTICAL_MAX = 1

const esQuieta = (v: VentanaSensores) => v.n > 0 && v.de <= DE_QUIETO && (v.giroMax === null || v.giroMax <= GIRO_QUIETO)

/** Dirección de la gravedad (hacia abajo, unitaria) en ejes de la cámara a partir de unas ventanas; null sin ninguna. */
function abajoDe(ventanas: readonly VentanaSensores[], pantalla: Sensores['pantalla']): Vec3 | null {
  let sx = 0
  let sy = 0
  let sz = 0
  let n = 0
  for (const v of ventanas) {
    sx += v.g[0] * v.n
    sy += v.g[1] * v.n
    sz += v.g[2] * v.n
    n += v.n
  }
  if (!n) return null
  // La aceleración con gravedad en reposo apunta hacia arriba: abajo es la opuesta.
  const c = aEjesCamara([-sx / n, -sy / n, -sz / n], pantalla)
  const m = Math.hypot(c.x, c.y, c.z)
  return m > 0 ? vec3(c.x / m, c.y / m, c.z / m) : null
}

/**
 * La vertical de la cámara: la dirección hacia abajo, unitaria, en ejes de la cámara, con la media de las ventanas
 * quietas de la grabación (desde el tiempo 0; si no hay ninguna quieta, de todas). null sin datos.
 */
export function verticalCamara(s: Sensores): Vec3 | null {
  const grabando = s.ventanas.filter((v) => v.t >= 0)
  const base = grabando.length ? grabando : s.ventanas
  const quietas = base.filter(esQuieta)
  return abajoDe(quietas.length ? quietas : base, s.pantalla)
}

/**
 * La inclinación de la cámara a partir de su vertical (°): `cabeceo`, cuánto mira hacia abajo (+) o hacia arriba (−)
 * respecto al horizonte; `alabeo`, cuánto está girada la imagen alrededor del eje de la cámara (+ si la gravedad, vista
 * en la imagen, apunta algo hacia la derecha: el horizonte sube hacia la derecha).
 */
export function inclinacion(abajo: Vec3): { readonly cabeceo: number; readonly alabeo: number } {
  const g = (r: number) => (r * 180) / Math.PI
  // Mirando hacia abajo, la gravedad tiene componente hacia delante (+z): cabeceo +.
  const cabeceo = g(Math.asin(Math.max(-1, Math.min(1, abajo.z))))
  const alabeo = g(Math.atan2(abajo.x, abajo.y))
  return { cabeceo, alabeo }
}

/** Ángulo entre dos direcciones (°). */
const anguloEntre = (a: Vec3, b: Vec3) =>
  (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))))) * 180) / Math.PI

export type MotivoMovido = 'sacudidas' | 'vertical' | 'pantalla'

/**
 * Si el móvil se ha movido durante la grabación (desde el tiempo 0): una ventana con sacudidas o giro (más de
 * `DE_QUIETO` o `GIRO_QUIETO`), la vertical que cambia más de `CAMBIO_VERTICAL_MAX` entre los primeros y los últimos
 * 3 s, o la pantalla que gira. Con el móvil apoyado, nada de eso pasa. Devuelve los motivos y los instantes (s) de las
 * ventanas movidas; null si no se ha movido.
 */
export function movimiento(s: Sensores): { readonly motivos: readonly MotivoMovido[]; readonly instantes: readonly number[]; readonly cambioVertical: number | null } | null {
  const grabando = s.ventanas.filter((v) => v.t >= 0)
  const movidas = grabando.filter((v) => !esQuieta(v))
  const principio = abajoDe(grabando.filter((v) => v.t < 3 && esQuieta(v)), s.pantalla)
  const finT = grabando.length ? grabando[grabando.length - 1]!.t : 0
  const final = abajoDe(grabando.filter((v) => v.t > finT - 3 && esQuieta(v)), s.pantalla)
  const cambioVertical = principio && final ? anguloEntre(principio, final) : null
  const motivos: MotivoMovido[] = []
  if (movidas.length) motivos.push('sacudidas')
  if (cambioVertical !== null && cambioVertical > CAMBIO_VERTICAL_MAX) motivos.push('vertical')
  if (s.giroPantalla) motivos.push('pantalla')
  return motivos.length ? { motivos, instantes: movidas.map((v) => v.t), cambioVertical } : null
}

/** Lee el resumen de los sensores del JSON del MP4; null si no hay o no se entiende. */
export function leerSensores(v: unknown): Sensores | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.pantalla !== 'number' || !(ANGULOS_PANTALLA as readonly number[]).includes(o.pantalla) || !Array.isArray(o.ventanas)) return null
  const ventanas: VentanaSensores[] = []
  for (const w of o.ventanas as unknown[]) {
    if (typeof w !== 'object' || w === null) return null
    const x = w as Record<string, unknown>
    const g = x.g
    if (!finito(x.t) || !Number.isInteger(x.n) || (x.n as number) < 1 || !Array.isArray(g) || g.length !== 3 || !g.every(finito) || !finito(x.de) || x.de < 0) return null
    if (x.giroMax !== null && !(finito(x.giroMax) && x.giroMax >= 0)) return null
    ventanas.push({ t: x.t, n: x.n as number, g: [g[0] as number, g[1] as number, g[2] as number] as const, de: x.de, giroMax: x.giroMax as number | null })
  }
  return { pantalla: o.pantalla as Sensores['pantalla'], giroPantalla: o.giroPantalla === true, ventanas }
}

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
