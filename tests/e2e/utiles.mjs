// Utilidades de las pruebas en navegador: servidor, navegador y gestos sobre la app.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

export const PUERTO = Number(process.env.E2E_PUERTO ?? 4173)
export const URL_APP = `http://localhost:${PUERTO}/`

/** Errores de consola y de página de todas las pruebas: la última prueba exige que no haya ninguno. */
export const errores = []

/** Sirve `dist/` (hay que haber hecho `npm run build`). Devuelve una función para pararlo. */
export async function servirApp() {
  const servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PUERTO), '--strictPort'], {
    stdio: 'ignore',
  })
  const parar = () => servidor.kill()
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(URL_APP)).ok) return parar
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  parar()
  throw new Error(`El servidor no ha arrancado en ${URL_APP}: ¿falta \`npm run build\`?`)
}

/** `CHROMIUM_PATH` permite usar un Chromium ya instalado en vez del de Playwright. */
export const lanzarNavegador = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })

/** Abre la app como un móvil (o ancho de escritorio con `ancho` ≥ 800). El idioma es es-ES: uPlot lo necesita. */
export async function abrirApp(navegador, { ancho = 390 } = {}) {
  const pagina = await navegador.newPage({
    locale: 'es-ES',
    viewport: { width: ancho, height: ancho >= 800 ? 900 : 844 },
    hasTouch: ancho < 800,
  })
  pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
  pagina.on('console', (m) => m.type() === 'error' && errores.push(`console: ${m.text()}`))
  await pagina.goto(URL_APP)
  return pagina
}

/** Carga un vídeo, elige hacia dónde mira la persona y espera al primer frame. */
export async function cargarVideo(p, ruta, mira = 'derecha') {
  await p.setInputFiles('input[type=file]', ruta)
  await p.getByRole('button', { name: `Mira a la ${mira}` }).click({ timeout: 20000 })
  await esperarQuieto(p)
}

/** Espera a que el visor haya pintado lo pedido (sin el «…» de «decodificando»). */
export async function esperarQuieto(p) {
  await p.waitForFunction(
    () => {
      const t = document.querySelector('[data-testid=posicion]')?.textContent ?? ''
      return t.includes('frame') && !t.includes('—') && !t.includes('…')
    },
    null,
    { timeout: 20000 },
  )
}

/** «frame 31 / 120» y «t = 1,000 s» del visor → { frame (1-based), total, t }. */
export async function leerPosicion(p) {
  const texto = (await p.getByTestId('posicion').innerText()).replace(/\s+/g, ' ')
  const m = /t = (-?[\d.,]+) s.*frame (\d+) \/ (\d+)/.exec(texto)
  if (!m) throw new Error(`No entiendo la posición del visor: «${texto}»`)
  return { t: Number(m[1].replace(',', '.')), frame: Number(m[2]), total: Number(m[3]) }
}

/** Salta al frame `i` (0-based) con el deslizador. */
export async function irAFrame(p, i) {
  await p.getByRole('slider', { name: 'Posición en el vídeo' }).fill(String(i))
  await esperarQuieto(p)
}

/** Número del frame que muestra el canvas, leído de los bloques de `numerado.webm` (bit b en el bloque b). */
export function leerFrameDibujado(p, { bits, ladoBloque }) {
  return p.evaluate(
    ({ bits, ladoBloque }) => {
      const ctx = document.querySelector('[data-testid=lienzo]').getContext('2d')
      let v = 0
      for (let b = 0; b < bits; b++) {
        const d = ctx.getImageData(b * ladoBloque + ladoBloque / 2, ladoBloque / 2, 1, 1).data
        if (d[0] > 128) v |= 1 << b
      }
      return v
    },
    { bits, ladoBloque },
  )
}

/**
 * Caja del vídeo en pantalla, con el vídeo a la vista. El ratón de Playwright
 * no llega fuera de la ventana: si mover el deslizador ha desplazado la página
 * y el vídeo queda en parte fuera (depende de la altura del texto, p. ej. si
 * no cargan las fuentes), el toque se perdería.
 */
export async function cajaVideo(p) {
  const capa = p.getByTestId('capa')
  await capa.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  return capa.boundingBox()
}

/** Toca el vídeo en (x, y) de los px del vídeo (640×360 por defecto). */
export async function tocarVideo(p, x, y, { ancho = 640, alto = 360 } = {}) {
  const caja = await cajaVideo(p)
  await p.mouse.click(caja.x + (x / ancho) * caja.width, caja.y + (y / alto) * caja.height)
}

/** Marca los 3 gomets en el frame actual, tocando `desvio` px desviados del centro (como un dedo). */
export async function marcarTres(p, posiciones, desvio = 2) {
  for (const [i, q] of posiciones.entries()) await tocarVideo(p, q.x + (i % 2 ? -desvio : desvio), q.y + (i === 2 ? desvio : -desvio))
}

/** Pulsa «Seguir desde aquí» y espera a que termine. Devuelve el texto del aviso final. */
export async function seguirHastaElFinal(p) {
  await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
  await p.getByTestId('aviso').waitFor({ timeout: 90000 })
  return (await p.getByTestId('aviso').innerText()).replace(/\s+/g, ' ')
}

/** Ángulo que muestra el panel (o el filtrado, con testid 'angulo-filtrado'), en grados (NaN si no hay valor). */
export async function leerAngulo(p, testid = 'angulo') {
  const texto = await p.getByTestId(testid).innerText()
  const m = /^(−|-)?([\d.,]+)°/.exec(texto.trim())
  return m ? (m[1] ? -1 : 1) * Number(m[2].replace(',', '.')) : NaN
}

/** Frame (0-based) más cercano al instante t, según la tabla de tiempos. */
export function frameMasCercano(tiempos, t) {
  return tiempos.reduce((mejor, x, k) => (Math.abs(x - t) < Math.abs(tiempos[mejor] - t) ? k : mejor), 0)
}

/**
 * Espera a que la sesión guardada en IndexedDB tenga `conDatos` frames con muestra.
 * El texto «Guardado…» del visor no basta: puede venir de un guardado anterior
 * mientras el último todavía se escribe.
 */
export async function esperarGuardado(p, conDatos) {
  await p.waitForFunction(
    async (n) => {
      const bd = await new Promise((ok, mal) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
      try {
        if (!bd.objectStoreNames.contains('sesiones')) return false
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        return todas.some((c) => c.resumen.conDatos === n)
      } finally {
        bd.close()
      }
    },
    conDatos,
    { timeout: 20000, polling: 200 },
  )
  await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo' }).waitFor({ timeout: 10000 })
}

/** Elige `ruta` desde un botón que abre el selector de archivos (p. ej. «Continuar» de la lista). */
export async function elegirArchivoDesde(p, boton, ruta) {
  const [selector] = await Promise.all([p.waitForEvent('filechooser'), boton.click()])
  await selector.setFiles(ruta)
}

/** Espera a que la sesión guardada tenga el corte de filtro `corteHz`. */
export async function esperarFiltroGuardado(p, corteHz) {
  await p.waitForFunction(
    async (corte) => {
      const bd = await new Promise((ok, mal) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
      try {
        if (!bd.objectStoreNames.contains('sesiones')) return false
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        return todas.some((c) => c.filtro?.corteHz === corte)
      } finally {
        bd.close()
      }
    },
    corteHz,
    { timeout: 20000, polling: 200 },
  )
}
