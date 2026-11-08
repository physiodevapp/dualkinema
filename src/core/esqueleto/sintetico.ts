/*
 * Una persona sintética con rotaciones (fase 7, D6 de docs/plan-fase-7.md): la de la fase 6 (`core/tresd/sintetico.ts`)
 * solo mueve las piernas en su plano; esta, generada con el propio esqueleto, añade rotación y abducción de cadera, la
 * oblicuidad de la pelvis, la progresión de los pies y la rotación e inclinación del tronco, con la postura (los 21 ángulos)
 * de verdad conocida en cada instante. Mundo: el marco del laboratorio, suelo en z = 0, metros.
 */
import { vec3 } from '../geometria/vector'
import { PROPORCIONES } from '../tresd/sintetico'
import { indiceGrado, posturaNeutra, type Grado, type Medidas } from './modelo'

/** Las medidas de una persona de estatura H con las proporciones de Winter (las de la persona sintética de la fase 6). */
export function medidasDe(H: number): Medidas {
  const P = PROPORCIONES
  return {
    anchoCaderas: P.anchoCaderas * H,
    muslo: (P.cadera - P.rodilla) * H,
    pierna: (P.rodilla - P.tobillo) * H,
    talon: { x: -0.25 * P.pie * H, z: -P.tobillo * H * 0.8 },
    punta: { x: 0.75 * P.pie * H, z: -P.tobillo * H * 0.8 },
    tronco: (P.hombro - P.cadera) * H,
    anchoHombros: P.anchoHombros * H,
  }
}

const deg = Math.PI / 180

/**
 * La postura en el instante t (s): 0–6 s, unos pasos por la zona con la pelvis girando y oscilando, la cadera rotando y
 * los pies hacia fuera; 6–12 s, dos sentadillas con la rodilla hacia dentro (rotación interna y aducción de cadera) y el
 * tronco inclinado; 12–18 s, marcha en el sitio con rotación del tronco.
 */
export function posturaEn(t: number, H: number): number[] {
  const m = medidasDe(H)
  const q = posturaNeutra(vec3(0, 0, PROPORCIONES.cadera * H))
  const poner = (g: Grado, v: number) => (q[indiceGrado(g)] = v)
  if (t < 6) {
    const a = (2 * Math.PI * t) / 6
    const paso = Math.sin(4 * a)
    poner('pelvisX', 0.6 * Math.cos(a))
    poner('pelvisY', 0.4 * Math.sin(a))
    poner('pelvisZ', PROPORCIONES.cadera * H - 0.01)
    poner('pelvisRumbo', Math.PI / 2 + 0.3 * Math.sin(a))
    poner('pelvisOblicuidad', 4 * deg * paso)
    poner('caderaFlexDer', 0.35 * paso)
    poner('caderaFlexIzq', -0.35 * paso)
    poner('rodillaDer', Math.max(0, paso) * 0.9 + 0.1)
    poner('rodillaIzq', Math.max(0, -paso) * 0.9 + 0.1)
    poner('caderaRotDer', 10 * deg * Math.sin(4 * a + 1))
    poner('caderaRotIzq', -8 * deg * Math.sin(4 * a + 1))
    poner('caderaAbdDer', 4 * deg * (1 + paso) / 2)
    poner('caderaAbdIzq', 4 * deg * (1 - paso) / 2)
    poner('tobilloProgresionDer', 8 * deg)
    poner('tobilloProgresionIzq', 6 * deg)
    poner('troncoRot', -6 * deg * paso)
    poner('troncoFlex', 0.05)
    return q
  }
  if (t < 12) {
    const fase = (1 - Math.cos((2 * Math.PI * (t - 6)) / 3)) / 2
    const rodilla = (Math.PI / 2) * fase
    const cadera = 0.95 * rodilla
    poner('pelvisRumbo', Math.PI / 2)
    poner('pelvisZ', PROPORCIONES.tobillo * H + m.pierna * Math.cos(rodilla - cadera) + m.muslo * Math.cos(cadera))
    for (const L of ['Der', 'Izq'] as const) {
      poner(`caderaFlex${L}`, cadera)
      poner(`rodilla${L}`, rodilla)
      poner(`tobilloDorsal${L}`, rodilla - cadera)
      // La rodilla hacia dentro al bajar.
      poner(`caderaRot${L}`, 15 * deg * fase)
      poner(`caderaAbd${L}`, -6 * deg * fase)
    }
    poner('troncoFlex', 0.5 * fase)
    poner('troncoLateral', 5 * deg * fase)
    return q
  }
  const a = (2 * Math.PI * (t - 12)) / 1.2
  const sube = Math.max(0, Math.sin(a))
  const baja = Math.max(0, -Math.sin(a))
  poner('pelvisZ', PROPORCIONES.cadera * H - 0.01)
  poner('pelvisRumbo', Math.PI / 2)
  poner('caderaFlexDer', sube * 0.8)
  poner('caderaFlexIzq', baja * 0.8)
  poner('rodillaDer', sube * 1.2)
  poner('rodillaIzq', baja * 1.2)
  poner('troncoRot', 10 * deg * Math.sin(a))
  poner('pelvisOblicuidad', 3 * deg * Math.sin(a))
  return q
}
