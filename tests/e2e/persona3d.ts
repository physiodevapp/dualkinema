/*
 * La persona sintética del núcleo 3D (`core/tresd/sintetico.ts`) vista por dos móviles virtuales, para la e2e de
 * «Calibrar en 3D» (fase 6, paso 3): lo que mandaría el detector sin marcadores en cada frame de cada vídeo. La e2e lo
 * empaqueta con esbuild (es TypeScript del núcleo) y lo importa. Los dos móviles miran en horizontal (los vídeos sintéticos
 * no llevan acelerómetro: la app los supone así y lo avisa), a ±45° del frente de la persona, a 4 m del centro de la zona,
 * a 1,0 y 0,8 m de alto; B con un 5 % más de focal.
 */
import { vec3 } from '../../src/core/geometria/vector'
import { PUNTOS_POSE } from '../../src/core/pose/puntos'
import { camaraMirando, centro, focalPrevia, proyectar } from '../../src/core/tresd/camara'
import { estadoEn, puntosDe } from '../../src/core/tresd/sintetico'

export const ESTATURA = 1.75
/** Segundos de la persona sintética por segundo de vídeo: los 4 s de los vídeos recorren los pasos por la zona (0–6 s). */
const RITMO = 1.5

export function persona3d(tiemposA: readonly number[], tiemposB: readonly number[], ancho: number, alto: number) {
  const f = focalPrevia(ancho, alto)
  const d = 4 * Math.SQRT1_2
  const A = camaraMirando(vec3(d, d, 1.0), vec3(0, 0, 1.0), vec3(0, 0, 1), f, ancho, alto)
  const B = camaraMirando(vec3(-d, d, 0.8), vec3(0, 0, 0.8), vec3(0, 0, 1), f * 1.05, ancho, alto)
  const frames = (camara: typeof A, tiempos: readonly number[]) =>
    tiempos.map((t, indice) => {
      const X = puntosDe(estadoEn(t * RITMO, ESTATURA), ESTATURA)
      const puntos = PUNTOS_POSE.flatMap((p) => {
        const q = proyectar(camara, X.get(`${p.parte}_${p.lado}`)!)
        return [q.u, q.v, 0.98]
      })
      return { indice, t, puntos }
    })
  const [cA, cB] = [centro(A), centro(B)]
  /** Los ángulos de verdad en un instante del vídeo (°): la flexión de cada rodilla y la del tronco. */
  const angulos = (t: number) => {
    const e = estadoEn(t * RITMO, ESTATURA)
    const g = (r: number) => (r * 180) / Math.PI
    return { rodillaDer: g(e.rodillaFlex.der), rodillaIzq: g(e.rodillaFlex.izq), tronco: g(e.troncoFlex) }
  }
  return {
    angulos,
    framesA: frames(A, tiemposA),
    framesB: frames(B, tiemposB),
    verdad: { distancia: Math.hypot(cA.x - cB.x, cA.y - cB.y, cA.z - cB.z), alturas: [1.0, 0.8], angulo: 90 },
  }
}
