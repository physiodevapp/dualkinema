import type { OrientacionVista } from '../geometria/canonico'

/*
 * Reglas de la grabación doble (fase 4, paso 5; D8 de docs/plan-fase-4.md), puras para probarlas aparte.
 *
 * Cualquiera de los dos móviles programa el inicio en su reloj: `programar` con el instante y la duración. El otro lo
 * pasa al suyo con su estimación del desfase (reloj del otro = el mío + desfase → en el mío, inicio − desfase), comprueba
 * que puede (cámara, vista, reloj, espacio, tiempo para prepararse) y contesta `confirmar` o `cancelar`. Sin
 * confirmación a tiempo no graba ninguno. Cada uno para solo a su hora aunque se corte la conexión.
 */

/** Lo que tarda en prepararse la grabadora (códec, archivo): el inicio tiene que quedar al menos así de lejos. */
export const MARGEN_PREPARAR_MS = 1500
/** Cuánto espera quien programa la confirmación del otro. */
export const ESPERA_CONFIRMACION_MS = 3000
export const CUENTAS_ATRAS_S = [5, 10, 15] as const
/** null: hasta que alguien pare (con el máximo de siempre, 5 min). */
export const DURACIONES_S = [10, 20, 30, 60, null] as const
/** Espacio libre mínimo para aceptar una grabación (un minuto a 1080p son unos 55 MB). */
export const ESPACIO_MINIMO_MB = 300

/** Una vista de perfil y la otra de frente o de espaldas: la de perfil es la referencia, y la otra mide el FPPA. */
export const vistasCompatibles = (mia: OrientacionVista | null, otra: OrientacionVista | null): boolean =>
  mia !== null && otra !== null && mia.plano !== otra.plano

/** Un instante del reloj del otro en el mío, con mi estimación de cuánto va por delante el suyo. */
export const aMiReloj = (instanteDelOtro: number, desfaseOtro: number): number => instanteDelOtro - desfaseOtro

export type NoPreparado = 'sin-camara' | 'sin-vista' | 'sin-reloj' | 'sin-espacio' | 'tarde' | 'ocupado'

/** Por qué este móvil no puede grabar lo programado; null si puede. */
export function motivoNoPreparado(m: {
  readonly camara: boolean
  readonly vistas: boolean
  readonly reloj: boolean
  readonly libreMB: number | null
  readonly ocupado: boolean
  /** ms que faltan para el inicio, en mi reloj. */
  readonly faltan: number
}): NoPreparado | null {
  if (m.ocupado) return 'ocupado'
  if (!m.camara) return 'sin-camara'
  if (!m.vistas) return 'sin-vista'
  if (!m.reloj) return 'sin-reloj'
  if (m.libreMB !== null && m.libreMB < ESPACIO_MINIMO_MB) return 'sin-espacio'
  if (!(m.faltan >= MARGEN_PREPARAR_MS)) return 'tarde'
  return null
}
