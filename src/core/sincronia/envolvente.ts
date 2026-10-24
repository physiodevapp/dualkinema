/*
 * Envolvente del audio para la sincronía (fase 3, paso 5; §3 de docs/plan-fase-3.md).
 *
 * No se correlaciona la onda: los dos móviles están a distancias distintas de la palmada, con su micrófono y su
 * reverberación, y la fase de cada onda no se parece. Sí se parece cuándo llega la energía. Por eso:
 *
 *   1. mono (media de los canales);
 *   2. sin graves (Butterworth paso alto de 2.º orden a CORTE_GRAVES_HZ): golpes al móvil, zumbidos, viento;
 *   3. energía (media del cuadrado) en bloques de 1/TASA_ENVOLVENTE s, suavizada antes de bajar de tasa: cada
 *      muestra se reparte entre los bloques cercanos con una B-spline cuadrática de ANCHO_SUAVIZADO bloques. Con
 *      bloques sin solape, el mismo golpe corrido una fracción de bloque daba otra envolvente (aliasing) y el desfase
 *      se desviaba hasta 0,4 ms; así, menos de 0,1 ms con señales sintéticas;
 *   4. la subida de esa energía (parte positiva de la diferencia entre bloques): una palmada es una subida brusca, y
 *      el ruido de fondo constante, o una caída, no suben.
 *
 * Energía y no amplitud: realza los sonidos fuertes frente al ruido de fondo (con señales sintéticas, aguanta el
 * doble de ruido). La ganancia de cada micrófono escala toda la señal y la ponderación de fase de
 * `gccPhat.ts` la quita.
 *
 * El tiempo es el del vídeo: la primera muestra de audio no tiene por qué estar en 0 ni en el instante del primer
 * frame, así que la envolvente guarda el instante de su primera muestra (`inicio`) y el bloque k está en
 * inicio + k / tasa.
 *
 * Cada muestra se coloca contando muestras desde la primera, no con el instante de cada trozo (que el contenedor
 * redondea, normalmente al microsegundo): solo un salto de más de SALTO_S entre lo esperado y lo que dice el trozo se
 * toma como un hueco en la pista.
 *
 * Se calcula sobre la marcha (`anadir` con cada trozo decodificado) para no tener que guardar el audio crudo.
 */

/** Muestras por segundo de la envolvente: bloques de 0,5 ms. */
export const TASA_ENVOLVENTE = 2000

/** Ancho de la B-spline que suaviza la energía, en bloques (soporte de 1,5 · ancho a cada lado: ±1,5 ms). */
export const ANCHO_SUAVIZADO = 2

/** Corte del paso alto que quita los graves (Hz). */
export const CORTE_GRAVES_HZ = 150

/** Lo que se analiza de cada vídeo desde su primera muestra de audio (s): la palmada suele estar al principio. */
export const DURACION_ANALIZADA_S = 60

/**
 * Lo que se ignora al principio (s): el paso alto arranca con un transitorio y el micrófono a veces da un chasquido al
 * empezar a grabar. Si contaran, los arranques de los dos vídeos se alinearían entre sí.
 */
export const ARRANQUE_IGNORADO_S = 0.1

/** Diferencia entre el instante de un trozo y el esperado a partir de la cual es un hueco en la pista (s). */
export const SALTO_S = 0.001

export interface Envolvente {
  /** Instante de la primera muestra (s de vídeo). */
  readonly inicio: number
  /** Muestras por segundo. */
  readonly tasa: number
  /** Subida de la energía de cada bloque (≥ 0). */
  readonly senal: Float64Array
}

/** Media de los canales (cada uno, un plano de muestras). */
export function mezclarMono(canales: readonly ArrayLike<number>[]): Float64Array {
  const n = canales[0]?.length ?? 0
  const mono = new Float64Array(n)
  for (const c of canales) {
    if (c.length !== n) throw new Error('Los canales deben tener las mismas muestras.')
    for (let i = 0; i < n; i++) mono[i] = mono[i]! + c[i]!
  }
  if (canales.length > 1) for (let i = 0; i < n; i++) mono[i] = mono[i]! / canales.length
  return mono
}

export interface OpcionesEnvolvente {
  readonly tasa?: number
  readonly corteGraves?: number
  readonly duracion?: number
}

export class CalculoEnvolvente {
  private readonly tasa: number
  private readonly corteGraves: number
  private readonly bloques: number
  /** Suma ponderada de y² y de los pesos de cada bloque. */
  private readonly energia: Float64Array
  private readonly cuenta: Float64Array
  private inicio: number | null = null
  private tasaAudio = 0
  /** Índice (desde la primera muestra) de la siguiente muestra que se espera. */
  private siguiente = 0
  /** Bloque de la última muestra colocada. */
  private ultimo = -1
  // Paso alto (forma directa I): coeficientes y estado.
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(opciones: OpcionesEnvolvente = {}) {
    this.tasa = opciones.tasa ?? TASA_ENVOLVENTE
    this.corteGraves = opciones.corteGraves ?? CORTE_GRAVES_HZ
    this.bloques = Math.round((opciones.duracion ?? DURACION_ANALIZADA_S) * this.tasa)
    this.energia = new Float64Array(this.bloques)
    this.cuenta = new Float64Array(this.bloques)
  }

