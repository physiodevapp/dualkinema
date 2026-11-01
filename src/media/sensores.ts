import { AcumuladorSensores, type Sensores } from '../core/sensores/sensores'

/*
 * Lee el acelerómetro y el giróscopo del móvil mientras se graba (fase 6, paso 1; D1 de docs/plan-fase-6.md) y los
 * resume por segundo (`core/sensores/`). `devicemotion` no pide permiso en Chrome para Android (sí en un contexto
 * seguro) y su `timeStamp` va en el reloj de la página, el mismo que el de la grabadora. Sin sensores (un ordenador),
 * no llega nada y el resumen es null.
 */

/** Lo que se lee antes del tiempo 0 que interesa (s): la cuenta atrás y el móvil ya apoyado. */
const ANTES_S = 5

export class RegistroSensores {
  private readonly acumulador = new AcumuladorSensores()
  private readonly alMovimiento = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (!a || a.x === null || a.y === null || a.z === null) return
    const r = e.rotationRate
    const giro = r && r.alpha !== null && r.beta !== null && r.gamma !== null ? { alpha: r.alpha, beta: r.beta, gamma: r.gamma } : null
    this.acumulador.anadir(e.timeStamp, a.x, a.y, a.z, giro)
  }
  private readonly alGirar = () => this.acumulador.pantalla(anguloActual())
  private activo = false

  /** Empieza a leer (antes de saber el tiempo 0: se fija al arrancar la grabación). */
  empezar() {
    if (this.activo || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return
    this.activo = true
    this.acumulador.pantalla(anguloActual())
    window.addEventListener('devicemotion', this.alMovimiento)
    screen.orientation?.addEventListener('change', this.alGirar)
  }

  /** El tiempo 0 del vídeo en el reloj de la página (ms). */
  fijarOrigen(origenMs: number) {
    this.acumulador.fijarOrigen(origenMs)
  }

  /** Deja de leer y da el resumen (desde unos segundos antes del tiempo 0); null si no llegó nada. */
  detener(): Sensores | null {
    if (this.activo) {
      window.removeEventListener('devicemotion', this.alMovimiento)
      screen.orientation?.removeEventListener('change', this.alGirar)
      this.activo = false
    }
    return this.acumulador.resumen(-ANTES_S)
  }
}

function anguloActual(): number {
  return screen.orientation?.angle ?? 0
}
