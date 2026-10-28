/*
 * Tramos sin persona que se pueden recuperar hacia atrás (fase 5, paso 1). En modo vídeo, el modelo sin marcadores busca
 * a la persona en cada frame hasta encontrarla y después la sigue de un frame al siguiente. Si al principio no la
 * encuentra (en el vídeo real del usuario, 148 frames de pie quieto hasta que empieza a moverse), esos frames quedan sin
 * nadie aunque la persona esté ahí. Recorriéndolos hacia atrás desde el primer frame en que sí la encontró, el modelo
 * arranca sabiendo dónde está y la sigue.
 */

export interface TramoSinPersona {
  /** Primer y último frame sin persona del tramo. */
  readonly desde: number
  readonly hasta: number
  /** Frame con persona justo después (`hasta + 1`): desde él se recorre hacia atrás. */
  readonly ancla: number
}

/**
 * Tramos de frames procesados sin persona (`false`) seguidos de un frame con persona (`true`). Un frame sin procesar
 * (`undefined`, p. ej. tras «Parar») corta el tramo: no se sabe si había alguien.
 */
export function tramosParaRecuperar(detectado: ArrayLike<boolean | undefined>): TramoSinPersona[] {
  const r: TramoSinPersona[] = []
  let inicio = -1
  for (let i = 0; i < detectado.length; i++) {
    const d = detectado[i]
    if (d === false) {
      if (inicio < 0) inicio = i
    } else {
      if (d === true && inicio >= 0) r.push({ desde: inicio, hasta: i - 1, ancla: i })
      inicio = -1
    }
  }
  return r
}

/**
 * Bloques en que se decodifica un tramo para recorrerlo hacia atrás: el decodificador solo va hacia delante, así que se
 * decodifica un bloque de frames seguidos, se recorre del último al primero y se pasa al bloque anterior. El primer
 * bloque empieza en el ancla (que se procesa para que el modelo arranque sabiendo dónde está la persona). Cada bloque
 * `{ desde, hasta }` va de `hasta` a `desde`; no se solapan.
 */
export function bloquesHaciaAtras(t: TramoSinPersona, tamano: number): { desde: number; hasta: number }[] {
  const r: { desde: number; hasta: number }[] = []
  let hasta = t.ancla
  while (hasta >= t.desde) {
    const desde = Math.max(t.desde, hasta - tamano + 1)
    r.push({ desde, hasta })
    hasta = desde - 1
  }
  return r
}
