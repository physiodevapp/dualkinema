/*
 * La persona sintética que anda (`core/marcha/sintetico.ts`) vista de perfil, mirando a la derecha, para la e2e de la
 * marcha (fase 9): lo que mandaría el detector sin marcadores en cada frame del vídeo. En cinta, con zancadas de 0,9 s
 * (los vídeos sintéticos duran 4 s). La e2e lo empaqueta con esbuild y lo importa, como `persona3d.ts`.
 */
import { PUNTOS_POSE } from '../../src/core/pose/puntos'
import { eventosVerdad, MARCHA_DEFECTO, puntosMarcha } from '../../src/core/marcha/sintetico'

export const OPCIONES = { ...MARCHA_DEFECTO, zancada: 0.9, velocidad: 0, fase0: 0.2 }
const ESCALA = 180 // px por metro

export function marchaFalsa(tiempos: readonly number[], ancho: number, alto: number) {
  const aImg = (p: { x: number; y: number }) => ({ x: ancho / 2 + p.x * ESCALA, y: alto - 20 - p.y * ESCALA })
  const frames = tiempos.map((t, indice) => {
    const q = puntosMarcha(t, OPCIONES)
    const puntos = PUNTOS_POSE.flatMap((p) => {
      const pierna = q[p.lado] as unknown as Record<string, { x: number; y: number }>
      const P = p.parte === 'hombro' ? { x: q.hombro.x + (p.lado === 'der' ? 0 : -0.03), y: q.hombro.y } : pierna[p.parte]
      if (!P) return [NaN, NaN, 0]
      const i = aImg(P)
      // La pierna derecha (la de la cámara) bien vista; la izquierda, peor (como la lejana de verdad).
      return [i.x, i.y, p.lado === 'der' ? 0.97 : 0.6]
    })
    return { indice, t, puntos }
  })
  const contactos = eventosVerdad(tiempos[0]!, tiempos[tiempos.length - 1]!, OPCIONES).filter((e) => e.lado === 'der' && e.tipo === 'contacto')
  return { frames, zancada: OPCIONES.zancada, contactos }
}
