import type { MotivoHueco } from '../../core/seguimiento/huecos'
import type { Hueco } from '../../workers/protocolo'

export const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Grados con una decimal sin «−0,0» (un valor entre −0,05 y 0 se muestra 0,0). */
export const grados = (n: number) => fmt(Math.round(n * 10) / 10 + 0, 1)
/** Valor de una serie por frame con d decimales, «—» si no hay (NaN o sin frame). */
export const valorEn = (serie: ArrayLike<number>, i: number | null, d: number) => {
  const v = i === null ? NaN : (serie[i] ?? NaN)
  return Number.isFinite(v) ? fmt(Math.round(v * 10 ** d) / 10 ** d + 0, d) : '—'
}

export const hora = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const NOMBRE_MOTIVO: Record<MotivoHueco, string> = {
  sinColor: 'sin su color en la zona',
  tamano: 'mancha de tamaño distinto',
  calidad: 'lejos de lo esperado o ambiguo',
  conflicto: 'junto a otro gomet',
  dudoso: 'detección dudosa, descartada',
}

export function describirMotivos(h: Hueco): string {
  const fmt = (n: number) => n.toFixed(1).replace('.', ',')
  return (Object.entries(h.motivos) as [MotivoHueco, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => {
      const area = m === 'tamano' && h.areaMin !== undefined ? ` (área ${fmt(h.areaMin)}–${fmt(h.areaMax!)}× la del gomet)` : ''
      return `${n} ${NOMBRE_MOTIVO[m]}${area}`
    })
    .join(', ')
}
