/*
 * Dónde está el relé de salas y el reloj de la app (fase 4, paso 4b).
 *
 * El relé es el de producción (`senal/`, desplegado desde `main`): las previsualizaciones de la app también lo usan. Solo
 * en localhost (pruebas e2e) se puede cambiar con `?senal=ws://…`, y desplazar el reloj con `?reloj=<ms>` para que dos
 * navegadores de la misma máquina tengan relojes distintos de desfase conocido. En una dirección pública los dos
 * parámetros se ignoran: un enlace no puede llevar a la app a otro relé.
 */

const RELE_PRODUCCION = 'wss://dualkinema-senal.edu-gamboa-rodriguez.workers.dev'

const enLocal = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

export function urlRele(): string {
  const p = new URLSearchParams(location.search).get('senal')
  if (p && enLocal() && /^wss?:\/\/[^/]+$/.test(p.replace(/\/+$/, ''))) return p.replace(/\/+$/, '')
  return RELE_PRODUCCION
}

const DESFASE_PRUEBA = (() => {
  if (typeof location === 'undefined' || !enLocal()) return 0
  const d = Number(new URLSearchParams(location.search).get('reloj'))
  return Number.isFinite(d) ? d : 0
})()

/** El reloj de la app para la sala (ms): `performance.now()`, monotónico (`Date.now()` puede saltar). */
export const ahora = (): number => performance.now() + DESFASE_PRUEBA
