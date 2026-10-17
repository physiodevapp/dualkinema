import type { Marcador, ModeloMarcadores } from '../modelo/tipos'
import type { DefinicionArticulacion } from './definicion'

/*
 * Articulaciones predefinidas. Signos y ceros deducidos en el marco canónico
 * (geometria/canonico.ts) y fijados por los tests de catalogo.test.ts:
 *
 * Sagital (x delante, y arriba, giro + = antihorario visto desde la izquierda
 * de la persona = hacia delante para un segmento que cuelga):
 *   - cadera: tronco (hombro → cadera) y muslo. Flexión = muslo hacia delante = +.
 *   - rodilla: muslo y pierna. Flexión = pierna hacia atrás = giro horario → signo −1.
 *   - tobillo: pierna y pie (talón → 5.º metatarsiano). En posición neutra el pie
 *     forma +90° con la pierna → cero 90. Flexión dorsal = +.
 *   - hombro: tronco (hombro → cadera) y brazo. Flexión = brazo hacia delante = +.
 *   - codo: brazo y antebrazo. Flexión = antebrazo hacia delante = +.
 * Frontal (x hacia la izquierda de la persona, y arriba):
 *   - cadera: abducción izquierda = muslo hacia +x = +; derecha = hacia −x → signo −1.
 */

export type Lado = 'der' | 'izq'

const NOMBRE_LADO: Record<Lado, string> = { der: 'derecha', izq: 'izquierda' }
const NOMBRE_LADO_M: Record<Lado, string> = { der: 'derecho', izq: 'izquierdo' }

/** Identificadores de marcador por lado. */
export const marcadores = (l: Lado) => ({
  hombro: `acromion_${l}`,
  codo: `epicondilo_humeral_${l}`,
  muneca: `estiloides_cubital_${l}`,
  cadera: `trocanter_${l}`,
  rodilla: `epicondilo_femoral_${l}`,
  tobillo: `maleolo_${l}`,
  talon: `calcaneo_${l}`,
  antepie: `metatarsiano5_${l}`,
})

export function articulacionesSagitales(l: Lado): DefinicionArticulacion[] {
  const m = marcadores(l)
  const lado = NOMBRE_LADO[l]
  return [
    {
      id: `cadera_sagital_${l}`,
      nombre: `Cadera ${lado} (flexo-extensión)`,
      plano: 'sagital',
      proximal: { desde: m.hombro, hasta: m.cadera },
      distal: { desde: m.cadera, hasta: m.rodilla },
      signo: 1,
      cero: 0,
      positivo: 'flexión',
      negativo: 'extensión',
    },
    {
      id: `rodilla_sagital_${l}`,
      nombre: `Rodilla ${lado} (flexo-extensión)`,
      plano: 'sagital',
      proximal: { desde: m.cadera, hasta: m.rodilla },
      distal: { desde: m.rodilla, hasta: m.tobillo },
      signo: -1,
      cero: 0,
      positivo: 'flexión',
      negativo: 'hiperextensión',
    },
    {
      id: `tobillo_sagital_${l}`,
      nombre: `Tobillo ${NOMBRE_LADO_M[l]} (flexión dorsal-plantar)`,
      plano: 'sagital',
      proximal: { desde: m.rodilla, hasta: m.tobillo },
      distal: { desde: m.talon, hasta: m.antepie },
      signo: 1,
      cero: 90,
      positivo: 'flexión dorsal',
      negativo: 'flexión plantar',
    },
    {
      id: `hombro_sagital_${l}`,
      nombre: `Hombro ${NOMBRE_LADO_M[l]} (flexo-extensión)`,
      plano: 'sagital',
      proximal: { desde: m.hombro, hasta: m.cadera },
      distal: { desde: m.hombro, hasta: m.codo },
      signo: 1,
      cero: 0,
      positivo: 'flexión',
      negativo: 'extensión',
    },
    {
      id: `codo_sagital_${l}`,
      nombre: `Codo ${NOMBRE_LADO_M[l]} (flexo-extensión)`,
      plano: 'sagital',
      proximal: { desde: m.hombro, hasta: m.codo },
      distal: { desde: m.codo, hasta: m.muneca },
      signo: 1,
      cero: 0,
      positivo: 'flexión',
      negativo: 'hiperextensión',
    },
  ]
}

export function articulacionesFrontales(l: Lado): DefinicionArticulacion[] {
  const m = marcadores(l)
  return [
    {
      id: `cadera_frontal_${l}`,
      nombre: `Cadera ${NOMBRE_LADO[l]} (abducción-aducción)`,
      plano: 'frontal',
      proximal: { desde: m.hombro, hasta: m.cadera },
      distal: { desde: m.cadera, hasta: m.rodilla },
      signo: l === 'izq' ? 1 : -1,
      cero: 0,
      positivo: 'abducción',
      negativo: 'aducción',
    },
  ]
}

/**
 * Modelo de la fase 1: rodilla en el plano sagital con 3 gomets
 * (trocánter mayor, epicóndilo femoral lateral, maléolo lateral).
 */
export function modeloRodilla3(l: Lado): ModeloMarcadores {
  const m = marcadores(l)
  const lado = NOMBRE_LADO[l]
  const lista: Marcador[] = [
    { id: m.cadera, nombre: `Trocánter mayor (${lado})` },
    { id: m.rodilla, nombre: `Epicóndilo femoral lateral (${lado})` },
    { id: m.tobillo, nombre: `Maléolo lateral (${lado})` },
  ]
  const rodilla = articulacionesSagitales(l).find((a) => a.id === `rodilla_sagital_${l}`)!
  return { marcadores: lista, articulaciones: [rodilla] }
}
