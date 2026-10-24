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
 * Frontal (x hacia la izquierda de la persona, y arriba; el espejo de la cámara delante o detrás ya lo quita el marco):
 *   - cadera: abducción izquierda = muslo hacia +x = +; derecha = hacia −x → signo −1.
 *   - rodilla (FPPA, ángulo de proyección en el plano frontal): muslo (muslo proximal → centro de la rodilla) y pierna
 *     (centro de la rodilla → centro del tobillo). Valgo = la rodilla hacia dentro (hacia la línea media): en la pierna
 *     izquierda la línea media queda hacia −x, así que el muslo baja hacia −x y la pierna vuelve hacia +x, un giro
 *     antihorario del muslo a la pierna → signo +1; en la derecha, al revés → signo −1. 0° con muslo y pierna alineados;
 *     valgo +, varo −, igual en las dos piernas y con la cámara delante o detrás.
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
  // Vista de frente (FPPA de la rodilla).
  musloProximal: `muslo_proximal_${l}`,
  centroRodilla: `centro_rodilla_${l}`,
  centroTobillo: `centro_tobillo_${l}`,
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
    {
      id: `rodilla_frontal_${l}`,
      nombre: `Rodilla ${NOMBRE_LADO[l]} (FPPA, valgo-varo)`,
      plano: 'frontal',
      proximal: { desde: m.musloProximal, hasta: m.centroRodilla },
      distal: { desde: m.centroRodilla, hasta: m.centroTobillo },
      signo: l === 'izq' ? 1 : -1,
      cero: 0,
      positivo: 'valgo',
      negativo: 'varo',
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

/**
 * Los marcadores de la vista de frente para el FPPA de la rodilla (D3 de la fase 3): muslo proximal (a media distancia
 * entre la espina ilíaca anterosuperior y la rodilla, como estimación del centro de la cadera), centro de la rodilla
 * (centro de la rótula o punto medio entre los cóndilos) y centro del tobillo (punto medio entre los maléolos).
 */
export function marcadoresFrontalesRodilla(l: Lado): Marcador[] {
  const m = marcadores(l)
  const lado = NOMBRE_LADO[l]
  return [
    { id: m.musloProximal, nombre: `Muslo proximal (${lado})` },
    { id: m.centroRodilla, nombre: `Centro de la rodilla (${lado})` },
    { id: m.centroTobillo, nombre: `Centro del tobillo (${lado})` },
  ]
}

/**
 * Un modelo con lo de la vista de frente añadido (D4: un único modelo por sesión con todos los marcadores; cada vista
 * sigue los suyos): sus tres marcadores y el FPPA de la rodilla del mismo lado. Lo que ya tenía no cambia (ni de orden:
 * las trayectorias guardadas van por id) y no se repite si ya estaba.
 */
export function conRodillaFrontal(modelo: ModeloMarcadores, l: Lado): ModeloMarcadores {
  const fppa = articulacionesFrontales(l).find((a) => a.id === `rodilla_frontal_${l}`)!
  const ids = new Set(modelo.marcadores.map((mk) => mk.id))
  const nuevos = marcadoresFrontalesRodilla(l).filter((mk) => !ids.has(mk.id))
  const tiene = modelo.articulaciones.some((a) => a.id === fppa.id)
  if (nuevos.length === 0 && tiene) return modelo
  return { marcadores: [...modelo.marcadores, ...nuevos], articulaciones: tiene ? modelo.articulaciones : [...modelo.articulaciones, fppa] }
}
