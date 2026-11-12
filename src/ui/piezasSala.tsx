import { revisarInclinacion, type Inclinacion } from '../core/grabacion/colocacion'
import { enteraEn, fraseEncuadre, type Encuadre } from '../core/grabacion/encuadre'
import type { OrientacionVista } from '../core/geometria/canonico'
import { InfoGlosario } from './glosario/Glosario'

/* Piezas de la sala que comparten el móvil («Grabar con dos móviles», `Emparejar.tsx`) y el mando (`Mando.tsx`). */

export const VISTAS: readonly { readonly id: string; readonly vista: OrientacionVista; readonly etiqueta: string }[] = [
  { id: 'perfil-izquierda', vista: { plano: 'sagital', mira: 'izquierda' }, etiqueta: 'De perfil, mira a la izquierda' },
  { id: 'perfil-derecha', vista: { plano: 'sagital', mira: 'derecha' }, etiqueta: 'De perfil, mira a la derecha' },
  { id: 'frente', vista: { plano: 'frontal', ve: 'delante' }, etiqueta: 'De frente' },
  { id: 'espalda', vista: { plano: 'frontal', ve: 'detras' }, etiqueta: 'De espaldas' },
]

export const idDeVista = (v: OrientacionVista | null): string | null =>
  v === null ? null : (VISTAS.find((x) => JSON.stringify(x.vista) === JSON.stringify(v))?.id ?? null)

export const textoVista = (v: OrientacionVista | null): string => (v === null ? 'sin elegir' : (VISTAS.find((x) => x.id === idDeVista(v))?.etiqueta.toLowerCase() ?? '—'))

/**
 * La inclinación de un móvil (este, en directo; o el otro, la que manda) y qué hacer si no mira casi en horizontal o está
 * torcido (fase 6, paso 6: el asistente de colocación). Nada si no se sabe (un ordenador no tiene acelerómetro).
 */
export function Colocacion({ inclinacion, testid, otro = false, quien }: { inclinacion: Inclinacion | null; testid: string; otro?: boolean; quien?: string }) {
  if (!inclinacion) return null
  const r = revisarInclinacion(inclinacion)
  return (
    <div className="flex flex-col gap-1" data-testid={testid} data-cabeceo={inclinacion.cabeceo} data-alabeo={inclinacion.alabeo}>
      <p className="flex items-center gap-1 font-mono text-xs text-texto-2">
        {quien ?? (otro ? 'Su cámara' : 'Esta cámara')}: {r.cabeceo} {r.bienCabeceo ? '✓' : '✗'} · {r.alabeo} {r.bienAlabeo ? '✓' : '✗'}
        <InfoGlosario id="colocacion" tema="cómo colocar los móviles" className="-my-1.5" />
      </p>
      {r.consejo && <Aviso testid={`${testid}-aviso`}>{otro || quien ? `${quien ?? 'El otro móvil'}: ${r.consejo.charAt(0).toLowerCase()}${r.consejo.slice(1)}` : r.consejo}</Aviso>}
    </div>
  )
}

/** Lo que ve una cámara de la persona («te ve entero ✓», «no se te ven los pies»…); nada si no se está comprobando. */
export function TextoEncuadre({ encuadre, activo, fallo = false, testid, quien }: { encuadre: Encuadre | null; activo: boolean; fallo?: boolean; testid: string; quien: string }) {
  if (!activo) return null
  const bien = enteraEn(encuadre)
  // Su detector no carga: se dice, en vez de «mirando…» para siempre.
  if (fallo && !encuadre)
    return (
      <p className="font-mono text-sm text-acento" data-testid={testid} data-fallo="true">
        {quien}: no puede comprobar el encuadre (su detector no carga: mira su pantalla)
      </p>
    )
  const texto = !encuadre
    ? 'mirando…'
    : bien
      ? 'te ve entero ✓'
      : fraseEncuadre(encuadre, encuadre).split(';')[0]!.replace(/^En este móvil /, '').replace(/\.$/, '')
  return (
    <p className={`font-mono text-sm ${encuadre && !bien ? 'text-acento' : ''}`} data-testid={testid} data-entera={encuadre ? String(bien) : ''}>
      {quien}: {texto}
    </p>
  )
}

export function Aviso({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <p className="rounded-md border border-acento/60 p-3 text-sm" data-testid={testid}>
      {children}
    </p>
  )
}