  /** Ya se ha llegado a `duracion`: lo que se añada después no cuenta. */
  get completo(): boolean {
    return this.ultimo >= this.bloques - 1
  }

  /** Añade un trozo de audio mono que empieza en `inicio` (s de vídeo), a `tasaAudio` muestras por segundo. */
  anadir(muestras: ArrayLike<number>, tasaAudio: number, inicio: number): void {
    if (!(tasaAudio > 0) || !Number.isFinite(inicio)) throw new Error('Trozo de audio no válido.')
    if (this.inicio === null) {
      this.inicio = inicio
      this.disenarPasoAlto(tasaAudio)
    } else if (tasaAudio !== this.tasaAudio) {
      throw new Error('La tasa de muestreo del audio cambia a mitad de la pista.')
    }
    const esperado = this.inicio + this.siguiente / tasaAudio
    if (Math.abs(inicio - esperado) > SALTO_S) this.siguiente = Math.round((inicio - this.inicio) * tasaAudio)
    const primera = this.siguiente
    this.siguiente += muestras.length
    const bloques = this.bloques
    for (let i = 0; i < muestras.length; i++) {
      // Posición en bloques; el centro del bloque k está en k + 0,5.
      const p = ((primera + i) * this.tasa) / tasaAudio
      if (p >= bloques) break
      const x = muestras[i]!
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
      this.x2 = this.x1
      this.x1 = x
      this.y2 = this.y1
      this.y1 = y
      if (p < 0) continue // anterior a la primera muestra: no se coloca.
      // B-spline cuadrática de ANCHO_SUAVIZADO bloques: la muestra se reparte entre los bloques cercanos (pesos que
      // suman 1).
      const desde = Math.max(0, Math.ceil(p - 0.5 - 1.5 * ANCHO_SUAVIZADO))
      const hasta = Math.min(bloques - 1, Math.floor(p - 0.5 + 1.5 * ANCHO_SUAVIZADO))
      for (let b = desde; b <= hasta; b++) {
        const w = bspline2((p - b - 0.5) / ANCHO_SUAVIZADO) / ANCHO_SUAVIZADO
        if (w <= 0) continue
        this.energia[b] = this.energia[b]! + w * y * y
        this.cuenta[b] = this.cuenta[b]! + w
      }
      this.ultimo = Math.max(this.ultimo, Math.floor(p))
    }
  }

  /** La envolvente de lo añadido; null si no se añadió nada. */
  terminar(): Envolvente | null {
    if (this.inicio === null) return null
    const n = this.ultimo + 1
    const senal = new Float64Array(n)
    const ignorados = Math.ceil(ARRANQUE_IGNORADO_S * this.tasa)
    let anterior = NaN
    for (let k = 0; k < n; k++) {
      const c = this.cuenta[k]!
      // Un bloque sin muestras (un hueco en la pista) repite la energía anterior: no sube.
      const energia = c > 0 ? this.energia[k]! / c : anterior
      if (k >= ignorados && Number.isFinite(anterior) && Number.isFinite(energia)) senal[k] = Math.max(0, energia - anterior)
      anterior = energia
    }
    return { inicio: this.inicio, tasa: this.tasa, senal }
  }

  private disenarPasoAlto(fs: number): void {
    this.tasaAudio = fs
    const corte = Math.min(this.corteGraves, 0.4 * fs)
    const k = Math.tan((Math.PI * corte) / fs)
    const k2 = k * k
    const n = 1 / (1 + Math.SQRT2 * k + k2)
    this.b0 = n
    this.b1 = -2 * n
    this.b2 = n
    this.a1 = 2 * (k2 - 1) * n
    this.a2 = (1 - Math.SQRT2 * k + k2) * n
  }
}

/** B-spline cuadrática centrada (soporte de −1,5 a 1,5, área 1). */
function bspline2(u: number): number {
  const a = Math.abs(u)
  if (a < 0.5) return 0.75 - a * a
  if (a < 1.5) return 0.5 * (1.5 - a) * (1.5 - a)
  return 0
}

/** Envolvente de una señal mono entera (para los tests y para quien ya tenga todo el audio). */
export function envolvente(muestras: ArrayLike<number>, tasaAudio: number, inicio = 0, opciones?: OpcionesEnvolvente): Envolvente | null {
  const calculo = new CalculoEnvolvente(opciones)
  calculo.anadir(muestras, tasaAudio, inicio)
  return calculo.terminar()
}
