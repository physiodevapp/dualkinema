import type { DatosDoble, MetadatosGrabacion } from './metadatos'

/*
 * ¿Son dos vídeos la misma grabación doble? (fase 4, paso 7; §9 de docs/plan-fase-4.md). Lo dicen sus metadatos
 * (`metadatos.ts`): los dos de dualkinema, con `doble`, el mismo id de la pareja, uno de perfil y otro de frente o de
 * espaldas. El de perfil es la referencia (vista A): la pierna que se analiza es la que ve la cámara de perfil.
 */

export type MotivoPareja = 'sin-metadatos' | 'no-doble' | 'otra-pareja' | 'mismo-plano' | 'mismo-video'

export const TEXTO_MOTIVO_PAREJA: Record<MotivoPareja, string> = {
  'sin-metadatos': 'no está grabado con dualkinema',
  'no-doble': 'está grabado con un solo móvil, no con dos',
  'otra-pareja': 'son de grabaciones dobles distintas',
  'mismo-plano': 'los dos ven a la persona en el mismo plano',
  'mismo-video': 'es el mismo vídeo dos veces',
}

export type Pareja =
  | { readonly ok: true; /** Índice (0 o 1) del vídeo de perfil, la referencia. */ readonly referencia: 0 | 1; readonly doble: readonly [DatosDoble, DatosDoble] }
  | { readonly ok: false; readonly motivo: MotivoPareja; /** Cuál de los dos lo provoca, si es uno. */ readonly cual?: 0 | 1 }

export function parejaDoble(a: MetadatosGrabacion | null, b: MetadatosGrabacion | null): Pareja {
  for (const [i, m] of [a, b].entries()) {
    if (!m) return { ok: false, motivo: 'sin-metadatos', cual: i as 0 | 1 }
    if (!m.doble) return { ok: false, motivo: 'no-doble', cual: i as 0 | 1 }
  }
  if (a!.id === b!.id) return { ok: false, motivo: 'mismo-video' }
  const da = a!.doble!
  const db = b!.doble!
  if (da.id !== db.id) return { ok: false, motivo: 'otra-pareja' }
  if (da.vista.plano === db.vista.plano) return { ok: false, motivo: 'mismo-plano' }
  return { ok: true, referencia: da.vista.plano === 'sagital' ? 0 : 1, doble: [da, db] }
}
