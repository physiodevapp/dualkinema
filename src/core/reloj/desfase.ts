/*
 * Reloj común entre dos móviles (fase 4, paso 3; D7 de docs/plan-fase-4.md).
 *
 * Cada móvil cuenta el tiempo con su `performance.now()` (ms, monotónico; `Date.now()` puede saltar), con su propio
 * origen. Para programar un inicio a la vez hay que saber cuánto va por delante el reloj del otro: el desfase
 *
 *   reloj remoto = reloj local + desfase
 *
 * Se mide como en NTP, con intercambios de cuatro marcas: el local manda un ping en t1 (su reloj), el remoto lo recibe
 * en t2 y contesta en t3 (el suyo) y el local recibe la respuesta en t4 (el suyo). Con d₁, d₂ ≥ 0 los retardos de ida y
 * de vuelta (en tiempo real) y el desfase constante durante el intercambio:
 *
 *   t2 = t1 + d₁ + desfase  →  desfase ≤ t2 − t1
 *   t4 = t3 + d₂ − desfase  →  desfase ≥ t3 − t4
 *
 * Así que el desfase real está en el intervalo [t3 − t4, t2 − t1], sin suponer nada de la red. Su centro es el θ de NTP
 * ((t2 − t1) + (t3 − t4)) / 2 y su semiancho, la mitad del retardo de ida y vuelta δ = (t4 − t1) − (t3 − t2). Una
 * marca tardía en el remoto (t2 después de recibir, t3 antes de enviar de verdad) solo cuenta como más retardo: el
 * intervalo sigue siendo cierto.
 *
 * Con varios intercambios, el desfase está en todos sus intervalos a la vez: en su **intersección**, que es la cota
 * (más estrecha cuanto más rápidos y variados son los intercambios). Esto vale mientras el desfase no cambie en la
 * ventana: la deriva entre relojes (10–100 ppm) mueve como mucho 0,3 ms en unos segundos; para ventanas largas, ver
 * `deriva.ts`. Si la intersección queda vacía (marcas incoherentes o deriva), se da la mediana de los intercambios más
 * rápidos con una cota que cubre todos sus intervalos.
 *
 * Todo en ms. El reloj común es solo para programar y anotar: el análisis sigue usando el tiempo del vídeo.
 */

/** Las cuatro marcas de un intercambio (ms): t1 y t4 del reloj local, t2 y t3 del remoto. */
export interface Intercambio {
  readonly t1: number
  readonly t2: number
  readonly t3: number
  readonly t4: number
}

/** θ de NTP: el centro del intervalo del desfase. */
export const desfaseDe = (i: Intercambio): number => (i.t2 - i.t1 + (i.t3 - i.t4)) / 2

/** Retardo de ida y vuelta, sin lo que tardó el remoto en contestar. */
export const retardoDe = (i: Intercambio): number => i.t4 - i.t1 - (i.t3 - i.t2)

/** Donde tiene que estar el desfase real según este intercambio. */
export const intervaloDe = (i: Intercambio): { readonly min: number; readonly max: number } => ({ min: i.t3 - i.t4, max: i.t2 - i.t1 })

/** Un intercambio utilizable: marcas finitas, cada reloj hacia delante y retardo no negativo. */
export const esValido = (i: Intercambio): boolean =>
  [i.t1, i.t2, i.t3, i.t4].every(Number.isFinite) && i.t4 >= i.t1 && i.t3 >= i.t2 && retardoDe(i) >= 0

/** Instante local (ms) al que se refiere un intercambio: la mitad entre envío y respuesta. */
export const instanteDe = (i: Intercambio): number => (i.t1 + i.t4) / 2

/** Intercambios más rápidos que se usan en la mediana de respaldo (fracción del total, al menos MINIMO_RESPALDO). */
export const FRACCION_RESPALDO = 0.25
export const MINIMO_RESPALDO = 3

