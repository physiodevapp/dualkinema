// Vídeos sintéticos para las pruebas en navegador. Todo se genera con Node + ffmpeg
// (VP9 en WebM: el Chromium de Playwright lo decodifica; H.264 no viene en él).
// Nada de vídeos reales ni de personas en el repositorio.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const FPS = 30
/** Súbelo si cambias cualquier generador: invalida la caché de vídeos. */
const VERSION = 2

export const VERDE = [40, 200, 90]
export const ROJO = [210, 45, 55]
const PIEL = [205, 160, 135]

/**
 * Tiempos de presentación con fps variable: 30 fps y, antes de cada frame de
 * `huecos`, un periodo extra (el móvil no guardó ese frame). Es lo que da
 * `setpts` en `escribirVideo`, y lo que las pruebas esperan leer.
 */
export function tiemposDe(n, huecos) {
  return Array.from({ length: n }, (_, i) => (i + huecos.filter((h) => h <= i).length) / FPS)
}

/** Escribe un vídeo VP9 con `n` frames (RGB24 de `dibujar(i)`) y los tiempos de `tiemposDe`. */
async function escribirVideo({ ancho, alto, n, huecos, dibujar, salida, gop = 30, kbps = 1500 }) {
  const extra = huecos.map((h) => `gte(N,${h})`).join('+')
  const expr = extra ? `(N+${extra})/${FPS}` : `N/${FPS}`
  const ff = spawn(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${ancho}x${alto}`, '-r', String(FPS), '-i', '-',
      '-vf', `setpts='${expr}/TB'`, '-fps_mode', 'passthrough', '-c:v', 'libvpx-vp9', '-g', String(gop), '-b:v', `${kbps}k`, salida],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  for (let i = 0; i < n; i++) {
    if (!ff.stdin.write(dibujar(i))) await once(ff.stdin, 'drain')
  }
  ff.stdin.end()
  const [codigo] = await once(ff, 'close')
  if (codigo !== 0) throw new Error(`ffmpeg ha fallado (${codigo}) al escribir ${salida}`)
}

// ---------------------------------------------------------------- frame exacto

const BITS = 8
const LADO_BLOQUE = 32

/**
 * Vídeo de 320×180 y 120 frames donde cada frame lleva su número codificado en
 * 8 bloques blancos/negros (bit b en el bloque b). Sirve para comprobar que el
 * frame que muestra el visor es el que se ha pedido, sin comparar imágenes ni
 * depender de ninguna fuente. Con un fotograma clave cada 25 frames y fps variable.
 */
async function generarNumerado(dir) {
  const ancho = 320
  const alto = 180
  const n = 120
  const huecos = [41, 81]
  await escribirVideo({
    ancho, alto, n, huecos, gop: 25, kbps: 800, salida: join(dir, 'numerado.webm'),
    dibujar: (i) => {
      const buf = Buffer.alloc(ancho * alto * 3, 90)
      const poner = (x, y, v) => {
        const k = (y * ancho + x) * 3
        buf[k] = buf[k + 1] = buf[k + 2] = v
      }
      for (let b = 0; b < BITS; b++) {
        const v = (i >> b) & 1 ? 240 : 15
        for (let y = 0; y < LADO_BLOQUE; y++) for (let x = b * LADO_BLOQUE; x < (b + 1) * LADO_BLOQUE; x++) poner(x, y, v)
      }
      // Una barra que se mueve, para que ningún frame se parezca al anterior.
      const x0 = 10 + ((i * 2) % 290)
      for (let y = 70; y < 130; y++) for (let x = x0; x < x0 + 12; x++) poner(x, y, 200)
      return buf
    },
  })
  writeFileSync(join(dir, 'numerado.json'), JSON.stringify({ tiempos: tiemposDe(n, huecos), bits: BITS, ladoBloque: LADO_BLOQUE }))
}

// --------------------------------------------------------------------- rodilla

export const RODILLA = { ancho: 640, alto: 360, n: 120, huecos: [41, 81] }
/** Flexión real (grados) en el instante t: 0 → 90 → 0 en 4 s. */
export const flexionEn = (t) => 45 * (1 - Math.cos((Math.PI * t) / 2))

/** Posición de los 3 gomets (cadera, rodilla, tobillo) en px: persona de perfil mirando a la derecha. */
function posiciones(t) {
  const k = (flexionEn(t) * Math.PI) / 180
  const cadera = { x: 330, y: 50 }
  const muslo = 0.15
  const rodilla = { x: cadera.x + 130 * Math.sin(muslo), y: cadera.y + 130 * Math.cos(muslo) }
  const pierna = muslo - k
  const tobillo = { x: rodilla.x + 120 * Math.sin(pierna), y: rodilla.y + 120 * Math.cos(pierna) }
  return [cadera, rodilla, tobillo]
}

/**
 * Pierna color piel sobre un fondo gris con ruido y 3 gomets de color con
 * antialiasing (centros reales conocidos). `oculto(t)` tapa el tobillo.
 */
async function generarRodilla(dir, nombre, color, oculto = () => false) {
  const { ancho, alto, n, huecos } = RODILLA
  const tiempos = tiemposDe(n, huecos)
  let semilla = 7
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
  await escribirVideo({
    ancho, alto, n, huecos, kbps: 1500, salida: join(dir, `${nombre}.webm`),
    dibujar: (i) => {
      const t = tiempos[i]
      const ps = posiciones(t)
      const buf = Buffer.alloc(ancho * alto * 3)
      for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
          let r = 120 + 40 * (y / alto)
          let g = 115 + 30 * (y / alto)
          let b = 110
          for (let j = 0; j < 2; j++) {
            const a = ps[j]
            const c = ps[j + 1]
            const vx = c.x - a.x
            const vy = c.y - a.y
            const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)))
            if (Math.hypot(x - (a.x + u * vx), y - (a.y + u * vy)) < 22) [r, g, b] = PIEL
          }
          for (const [ip, p] of ps.entries()) {
            if (ip === 2 && oculto(t)) continue
            if (Math.abs(x + 0.5 - p.x) > 8 || Math.abs(y + 0.5 - p.y) > 8) continue
            let dentro = 0
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
              if ((x + (sx + 0.5) / 4 - p.x) ** 2 + (y + (sy + 0.5) / 4 - p.y) ** 2 <= 49) dentro++
            }
            const f = dentro / 16
            r = r * (1 - f) + color[0] * f
            g = g * (1 - f) + color[1] * f
            b = b * (1 - f) + color[2] * f
          }
          const k = (y * ancho + x) * 3
          buf[k] = Math.max(0, Math.min(255, r + (azar() - 0.5) * 12))
          buf[k + 1] = Math.max(0, Math.min(255, g + (azar() - 0.5) * 12))
          buf[k + 2] = Math.max(0, Math.min(255, b + (azar() - 0.5) * 12))
        }
      }
      return buf
    },
  })
  writeFileSync(
    join(dir, `${nombre}.json`),
    JSON.stringify(tiempos.map((t) => ({ t, flexion: flexionEn(t), ps: posiciones(t), tobilloOculto: oculto(t) }))),
  )
}

/** Intervalo en que el tobillo queda tapado en el vídeo «oculto» (segundos de vídeo). */
export const OCULTO = { desde: 1.5, hasta: 1.8 }
/** Lo mismo en el vídeo «corto»: un hueco que se puede rellenar (≤ 0,2 s entre posiciones fiables). */
export const OCULTO_CORTO = { desde: 1.5, hasta: 1.6 }

// ------------------------------------------------------------------- conjunto

/**
 * Genera (una sola vez por versión) los vídeos y devuelve sus rutas y la
 * verdad de cada uno. Se guardan en la carpeta temporal del sistema.
 */
export async function asegurarVideos() {
  const dir = join(tmpdir(), `dualkinema-e2e-v${VERSION}`)
  const marca = join(dir, 'listo')
  if (!existsSync(marca)) {
    mkdirSync(dir, { recursive: true })
    await generarNumerado(dir)
    await generarRodilla(dir, 'verde', VERDE)
    await generarRodilla(dir, 'rojo', ROJO)
    await generarRodilla(dir, 'oculto', VERDE, (t) => t > OCULTO.desde && t < OCULTO.hasta)
    await generarRodilla(dir, 'corto', VERDE, (t) => t > OCULTO_CORTO.desde && t < OCULTO_CORTO.hasta)
    writeFileSync(marca, '')
  }
  const leer = (nombre) => JSON.parse(readFileSync(join(dir, `${nombre}.json`), 'utf8'))
  return {
    numerado: { ruta: join(dir, 'numerado.webm'), ...leer('numerado') },
    verde: { ruta: join(dir, 'verde.webm'), verdad: leer('verde') },
    rojo: { ruta: join(dir, 'rojo.webm'), verdad: leer('rojo') },
    oculto: { ruta: join(dir, 'oculto.webm'), verdad: leer('oculto') },
    corto: { ruta: join(dir, 'corto.webm'), verdad: leer('corto') },
  }
}
