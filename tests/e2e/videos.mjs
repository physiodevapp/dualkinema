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
const VERSION = 4

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
async function escribirVideo({ ancho, alto, n, huecos, dibujar, salida, gop = 30, kbps = 1500, fps = FPS }) {
  const extra = huecos.map((h) => `gte(N,${h})`).join('+')
  const expr = extra ? `(N+${extra})/${fps}` : `N/${fps}`
  const ff = spawn(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${ancho}x${alto}`, '-r', String(fps), '-i', '-',
      // Con fps constante distinto de 30 no se reescriben los tiempos: `setpts` en coma flotante repetía algún milisegundo.
      ...(huecos.length || fps === FPS ? ['-vf', `setpts='${expr}/TB'`] : []), '-fps_mode', 'passthrough', '-c:v', 'libvpx-vp9', '-g', String(gop), '-b:v', `${kbps}k`, salida],
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
async function generarRodilla(dir, nombre, color, oculto = () => false, { posicionesEn = posiciones, verdadEn = (t) => ({ flexion: flexionEn(t) }), fps } = {}) {
  // Con `fps` (distinto del de los demás): constante, sin huecos, y 4 s como los otros.
  const { ancho, alto } = RODILLA
  const n = fps ? Math.round(4 * fps) : RODILLA.n
  const huecos = fps ? [] : RODILLA.huecos
  const tiempos = fps ? Array.from({ length: n }, (_, i) => i / fps) : tiemposDe(n, huecos)
  let semilla = 7
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
  await escribirVideo({
    ancho, alto, n, huecos, kbps: 1500, salida: join(dir, `${nombre}.webm`), ...(fps ? { fps } : {}),
    dibujar: (i) => {
      const t = tiempos[i]
      const ps = posicionesEn(t)
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
    JSON.stringify(tiempos.map((t) => ({ t, ...verdadEn(t), ps: posicionesEn(t), tobilloOculto: oculto(t) }))),
  )
}

/** Valgo real (FPPA, grados) en el instante t del vídeo «frontal»: 0 → 20 → 0 en 4 s. */
export const valgoEn = (t) => 10 * (1 - Math.cos((Math.PI * t) / 2))

/**
 * Pierna derecha vista de frente (la cámara delante: la derecha de la persona queda a la izquierda de la imagen), con
 * los gomets del FPPA: muslo proximal, centro de la rodilla y centro del tobillo. Es la pierna que ve la vista de perfil
 * `verde` (la persona mira a la derecha de la imagen: se ve su lado derecho). La rodilla va hacia dentro (hacia la línea
 * media, a la derecha de la imagen) repartiendo el valgo entre el muslo y la pierna, así que el FPPA es exactamente
 * `valgoEn(t)`.
 */
function posicionesFrontales(t) {
  const v = (valgoEn(t) * Math.PI) / 180
  const muslo = { x: 310, y: 50 }
  const rodilla = { x: muslo.x + 130 * Math.sin(v / 2), y: muslo.y + 130 * Math.cos(v / 2) }
  const tobillo = { x: rodilla.x - 120 * Math.sin(v / 2), y: rodilla.y + 120 * Math.cos(v / 2) }
  return [muslo, rodilla, tobillo]
}

/** Intervalo en que el tobillo queda tapado en el vídeo «oculto» (segundos de vídeo). */
export const OCULTO = { desde: 1.5, hasta: 1.8 }
/** Lo mismo en el vídeo «corto»: un hueco que se puede rellenar (≤ 0,2 s entre posiciones fiables). */
export const OCULTO_CORTO = { desde: 1.5, hasta: 1.6 }

/** Gira un vídeo 90° (de 640×360 a 360×640) conservando sus tiempos: para probar la distribución con un vídeo vertical. */
async function girarVideo(entrada, salida) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-i', entrada, '-vf', 'transpose=1', '-fps_mode', 'passthrough', '-c:v', 'libvpx-vp9', '-g', '30', '-b:v', '1500k', salida], {
    stdio: 'inherit',
  })
  const [codigo] = await once(ff, 'close')
  if (codigo !== 0) throw new Error(`ffmpeg ha fallado (${codigo}) al girar ${entrada}`)
}

// ------------------------------------------------------------------ con audio

/**
 * Copia el vídeo `entrada` (sin volver a codificar la imagen: mismos pts) y le añade una pista de audio Opus a 48 kHz con
 * un ruido de fondo flojo y un pitido de 30 ms (1,5 kHz, con un ataque brusco y una caída de 10 ms) que empieza en
 * `pitido` s del contenedor: la «palmada» de la sincronía por audio, en un instante conocido.
 */
async function anadirPitido(entrada, salida, pitido, duracion) {
  const sonido = `0.004*(2*random(0)-1)+if(between(t,${pitido},${pitido + 0.03}),0.8*sin(2*PI*1500*(t-${pitido}))*exp(-(t-${pitido})/0.01),0)`
  const ff = spawn(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-i', entrada, '-f', 'lavfi', '-i', `aevalsrc='${sonido}':s=48000:d=${duracion}`,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '96k', salida],
    { stdio: 'inherit' },
  )
  const [codigo] = await once(ff, 'close')
  if (codigo !== 0) throw new Error(`ffmpeg ha fallado (${codigo}) al añadir el audio a ${entrada}`)
}

/**
 * La pareja de la sincronía por audio: `verde` y `numerado25` con un pitido. En A suena en el instante del frame 46 (el
 * del evento visual de las pruebas de sincronía) y en B, 40 ms después del instante de su frame 13 (el suyo): como un
 * móvil que guarda el sonido 40 ms tarde respecto a la imagen. Así el audio da un desfase 40 ms menor que el evento visual.
 */
export const RETARDO_AUDIO_B = 0.04
async function generarConAudio(dir) {
  const leer = (nombre) => JSON.parse(readFileSync(join(dir, `${nombre}.json`), 'utf8'))
  const verde = leer('verde')
  const tA = Math.round(verde[45].t * 1000) / 1000
  await anadirPitido(join(dir, 'verde.webm'), join(dir, 'verdeAudio.webm'), tA, verde[verde.length - 1].t + 1 / FPS)
  writeFileSync(join(dir, 'verdeAudio.json'), JSON.stringify({ pitido: tA }))
  const tB = 12 / 25 + RETARDO_AUDIO_B
  await anadirPitido(join(dir, 'numerado25.webm'), join(dir, 'numerado25Audio.webm'), tB, 90 / 25)
  writeFileSync(join(dir, 'numerado25Audio.json'), JSON.stringify({ pitido: tB }))
}

// ------------------------------------------------------------------- conjunto

/**
 * Genera (una sola vez por versión) los vídeos y devuelve sus rutas y la
 * verdad de cada uno. Se guardan en la carpeta temporal del sistema.
 */
/**
 * El mismo tipo de vídeo que `numerado`, pero a 25 fps constantes y 90 frames (3,6 s): la segunda vista de las pruebas de
 * dos vistas. Con fps distinto del de `verde` (30 y variable) y una duración menor, sirve para comprobar que el cursor
 * común lleva cada vista por tiempo y no por índice, y qué pasa cuando un vídeo acaba antes que el otro.
 */
async function generarNumerado25(dir) {
  const ancho = 320
  const alto = 180
  const n = 90
  await escribirVideo({
    ancho, alto, n, huecos: [], gop: 25, kbps: 800, fps: 25, salida: join(dir, 'numerado25.webm'),
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
      const x0 = 10 + ((i * 3) % 290)
      for (let y = 70; y < 130; y++) for (let x = x0; x < x0 + 12; x++) poner(x, y, 200)
      return buf
    },
  })
  writeFileSync(join(dir, 'numerado25.json'), JSON.stringify({ tiempos: Array.from({ length: n }, (_, i) => i / 25), bits: BITS, ladoBloque: LADO_BLOQUE }))
}

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
    await girarVideo(join(dir, 'verde.webm'), join(dir, 'vertical.webm'))
    writeFileSync(marca, '')
  }
  // Añadido después de la primera versión: se genera aparte si falta (sin invalidar los demás).
  if (!existsSync(join(dir, 'numerado25.json'))) await generarNumerado25(dir)
  // La misma pierna de frente a 25 fps constantes: con `verde` (30 fps con huecos) los instantes de las dos vistas se intercalan.
  if (!existsSync(join(dir, 'frontal25.json'))) await generarRodilla(dir, 'frontal25', VERDE, () => false, { posicionesEn: posicionesFrontales, verdadEn: (t) => ({ fppa: valgoEn(t) }), fps: 25 })
  if (!existsSync(join(dir, 'frontal.json'))) await generarRodilla(dir, 'frontal', VERDE, () => false, { posicionesEn: posicionesFrontales, verdadEn: (t) => ({ fppa: valgoEn(t) }) })
  // La pareja con audio (sincronía por audio), hecha de `verde` y `numerado25`.
  if (!existsSync(join(dir, 'numerado25Audio.json'))) await generarConAudio(dir)
  const leer = (nombre) => JSON.parse(readFileSync(join(dir, `${nombre}.json`), 'utf8'))
  return {
    numerado: { ruta: join(dir, 'numerado.webm'), ...leer('numerado') },
    numerado25: { ruta: join(dir, 'numerado25.webm'), ...leer('numerado25') },
    verde: { ruta: join(dir, 'verde.webm'), verdad: leer('verde') },
    rojo: { ruta: join(dir, 'rojo.webm'), verdad: leer('rojo') },
    // La pierna derecha de frente (la que ve `verde` de perfil), con el FPPA real de cada frame (`fppa`).
    frontal: { ruta: join(dir, 'frontal.webm'), verdad: leer('frontal') },
    // Lo mismo a 25 fps constantes (100 frames).
    frontal25: { ruta: join(dir, 'frontal25.webm'), verdad: leer('frontal25') },
    oculto: { ruta: join(dir, 'oculto.webm'), verdad: leer('oculto') },
    corto: { ruta: join(dir, 'corto.webm'), verdad: leer('corto') },
    // Los mismos con un pitido en un instante conocido (`pitido`, s del contenedor): el de B, RETARDO_AUDIO_B después de su evento.
    verdeAudio: { ruta: join(dir, 'verdeAudio.webm'), ...leer('verdeAudio') },
    numerado25Audio: { ruta: join(dir, 'numerado25Audio.webm'), ...leer('numerado25Audio') },
    // El vídeo «verde» girado 90° (360×640): solo para probar la distribución con un vídeo vertical, sin verdad conocida.
    vertical: { ruta: join(dir, 'vertical.webm') },
  }
}