export interface EstimacionReloj {
  /** reloj remoto − reloj local (ms). */
  readonly desfase: number
  /** El desfase real está en desfase ± cota (ms). */
  readonly cota: number
  /** intersección: cota rigurosa; mediana: las marcas no casaban (se cubre a todos los intercambios rápidos). */
  readonly metodo: 'interseccion' | 'mediana'
  /** Intercambios válidos usados. */
  readonly intercambios: number
  /** El más rápido (ms). */
  readonly retardoMinimo: number
  /** Instante local (ms) al que se refiere: la media de los de los intercambios. */
  readonly instante: number
}

const mediana = (xs: readonly number[]): number => {
  const o = [...xs].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

/** El desfase entre los dos relojes a partir de una ventana de intercambios; null si ninguno es válido. */
export function estimarDesfase(lista: readonly Intercambio[]): EstimacionReloj | null {
  const validos = lista.filter(esValido)
  if (validos.length === 0) return null
  const retardos = validos.map(retardoDe)
  const retardoMinimo = Math.min(...retardos)
  const instante = validos.reduce((s, i) => s + instanteDe(i), 0) / validos.length
  let lo = -Infinity
  let hi = Infinity
  for (const i of validos) {
    const r = intervaloDe(i)
    lo = Math.max(lo, r.min)
    hi = Math.min(hi, r.max)
  }
  if (lo <= hi) {
    return { desfase: (lo + hi) / 2, cota: (hi - lo) / 2, metodo: 'interseccion', intercambios: validos.length, retardoMinimo, instante }
  }
  // Marcas que no casan: mediana de los más rápidos, con una cota que abarca todos sus intervalos.
  const rapidos = [...validos].sort((a, b) => retardoDe(a) - retardoDe(b)).slice(0, Math.max(MINIMO_RESPALDO, Math.ceil(validos.length * FRACCION_RESPALDO)))
  const desfase = mediana(rapidos.map(desfaseDe))
  let cota = 0
  for (const i of rapidos) {
    const r = intervaloDe(i)
    cota = Math.max(cota, desfase - r.min, r.max - desfase)
  }
  return { desfase, cota, metodo: 'mediana', intercambios: rapidos.length, retardoMinimo, instante }
}

/** Un instante del reloj local en el remoto, y al revés. */
export const aRemoto = (e: Pick<EstimacionReloj, 'desfase'>, tLocal: number): number => tLocal + e.desfase
export const aLocal = (e: Pick<EstimacionReloj, 'desfase'>, tRemoto: number): number => tRemoto - e.desfase

/**
 * Deriva que se supone como mucho entre dos móviles cuando no se ha medido (ppm). La pareja del usuario se separa unos
 * 140 ppm (tablet y Pixel 8): se deja margen.
 */
export const DERIVA_MAXIMA_PPM = 300

/**
 * La estimación llevada a otro instante local (ms), p. ej. el inicio programado de una grabación, que llega 5–15 s
 * después de la última medida y unos 15 s más tarde que el instante al que se refiere (la media de la ventana). Los
 * relojes se separan entretanto: la cota deja de ser rigurosa si no crece. Con la deriva medida, el desfase se lleva
 * por ella y la cota crece con 3 errores típicos; sin medir, con DERIVA_MAXIMA_PPM.
 */
export function desfaseEn(
  e: EstimacionReloj,
  instante: number,
  deriva: { readonly ppm: number; readonly errorPpm: number } | null,
): { readonly desfase: number; readonly cota: number } {
  const dt = instante - e.instante
  if (deriva && Number.isFinite(deriva.ppm) && Number.isFinite(deriva.errorPpm))
    return { desfase: e.desfase + deriva.ppm * 1e-6 * dt, cota: e.cota + 3 * deriva.errorPpm * 1e-6 * Math.abs(dt) }
  return { desfase: e.desfase, cota: e.cota + DERIVA_MAXIMA_PPM * 1e-6 * Math.abs(dt) }
}
