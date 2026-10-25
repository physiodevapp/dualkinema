// Pruebas de punta a punta de la app en un navegador real (Chromium con Playwright).
// Los vídeos son sintéticos y se generan con ffmpeg (ver videos.mjs): la verdad
// (ángulo y posición de cada gomet en cada frame) se conoce de antemano.
//
//   npm run build && npm run test:e2e
//
import assert from 'node:assert/strict'
import { copyFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { asegurarVideos } from './videos.mjs'
import {
  abrirApp,
  abrirPestana,
  cajaElemento,
  cajaVideo,
  cargarVideo,
  centrarLibre,
  elegirArchivoDesde,
  errores,
  esperarFiltroGuardado,
  esperarGuardado,
  esperarQuieto,
  esperarVideoAsentado,
  frameMasCercano,
  irAFrame,
  lanzarNavegador,
  lanzarNavegadorConCamaraFalsa,
  servirRele,
  URL_APP,
  URL_RELE,
  leerAngulo,
  textoDe,
  leerFrameDibujado,
  leerPosicion,
  marcarTres,
  seguirHastaElFinal,
  servirApp,
  tocarVideo,
} from './utiles.mjs'

/** Diferencia máxima aceptada entre el ángulo medido y el real, en grados (lo medido en la fase 1: ≤ 0,1°). */
const TOLERANCIA_GRADOS = 0.5
/** Frames donde se compara el ángulo medido con el real: incluye los que siguen a los huecos de fps. */
const FRAMES_A_COMPARAR = [1, 20, 40, 41, 60, 80, 81, 100, 119]

// Flexión real de los vídeos de rodilla: 45·(1 − cos(πt/2)); velocidad 45·(π/2)·sin(πt/2) °/s (pico 70,7 a t = 1 s).
const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)

let videos
let navegador
let pararServidor

before(async () => {
  videos = await asegurarVideos()
  pararServidor = await servirApp()
  navegador = await lanzarNavegador()
})

after(async () => {
  await navegador?.close()
  pararServidor?.()
})

/** Marca los 3 gomets en el primer frame y sigue hasta el final. Devuelve la página y el aviso final. */
async function seguirVideo(video, { ancho = 390 } = {}) {
  const p = await abrirApp(navegador, { ancho })
  await cargarVideo(p, video.ruta)
  await marcarTres(p, video.verdad[0].ps)
  const aviso = await seguirHastaElFinal(p)
  return { p, aviso }
}

async function compararAngulos(p, verdad) {
  for (const i of FRAMES_A_COMPARAR) {
    await irAFrame(p, i)
    const medido = await leerAngulo(p)
    assert.ok(
      Math.abs(medido - verdad[i].flexion) < TOLERANCIA_GRADOS,
      `frame ${i + 1}: medido ${medido}°, real ${verdad[i].flexion.toFixed(2)}°`,
    )
  }
}

describe('visor: frame exacto con fps variable', () => {
  let p
  before(async () => {
    p = await abrirApp(navegador)
    await cargarVideo(p, videos.numerado.ruta)
  })
  after(() => p?.close())

  it('muestra el frame pedido avanzando, retrocediendo y saltando (incluidos los fotogramas clave)', async () => {
    const { tiempos, bits, ladoBloque } = videos.numerado
    const siguiente = p.getByRole('button', { name: 'Frame siguiente' })
    const anterior = p.getByRole('button', { name: 'Frame anterior' })
    // [frame al que se va, cómo]. El vídeo tiene un fotograma clave cada 25 frames.
    const recorrido = [
      [0, 'deslizador'], [1, 'siguiente'], [2, 'siguiente'], [29, 'deslizador'], [30, 'siguiente'], [31, 'siguiente'],
      [30, 'anterior'], [29, 'anterior'], [24, 'deslizador'], [25, 'siguiente'], [60, 'deslizador'], [119, 'deslizador'],
      [118, 'anterior'], [7, 'deslizador'],
    ]
    for (const [i, como] of recorrido) {
      if (como === 'deslizador') await irAFrame(p, i)
      else {
        await (como === 'siguiente' ? siguiente : anterior).click()
        await esperarQuieto(p)
      }
      const pos = await leerPosicion(p)
      assert.equal(pos.frame, i + 1, `el texto dice frame ${pos.frame}, se pidió el ${i + 1} (${como})`)
      assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i, `el canvas muestra otro frame que el ${i + 1} (${como})`)
      assert.ok(Math.abs(pos.t - tiempos[i]) < 0.0015, `frame ${i + 1}: t = ${pos.t} s, se esperaba ${tiempos[i].toFixed(3)} s`)
    }
  })

  it('avisa de que los fps son variables y da el rango entre frames', async () => {
    await abrirPestana(p, 'video')
    const datos = await p.locator('section', { has: p.getByRole('heading', { name: 'Datos del vídeo' }) }).innerText()
    assert.match(datos, /variable/)
    assert.match(datos, /33,\d.{1,3}6\d,\d ms/s) // 33 ms normales y 66 ms con el frame que falta
  })

  it('teclado: flechas, Mayús para saltar de 10 en 10, Inicio y Fin', async () => {
    await irAFrame(p, 50)
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 52)
    await p.keyboard.press('Shift+ArrowLeft')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 42)
    await p.keyboard.press('End')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 120)
    await p.keyboard.press('Home')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 1)
  })

  it('las flechas sobre el corte del filtro cambian el corte, no el frame', async () => {
    await irAFrame(p, 50)
    await abrirPestana(p, 'analisis')
    const corte = p.getByRole('slider', { name: 'Frecuencia de corte del filtro' })
    const antes = await textoDe(p, 'corte')
    await corte.focus()
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 51)
    assert.notEqual(await textoDe(p, 'corte'), antes)
    await corte.blur()
  })

  it('mantener pulsado «siguiente» avanza seguido y se para al soltar', async () => {
    await irAFrame(p, 0)
    const caja = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
    await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
    await p.mouse.down()
    await p.waitForTimeout(1500)
    await p.mouse.up()
    await esperarQuieto(p)
    const alSoltar = (await leerPosicion(p)).frame
    assert.ok(alSoltar > 6, `solo ha avanzado hasta el frame ${alSoltar}`)
    await p.waitForTimeout(800)
    assert.equal((await leerPosicion(p)).frame, alSoltar, 'sigue avanzando después de soltar')
  })
})

describe('marcado: errores sobre el vídeo y siguiente marcador', () => {
  let p
  before(async () => {
    p = await abrirApp(navegador)
    await cargarVideo(p, videos.verde.ruta)
  })
  after(() => p?.close())

  it('un toque fuera de un gomet muestra el motivo encima del vídeo, con detalle técnico', async () => {
    await tocarVideo(p, 60, 300)
    const error = p.getByTestId('error-toque')
    await error.waitFor()
    const texto = await error.innerText()
    assert.match(texto, /gomet/)
    assert.match(texto, /tono \d+°, saturación/)
  })

  it('el mensaje de error no tapa la imagen (si no, el siguiente toque cae en él en vez de marcar)', async () => {
    const error = await p.getByTestId('error-toque').boundingBox()
    const imagen = await cajaVideo(p)
    assert.ok(error.y >= imagen.y + imagen.height - 1, `el error empieza en y=${error.y} y la imagen acaba en ${imagen.y + imagen.height}`)
  })

  it('cambiar de frame quita el error (y con él «Colocarlo aquí a ojo», que marcaría el frame anterior)', async () => {
    await irAFrame(p, 5)
    assert.equal(await p.getByTestId('error-toque').count(), 0)
    await irAFrame(p, 0)
    await tocarVideo(p, 60, 300)
    await p.getByTestId('error-toque').waitFor()
  })

  it('un toque correcto limpia el error y pasa al siguiente marcador', async () => {
    const [cadera] = videos.verde.verdad[0].ps
    await tocarVideo(p, cadera.x + 2, cadera.y - 2)
    await p.getByTestId('error-toque').waitFor({ state: 'detached' })
    assert.equal(await p.getByRole('radio', { name: /Epicóndilo/ }).getAttribute('aria-checked'), 'true')
    assert.match(await p.getByRole('radiogroup').innerText(), /Trocánter\s+a mano/)
  })
})

describe('lupa: anillo donde quedará el marcador', () => {
  it('sin gomet en la lupa no hay anillo; con él dentro, sí, y al soltar va a su centro', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const caja = await cajaVideo(p)
      const enPantalla = (x, y) => [caja.x + (x / 640) * caja.width, caja.y + (y / 360) * caja.height]
      const lupa = p.getByTestId('lupa')
      const ps = videos.verde.verdad[0].ps
      // En este vídeo (640 × 360 a 390 px de ancho) la lupa abarca 40 px del vídeo: busca a 20 del dedo.
      for (const [k, q] of ps.entries()) {
        await p.mouse.move(...enPantalla(q.x + 45, q.y + 30))
        await p.mouse.down()
        await lupa.waitFor()
        assert.equal(await lupa.getAttribute('data-gomet'), 'no', 'a 54 px no debería encontrar el gomet')
        await p.mouse.move(...enPantalla(q.x + 12, q.y - 8), { steps: 5 })
        assert.equal(await lupa.getAttribute('data-gomet'), 'si', 'a 14 px debería encontrar el gomet')
        await p.mouse.up()
        assert.equal(await p.getByTestId('error-toque').count(), 0, `marcador ${k + 1}: error al soltar`)
      }
      // Soltando a 14 px de cada gomet, el ángulo es el real: los tres quedaron en su centro.
      assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[0].flexion) < TOLERANCIA_GRADOS)
    } finally {
      await p.close()
    }
  })
})

// La gráfica completa está siempre a la vista a 1280 px; en el móvil solo en «Solo gráficas» (probada en «vistas ampliadas del móvil»).
describe('seguimiento y gráfica con gomets verdes', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.verde, { ancho: 1280 }))
  })
  after(() => p?.close())

  it('recorre el vídeo entero sin huecos', () => {
    assert.match(aviso, /sin huecos/)
  })

  it('el ángulo medido coincide con el real (tolerancia 0,5°) con fps variable', async () => {
    await compararAngulos(p, videos.verde.verdad)
  })

  it('el ángulo filtrado (6 Hz, coordenadas remuestreadas por el fps variable) coincide con el real', async () => {
    assert.match(await textoDe(p, 'corte'), /6,0 Hz/)
    // El corte aplicado se ve también en el botón de la serie filtrada de la gráfica.
    assert.match(await p.getByTestId('serie-filtrado').innerText(), /Filtrado 6,0 Hz/)
    for (const i of FRAMES_A_COMPARAR) {
      await irAFrame(p, i)
      const filtrado = await leerAngulo(p, 'angulo-filtrado')
      assert.ok(
        Math.abs(filtrado - videos.verde.verdad[i].flexion) < TOLERANCIA_GRADOS,
        `frame ${i + 1}: filtrado ${filtrado}°, real ${videos.verde.verdad[i].flexion.toFixed(2)}°`,
      )
    }
    assert.equal(await p.getByTestId('tramos-cortos').count(), 0)
  })

  it('la gráfica resume el máximo (90°) y el mínimo (0°) sin instantes sin valor', async () => {
    const resumen = await p.getByTestId('resumen-grafica').innerText()
    assert.match(resumen, /máx\. 9[0-1],\d° \(t = 2,0\d s\)/)
    assert.match(resumen, /mín\. 0,0°/)
    assert.doesNotMatch(resumen, /sin valor/)
  })

  it('tocar la gráfica salta al frame más cercano a ese instante (±1 frame)', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    for (const f of [0.25, 0.5, 0.75, 0.999]) {
      await p.mouse.click(caja.x + caja.width * f, caja.y + caja.height / 2)
      await esperarQuieto(p)
      const t = tiempos[0] + f * (tiempos.at(-1) - tiempos[0])
      const esperado = frameMasCercano(tiempos, t) + 1
      const { frame } = await leerPosicion(p)
      assert.ok(Math.abs(frame - esperado) <= 1, `al ${f * 100} % de la gráfica: frame ${frame}, esperado ${esperado}`)
    }
  })

  it('arrastrar sobre la gráfica mueve el vídeo con el dedo', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    await p.mouse.move(caja.x + caja.width * 0.1, caja.y + caja.height / 2)
    await p.mouse.down()
    await p.mouse.move(caja.x + caja.width * 0.4, caja.y + caja.height / 2, { steps: 8 })
    await p.mouse.up()
    await esperarQuieto(p)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.4 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
  })

  it('las series de la gráfica dan en cada frame el ángulo real (crudo y filtrado) y la velocidad real', async () => {
    const verdad = videos.verde.verdad
    for (const i of [10, 30, 41, 60, 81, 100, 110]) {
      await irAFrame(p, i)
      const crudo = await leerNumero(p, 'valor-serie-crudo')
      const filtrado = await leerNumero(p, 'valor-serie-filtrado')
      const v = await leerNumero(p, 'valor-serie-velocidad')
      assert.ok(Math.abs(crudo - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: crudo ${crudo}°, real ${verdad[i].flexion.toFixed(2)}°`)
      assert.ok(Math.abs(filtrado - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: filtrado ${filtrado}°`)
      assert.ok(Math.abs(v - velReal(verdad[i].t)) < 3, `frame ${i + 1}: ${v} °/s, real ${velReal(verdad[i].t).toFixed(1)} °/s`)
    }
    // Sin derivada en el primer frame: la serie de velocidad no tiene valor (nunca 0).
    await irAFrame(p, 0)
    assert.equal(await p.getByTestId('valor-serie-velocidad').innerText(), '—')
  })

  it('cambiar de frame no redibuja la gráfica: el cursor va en una capa aparte, en su instante', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    await irAFrame(p, 20)
    const redibujos = async () => [await p.getByTestId('grafica-angulo').getAttribute('data-redibujos'), await p.getByTestId('grafica-velocidad').getAttribute('data-redibujos')]
    const antes = await redibujos()
    assert.ok(antes.every((n) => Number(n) > 0))
    for (const i of [21, 22, 40, 41, 90]) {
      await irAFrame(p, i)
      for (const id of ['grafica-angulo', 'grafica-velocidad']) {
        // La línea del cursor cae en el instante del frame (±1 px).
        const area = await p.getByTestId(`${id}-area`).boundingBox()
        const linea = await p.getByTestId(`${id}-cursor`).boundingBox()
        const esperado = area.x + ((tiempos[i] - tiempos[0]) / (tiempos.at(-1) - tiempos[0])) * area.width
        assert.ok(Math.abs(linea.x - esperado) <= 1.5, `${id}, frame ${i + 1}: cursor en ${linea.x}, esperado ${esperado}`)
      }
    }
    for (let k = 0; k < 5; k++) {
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
    }
    assert.deepEqual(await redibujos(), antes)
  })

  it('cada interruptor oculta y muestra su serie; un panel sin series no se dibuja', async () => {
    const velocidad = p.getByTestId('serie-velocidad')
    assert.equal(await velocidad.getAttribute('aria-pressed'), 'true')
    await velocidad.click()
    assert.equal(await velocidad.getAttribute('aria-pressed'), 'false')
    assert.equal(await p.getByTestId('grafica-velocidad').count(), 0)
    await velocidad.click()
    await p.getByTestId('grafica-velocidad').waitFor()
    // Sin crudo ni filtrado, el panel del ángulo desaparece; con uno de los dos, vuelve.
    await p.getByTestId('serie-crudo').click()
    assert.equal(await p.getByTestId('grafica-angulo').count(), 1)
    await p.getByTestId('serie-filtrado').click()
    assert.equal(await p.getByTestId('grafica-angulo').count(), 0)
    await p.getByTestId('serie-crudo').click()
    await p.getByTestId('serie-filtrado').click()
    await p.getByTestId('grafica-angulo').waitFor()
  })

  it('longitud de los segmentos: oculta al empezar; mostrada, cerca de 0 % en todo el vídeo (son rígidos)', async () => {
    const botones = p.locator('[data-testid^="serie-segmento-"]')
    assert.equal(await botones.count(), 2)
    assert.equal(await p.getByTestId('grafica-segmentos').count(), 0)
    for (let k = 0; k < 2; k++) {
      assert.equal(await botones.nth(k).getAttribute('aria-pressed'), 'false')
      await botones.nth(k).click()
    }
    await p.getByTestId('grafica-segmentos').waitFor()
    const ids = await botones.evaluateAll((bs) => bs.map((b) => b.dataset.testid.replace('serie-', '')))
    // En el vídeo, cadera–rodilla mide siempre 130 px y rodilla–tobillo 120 px: 0 % en cada frame.
    for (const i of [0, 30, 41, 60, 81, 119]) {
      await irAFrame(p, i)
      for (const id of ids) {
        const v = await leerNumero(p, `valor-serie-${id}`)
        assert.ok(Math.abs(v) < 1, `${id}, frame ${i + 1}: ${v} %`)
      }
    }
    // Tocar esta gráfica también lleva al frame.
    const caja = await cajaElemento(p, 'grafica-segmentos-area')
    await p.mouse.click(caja.x + caja.width * 0.3, caja.y + caja.height / 2)
    await esperarQuieto(p)
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.3 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
    for (let k = 0; k < 2; k++) await botones.nth(k).click()
    assert.equal(await p.getByTestId('grafica-segmentos').count(), 0)
  })

  it('tocar la gráfica de velocidad también salta al frame más cercano', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-velocidad-area')
    await p.mouse.click(caja.x + caja.width * 0.6, caja.y + caja.height / 2)
    await esperarQuieto(p)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.6 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
  })
})

describe('progreso del seguimiento: en la franja del deslizador y en «Parar»', () => {
  it('mientras se sigue, «Parar» lleva el porcentaje y la franja se va poniendo verde', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      const parar = p.getByRole('button', { name: /^Parar/ })
      await parar.waitFor()
      assert.match(await parar.innerText(), /Parar\s+\d+ %/)
      await p.getByTestId('aviso').waitFor({ timeout: 90000 })
      assert.equal(await p.getByTestId('progreso-seguimiento').count(), 0)
    } finally {
      await p.close()
    }
  })
})

/**
 * Frena el worker de seguimiento: cada lectura de píxeles tarda `ms` más. El seguimiento del vídeo sintético dura
 * menos de un segundo; frenado, dura varios y da tiempo a mirar y a tocar a medias (frenar la CPU no frena el worker).
 */
async function frenarWorker(p, ms = 15) {
  await p.context().route('**/seguimiento.worker-*.js', async (ruta) => {
    const r = await ruta.fetch()
    const freno = `{ const g = OffscreenCanvasRenderingContext2D.prototype.getImageData
      OffscreenCanvasRenderingContext2D.prototype.getImageData = function (...a) {
        const fin = performance.now() + ${ms}; while (performance.now() < fin); return g.apply(this, a) } }\n`
    await ruta.fulfill({ response: r, body: freno + (await r.text()) })
  })
}

describe('«Parar» a mitad del seguimiento', () => {
  let p
  const verdad = () => videos.verde.verdad
  before(async () => {
    p = await abrirApp(navegador, { ancho: 1280 })
    await frenarWorker(p)
    await cargarVideo(p, videos.verde.ruta)
    await marcarTres(p, verdad()[0].ps)
  })
  after(() => p?.close())

  it('se queda lo seguido hasta parar (con el ángulo real), lo de después sin seguir, y se avisa', async () => {
    await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
    // Varios lotes del worker ya aplicados: el porcentaje de «Parar» pasa del 30 %.
    await p.waitForFunction(() => Number.parseInt(document.querySelector('[data-testid=progreso-seguimiento]')?.textContent ?? '0') >= 30, null, {
      timeout: 60000,
    })
    await p.getByRole('button', { name: /^Parar/ }).click()
    await p.getByTestId('aviso').waitFor({ timeout: 30000 })
    const aviso = (await p.getByTestId('aviso').innerText()).replace(/\s+/g, ' ')
    assert.match(aviso, /^Seguimiento parado/, `aviso: «${aviso}»`)
    assert.doesNotMatch(aviso, /completado/)
    assert.equal(await p.getByTestId('progreso-seguimiento').count(), 0)
    await p.getByRole('button', { name: 'Seguir desde aquí' }).waitFor()
    // Lo seguido antes de parar se conserva y es el ángulo real.
    for (const i of [1, 20]) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad()[i].flexion.toFixed(2)}°`)
    }
    // Lo que no llegó a seguirse queda sin posición: sin ángulo, nada inventado.
    await irAFrame(p, verdad().length - 1)
    assert.ok(Number.isNaN(await leerAngulo(p)), 'el último frame no se llegó a seguir y tiene ángulo')
  })

  it('seguir desde un frame ya seguido termina el vídeo con el ángulo real', async () => {
    await irAFrame(p, 20)
    const aviso = await seguirHastaElFinal(p)
    assert.match(aviso, /completado hasta el final del vídeo, sin huecos/, `aviso: «${aviso}»`)
    for (const i of [60, 100, verdad().length - 1]) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad()[i].flexion.toFixed(2)}°`)
    }
  })
})

describe('seguir de nuevo desde un frame intermedio de un vídeo ya seguido', () => {
  it('lo de antes no cambia, lo de después se rehace con el ángulo real y no quedan huecos', async () => {
    const { p } = await seguirVideo(videos.verde)
    try {
      const verdad = videos.verde.verdad
      await irAFrame(p, 20)
      const antes20 = await textoDe(p, 'angulo')
      await irAFrame(p, 60)
      const aviso = await seguirHastaElFinal(p)
      assert.match(aviso, /completado hasta el final del vídeo, sin huecos/, `aviso: «${aviso}»`)
      // Antes del frame de partida no se toca nada (mismo texto, no solo el mismo valor redondeado a la tolerancia).
      await irAFrame(p, 20)
      assert.equal(await textoDe(p, 'angulo'), antes20)
      for (const i of [61, 90, verdad.length - 1]) {
        await irAFrame(p, i)
        const medido = await leerAngulo(p)
        assert.ok(Math.abs(medido - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad[i].flexion.toFixed(2)}°`)
      }
      assert.doesNotMatch(await p.getByTestId('resumen-grafica').innerText(), /sin valor/)
    } finally {
      await p.close()
    }
  })
})

describe('seguimiento con gomets rojos sobre piel', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.rojo))
  })
  after(() => p?.close())

  it('los separa de la piel y recorre el vídeo sin huecos', () => {
    assert.match(aviso, /sin huecos/)
  })

  it('el ángulo medido coincide con el real (tolerancia 0,5°)', async () => {
    await compararAngulos(p, videos.rojo.verdad)
  })
})

describe('un gomet tapado unos frames', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.oculto))
  })
  after(() => p?.close())

  const ocultos = () => videos.oculto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))

  it('el aviso, la gráfica y la franja cuentan exactamente los frames tapados', async () => {
    const n = ocultos().length
    assert.ok(n >= 6, 'el vídeo de prueba debería tapar el tobillo varios frames')
    assert.match(aviso, new RegExp(`Maléolo no tiene posición fiable en ${n} frames`))
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${n} sin valor`))
  })

  it('durante el hueco no hay ángulo (nunca 0 ni inventado) y fuera de él sí', async () => {
    const [primero] = ocultos()
    await irAFrame(p, primero + 2)
    assert.match(await p.getByRole('radiogroup').innerText(), /Maléolo\s+perdido/)
    assert.ok(Number.isNaN(await leerAngulo(p)))
    const despues = ocultos().at(-1) + 3
    await irAFrame(p, despues)
    assert.match(await p.getByRole('radiogroup').innerText(), /Maléolo\s+seguido/)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[despues].flexion) < TOLERANCIA_GRADOS)
  })

  it('el filtro no cruza el hueco: dentro no hay ángulo filtrado; justo a los lados, sí y cerca del real', async () => {
    const tapados = ocultos()
    await irAFrame(p, tapados[2])
    assert.equal(await textoDe(p, 'angulo-filtrado'), '—')
    // Bordes de los dos tramos (reflexión en los extremos): ±1°.
    for (const i of [tapados[0] - 1, tapados.at(-1) + 1]) {
      await irAFrame(p, i)
      const filtrado = await leerAngulo(p, 'angulo-filtrado')
      assert.ok(Math.abs(filtrado - videos.oculto.verdad[i].flexion) < 1, `frame ${i + 1}: filtrado ${filtrado}°`)
    }
  })

  it('«Ir al primer frame con hueco» lleva al primero', async () => {
    const [primero] = ocultos()
    await irAFrame(p, 0)
    await p.getByRole('button', { name: new RegExp(`Ir al primer frame con hueco \\(${primero + 1}\\)`) }).click()
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, primero + 1)
  })

  it('el desplegable «Por qué» explica el motivo', async () => {
    await p.getByText('Por qué (para diagnosticar)').click()
    assert.match(await p.getByRole('status').innerText(), /Maléolo: \d+ .*(sin su color|tamaño distinto|lejos de lo esperado|dudosa)/s)
  })
})

describe('persistencia: marcar, seguir, recargar y recuperar', () => {
  let p
  let n
  /** Lo que mostraba el visor antes de recargar: ángulo en cada frame comparado, resumen y estado de los marcadores. */
  const antes = { angulos: [], resumen: '', marcadores: '' }

  before(async () => {
    ;({ p } = await seguirVideo(videos.verde))
    n = videos.verde.verdad.length
    await esperarGuardado(p, n)
    for (const i of FRAMES_A_COMPARAR) {
      await irAFrame(p, i)
      antes.angulos.push(await p.getByTestId('angulo').innerText())
    }
    antes.resumen = await p.getByTestId('resumen-grafica').innerText()
    await irAFrame(p, 0)
    antes.marcadores = await p.getByRole('radiogroup').innerText()
  })
  after(() => p?.close())

  it('tras recargar, la portada lista la sesión con su resumen', async () => {
    await p.reload()
    const sesion = p.getByTestId('sesion-guardada')
    await sesion.waitFor()
    assert.equal(await sesion.count(), 1)
    const texto = await sesion.innerText()
    assert.match(texto, /verde/)
    assert.match(texto, /mira a la derecha/)
    // Los 3 gomets se marcaron a mano en el primer frame y el resto se siguió.
    assert.match(texto, new RegExp(`${n} de ${n} frames seguidos · 1 con marcas a mano`))
  })

  it('al abrir el mismo vídeo ofrece recuperar el trabajo y lo recupera tal cual', async () => {
    await p.setInputFiles('input[type=file]', videos.verde.ruta)
    await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
    assert.equal(await p.getByTestId('candidata').count(), 1)
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await esperarQuieto(p)
    // Sin volver a preguntar la orientación: se guardó con la sesión.
    assert.match(await p.getByTestId('aviso').innerText(), /Trabajo recuperado/)
    // Ya está guardado: no debe decir «en cuanto marques algo».
    assert.match(await p.getByTestId('guardado').innerText(), /Guardado en este dispositivo\. Lo que cambies se guarda solo/)
    for (const [k, i] of FRAMES_A_COMPARAR.entries()) {
      await irAFrame(p, i)
      assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[k], `frame ${i + 1}`)
      assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[i].flexion) < TOLERANCIA_GRADOS)
    }
    assert.equal(await p.getByTestId('resumen-grafica').innerText(), antes.resumen)
    await irAFrame(p, 0)
    assert.equal(await p.getByRole('radiogroup').innerText(), antes.marcadores)
    assert.match(antes.marcadores, /a mano/)
  })

  it('recuperar no crea otra sesión, y seguir trabajando actualiza la misma', async () => {
    // Recuperado no hay marcador elegido: se elige el trocánter y se corrige en el frame 6.
    await irAFrame(p, 5)
    await p.getByRole('radio', { name: /Trocánter/ }).click()
    await tocarVideo(p, videos.verde.verdad[5].ps[0].x + 1, videos.verde.verdad[5].ps[0].y - 1)
    await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo' }).waitFor({ state: 'attached', timeout: 10000 })
    await p.reload()
    await p.getByTestId('sesion-guardada').waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 1)
    assert.match(await p.getByTestId('sesion-guardada').innerText(), /2 con marcas a mano/)
  })

  it('«Continuar» con otro vídeo explica que no es el suyo y no abre nada', async () => {
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.numerado.ruta)
    const error = p.getByText(/no es el vídeo de la sesión/)
    await error.waitFor({ timeout: 20000 })
    assert.match(await error.innerText(), /tamaño/)
    assert.equal(await p.getByTestId('lienzo').count(), 0)
  })

  it('un vídeo sin trabajo guardado no pregunta y va a la orientación', async () => {
    await p.setInputFiles('input[type=file]', videos.numerado.ruta)
    await p.getByRole('button', { name: 'Mira a la derecha' }).waitFor({ timeout: 20000 })
    assert.equal(await p.getByText('Ya has trabajado con este vídeo').count(), 0)
    await p.reload()
  })

  it('«Continuar» con su vídeo lo recupera directamente', async () => {
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.verde.ruta)
    await esperarQuieto(p)
    assert.match(await p.getByTestId('aviso').innerText(), /Trabajo recuperado/)
    await irAFrame(p, FRAMES_A_COMPARAR[3])
    assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[3])
  })

  it('el mismo vídeo con otro nombre (selector de fotos de Android) se reconoce, avisando', async () => {
    const copia = join(tmpdir(), '1000012345.webm')
    await copyFile(videos.verde.ruta, copia)
    await p.reload()
    await p.setInputFiles('input[type=file]', copia)
    const candidata = p.getByTestId('candidata')
    await candidata.waitFor({ timeout: 20000 })
    assert.match(await candidata.innerText(), new RegExp(`Se guardó como «${basename(videos.verde.ruta)}».*es el mismo vídeo`, 's'))
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await esperarQuieto(p)
    await irAFrame(p, FRAMES_A_COMPARAR[3])
    assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[3])
  })

  it('«Empezar de cero» deja lo guardado y crea otra sesión al marcar', async () => {
    await p.reload()
    await p.setInputFiles('input[type=file]', videos.verde.ruta)
    await p.getByRole('button', { name: 'Empezar de cero' }).click({ timeout: 20000 })
    await p.getByRole('button', { name: 'Mira a la derecha' }).click()
    await esperarQuieto(p)
    assert.equal(await leerAngulo(p).then(Number.isNaN), true)
    assert.match(await p.getByTestId('guardado').innerText(), /en cuanto marques algo/)
    await marcarTres(p, videos.verde.verdad[0].ps)
    // Se recarga sin esperar al guardado diferido (1 s): lo guarda el aviso de que la página se oculta.
    await p.reload()
    await p.getByTestId('sesion-guardada').first().waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 2)
  })

  it('borrar pide confirmación y quita la sesión de la lista', async () => {
    const primera = p.getByTestId('sesion-guardada').first()
    await primera.getByRole('button', { name: /^Borrar/ }).click()
    await primera.getByRole('button', { name: 'No' }).click()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 2)
    await primera.getByRole('button', { name: /^Borrar/ }).click()
    await primera.getByRole('button', { name: 'Sí, borrar' }).click()
    await p.waitForFunction(() => document.querySelectorAll('[data-testid=sesion-guardada]').length === 1)
    await p.getByTestId('sesion-guardada').getByRole('button', { name: /^Borrar/ }).click()
    await p.getByRole('button', { name: 'Sí, borrar' }).click()
    await p.getByRole('heading', { name: 'Sesiones guardadas' }).waitFor({ state: 'detached' })
  })
})

describe('filtro: el corte se guarda con la sesión', () => {
  it('cambiar el corte, recargar y recuperar lo deja como estaba', async () => {
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, videos.verde.verdad.length)
      await abrirPestana(p, 'analisis')
      await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('9')
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await esperarFiltroGuardado(p, 9)
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await abrirPestana(p, 'analisis')
      assert.equal(await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).inputValue(), '9')
      await irAFrame(p, 60)
      assert.ok(Math.abs((await leerAngulo(p, 'angulo-filtrado')) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
      // «Volver a 6 Hz» y se guarda también.
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Volver a 6 Hz' }).click()
      await esperarFiltroGuardado(p, 6)
    } finally {
      await p.close()
    }
  })
})

describe('filtro: uno para toda la sesión, también con dos vistas', () => {
  // Antes cada vista tenía su corte y solo se guardaba el de A: cambiado con B activa, al recuperar B volvía al de A.
  it('cambiar el corte con B activa lo cambia en las dos, se guarda y se mantiene al recuperar', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    const corte = () => p.getByRole('slider', { name: 'Frecuencia de corte del filtro' })
    try {
      await abrirPestana(p, 'video')
      await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.frontal.ruta)
      await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
      await p.getByTestId('conmutador-vista').waitFor()
      await esperarQuieto(p)
      await p.getByTestId('vista-B').click()
      await esperarQuieto(p)
      await abrirPestana(p, 'analisis')
      assert.equal(await corte().inputValue(), '6', 'B arranca con el corte de la sesión')
      await corte().fill('9')
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await p.getByTestId('vista-A').click()
      await esperarQuieto(p)
      assert.equal(await corte().inputValue(), '9', 'A tiene el mismo corte')
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await esperarFiltroGuardado(p, 9)
      await p.reload()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
      await p.getByTestId('faltan-videos').waitFor({ timeout: 20000 })
      await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.frontal.ruta)
      await p.getByTestId('conmutador-vista').waitFor({ timeout: 20000 })
      await esperarQuieto(p)
      await abrirPestana(p, 'analisis')
      assert.equal(await corte().inputValue(), '9', 'A al recuperar')
      await p.getByTestId('vista-B').click()
      await esperarQuieto(p)
      assert.equal(await corte().inputValue(), '9', 'B al recuperar (antes volvía al de A sin aviso)')
    } finally {
      await p.close()
    }
  })
})

describe('persistencia: recuperar a medio marcar', () => {
  it('elige el primer marcador que falta, como al marcar', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const [cadera] = videos.verde.verdad[0].ps
      await tocarVideo(p, cadera.x, cadera.y)
      await esperarGuardado(p, 1)
      await p.reload()
      await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.verde.ruta)
      await esperarQuieto(p)
      assert.equal(await p.getByRole('radio', { name: /Trocánter/ }).getAttribute('aria-checked'), 'false')
      assert.equal(await p.getByRole('radio', { name: /Epicóndilo/ }).getAttribute('aria-checked'), 'true')
      // Y se puede seguir marcando sin elegirlo antes.
      const [, rodilla] = videos.verde.verdad[0].ps
      await tocarVideo(p, rodilla.x, rodilla.y)
      assert.equal(await p.getByRole('radio', { name: /Maléolo/ }).getAttribute('aria-checked'), 'true')
    } finally {
      await p.close()
    }
  })

  it('quitar lo único que había también se guarda (no vuelve al recuperar)', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const [cadera] = videos.verde.verdad[0].ps
      await tocarVideo(p, cadera.x, cadera.y)
      await esperarGuardado(p, 1)
      // Sin elegir el marcador antes: el botón sale solo en el frame con la marca a mano.
      await p.getByRole('button', { name: /Quitar la marca a mano: Trocánter/ }).click()
      await esperarGuardado(p, 0)
    } finally {
      await p.close()
    }
  })
})

/** Elige un marcador (sin desmarcarlo si ya estaba elegido). */
async function elegirMarcador(p, nombre) {
  const r = p.getByRole('radio', { name: new RegExp(nombre) })
  if ((await r.getAttribute('aria-checked')) !== 'true') await r.click()
}
const estadoMarcador = async (p, nombre) =>
  new RegExp(`${nombre}\\s+(\\S[^\\n]*)`).exec(await p.getByRole('radiogroup').innerText())?.[1]?.trim()

describe('corrección manual: arrastrar, a ojo, quitar y anclas', () => {
  let p
  let aviso
  const ocultos = () => videos.oculto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.oculto))
  })
  after(() => p?.close())

  it('un hueco de 0,3 s no se ofrece para rellenar', async () => {
    assert.match(aviso, /no tiene posición fiable/)
    assert.equal(await p.getByTestId('huecos-cortos').count(), 0)
  })

  it('arrastrar con la lupa coloca el marcador en el gomet donde se suelta', async () => {
    const i = 30
    await irAFrame(p, i)
    await elegirMarcador(p, 'Trocánter')
    const real = videos.oculto.verdad[i].ps[0]
    const caja = await cajaVideo(p)
    const enPantalla = (x, y) => [caja.x + (x / 640) * caja.width, caja.y + (y / 360) * caja.height]
    await p.mouse.move(...enPantalla(real.x + 40, real.y + 30))
    await p.mouse.down()
    await p.mouse.move(...enPantalla(real.x + 1, real.y - 1), { steps: 6 })
    await p.mouse.up()
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'a mano')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[i].flexion) < TOLERANCIA_GRADOS)
  })

  it('con el gomet tapado ofrece colocarlo a ojo, y queda marcado a mano', async () => {
    const i = ocultos()[2]
    await irAFrame(p, i)
    assert.ok(Number.isNaN(await leerAngulo(p)))
    await elegirMarcador(p, 'Maléolo')
    const real = videos.oculto.verdad[i].ps[2]
    await tocarVideo(p, real.x, real.y)
    await p.getByTestId('error-toque').waitFor()
    await p.getByRole('button', { name: 'Colocarlo aquí a ojo' }).click()
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[i].flexion) < 1.5)
  })

  it('al seguir de nuevo, lo marcado a mano es un ancla: se respeta y deja de contar como hueco', async () => {
    await irAFrame(p, 0)
    const texto = await seguirHastaElFinal(p)
    // El aviso lo cuenta el worker: si no recibiera las anclas, contaría el frame a ojo como hueco.
    assert.match(texto, new RegExp(`Maléolo no tiene posición fiable en ${ocultos().length - 1} frames`))
    await irAFrame(p, ocultos()[2])
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'a mano')
  })

  it('si no se puede arrancar desde un frame (gomet a ojo, tapado), lo seguido después se conserva', async () => {
    const despues = ocultos().at(-1) + 3
    await irAFrame(p, ocultos()[2])
    const texto = await seguirHastaElFinal(p)
    assert.match(texto, /No reconozco Maléolo/)
    await irAFrame(p, despues)
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'seguido')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[despues].flexion) < TOLERANCIA_GRADOS)
  })

  it('una marca a mano equivocada se puede quitar', async () => {
    await irAFrame(p, ocultos()[2])
    // Aunque no sea el marcador elegido: sale un botón por cada marcador con marca a mano en el frame.
    await elegirMarcador(p, 'Epicóndilo')
    await p.getByRole('button', { name: /Quitar la marca a mano: Maléolo/ }).click()
    assert.equal(await estadoMarcador(p, 'Maléolo'), '—')
    assert.ok(Number.isNaN(await leerAngulo(p)))
  })

  it('antes de seguir avisa de las marcas a mano posteriores (serán anclas) y deja quitarlas', async () => {
    // Queda la del trocánter en el frame 31 (la que se arrastró con la lupa).
    await irAFrame(p, 0)
    const aviso = p.getByTestId('aviso-anclas')
    await aviso.waitFor()
    assert.match(await aviso.innerText(), /Hay marcas a mano más adelante \(frames 31\)/)
    // Desde un frame posterior a todas, no hay nada que avisar.
    await irAFrame(p, 60)
    assert.equal(await p.getByTestId('aviso-anclas').count(), 0)
    await irAFrame(p, 0)
    // También en el vídeo grande (versión corta), que es donde se marca y se sigue.
    await p.getByTestId('ampliar-video').click()
    const compacto = p.getByTestId('marcado-compacto').getByTestId('aviso-anclas')
    await compacto.waitFor()
    assert.match(await compacto.innerText(), /frames 31\): se usan como anclas/)
    await p.getByTestId('reducir-video').click()
    await aviso.getByRole('button', { name: 'Quitar las marcas a mano posteriores' }).click()
    assert.equal(await p.getByTestId('aviso-anclas').count(), 0)
    assert.match(await p.getByTestId('aviso').innerText(), /Quitadas 1 marca a mano posteriores al frame 1/)
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), '—')
    // Y se puede volver a seguir: el hueco se rehace y ya no hay anclas.
    await irAFrame(p, 0)
    const texto = await seguirHastaElFinal(p)
    assert.match(texto, /Maléolo no tiene posición fiable en \d+ frames/)
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'seguido')
  })
})

describe('mientras se sigue, lo filtrado se rehace (no se queda en la pasada anterior)', () => {
  let p
  const verdad = () => videos.verde.verdad
  before(async () => {
    p = await abrirApp(navegador, { ancho: 1280 })
    // El seguimiento del vídeo sintético dura menos de un segundo: con cada lectura de píxeles del worker
    // frenada 15 ms, dura varios y da tiempo a mirar a medias (frenar la CPU no frena el worker).
    await p.context().route('**/seguimiento.worker-*.js', async (ruta) => {
      const r = await ruta.fetch()
      const freno = `{ const g = OffscreenCanvasRenderingContext2D.prototype.getImageData
        OffscreenCanvasRenderingContext2D.prototype.getImageData = function (...a) {
          const fin = performance.now() + 15; while (performance.now() < fin); return g.apply(this, a) } }\n`
      await ruta.fulfill({ response: r, body: freno + (await r.text()) })
    })
    await cargarVideo(p, videos.verde.ruta)
    await marcarTres(p, verdad()[0].ps)
  })
  after(() => p?.close())

  const siguiendo = async () => (await p.getByTestId('progreso-seguimiento').count()) > 0
  async function pulsarSeguir() {
    await abrirPestana(p, 'marcar')
    const seguir = p.getByRole('button', { name: 'Seguir desde aquí' })
    await centrarLibre(seguir)
    await seguir.click()
    await p.getByTestId('progreso-seguimiento').waitFor()
  }
  /** Toca la gráfica en el instante del frame i (se puede mientras se sigue). */
  async function tocarFrame(i) {
    const ts = verdad().map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    await p.mouse.click(caja.x + (caja.width * (ts[i] - ts[0])) / (ts.at(-1) - ts[0]), caja.y + caja.height / 2)
    await esperarQuieto(p)
  }

  it('la primera vez, el ángulo filtrado aparece antes de acabar de seguir y da el real', async () => {
    await pulsarSeguir()
    await tocarFrame(20)
    // Antes, lo filtrado era lo de antes de seguir (solo el frame 0) hasta parar: «—» todo el seguimiento.
    await p.waitForFunction(() => /\d/.test(document.querySelector('[data-testid=valor-serie-filtrado]')?.textContent ?? ''), null, { timeout: 15000 })
    const filtrado = await leerNumero(p, 'valor-serie-filtrado')
    assert.ok(await siguiendo(), 'el ángulo filtrado no apareció hasta acabar de seguir')
    assert.ok(Math.abs(filtrado - verdad()[20].flexion) < 1, `filtrado ${filtrado}°, real ${verdad()[20].flexion.toFixed(2)}°`)
    await p.getByTestId('aviso').waitFor({ timeout: 90000 })
  })

  it('al seguir de nuevo desde un frame intermedio, no queda ángulo filtrado donde ya no hay nada seguido', async () => {
    await irAFrame(p, 30)
    await pulsarSeguir()
    await tocarFrame(115)
    // Primero lo filtrado y después lo crudo: si lo filtrado tiene valor, el frame ya estaba seguido al filtrar.
    const filtrado = await p.getByTestId('valor-serie-filtrado').innerText()
    const crudo = await p.getByTestId('valor-serie-crudo').innerText()
    assert.ok(await siguiendo(), 'el seguimiento acabó antes de poder mirar: la prueba no dice nada')
    assert.equal(crudo.trim(), '—', 'el frame 116 aún no se ha vuelto a seguir')
    assert.equal(filtrado.trim(), '—', `ángulo filtrado ${filtrado} en un frame sin nada seguido (lo de la pasada anterior)`)
    await p.getByTestId('aviso').waitFor({ timeout: 90000 })
    await esperarQuieto(p)
    assert.ok(Math.abs((await leerNumero(p, 'valor-serie-filtrado')) - verdad()[115].flexion) < TOLERANCIA_GRADOS)
  })
})

describe('ancla a ojo lejos del gomet: se vuelve a encontrar (reenganche)', () => {
  it('con el tobillo tapado y marcado a ojo a 130 px, se recupera al reaparecer y da el ángulo real', async () => {
    const verdad = videos.oculto.verdad
    const ocultos = verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.oculto.ruta)
      await marcarTres(p, verdad[0].ps)
      // A ojo, en un frame con el tobillo tapado y 130 px a su izquierda (sobre el fondo): más lejos que el
      // tope de la ventana normal de búsqueda (un 25 % de 360 px = 90 px), así que antes se perdía hasta el final.
      const i = ocultos[2]
      await irAFrame(p, i)
      await abrirPestana(p, 'marcar')
      await elegirMarcador(p, 'Maléolo')
      const interruptor = p.getByTestId('colocar-a-ojo').filter({ visible: true })
      await interruptor.click()
      const real = verdad[i].ps[2]
      await tocarVideo(p, real.x - 130, real.y)
      await interruptor.click()
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      await irAFrame(p, 0)
      const aviso = await seguirHastaElFinal(p)
      // Huecos: exactamente los frames tapados, menos el del ancla (antes, del ancla al final del vídeo).
      assert.match(aviso, new RegExp(`Maléolo no tiene posición fiable en ${ocultos.length - 1} frames`))
      for (const k of [ocultos.at(-1) + 2, 80, verdad.length - 1]) {
        await irAFrame(p, k)
        assert.equal(await estadoMarcador(p, 'Maléolo'), 'seguido', `frame ${k + 1}`)
        assert.ok(Math.abs((await leerAngulo(p)) - verdad[k].flexion) < TOLERANCIA_GRADOS, `frame ${k + 1}`)
      }
    } finally {
      await p.close()
    }
  })
})

describe('huecos cortos: rellenar a petición', () => {
  let p
  const ocultos = () => videos.corto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
  before(async () => {
    ;({ p } = await seguirVideo(videos.corto))
  })
  after(() => p?.close())

  it('el hueco se ofrece, pero no se rellena hasta pedirlo', async () => {
    const n = ocultos().length
    assert.ok(n >= 2)
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${n} sin valor`))
    await irAFrame(p, ocultos()[1])
    assert.ok(Number.isNaN(await leerAngulo(p)))
    assert.match(await p.getByTestId('huecos-cortos').innerText(), /Rellenar 1 hueco corto/)
  })

  it('al rellenarlo, cada frame interpolado da el ángulo real (±1°) y queda marcado', async () => {
    await p.getByRole('button', { name: /Rellenar 1 hueco corto/ }).click()
    const resumen = await p.getByTestId('resumen-grafica').innerText()
    assert.doesNotMatch(resumen, /sin valor/)
    assert.match(resumen, new RegExp(`${ocultos().length} interpolados`))
    for (const i of ocultos()) {
      await irAFrame(p, i)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'interpolado')
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - videos.corto.verdad[i].flexion) < 1, `frame ${i + 1}: ${medido}° frente a ${videos.corto.verdad[i].flexion.toFixed(2)}°`)
    }
  })

  it('lo interpolado se guarda y se recupera como interpolado', async () => {
    await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo a las' }).waitFor({ state: 'attached', timeout: 10000 })
    await p.reload()
    assert.match(await p.getByTestId('sesion-guardada').innerText(), new RegExp(`${ocultos().length} interpolados`))
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.corto.ruta)
    await esperarQuieto(p)
    await irAFrame(p, ocultos()[0])
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'interpolado')
  })

  it('«Quitar lo interpolado» los devuelve a huecos', async () => {
    await p.getByRole('button', { name: 'Quitar lo interpolado' }).click()
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${ocultos().length} sin valor`))
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'perdido')
    assert.match(await p.getByTestId('huecos-cortos').innerText(), /Rellenar 1 hueco corto/)
  })
})

describe('retroceder con la caché de frames', () => {
  it('frame a frame hacia atrás muestra siempre el frame pedido', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.numerado.ruta)
      const { bits, ladoBloque } = videos.numerado
      await irAFrame(p, 70)
      const anterior = p.getByRole('button', { name: 'Frame anterior' })
      // El salto al 70 decodifica desde el fotograma clave del 50 y deja en la
      // caché todo lo que entrega de paso (del 50 al 70).
      assert.equal(await p.getByTestId('lectura').innerText(), 'clave')
      // Del 70 al 45: cruza el fotograma clave del 50 (uno cada 25 frames). Solo
      // el paso al 49 vuelve a decodificar (desde el 25); el resto sale de la caché.
      const conClave = []
      for (let i = 69; i >= 45; i--) {
        await anterior.click()
        await esperarQuieto(p)
        assert.equal((await leerPosicion(p)).frame, i + 1)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i, `el canvas no muestra el frame ${i + 1}`)
        if ((await p.getByTestId('lectura').innerText()) !== 'caché') conClave.push(i)
      }
      assert.deepEqual(conClave, [49])
      // Y hacia delante otra vez, saliendo de la caché.
      const siguiente = p.getByRole('button', { name: 'Frame siguiente' })
      for (let i = 46; i <= 52; i++) {
        await siguiente.click()
        await esperarQuieto(p)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i)
      }
    } finally {
      await p.close()
    }
  })
})

describe('avanzar saltando frames', () => {
  it('dentro del mismo grupo de imágenes sigue con el decodificador; pasado un fotograma clave, empieza en él', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.numerado.ruta)
      const { bits, ladoBloque } = videos.numerado
      await irAFrame(p, 30)
      const avanzar = p.getByRole('button', { name: 'Avanzar 10 frames' })
      // 30 → 40: sin fotograma clave entre medias (son el 25 y el 50). Antes,
      // cualquier salto hacia delante volvía al fotograma clave: al mantener
      // pulsado y saltarse frames, el avance se atascaba.
      await avanzar.click()
      await esperarQuieto(p)
      assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), 40)
      assert.equal(await p.getByTestId('lectura').innerText(), 'seguido')
      // 40 → 50 y 70 → 80 cruzan un fotograma clave (50, 75): empezar en él
      // decodifica menos que seguir. 50 → 60 → 70, dentro del grupo, siguen.
      for (const [i, modo] of [
        [50, 'clave'],
        [60, 'seguido'],
        [70, 'seguido'],
        [80, 'clave'],
      ]) {
        await avanzar.click()
        await esperarQuieto(p)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i)
        assert.equal(await p.getByTestId('lectura').innerText(), modo, `al frame ${i}`)
      }
    } finally {
      await p.close()
    }
  })
})

/** Número que muestra un elemento («−12,3 °/s», «148 px/s»); NaN si muestra «—». */
async function leerNumero(p, testid) {
  const texto = (await textoDe(p, testid)).trim()
  const m = /^([+−-])?([\d.,]+)/.exec(texto)
  return m ? (m[1] === '−' || m[1] === '-' ? -1 : 1) * Number(m[2].replace(/\./g, '').replace(',', '.')) : NaN
}

/** Espera a que la sesión guardada tenga en su vista el cero `ceros` (comparado como JSON). */
async function esperarCerosGuardados(p, ceros) {
  await p.waitForFunction(
    async (esperado) => {
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
        return todas.some((c) => JSON.stringify(c.vistas[0].ceros) === esperado)
      } finally {
        bd.close()
      }
    },
    JSON.stringify(ceros),
    { timeout: 20000, polling: 200 },
  )
}

describe('velocidad y aceleración angulares, velocidad de los marcadores', () => {
  // Aceleración real 45·(π/2)²·cos(πt/2) °/s². El tobillo gira a 120 px de la rodilla.
  const acelReal = (t) => 45 * (Math.PI / 2) ** 2 * Math.cos((Math.PI * t) / 2)
  let p
  before(async () => {
    ;({ p } = await seguirVideo(videos.verde))
  })
  after(() => p?.close())

  it('velocidad angular frente a la derivada real del vídeo (±3 °/s), también tras los huecos de fps', async () => {
    const verdad = videos.verde.verdad
    for (const i of [10, 30, 41, 60, 81, 100, 110]) {
      await irAFrame(p, i)
      const v = await leerNumero(p, 'velocidad-angular')
      assert.ok(Math.abs(v - velReal(verdad[i].t)) < 3, `frame ${i + 1}: ${v} °/s, real ${velReal(verdad[i].t).toFixed(1)} °/s`)
      // La fila de valores junto a los controles dice lo mismo que el panel.
      assert.equal(await leerNumero(p, 'rapida-velocidad'), v)
      assert.equal(await leerNumero(p, 'rapida-angulo'), await leerNumero(p, 'angulo-sin-cero'))
    }
  })

  it('aceleración angular frente a la real (±10 °/s²) con el corte a 3 Hz', async () => {
    // La segunda derivada multiplica el ruido por (2πf)²: con el ruido de seguimiento de este
    // vídeo (≈ 0,05°), a 6 Hz la aceleración oscila unos ±20 °/s² (medido); a 3 Hz, unos ±4.
    // La flexión (0,25 Hz) pasa igual por los dos cortes.
    await abrirPestana(p, 'analisis')
    await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('3')
    assert.match(await textoDe(p, 'corte'), /3,0 Hz/)
    const verdad = videos.verde.verdad
    for (const i of [15, 30, 60, 90, 105]) {
      await irAFrame(p, i)
      const a = await leerNumero(p, 'aceleracion-angular')
      assert.ok(Math.abs(a - acelReal(verdad[i].t)) < 10, `frame ${i + 1}: ${a} °/s², real ${acelReal(verdad[i].t).toFixed(1)} °/s²`)
    }
  })

  it('sin derivada en el primer y el último frame (—, nunca 0)', async () => {
    for (const i of [0, videos.verde.verdad.length - 1]) {
      await irAFrame(p, i)
      for (const id of ['velocidad-angular', 'aceleracion-angular']) assert.equal(await textoDe(p, id), '—', `${id}, frame ${i + 1}`)
    }
  })

  it('velocidad lineal en px/s: el tobillo, la real (±5 %); cadera y rodilla quietas', async () => {
    const verdad = videos.verde.verdad
    const filas = p.locator('[data-testid^="velocidad-marcador-"]')
    assert.equal(await filas.count(), 3)
    await irAFrame(p, 30)
    const real = 120 * (velReal(verdad[30].t) * Math.PI) / 180
    const textos = await filas.allInnerTexts()
    assert.match(textos[2], /px\/s$/)
    const tobillo = await leerNumero(p, await filas.nth(2).getAttribute('data-testid'))
    assert.ok(Math.abs(tobillo / real - 1) < 0.05, `tobillo ${tobillo} px/s, real ${real.toFixed(0)} px/s`)
    for (const k of [0, 1]) {
      const v = await leerNumero(p, await filas.nth(k).getAttribute('data-testid'))
      assert.ok(v < 3, `marcador ${k}: ${v} px/s`)
    }
  })
})

describe('cero de referencia: tramo estático guardado con la sesión', () => {
  it('primeros 2 s, inicio y fin aquí, relativo = sin cero − media; se guarda, se recupera y se quita', async () => {
    const verdad = videos.verde.verdad
    const media = (a, b) => {
      const v = verdad.filter((f) => f.t >= a - 1e-9 && f.t <= b + 1e-9).map((f) => f.flexion)
      return v.reduce((s, x) => s + x, 0) / v.length
    }
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      assert.equal(await textoDe(p, 'angulo-relativo'), '—')
      // Primeros 2 s: de 0° a 90° y vuelta a empezar; la media es la de esos frames (≈ 45°).
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Primeros 2 s' }).click()
      const m1 = media(verdad[0].t, verdad[0].t + 2)
      assert.ok(Math.abs((await leerNumero(p, 'cero-media')) - m1) < 0.5, `media ${await textoDe(p, 'cero-media')}, real ${m1.toFixed(2)}`)
      // No es un tramo quieto: se avisa.
      await abrirPestana(p, 'analisis')
      await p.getByText(/no parece quieto/).waitFor()
      await irAFrame(p, 60)
      const sinCero = await leerNumero(p, 'angulo-sin-cero')
      assert.ok(Math.abs(sinCero - verdad[60].flexion) < TOLERANCIA_GRADOS)
      assert.ok(Math.abs((await leerNumero(p, 'angulo-relativo')) - (sinCero - (await leerNumero(p, 'cero-media')))) < 0.11)
      assert.equal(await leerNumero(p, 'rapida-relativo'), await leerNumero(p, 'angulo-relativo'))

      // Inicio en el frame 11 y fin en el 31 (tiempos del vídeo).
      await irAFrame(p, 10)
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Inicio aquí' }).click()
      await irAFrame(p, 30)
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Fin aquí' }).click()
      const tramo = { desde: verdad[10].t, hasta: verdad[30].t }
      const m2 = media(tramo.desde, tramo.hasta)
      assert.ok(Math.abs((await leerNumero(p, 'cero-media')) - m2) < 0.5)
      await p.waitForFunction(
        async ({ a, b }) => {
          const bd = await new Promise((ok) => {
            const r = indexedDB.open('dualkinema')
            r.onsuccess = () => ok(r.result)
          })
          try {
            const todas = await new Promise((ok) => {
              const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
              r.onsuccess = () => ok(r.result)
            })
            return todas.some((c) => Object.values(c.vistas[0].ceros).some((z) => z.desde === a && z.hasta === b))
          } finally {
            bd.close()
          }
        },
        { a: tramo.desde, b: tramo.hasta },
        { timeout: 20000, polling: 200 },
      )
      const textoTramo = await textoDe(p, 'cero-tramo')

      // Recargar y recuperar: el mismo tramo y la misma media.
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'cero-tramo'), textoTramo)
      await irAFrame(p, 60)
      assert.ok(Math.abs((await leerNumero(p, 'angulo-relativo')) - (verdad[60].flexion - m2)) < 0.6)

      // Quitar: vuelve a no haber relativo, y se guarda vacío.
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Quitar', exact: true }).click()
      assert.equal(await textoDe(p, 'angulo-relativo'), '—')
      await esperarCerosGuardados(p, {})
    } finally {
      await p.close()
    }
  })
})

describe('escala en metros: dos extremos y la longitud', () => {
  it('elegir el objeto, tocar los extremos, m/s del tobillo con la escala; se guarda, se recupera y se quita', async () => {
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      await irAFrame(p, 30)
      const anguloAntes = await leerAngulo(p)
      assert.match(await textoDe(p, 'velocidad-marcador-' + (await idTobillo(p))), /px\/s$/)

      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      // Se puede elegir el objeto; cada uno trae su longitud de partida.
      assert.equal(await panel.getByRole('radio', { name: 'Cinta métrica' }).getAttribute('aria-checked'), 'true')
      await panel.getByRole('radio', { name: 'Regla' }).click()
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '30')
      await panel.getByRole('radio', { name: 'Palo' }).click()
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '100')

      // Dos extremos a 50 px: se avisa de que es corto.
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 150, 300)
      await panel.getByTestId('escala-aviso-corto').waitFor()
      // Un tercer toque mueve el extremo más cercano (el de x = 150): quedan a 400 px.
      await tocarVideo(p, 500, 300)
      const d = Number(/a ([\d.,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d - 400) < 3, `extremos a ${d} px`)
      assert.equal(await panel.getByTestId('escala-aviso-corto').count(), 0)
      // Tocar al calibrar no mueve ningún marcador.
      assert.equal(await leerAngulo(p), anguloAntes)
      // Los dos extremos, del mismo frame: un toque en otro frame empieza de nuevo (el objeto podría moverse).
      await irAFrame(p, 31)
      await tocarVideo(p, 120, 300)
      assert.match(await panel.getByTestId('escala-estado').innerText(), /Has cambiado de frame/)
      assert.match(await p.getByTestId('toca-escala').innerText(), /otro frame, empieza de nuevo/)
      assert.ok(await panel.getByRole('button', { name: 'Guardar escala' }).isDisabled())
      // De vuelta en el frame 30, los dos extremos otra vez (a 400 px).
      await irAFrame(p, 30)
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 500, 300)
      const d2 = Number(/a ([\d.,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d2 - d) < 0.5, `extremos a ${d2} px, antes ${d} px`)

      await panel.getByLabel('Longitud en cm').fill('400')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      // 4 m en 400 px: 10 mm por píxel.
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 1000 * (4 / d)) < 0.02, `${mm} mm/px`)

      // Velocidad del tobillo (gira a 120 px de la rodilla) en m/s, la real con la escala (±5 %).
      const tobillo = 'velocidad-marcador-' + (await idTobillo(p))
      assert.match(await textoDe(p, tobillo), /m\/s$/)
      const real = ((120 * velReal(verdad[30].t) * Math.PI) / 180) * (mm / 1000)
      const v = await leerNumero(p, tobillo)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)
      // Los ángulos no dependen de la escala.
      assert.equal(await leerAngulo(p), anguloAntes)

      await esperarCalibracionGuardada(p, 4)
      const textoEscala = await textoDe(p, 'escala-objeto')
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'escala-objeto'), textoEscala)
      assert.match(textoEscala, /400,0 cm/)
      await irAFrame(p, 30)
      assert.equal(await leerNumero(p, tobillo), v)

      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Quitar' }).click()
      assert.match(await textoDe(p, tobillo), /px\/s$/)
      await esperarCalibracionGuardada(p, null)
    } finally {
      await p.close()
    }
  })
})

describe('escala entre dos marcadores y longitud de los segmentos', () => {
  it('rodilla–tobillo en los primeros 2 s con su distancia real; la longitud de los segmentos no cambia', async () => {
    // En el vídeo sintético el muslo mide 130 px y la pierna 120, rígidos y en el plano.
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      // Uno por segmento de la rodilla, en orden: muslo (trocánter–rodilla) y pierna (rodilla–tobillo).
      const segmentos = panel.locator('[data-testid^="constancia-trocanter"], [data-testid^="constancia-epicondilo"]')
      assert.equal(await segmentos.count(), 2)
      for (const [k, real] of [[0, 130], [1, 120]]) {
        const s = segmentos.nth(k)
        const l = Number((await s.getByTestId('constancia-longitud').innerText()).match(/[\d,]+/)[0].replace(',', '.'))
        assert.ok(Math.abs(l - real) < 1.5, `segmento ${k}: ${l} px, real ${real}`)
        const rms = Number((await s.getByTestId('constancia-rms').innerText()).match(/[\d,]+/)[0].replace(',', '.'))
        assert.ok(rms < 1, `segmento ${k}: varía ± ${rms} %`)
        assert.equal(await s.getByTestId('constancia-fuera').count(), 0)
      }

      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      await panel.getByRole('radio', { name: 'Entre dos marcadores' }).click()
      // Por defecto, la pierna (rodilla–tobillo) y los primeros 2 s; sin longitud: hay que medirla.
      const opciones = panel.getByRole('radiogroup', { name: 'Segmento de calibración' }).getByRole('radio')
      assert.equal(await opciones.nth(1).getAttribute('aria-checked'), 'true')
      assert.equal(await panel.getByRole('radio', { name: 'Primeros 2 s' }).getAttribute('aria-checked'), 'true')
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '')
      assert.ok(await panel.getByRole('button', { name: 'Guardar escala' }).isDisabled())
      const d = Number(/([\d,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d - 120) < 1, `distancia media ${d} px`)
      // Promediar en muchos frames: la precisión por el marcado queda muy por debajo de la de dos toques (√2/120 = 1,2 %).
      const precision = Number(/± ([\d,]+) %/.exec(await panel.getByTestId('escala-precision').innerText())[1].replace(',', '.'))
      assert.ok(precision <= 0.3, `± ${precision} %`)

      await panel.getByLabel('Longitud en cm').fill('30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 2.5) < 0.03, `${mm} mm/px`)
      await irAFrame(p, 30)
      const tobillo = 'velocidad-marcador-' + (await idTobillo(p))
      const real = ((120 * velReal(verdad[30].t) * Math.PI) / 180) * 0.0025
      const v = await leerNumero(p, tobillo)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)
      // La longitud de los segmentos, también en cm.
      assert.match(await segmentos.nth(1).getByTestId('constancia-longitud').innerText(), /30,\d cm/)

      await esperarCalibracionGuardada(p, 0.3)
      const texto = await textoDe(p, 'escala-objeto')
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'escala-objeto'), texto)
      await abrirPestana(p, 'escala')
      await p.getByText(/Posición media de los dos gomets/).waitFor()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)

      // Corregir el tobillo en un frame del tramo (mismo número de frames, otra distancia):
      // la escala ya no corresponde a lo seguido y se avisa, también desde otra pestaña.
      await abrirPestana(p, 'marcar')
      await irAFrame(p, 10)
      await elegirMarcador(p, 'Maléolo')
      const t10 = verdad[10].ps[2]
      await tocarVideo(p, t10.x + (t10.x > 320 ? -80 : 80), t10.y)
      await p.getByTestId('error-toque').waitFor()
      await p.getByRole('button', { name: 'Colocarlo aquí a ojo' }).click()
      assert.ok(await p.getByTestId('aviso-pestana-escala').isVisible())
      await abrirPestana(p, 'escala')
      assert.match(await panel.getByTestId('escala-rehacer').innerText(), /han cambiado desde que se guardó/)
    } finally {
      await p.close()
    }
  })
})

/** Id del tercer marcador (el tobillo, distal) según las filas de velocidad. */
async function idTobillo(p) {
  const id = await p.locator('[data-testid^="velocidad-marcador-"]').nth(2).getAttribute('data-testid')
  return id.replace('velocidad-marcador-', '')
}

/** Espera a que la vista guardada tenga una escala de `longitudM` metros (null: sin escala). */
async function esperarCalibracionGuardada(p, longitudM) {
  await p.waitForFunction(
    async (l) => {
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
        return todas.some((c) => (l === null ? c.vistas[0].calibracion === null : c.vistas[0].calibracion?.longitudM === l))
      } finally {
        bd.close()
      }
    },
    longitudM,
    { timeout: 20000, polling: 200 },
  )
}

describe('escala entre marcadores calibrada antes de seguir', () => {
  it('avisa de que solo hay un frame en el tramo y, tras seguir, ofrece rehacerla con todos', async () => {
    // Lo que pasó en el móvil: marcar los gomets, calibrar y después seguir. La escala se quedaba
    // con 1 frame de un tramo de 2 s, y la precisión se mostraba como si fueran muchos.
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      await panel.getByRole('radio', { name: 'Entre dos marcadores' }).click()
      await panel.getByTestId('escala-pocos-frames').waitFor()
      assert.match(await panel.getByTestId('escala-pocos-frames').innerText(), /Solo 1 de los \d+ frames/)
      // Un frame: √2 · 0,5 px sobre 120 px ≈ 0,6 %, no el 0,2 % de una media larga.
      const precision = Number(/± ([\d,]+) %/.exec(await panel.getByTestId('escala-precision').innerText())[1].replace(',', '.'))
      assert.ok(precision >= 0.5, `± ${precision} %`)
      await panel.getByLabel('Longitud en cm').fill('30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)

      await seguirHastaElFinal(p)
      await panel.getByTestId('escala-rehacer').waitFor()
      // Desde otra pestaña, un punto en «Escala» avisa de lo mismo.
      await abrirPestana(p, 'marcar')
      assert.ok(await p.getByTestId('aviso-pestana-escala').isVisible())
      await abrirPestana(p, 'escala')
      assert.match(await panel.getByTestId('escala-rehacer').innerText(), /solo había 1 frame .* ahora hay \d+/)
      await panel.getByRole('button', { name: 'Rehacer' }).click()
      assert.equal(await panel.getByTestId('escala-pocos-frames').count(), 0)
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)
      assert.match(await panel.getByText(/Posición media de los dos gomets/).innerText(), /en \d{2,} frames/)
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 2.5) < 0.03, `${mm} mm/px`)
    } finally {
      await p.close()
    }
  })
})

describe('estela de los marcadores: siempre por detrás en el sentido del recorrido', () => {
  it('al avanzar dibuja los frames anteriores; al retroceder, los posteriores', async () => {
    // Antes la estela eran siempre los 20 frames anteriores: al retroceder iba por delante del marcador.
    const verdad = videos.verde.verdad
    const { p } = await seguirVideo(videos.verde)
    try {
      // ¿Hay trazo en la capa junto a la posición real del tobillo en el frame k?
      const hayTrazo = (k) =>
        p.evaluate(({ x, y }) => {
          const d = document.querySelector('[data-testid=capa]').getContext('2d').getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
          return false
        }, verdad[k].ps[2])
      // Avanzando hasta el 30 (de 29 a 30): se ve el tobillo del frame 20 y no el del 40.
      await irAFrame(p, 29)
      await irAFrame(p, 30)
      assert.equal(await hayTrazo(20), true, 'avanzando, estela en el frame 20')
      assert.equal(await hayTrazo(40), false, 'avanzando, sin estela en el frame 40')
      // Retrocediendo hasta el 30 (de 31 a 30): al revés.
      await irAFrame(p, 31)
      await irAFrame(p, 30)
      assert.equal(await hayTrazo(40), true, 'retrocediendo, estela en el frame 40')
      assert.equal(await hayTrazo(20), false, 'retrocediendo, sin estela en el frame 20')
      // Con el botón de frame anterior, igual.
      await irAFrame(p, 31)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
      await p.getByRole('button', { name: 'Frame anterior' }).click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, 32)
      assert.equal(await hayTrazo(42), true, 'con el botón, estela hacia delante')
    } finally {
      await p.close()
    }
  })
})

describe('trayectoria completa sobre el vídeo', () => {
  /** ¿Hay trazo en la capa en (x, y) del vídeo (±2 px)? */
  const hayTrazo = (p, { x, y }) =>
    p.evaluate(
      ({ x, y }) => {
        const d = document.querySelector('[data-testid=capa]').getContext('2d').getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
        return false
      },
      { x, y },
    )

  it('apagada por defecto; encendida, todo el recorrido del tobillo; se elige por marcador', async () => {
    // La flexión va de 0° a 90° y vuelve: la bajada y la subida pasan por los mismos sitios.
    // En el frame 30, avanzando, la estela corta cubre del 10 al 30 (de ~5° a 45°); el tobillo
    // de los frames 45 a 75 (más de 75°) solo puede estar dibujado por la trayectoria completa.
    // El corte en los huecos y los trazos de lo interpolado se prueban en el núcleo
    // (core/graficas/trayectoria.test.ts): aquí la vuelta taparía el hueco.
    const verdad = videos.verde.verdad
    const lejos = [45, 52, 60, 68, 75]
    const { p } = await seguirVideo(videos.verde)
    try {
      await irAFrame(p, 29)
      await irAFrame(p, 30)
      for (const k of lejos) assert.equal(await hayTrazo(p, verdad[k].ps[2]), false, `sin trayectoria completa, nada en el frame ${k + 1}`)
      const boton = p.getByRole('button', { name: 'Trayectoria completa', exact: true })
      assert.equal(await boton.getAttribute('aria-pressed'), 'false')
      await boton.click()
      for (const k of lejos) assert.equal(await hayTrazo(p, verdad[k].ps[2]), true, `trayectoria en el frame ${k + 1}`)
      // Sin el tobillo elegido, su trayectoria desaparece; los otros dos siguen elegidos.
      const marcadores = p.getByRole('group', { name: 'Marcadores con trayectoria' }).getByRole('button')
      assert.equal(await marcadores.count(), 3)
      await marcadores.nth(2).click()
      assert.equal(await marcadores.nth(2).getAttribute('aria-pressed'), 'false')
      assert.equal(await marcadores.nth(0).getAttribute('aria-pressed'), 'true')
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), false, 'sin el tobillo elegido')
      await marcadores.nth(2).click()
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), true)
      // Cambiar de frame no la quita; apagarla, sí.
      await irAFrame(p, 31)
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), true)
      await boton.click()
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), false)
    } finally {
      await p.close()
    }
  })

})

describe('la barra fija del móvil no mueve los botones', () => {
  // Si «t = … · frame … · N ms clave» pasaba de una a dos líneas según el texto, los botones de
  // debajo se movían y se perdía la pulsación mantenida. Ahora van en una barra pegada abajo: si
  // su altura cambia, se mueve su borde de arriba y con él los botones. Se recorren anchos de móvil
  // para dar con el límite, con el texto más largo posible (frame de 3 cifras de «numerado» y «clave»).
  it('de 340 a 440 px, la barra y los botones de avance no se desplazan al cambiar de frame', async () => {
    for (let ancho = 340; ancho <= 440; ancho += 20) {
      const p = await abrirApp(navegador, { ancho })
      try {
        await cargarVideo(p, videos.verde.ruta)
        const boton = p.getByRole('button', { name: 'Frame siguiente' })
        const barra = p.getByTestId('barra-fija')
        const posiciones = new Set()
        for (const i of [0, 1, 50, 49, 119, 75, 74, 100, 99]) {
          await irAFrame(p, i)
          // Texto largo de verdad: un número de ms de 4 cifras, como al decodificar lento en el móvil.
          await p.getByTestId('ms-decodificar').evaluate((el) => {
            const numero = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /^\d+$/.test(n.textContent))
            if (numero) numero.textContent = '1288'
          })
          const b = await barra.boundingBox()
          posiciones.add(`${Math.round(b.y)}/${Math.round(b.height)}/${Math.round((await boton.boundingBox()).y)}`)
        }
        assert.equal(posiciones.size, 1, `a ${ancho} px la barra o el botón cambian de sitio: ${[...posiciones].join(', ')}`)
      } finally {
        await p.close()
      }
    }
  })

  it('la barra queda pegada abajo con scroll y no tapa el final de la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const alto = p.viewportSize().height
      const antes = await p.getByTestId('barra-fija').boundingBox()
      assert.equal(Math.round(antes.y + antes.height), alto, 'la barra no está pegada abajo')
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const despues = await p.getByTestId('barra-fija').boundingBox()
      assert.deepEqual(despues, antes, 'la barra se mueve con el scroll')
      // Lo último de la página (el panel de la pestaña abierta) queda entero por encima de la barra.
      const panel = await p.locator('[role=tabpanel]:visible').last().boundingBox()
      assert.ok(panel.y + panel.height <= despues.y + 1, `el panel acaba en ${panel.y + panel.height}, la barra empieza en ${despues.y}`)
      // El pie de página (rama y commit) también queda por encima de la barra, no tapado por ella.
      const pie = await p.getByTestId('pie').boundingBox()
      assert.ok(pie.y + pie.height <= despues.y + 1, `el pie acaba en ${pie.y + pie.height}, la barra empieza en ${despues.y}`)
      // Los botones y los valores del frame siguen ahí aunque se haya bajado hasta el final.
      assert.ok(await p.getByRole('button', { name: 'Frame siguiente' }).isVisible())
      assert.ok(await p.getByTestId('rapida-angulo').isVisible())
    } finally {
      await p.close()
    }
  })

  it('en pantalla ancha no es una barra: los controles van en el flujo', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      assert.notEqual(await p.getByTestId('barra-fija').evaluate((el) => getComputedStyle(el).position), 'fixed')
      const boton = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
      assert.ok(boton.y + boton.height < 900)
    } finally {
      await p.close()
    }
  })
})

describe('pestañas de herramientas', () => {
  it('«Marcar» es la abierta; cambiar de pestaña muestra sus paneles y oculta los de las demás', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const abierta = async () => p.locator('[role=tab][aria-selected=true]').innerText()
      assert.equal(await abierta(), 'Marcar')
      assert.ok(await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).isVisible())
      assert.ok(!(await p.getByTestId('panel-filtro').isVisible()))

      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await abierta(), 'Análisis')
      for (const id of ['panel-filtro', 'panel-cinematica', 'panel-exportar']) assert.ok(await p.getByTestId(id).isVisible(), id)
      assert.ok(!(await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).isVisible()))

      await p.getByRole('tab', { name: 'Escala' }).click()
      assert.ok(await p.getByTestId('panel-escala').isVisible())
      assert.ok(!(await p.getByTestId('panel-filtro').isVisible()))

      await p.getByRole('tab', { name: 'Vídeo' }).click()
      assert.ok(await p.getByRole('heading', { name: 'Datos del vídeo' }).isVisible())

      // Lo que no se ve sigue montado: el ajuste del filtro no se pierde al cambiar de pestaña.
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('9')
      await p.getByRole('tab', { name: 'Marcar' }).click()
      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).inputValue(), '9')
    } finally {
      await p.close()
    }
  })

  it('en el móvil también hay pestañas, debajo del vídeo, y la gráfica completa no ocupa la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      await p.evaluate(() => window.scrollTo(0, 0))
      const video = await p.getByTestId('capa').boundingBox()
      const pestanas = await p.getByRole('tablist').boundingBox()
      assert.ok(video.y + video.height <= pestanas.y + 1, 'las pestañas quedan encima del vídeo')
      // El panel abierto va justo debajo de las pestañas y la página acaba ahí: no hay otra pantalla de gráfica más abajo.
      const panel = await p.locator('[role=tabpanel]:visible').first().boundingBox()
      assert.ok(panel.y >= pestanas.y + pestanas.height - 1, 'el panel queda debajo de las pestañas')
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
      assert.ok(await p.getByTestId('minigrafica').isVisible(), 'queda la gráfica pequeña')
      await p.getByRole('tab', { name: 'Escala' }).click()
      assert.ok(await p.getByTestId('panel-escala').isVisible())
    } finally {
      await p.close()
    }
  })

  it('la gráfica completa oculta no se redibuja mientras se sigue y se pinta entera al abrirla', async () => {
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await seguirHastaElFinal(p)
      // Oculta (la vista mixta del móvil): casi sin redibujos pese a los lotes del seguimiento.
      const redibujos = Number(await p.getByTestId('grafica-angulo').getAttribute('data-redibujos'))
      assert.ok(redibujos <= 2, `la gráfica oculta se ha redibujado ${redibujos} veces`)
      // Al abrir «Solo gráficas» aparece con todos los datos: la curva (ámbar) está pintada.
      await p.getByTestId('ampliar-graficas').click()
      await p.getByTestId('grafica-angulo-area').waitFor()
      await p.waitForFunction(() => {
        const c = document.querySelector('[data-testid=grafica-angulo] canvas')
        const ctx = c?.getContext('2d')
        if (!c || !ctx) return false
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 120 && d[i + 1] < 200 && d[i + 2] < 140) n++
        return n > 100
      }, undefined, { timeout: 5000 })
    } finally {
      await p.close()
    }
  })

  it('en el móvil el vídeo y la gráfica del ángulo quedan a la vista al desplazarse, y las pestañas se pegan debajo', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const alto = p.viewportSize().height
      const cajas = async () => ({
        video: await p.getByTestId('capa').boundingBox(),
        mini: await p.getByTestId('minigrafica').boundingBox(),
        // La caja con su aire, no solo las pestañas: es lo que queda pegado.
        pestanas: await p.getByRole('tablist').locator('..').boundingBox(),
        fijo: await p.getByTestId('visor-fijo').boundingBox(),
      })
      // Desplazándose hasta el final de la pestaña «Marcar» (corta), el vídeo no se oculta: no hay tarjetas que ganar sitio.
      // En un frame sin marcas a mano (el primero lleva un botón de quitar por marcador y la haría más larga).
      await irAFrame(p, 60)
      await p.evaluate(() => window.scrollTo(0, 300))
      const a = await cajas()
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await p.waitForTimeout(300)
      const b = await cajas()
      assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-oculto'), 'false')
      assert.deepEqual(b.video, a.video, 'el vídeo se mueve al desplazarse')
      assert.deepEqual(b.mini, a.mini, 'la gráfica se mueve al desplazarse')
      assert.ok(b.video.y >= 0 && b.mini.y + b.mini.height <= b.fijo.y + b.fijo.height, 'vídeo y gráfica fuera de su zona pegada')
      // El vídeo no se come la pantalla: más de un tercio de alto se lo quitaría a las herramientas.
      assert.ok(b.video.height <= alto * 0.36, `el vídeo mide ${b.video.height} de ${alto} px`)
      assert.ok(b.mini.y > b.video.y + b.video.height - 1, 'la gráfica va debajo del vídeo')
      // Las pestañas se pegan justo debajo, no detrás del vídeo, y siguen ahí hasta el final de la página.
      for (const [donde, c] of [['a mitad', a], ['al final', b]]) {
        assert.ok(Math.abs(c.pestanas.y - (c.fijo.y + c.fijo.height)) <= 4, `${donde}: pestañas en ${c.pestanas.y}, vídeo y gráfica acaban en ${c.fijo.y + c.fijo.height}`)
      }
    } finally {
      await p.close()
    }
  })

  describe('el vídeo se oculta al bajar por tarjetas largas (pestaña «Análisis»)', () => {
    let p
    // Posición de scroll a la que las tarjetas llegan a la tira de pestañas (y el vídeo empieza a poder ocultarse): depende de
    // lo que haya sobre ellas (vídeo, barra, deslizador), así que se mide en vez de fijarla.
    let U
    before(async () => {
      ;({ p } = await seguirVideo(videos.verde, { ancho: 390 }))
      await abrirPestana(p, 'analisis')
      // Se mide con la gráfica pequeña en su alto de reposo (arriba del todo crece y las tarjetas quedan más abajo).
      await p.evaluate(() => window.scrollTo(0, 20))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'false')
      await esperarVideoAsentado(p, false)
      U = await p.evaluate(() => {
        const tarjetas = document.querySelector('[data-testid=panel-herramientas]').getBoundingClientRect().top + window.scrollY
        const tira = document.querySelector('[role=tablist]').parentElement.getBoundingClientRect().height
        return Math.round(tarjetas - tira - 4)
      })
    })
    after(() => p?.close())

    const oculto = async () => (await p.getByTestId('visor-fijo').getAttribute('data-oculto')) === 'true'
    const arribaTarjetas = async () => (await p.getByTestId('panel-herramientas').boundingBox()).y
    const bajar = async (y) => {
      await p.evaluate((y) => window.scrollTo(0, y), y)
      await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    }

    it('con el vídeo a la vista, las tarjetas tienen menos de la mitad de la pantalla', async () => {
      await bajar(300)
      assert.equal(await oculto(), false)
      const barra = (await p.getByTestId('barra-fija').boundingBox()).y
      const tira = await p.getByRole('tablist').locator('..').boundingBox()
      const libre = barra - (tira.y + tira.height)
      assert.ok(libre < p.viewportSize().height * 0.5, `sitio para las tarjetas con el vídeo: ${libre} px`)
    })

    it('mientras las tarjetas no han subido bajo las pestañas no se oculta (dejaría un hueco vacío)', async () => {
      await bajar(0)
      for (const y of [100, 250, U - 60, U - 40]) {
        await bajar(y)
        assert.equal(await oculto(), false, `oculto a y = ${y}`)
      }
    })

    it('al seguir bajando se oculta, las pestañas suben y las tarjetas no se mueven (solo se descubre lo que tapaba el vídeo)', async () => {
      await bajar(U - 27)
      assert.equal(await oculto(), false)
      const antes = await arribaTarjetas()
      await bajar(U + 13)
      await esperarVideoAsentado(p, true)
      assert.equal(await oculto(), true)
      // Lo que se mira no salta: las tarjetas subieron los 40 px que se bajó, no los ~340 del hueco del vídeo.
      const despues = await arribaTarjetas()
      assert.ok(Math.abs(despues - (antes - 40)) <= 3, `las tarjetas saltaron: de ${antes} a ${despues}`)
      // Las pestañas suben a lo más alto y las tarjetas ganan el sitio del vídeo.
      const tira = await p.getByRole('tablist').locator('..').boundingBox()
      assert.ok(tira.y >= -2 && tira.y <= 2, `las pestañas están en y = ${tira.y}`)
      const barra = (await p.getByTestId('barra-fija').boundingBox()).y
      const libre = barra - (tira.y + tira.height)
      assert.ok(libre >= p.viewportSize().height * 0.7, `queda ${libre} px para las tarjetas`)
      // Oculto de verdad: no recibe toques ni foco, y sigue montado (el lienzo y la gráfica conservan su estado).
      assert.equal(await p.getByTestId('visor-fijo').evaluate((e) => e.inert), true)
      assert.equal(await p.getByTestId('lienzo').count(), 1)
    })

    it('el cambio es suave: las pestañas se deslizan y el vídeo se desvanece, en vez de saltar', async () => {
      await bajar(0)
      await bajar(U - 27)
      // Al ocultarse (y al volver), mientras dura el cambio hay animaciones en la tira de pestañas y en el vídeo.
      const animaciones = () =>
        p.evaluate(() => ({
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }))
      const ocultar = await p.evaluate(async (y) => {
        window.scrollTo(0, y)
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        return {
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }
      }, U + 18)
      assert.ok(ocultar.tira > 0, 'las pestañas saltan en vez de deslizarse al ocultar el vídeo')
      assert.ok(ocultar.video > 0, 'el vídeo no se desvanece al ocultarse')
      await esperarVideoAsentado(p, true)
      assert.deepEqual(await animaciones(), { tira: 0, video: 0 })
      const volver = await p.evaluate(async () => {
        window.scrollBy(0, -60)
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        return {
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }
      })
      assert.ok(volver.tira > 0, 'las pestañas saltan en vez de deslizarse al volver el vídeo')
      assert.ok(volver.video > 0, 'el vídeo no aparece con un fundido')
      await esperarVideoAsentado(p, false)
    })

    it('al subir un poco vuelve, y tampoco salta nada', async () => {
      const antes = await arribaTarjetas()
      await p.evaluate(() => window.scrollBy(0, -60))
      await esperarVideoAsentado(p, false)
      const despues = await arribaTarjetas()
      assert.ok(Math.abs(despues - (antes + 60)) <= 3, `las tarjetas saltaron: de ${antes} a ${despues}`)
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      assert.ok(fijo.y >= 0 && fijo.y < 4, 'el vídeo vuelve pegado arriba')
    })

    it('vuelve al cambiar de frame con la barra y al cambiar de pestaña', async () => {
      await bajar(0)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarVideoAsentado(p, false)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      await p.getByTestId('pestana-escala').click()
      await esperarVideoAsentado(p, false)
      await abrirPestana(p, 'analisis')
    })

    it('con el botón «Vídeo» se ve y se queda por mucho que se baje, hasta volver al principio', async () => {
      await bajar(0)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      const antes = await arribaTarjetas()
      await p.getByTestId('mostrar-video').click()
      await esperarVideoAsentado(p, false)
      assert.ok(Math.abs((await arribaTarjetas()) - antes) <= 3, 'al mostrar el vídeo con el botón, las tarjetas saltan')
      await p.evaluate(() => window.scrollBy(0, 200))
      await p.waitForTimeout(300)
      assert.equal(await oculto(), false, 'anclado, el vídeo no se oculta solo')
      await bajar(0)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
    })

    it('mientras se calibra tocando el vídeo, no se oculta al bajar', async () => {
      await bajar(0)
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Calibrar escala' }).click()
      await bajar(300)
      await bajar(700)
      await p.waitForTimeout(300)
      assert.equal(await oculto(), false)
    })
  })

  it('la gráfica pequeña salta de frame al tocarla y su cursor no la redibuja', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const tiempos = videos.verde.verdad.map((f) => f.t)
      const redibujos = () => p.getByTestId('minigrafica').getAttribute('data-redibujos')
      await irAFrame(p, 20)
      const antes = await redibujos()
      assert.ok(Number(antes) > 0)
      for (const i of [21, 22, 40, 90]) await irAFrame(p, i)
      assert.equal(await redibujos(), antes, 'cambiar de frame redibuja la gráfica pequeña')
      const caja = await cajaElemento(p, 'minigrafica-area')
      for (const f of [0.3, 0.7]) {
        await p.mouse.click(caja.x + caja.width * f, caja.y + caja.height / 2)
        await esperarQuieto(p)
        const esperado = frameMasCercano(tiempos, tiempos[0] + f * (tiempos.at(-1) - tiempos[0])) + 1
        assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1, `al ${f * 100} %: frame ${(await leerPosicion(p)).frame}, esperado ${esperado}`)
      }
      // Su cursor está en el instante del frame.
      const linea = await p.getByTestId('minigrafica-cursor').boundingBox()
      const area = await p.getByTestId('minigrafica-area').boundingBox()
      const { frame } = await leerPosicion(p)
      const esperadoX = area.x + ((tiempos[frame - 1] - tiempos[0]) / (tiempos.at(-1) - tiempos[0])) * area.width
      assert.ok(Math.abs(linea.x - esperadoX) <= 1.5, `cursor en ${linea.x}, esperado ${esperadoX}`)
    } finally {
      await p.close()
    }
  })

  it('en pantalla ancha no hay gráfica pequeña ni vídeo pegado: la gráfica completa va a su sitio', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      assert.equal(await p.getByTestId('minigrafica').count(), 0)
      assert.notEqual(await p.getByTestId('visor-fijo').evaluate((el) => getComputedStyle(el).position), 'sticky')
      assert.ok(await p.getByTestId('grafica-angulo-area').isVisible())
    } finally {
      await p.close()
    }
  })

  it('la tira de pestañas pegada tiene un fondo opaco de lado a lado: no se ven las tarjetas por detrás', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      await p.evaluate(() => window.scrollTo(0, 300))
      const contenedor = p.getByRole('tablist').locator('..')
      const caja = await contenedor.boundingBox()
      assert.ok(caja.x <= 0.5 && Math.abs(caja.width - 390) <= 1, `el fondo va de ${caja.x} a ${caja.x + caja.width}`)
      const fondo = await contenedor.evaluate((el) => getComputedStyle(el).backgroundColor)
      assert.doesNotMatch(fondo, /rgba\(.*, 0\)|transparent/, `fondo ${fondo}`)
    } finally {
      await p.close()
    }
  })

  it('un punto en el nombre de una pestaña oculta avisa de huecos y de un cero que no parece quieto', async () => {
    const { p } = await seguirVideo(videos.oculto, { ancho: 1280 })
    try {
      // Estando en «Marcar» no hace falta el punto; en las demás, sí.
      assert.equal(await p.getByTestId('aviso-pestana-marcar').count(), 0)
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.getByTestId('aviso-pestana-marcar').waitFor()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
      // Un cero que no es quieto (los primeros 2 s del movimiento): el punto sale en «Análisis» desde otra pestaña.
      await p.getByRole('button', { name: 'Primeros 2 s' }).click()
      await p.getByText(/no parece quieto/).waitFor()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
      await p.getByRole('tab', { name: 'Escala' }).click()
      await p.getByTestId('aviso-pestana-analisis').waitFor()
      assert.ok(await p.getByTestId('aviso-pestana-marcar').isVisible())
      // El punto lleva su motivo para quien no lo ve (lectores de pantalla).
      assert.match(await p.getByTestId('aviso-pestana-analisis').getAttribute('aria-label'), /no parece quieto/)
      // Al abrir la pestaña, el punto se quita (el aviso ya está a la vista).
      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('a 1280 px la columna de herramientas tiene su propio scroll y el vídeo no se mueve', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      // Una ventana baja para que los paneles no quepan.
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.setViewportSize({ width: 1280, height: 480 })
      const columna = p.getByTestId('columna-herramientas')
      const tarjeta = p.getByTestId('panel-herramientas')
      const hay = await tarjeta.evaluate((el) => el.scrollHeight > el.clientHeight + 20)
      assert.ok(hay, 'la tarjeta cabe entera: la prueba no comprueba nada')
      const antes = { video: await p.getByTestId('capa').boundingBox(), columna: await columna.boundingBox(), tarjeta: await tarjeta.boundingBox() }
      await tarjeta.evaluate((el) => (el.scrollTop = el.scrollHeight))
      assert.ok((await tarjeta.evaluate((el) => el.scrollTop)) > 100, 'la tarjeta no se desplazó')
      const despues = { video: await p.getByTestId('capa').boundingBox(), columna: await columna.boundingBox(), tarjeta: await tarjeta.boundingBox() }
      assert.deepEqual(despues.video, antes.video, 'el vídeo se movió al recorrer los paneles')
      assert.deepEqual(despues.columna, antes.columna, 'la columna se movió de sitio')
      assert.deepEqual(despues.tarjeta, antes.tarjeta, 'la tarjeta se movió de sitio: se desplaza su contenido, no ella')
      assert.equal(await p.evaluate(() => window.scrollY), 0, 'la página se desplazó')
      // Las pestañas siguen a mano arriba aunque se haya bajado, y la tarjeta conserva sus esquinas redondeadas (es ella la que se recorta).
      const pestanas = await p.getByRole('tablist').boundingBox()
      assert.ok(pestanas.y >= despues.columna.y - 1 && pestanas.y < despues.columna.y + 20, `las pestañas están en ${pestanas.y}`)
      const radios = await tarjeta.evaluate((el) => {
        const c = getComputedStyle(el)
        return { abajoIzq: parseFloat(c.borderBottomLeftRadius), abajoDer: parseFloat(c.borderBottomRightRadius), desborde: c.overflowY }
      })
      assert.ok(radios.abajoIzq >= 12 && radios.abajoDer >= 12, `esquinas de abajo: ${JSON.stringify(radios)}`)
      assert.equal(radios.desborde, 'auto')
    } finally {
      await p.close()
    }
  })
})

/** Lee un CSV exportado: cabecera «# clave;valor», nombres de columna y filas. */
function leerCsv(texto, sep = ';') {
  const lineas = texto.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l !== '')
  const cabecera = lineas.filter((l) => l.startsWith('# '))
  const [nombres, ...filas] = lineas.filter((l) => !l.startsWith('# '))
  const columnas = nombres.split(sep)
  return { cabecera, columnas, filas: filas.map((f) => f.split(sep)) }
}

describe('exportación CSV', () => {
  it('sin escala (px) y con escala (m y m/s): una fila por frame, cabecera, vacío = sin valor y valores de la verdad', async () => {
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'analisis')
      const panel = p.getByTestId('panel-exportar')
      const descargar = async () => {
        await abrirPestana(p, 'analisis')
        const [descarga] = await Promise.all([p.waitForEvent('download'), panel.getByTestId('descargar-csv').click()])
        const { readFile } = await import('node:fs/promises')
        return { nombre: descarga.suggestedFilename(), texto: await readFile(await descarga.path(), 'utf8') }
      }

      // Sin escala: todo en píxeles, sin columnas en metros.
      const sin = await descargar()
      assert.match(sin.nombre, /\.csv$/)
      const a = leerCsv(sin.texto)
      assert.equal(a.filas.length, verdad.length)
      assert.ok(a.cabecera.some((l) => l.startsWith('# escala;sin escala')))
      assert.ok(a.columnas.some((c) => c.endsWith('_velocidad_px_s')))
      assert.ok(!a.columnas.some((c) => c.endsWith('_x_m')))
      const cCrudo = a.columnas.find((c) => c.endsWith('_crudo_grados'))
      for (const i of FRAMES_A_COMPARAR) {
        const medido = Number(a.filas[i - 1][a.columnas.indexOf(cCrudo)].replace(',', '.'))
        assert.ok(Math.abs(medido - verdad[i - 1].flexion) < TOLERANCIA_GRADOS, `frame ${i}: crudo ${medido}°, real ${verdad[i - 1].flexion.toFixed(2)}°`)
      }
      // El primer frame no tiene velocidad angular (sin derivada en el extremo del tramo): vacío, nunca 0.
      assert.equal(a.filas[0][a.columnas.findIndex((c) => c.endsWith('_vel_grados_s'))], '')

      // Con escala: 4 m en 400 px entre dos toques (10 mm por píxel).
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Calibrar escala' }).click()
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('radio', { name: 'Palo' }).click()
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 500, 300)
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByLabel('Longitud en cm').fill('400')
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Guardar escala' }).click()
      const mm = await leerNumero(p, 'escala-mm-px')
      const tobillo = await idTobillo(p)

      const con = leerCsv((await descargar()).texto)
      assert.equal(con.filas.length, verdad.length)
      const linea = con.cabecera.find((l) => l.startsWith('# escala;'))
      assert.match(linea, /400[,.]?\d* m|4,0000 m/)
      assert.ok(con.cabecera.some((l) => l.startsWith('# escala: origen;')))
      const col = (n) => con.columnas.indexOf(n)
      assert.ok(col(`${tobillo}_filtrado_x_m`) >= 0 && col(`${tobillo}_velocidad_m_s`) >= 0)
      const num = (f, n) => Number(f[col(n)].replace(',', '.'))
      // Coherencia: metros = píxeles filtrados × m/px.
      const f30 = con.filas[29]
      assert.ok(Math.abs(num(f30, `${tobillo}_filtrado_x_m`) - num(f30, `${tobillo}_filtrado_x_px`) * (mm / 1000)) < 1e-4)
      // Velocidad del tobillo en m/s frente a la real con la escala (±5 %).
      const real = ((120 * velReal(verdad[29].t) * Math.PI) / 180) * (mm / 1000)
      const v = num(f30, `${tobillo}_velocidad_m_s`)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)

      // Formato internacional: «,» y punto decimal.
      await panel.getByRole('radio', { name: /Internacional/ }).check()
      const intl = leerCsv((await descargar()).texto, ',')
      assert.equal(intl.filas.length, verdad.length)
      assert.match(intl.filas[29][intl.columnas.indexOf(`${tobillo}_filtrado_x_m`)], /^-?\d+\.\d{6}$/)
    } finally {
      await p.close()
    }
  })
})

describe('gráfica pequeña del móvil: ángulo, velocidad o las dos normalizadas', () => {
  it('alterna entre ángulo, velocidad y ambas; el punto del cursor cae donde está el valor', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const posicionRelativa = async () => {
        const area = await p.getByTestId('minigrafica-area').boundingBox()
        const punto = await p.getByTestId('minigrafica-punto').boundingBox()
        return (punto.y + punto.height / 2 - area.y) / area.height
      }
      const modo = (id) => p.getByTestId(`minigrafica-modo-${id}`)
      assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'true')

      // Velocidad: máxima hacia arriba en t = 1 s (frame ≈ 31) y mínima en t = 3 s (frame ≈ 91).
      await modo('velocidad').click()
      assert.equal(await modo('velocidad').getAttribute('aria-pressed'), 'true')
      assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'false')
      const tiempos = videos.verde.verdad.map((f) => f.t)
      const i1 = frameMasCercano(tiempos, 1)
      const i3 = frameMasCercano(tiempos, 3)
      await irAFrame(p, i1)
      const arriba = await posicionRelativa()
      await irAFrame(p, i3)
      const abajo = await posicionRelativa()
      assert.ok(arriba < 0.3, `velocidad máxima: el punto está a ${arriba} de la altura`)
      assert.ok(abajo > 0.7, `velocidad mínima: el punto está a ${abajo} de la altura`)

      // Ambas, normalizadas: el ángulo (el punto va sobre su curva) llega a su máximo en t = 2 s, arriba del todo.
      await modo('ambas').click()
      await p.getByText(/Normalizadas/).waitFor()
      await irAFrame(p, frameMasCercano(tiempos, 2))
      const cima = await posicionRelativa()
      assert.ok(cima < 0.3, `ángulo máximo normalizado: el punto está a ${cima} de la altura`)
      // Y al volver al ángulo desaparece la nota.
      await modo('angulo').click()
      assert.equal(await p.getByText(/Normalizadas/).count(), 0)

      // Tocar la gráfica sigue saltando de frame en cualquier modo.
      await modo('velocidad').click()
      const caja = await cajaElemento(p, 'minigrafica-area')
      await p.mouse.click(caja.x + caja.width * 0.5, caja.y + caja.height / 2)
      await esperarQuieto(p)
      const esperado = frameMasCercano(tiempos, tiempos[0] + 0.5 * (tiempos.at(-1) - tiempos[0])) + 1
      assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
    } finally {
      await p.close()
    }
  })
})

describe('gráfica pequeña del móvil: conserva su modo', () => {
  it('al cambiar de frame, de pestaña, al desplazarse, al ampliar el vídeo o las gráficas y volver, y al volver a seguir sigue en el modo elegido', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const modo = (id) => p.getByTestId(`minigrafica-modo-${id}`)
      const enVelocidad = async (cuando) => {
        assert.equal(await modo('velocidad').getAttribute('aria-pressed'), 'true', `${cuando}: la gráfica pequeña ha dejado el modo velocidad`)
        assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'false', cuando)
      }
      await p.evaluate(() => window.scrollTo(0, 0))
      await modo('velocidad').click()
      await enVelocidad('al elegirlo')
      await irAFrame(p, 40)
      await enVelocidad('al cambiar de frame')
      for (const id of ['analisis', 'escala', 'video', 'marcar']) {
        await abrirPestana(p, id)
        await enVelocidad(`en la pestaña ${id}`)
      }
      // Bajar (la gráfica vuelve a su alto de siempre y el vídeo se puede ocultar) y volver arriba (crece otra vez).
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'false')
      await esperarVideoAsentado(p)
      await p.evaluate(() => window.scrollTo(0, 0))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'true')
      await esperarVideoAsentado(p, false)
      await enVelocidad('al bajar y volver arriba')
      // Al pasar al vídeo grande o a solo gráficas (la gráfica pequeña no está) y volver, sigue en «Velocidad».
      await p.getByTestId('ampliar-video').click()
      await p.getByTestId('reducir-video').click()
      await p.getByTestId('minigrafica-modo-velocidad').waitFor()
      await enVelocidad('al volver del vídeo grande')
      await p.getByTestId('ampliar-graficas').click()
      await p.getByTestId('reducir-graficas').click()
      await p.getByTestId('minigrafica-modo-velocidad').waitFor()
      await enVelocidad('al volver de solo gráficas')
      // Seguir de nuevo desde un frame intermedio: llegan lotes del worker y se rehace lo filtrado.
      await irAFrame(p, 60)
      await seguirHastaElFinal(p)
      await enVelocidad('al volver a seguir')
    } finally {
      await p.close()
    }
  })
})

describe('vistas ampliadas del móvil', () => {
  it('vídeo grande: se marca y se sigue sin salir de ella, y el ángulo medido es el real', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      // Cubre la pantalla hasta la barra; lo demás no se ve.
      const alto = p.viewportSize().height
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(fijo.y <= 0.5 && Math.abs(fijo.y + fijo.height - barra.y) <= 1, `el vídeo grande ocupa de ${fijo.y} a ${fijo.y + fijo.height}; la barra empieza en ${barra.y}`)
      assert.equal(await p.getByRole('tablist').isVisible(), false)
      assert.equal(await p.getByTestId('minigrafica').count(), 0)
      // El deslizador de frames (con su franja de estado) va en la barra de abajo, en la fila de la posición, en todas las vistas.
      const deslizador = p.getByRole('slider', { name: 'Posición en el vídeo' })
      assert.ok(await deslizador.isVisible())
      const caja = await deslizador.boundingBox()
      assert.ok(caja.y >= barra.y - 1 && caja.y + caja.height <= barra.y + barra.height + 1, 'el deslizador no está en la barra de abajo')
      const fila = await p.getByTestId('posicion').boundingBox()
      assert.ok(caja.y >= fila.y - 2 && caja.y + caja.height <= fila.y + fila.height + 2, 'el deslizador no va en la fila de la posición')
      assert.equal(await p.getByTestId('marcado-compacto').getByRole('slider').count(), 0)
      await irAFrame(p, 40)
      assert.equal((await leerPosicion(p)).frame, 41)
      await irAFrame(p, 0)
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
      assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflow), 'hidden', 'la página de debajo se puede desplazar')
      // Lo necesario para marcar está dentro, y la barra de avance sigue.
      assert.equal(await p.getByRole('radio').count(), 3)
      assert.ok(await p.getByRole('button', { name: 'Frame siguiente' }).isVisible())
      assert.ok((await (await p.getByTestId('capa').boundingBox()).y) >= 0 && (await p.getByTestId('capa').boundingBox()).y < alto)

      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('marcado-compacto').getByText(/Seguimiento completado/).waitFor({ timeout: 90000 })

      // Al volver, todo lo hecho está en su sitio y el ángulo coincide con el real.
      // La franja se ve ya aquí, en el propio vídeo grande, verde donde se siguió.
      assert.ok((await colorFranja(p)).verde > (await colorFranja(p)).ancho * 0.9)
      await p.getByTestId('reducir-video').click()
      assert.ok(await p.getByRole('tablist').isVisible())
      assert.ok(await p.getByTestId('minigrafica').isVisible())
      assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflow), 'visible')
      // La franja de estado, dibujada mientras estaba oculta, se rehace al volver: verde (seguido), no un solo píxel estirado.
      const franja = await colorFranja(p)
      assert.ok(franja.verde > franja.ancho * 0.9, `franja: ${JSON.stringify(franja)}`)
      await compararAngulos(p, video.verdad)
    } finally {
      await p.close()
    }
  })

  // Cuenta de colores de la franja de estado de los frames (verde = seguido, rojo = perdido, ámbar = a mano, azul = interpolado).
  const colorFranja = (p) =>
    p.getByRole('slider', { name: 'Posición en el vídeo' }).locator('..').locator('canvas').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, 1).data
      const cuenta = { verde: 0, rojo: 0, ambar: 0, azul: 0, otros: 0, ancho: c.width }
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
        if (a < 128) cuenta.otros++
        else if (g > 180 && r < 100) cuenta.verde++
        else if (r > 220 && g < 140) cuenta.rojo++
        else if (r > 220 && g > 140 && b < 120) cuenta.ambar++
        else if (b > 200 && r < 120) cuenta.azul++
        else cuenta.otros++
      }
      return cuenta
    })

  it('vídeo grande: seguir con huecos, ir al primero, trayectoria completa y, al volver, la franja de estado correcta', async () => {
    const video = videos.oculto
    const tapados = video.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('marcado-compacto').getByText(/no tiene posición fiable/).waitFor({ timeout: 90000 })
      // El botón para ir al primer hueco está dentro del vídeo grande y funciona.
      await p.getByRole('button', { name: new RegExp(`Ir al primer frame con hueco \\(${tapados[0] + 1}\\)`) }).click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, tapados[0] + 1)
      // La trayectoria completa se enciende desde el vídeo grande (y es la misma que la del panel «Marcar»).
      const trayectoria = p.getByTestId('trayectoria-compacta')
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'false')
      await trayectoria.click()
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'true')

      // Al volver: la franja refleja lo seguido (verde), lo perdido (rojo) y lo marcado a mano (ámbar), no un solo color.
      await p.getByTestId('reducir-video').click()
      assert.equal(await p.getByRole('button', { name: 'Trayectoria completa', exact: true }).getAttribute('aria-pressed'), 'true')
      await p.waitForFunction(() => {
        const c = document.querySelector('input[aria-label="Posición en el vídeo"]')?.parentElement?.querySelector('canvas')
        return !!c && c.width > 50
      })
      const franja = await colorFranja(p)
      const total = video.verdad.length
      assert.ok(franja.verde > franja.ancho * 0.7, `franja casi toda verde: ${JSON.stringify(franja)}`)
      assert.ok(franja.rojo >= 1, `la franja no marca el hueco en rojo: ${JSON.stringify(franja)}`)
      // El hueco ocupa tapados.length de total frames: su parte de la franja, con un píxel de margen por redondeo.
      const esperado = (tapados.length / total) * franja.ancho
      assert.ok(Math.abs(franja.rojo - esperado) <= 2 + esperado * 0.5, `rojo ${franja.rojo} px, esperado ≈ ${esperado.toFixed(1)}`)
    } finally {
      await p.close()
    }
  })

  it('vista mixta del móvil: el atajo de la trayectoria completa está sobre el vídeo y es el mismo interruptor que el de «Marcar»', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('aviso').waitFor({ timeout: 90000 })
      await p.evaluate(() => window.scrollTo(0, 0))
      await esperarQuieto(p)
      const trayectoria = p.getByTestId('trayectoria-compacta')
      await trayectoria.waitFor()
      // No tapa el botón de ampliar ni se sale del vídeo.
      const caja = await p.getByTestId('capa').boundingBox()
      const b = await trayectoria.boundingBox()
      const ampliar = await p.getByTestId('ampliar-video').boundingBox()
      assert.ok(b.y >= ampliar.y + ampliar.height, 'el atajo debe ir debajo del botón de ampliar')
      assert.ok(b.y + b.height <= caja.y + caja.height && b.x + b.width <= caja.x + caja.width, 'el atajo debe caber en el vídeo')
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'false')
      await trayectoria.click()
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'true')
      // Es el interruptor de la pestaña «Marcar»: lo ve encendido; apagarlo allí lo apaga aquí.
      await p.getByTestId('pestana-marcar').click()
      const enPanel = p.getByRole('button', { name: 'Trayectoria completa', exact: true })
      assert.equal(await enPanel.getAttribute('aria-pressed'), 'true')
      await enPanel.click()
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'false')
    } finally {
      await p.close()
    }
  })

  it('vídeo grande: un hueco corto se rellena y se quita desde ella', async () => {
    const video = videos.corto
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      const extras = p.getByTestId('extras-compactos')
      await extras.waitFor({ timeout: 90000 })
      await extras.getByRole('button', { name: /Rellenar 1 hueco corto/ }).click()
      await extras.getByRole('button', { name: 'Quitar lo interpolado' }).waitFor()
      assert.equal(await extras.getByRole('button', { name: /Rellenar/ }).count(), 0)
      await extras.getByRole('button', { name: 'Quitar lo interpolado' }).click()
      await extras.getByRole('button', { name: /Rellenar 1 hueco corto/ }).waitFor()
    } finally {
      await p.close()
    }
  })

  it('vídeo grande: «Colocar a ojo» deja el marcador justo donde se toca, sin buscar el gomet', async () => {
    const { p } = await seguirVideo(videos.oculto, { ancho: 390 })
    const verdad = videos.oculto.verdad
    const tapados = verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    try {
      await irAFrame(p, tapados[2])
      await p.getByTestId('ampliar-video').click()
      // El del panel «Marcar» sigue montado pero oculto: se usa el de la tira del vídeo grande.
      const interruptor = p.getByTestId('marcado-compacto').getByTestId('colocar-a-ojo')
      assert.equal(await interruptor.getAttribute('aria-checked'), 'false')
      await elegirMarcador(p, 'Maléolo')
      await interruptor.click()
      assert.equal(await interruptor.getAttribute('aria-checked'), 'true')
      // Con el gomet tapado, un toque en su sitio queda a mano sin que salga el error de «no veo un gomet».
      const real = verdad[tapados[2]].ps[2]
      await tocarVideo(p, real.x, real.y)
      assert.equal(await p.getByTestId('error-toque').count(), 0)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      assert.ok(Math.abs((await leerAngulo(p)) - verdad[tapados[2]].flexion) < 1.5)
      // Ya no hay marcador elegido, pero el botón para quitar la marca a mano está a la vista en el vídeo grande.
      assert.equal(await p.getByRole('radio', { checked: true }).count(), 0)
      await p.getByTestId('extras-compactos').getByRole('button', { name: /Quitar la marca a mano: Maléolo/ }).waitFor()
      // No se ajusta a ningún gomet: un toque 40 px más abajo se queda ahí (con el interruptor apagado se iría al gomet).
      await elegirMarcador(p, 'Maléolo')
      await tocarVideo(p, real.x, real.y + 40)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      assert.ok(Math.abs((await leerAngulo(p)) - verdad[tapados[2]].flexion) > 3, 'el marcador se ha pegado al gomet')
      // Apagado, vuelve a buscar el gomet: tocar lejos de todos da el aviso.
      await elegirMarcador(p, 'Maléolo')
      await interruptor.click()
      assert.equal(await interruptor.getAttribute('aria-checked'), 'false')
      await tocarVideo(p, 60, 300)
      const error = p.getByTestId('error-toque')
      await error.waitFor()
      // En el vídeo grande el aviso es corto, va justo debajo del vídeo (antes de los marcadores) y no hace falta desplazarse.
      assert.ok((await error.locator('> p').innerText()).length < 60, 'el aviso del vídeo grande es largo')
      assert.equal(await error.getByRole('button', { name: 'Colocarlo aquí a ojo' }).isVisible(), true)
      const cajaError = await error.boundingBox()
      const cajaMarcadores = await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).boundingBox()
      const cajaVideoGrande = await p.getByTestId('capa').boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(cajaError.y >= cajaVideoGrande.y + cajaVideoGrande.height - 1 && cajaError.y + cajaError.height <= cajaMarcadores.y + 1, 'el aviso no está entre el vídeo y los marcadores')
      assert.ok(cajaError.y + cajaError.height <= barra.y, 'el aviso queda tapado por la barra de abajo')
      // El detalle técnico y la explicación están plegados.
      assert.equal(await error.locator('details').getAttribute('open'), null)
    } finally {
      await p.close()
    }
  })

  it('solo gráficas: la completa ocupa el espacio, tocarla salta de frame y la barra sigue', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const tiempos = videos.verde.verdad.map((f) => f.t)
      await p.getByTestId('ampliar-graficas').click()
      const vista = p.getByTestId('vista-graficas')
      const caja = await vista.boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(caja.y <= 0.5 && Math.abs(caja.y + caja.height - barra.y) <= 1, `las gráficas van de ${caja.y} a ${caja.y + caja.height}; la barra empieza en ${barra.y}`)
      assert.equal(await p.getByTestId('capa').isVisible(), false)
      assert.equal(await p.getByRole('tablist').isVisible(), false)
      // Más altas que en la vista mixta (190 px de gráfica → unos 150 de zona táctil).
      assert.ok((await p.getByTestId('grafica-angulo-area').boundingBox()).height > 200)
      // Tocarla salta de frame; el cursor y los botones de avance siguen.
      const area = await cajaElemento(p, 'grafica-angulo-area')
      await p.mouse.click(area.x + area.width * 0.4, area.y + area.height / 2)
      await esperarQuieto(p)
      const esperado = frameMasCercano(tiempos, tiempos[0] + 0.4 * (tiempos.at(-1) - tiempos[0])) + 1
      assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
      assert.ok((await leerPosicion(p)).frame >= esperado)
      // Volver.
      await p.getByTestId('reducir-graficas').click()
      assert.ok(await p.getByTestId('capa').isVisible())
      assert.ok(await p.getByTestId('minigrafica').isVisible())
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
    } finally {
      await p.close()
    }
  })

  it('solo gráficas se reparte el alto de la pantalla y no hace falta desplazarse (móvil, móvil grande y tablet en vertical)', async () => {
    for (const [ancho, alto] of [[390, 844], [432, 960], [768, 1024]]) {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        await p.getByTestId('ampliar-graficas').click()
        const vista = p.getByTestId('vista-graficas')
        const sinScroll = () => vista.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
        assert.ok(await sinScroll(), `${ancho} × ${alto}: ángulo y velocidad no caben sin desplazarse`)
        // Las dos gráficas se ven enteras y con altura útil.
        for (const id of ['grafica-angulo-area', 'grafica-velocidad-area']) {
          const caja = await p.getByTestId(id).boundingBox()
          assert.ok(caja.height >= 70, `${ancho} × ${alto}: ${id} mide ${caja.height} px`)
        }
        // Con los segmentos encendidos son tres paneles: siguen cabiendo.
        await p.locator('[data-testid^="serie-segmento-"]').first().click()
        await p.getByTestId('grafica-segmentos-area').waitFor()
        assert.ok(await sinScroll(), `${ancho} × ${alto}: con los segmentos no caben sin desplazarse`)
        // Las gráficas se ajustan si cambia el alto (girar el móvil): más bajo, más corto, sin salirse.
        const antes = (await p.getByTestId('grafica-angulo-area').boundingBox()).height
        await p.setViewportSize({ width: ancho, height: alto - 200 })
        await p.waitForTimeout(300)
        const despues = (await p.getByTestId('grafica-angulo-area').boundingBox()).height
        assert.ok(despues < antes, `${ancho} × ${alto}: la gráfica no se ajusta al alto (${antes} → ${despues})`)
      } finally {
        await p.close()
      }
    }
  })

  it('en pantalla ancha no hay botones de ampliar', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      assert.equal(await p.getByTestId('ampliar-video').count(), 0)
      assert.equal(await p.getByTestId('ampliar-graficas').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('deslizador de frames y franja de estado: una sola barra', () => {
  it('la franja de estado es la pista del deslizador (una barra baja) y tocarlo salta de frame', async () => {
    for (const ancho of [390, 1280]) {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        const deslizador = p.getByRole('slider', { name: 'Posición en el vídeo' })
        const contenedor = deslizador.locator('..')
        await contenedor.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const caja = await contenedor.boundingBox()
        assert.ok(caja.height <= 30, `${ancho} px: la barra mide ${caja.height} px`)
        // La franja (canvas) va dentro de la misma caja, centrada: no es una fila aparte.
        const franja = await contenedor.locator('canvas').boundingBox()
        assert.ok(franja.y >= caja.y && franja.y + franja.height <= caja.y + caja.height + 0.5, `${ancho} px: la franja se sale de la barra`)
        assert.ok(Math.abs(franja.y + franja.height / 2 - (caja.y + caja.height / 2)) <= 1)
        // Tocar la barra salta de frame: al 50 % del recorrido, el frame central (±2 por el tirador).
        const total = videos.verde.verdad.length
        await p.mouse.click(caja.x + caja.width * 0.5, caja.y + caja.height / 2)
        await esperarQuieto(p)
        const { frame } = await leerPosicion(p)
        assert.ok(Math.abs(frame - (total / 2 + 0.5)) <= 3, `${ancho} px: tocar la mitad lleva al frame ${frame} de ${total}`)
        // El deslizador sigue siendo accesible y con el valor del frame actual.
        assert.equal(Number(await deslizador.inputValue()), frame - 1)
      } finally {
        await p.close()
      }
    }
  })
})

describe('escritorio: la pantalla cabe en la altura de la ventana', () => {
  for (const [nombre, ancho, alto, vertical] of [
    ['vídeo horizontal a 1280 × 900', 1280, 900, false],
    ['vídeo vertical a 1280 × 900', 1280, 900, true],
    ['vídeo horizontal a 1920 × 1000', 1920, 1000, false],
    ['vídeo vertical a 1920 × 1000', 1920, 1000, true],
  ]) {
    it(`${nombre}: ni el vídeo, ni los controles, ni la gráfica obligan a desplazarse`, async () => {
      const p = await abrirApp(navegador, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        const video = vertical ? videos.vertical : videos.verde
        await cargarVideo(p, video.ruta)
        if (!vertical) {
          await marcarTres(p, videos.verde.verdad[0].ps)
          await seguirHastaElFinal(p)
        }
        // También con los segmentos encendidos (tres paneles en la gráfica).
        await p.locator('[data-testid^="serie-segmento-"]').first().click()
        await p.waitForTimeout(300)
        const medidas = await p.evaluate(() => ({ alto: document.documentElement.scrollHeight, ventana: window.innerHeight, ancho: document.documentElement.scrollWidth, anchoVentana: window.innerWidth }))
        assert.ok(medidas.alto <= medidas.ventana + 1, `la página mide ${medidas.alto} px y la ventana ${medidas.ventana}`)
        assert.ok(medidas.ancho <= medidas.anchoVentana, 'scroll horizontal')
        // Vídeo, controles, gráfica y pie, enteros dentro de la ventana.
        for (const id of ['lienzo', 'barra-fija', 'grafica-angulo-area', 'pie']) {
          const caja = await p.getByTestId(id).boundingBox().catch(() => null)
          if (!caja) continue
          assert.ok(caja.y >= 0 && caja.y + caja.height <= alto + 1, `${id} está en ${caja.y}–${caja.y + caja.height}, la ventana mide ${alto}`)
        }
        const botones = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
        assert.ok(botones.y + botones.height <= alto)
        // La columna de herramientas, más alta que el hueco (la trayectoria desplegada, el panel de análisis), se desplaza por dentro:
        // no alarga la página ni empuja el pie hacia abajo.
        await p.getByRole('button', { name: 'Trayectoria completa', exact: true }).click()
        for (const pestana of ['marcar', 'analisis', 'escala', 'video']) {
          await abrirPestana(p, pestana)
          const m = await p.evaluate(() => ({ alto: document.documentElement.scrollHeight, ventana: window.innerHeight }))
          assert.ok(m.alto <= m.ventana + 1, `pestaña ${pestana}: la página mide ${m.alto} px y la ventana ${m.ventana}`)
          const pie = await p.getByTestId('pie').boundingBox()
          assert.ok(pie.y + pie.height <= alto + 1, `pestaña ${pestana}: el pie está en ${pie.y}–${pie.y + pie.height}`)
        }
        await abrirPestana(p, 'marcar')
        // El vídeo no queda diminuto: al menos 200 px de alto y un tercio del ancho de la columna.
        const lienzo = await p.getByTestId('lienzo').boundingBox()
        assert.ok(lienzo.height >= 200, `el vídeo mide ${lienzo.height} px de alto`)
      } finally {
        await p.close()
      }
    })
  }
})

describe('escritorio: la columna de herramientas mide lo mismo que la tarjeta de la gráfica', () => {
  for (const [ancho, alto] of [[1280, 900], [1920, 1000]]) {
    it(`a ${ancho} × ${alto}, en las cuatro pestañas, con y sin la trayectoria`, async () => {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        await p.waitForTimeout(300)
        const columna = p.getByTestId('columna-herramientas')
        const tarjeta = p.getByTestId('panel-grafica')
        const medir = async () => ({ c: await columna.boundingBox(), g: await tarjeta.boundingBox() })
        let alturas = new Set()
        for (const trayectoria of [false, true]) {
          if (trayectoria) {
            await abrirPestana(p, 'marcar')
            await p.getByRole('button', { name: 'Trayectoria completa', exact: true }).click()
          }
          for (const pestana of ['marcar', 'analisis', 'escala', 'video']) {
            await abrirPestana(p, pestana)
            const { c, g } = await medir()
            // Mismo alto y mismo borde de arriba: la caja de herramientas y la tarjeta de la gráfica.
            assert.ok(Math.abs(c.height - g.height) <= 1.5, `${pestana}: herramientas ${c.height} px y gráfica ${g.height} px`)
            assert.ok(Math.abs(c.y - g.y) <= 1.5 + 0.5, `${pestana}: herramientas empiezan en ${c.y} y la gráfica en ${g.y}`)
            alturas.add(Math.round(c.height))
            // La tarjeta de herramientas (la que lleva los paneles) acaba justo donde la de la gráfica, con scroll o sin él.
            const t = await p.getByTestId('panel-herramientas').boundingBox()
            assert.ok(Math.abs(t.y + t.height - (g.y + g.height)) <= 1.5, `${pestana}: la tarjeta acaba en ${t.y + t.height} y la de la gráfica en ${g.y + g.height}`)
          }
        }
        assert.equal(alturas.size, 1, `la altura cambia según la pestaña: ${[...alturas].join(', ')}`)
        // El scroll aparece solo si el panel excede esa altura: «Análisis» (largo) sí, «Vídeo» (corto) no.
        const tarjetaHerramientas = p.getByTestId('panel-herramientas')
        await abrirPestana(p, 'analisis')
        assert.ok(await tarjetaHerramientas.evaluate((el) => el.scrollHeight > el.clientHeight + 1), 'Análisis debería desplazarse')
        await abrirPestana(p, 'video')
        assert.ok(await tarjetaHerramientas.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'Vídeo no debería desplazarse')
      } finally {
        await p.close()
      }
    })
  }
})

describe('barras de desplazamiento', () => {
  it('llevan el estilo del tema (finas y oscuras), no las del sistema', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const estilos = await p.evaluate(() => {
        const e = (sel) => document.querySelector(sel)
        const g = (el) => getComputedStyle(el)
        return {
          esquema: g(document.documentElement).colorScheme,
          columna: g(e('[data-testid=panel-herramientas]')).scrollbarWidth,
          serie: g(e('[role=group][aria-label="Series de la gráfica"]')).scrollbarWidth,
          color: g(e('[data-testid=panel-herramientas]')).scrollbarColor,
        }
      })
      assert.equal(estilos.esquema, 'dark')
      assert.equal(estilos.columna, 'thin')
      assert.equal(estilos.serie, 'thin')
      assert.match(estilos.color, /^color\(srgb|^rgba?\(/, `scrollbar-color: ${estilos.color}`)
      assert.match(estilos.color, /transparent|rgba\(0, 0, 0, 0\)|\/ 0\)/, `la pista debe ser transparente: ${estilos.color}`)
    } finally {
      await p.close()
    }
  })
})

describe('escritorio', () => {
  it('a 1280 px la gráfica y los controles caben sin desbordar la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const { desborda } = await p.evaluate(() => ({ desborda: document.documentElement.scrollWidth > window.innerWidth }))
      assert.equal(desborda, false, 'la página tiene scroll horizontal')
      assert.ok(await p.getByTestId('grafica-angulo-area').isVisible())
    } finally {
      await p.close()
    }
  })
})

describe('aviso de versión nueva', () => {
  const publicar = (p, commit) => p.route('**/version.json', (r) => r.fulfill({ json: { commit, rama: 'prueba' } }))

  it('con lo publicado igual a lo abierto no avisa', async () => {
    const p = await abrirApp(navegador)
    try {
      // Build local: el commit de la app y el de version.json son el mismo («dev»).
      const publicada = await (await p.request.get(new URL('/version.json', p.url()).href)).json()
      assert.ok(publicada.commit)
      await p.reload()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('con otro commit publicado, avisa y «Recargar» vuelve a cargar la app; también al volver a verla', async () => {
    const p = await abrirApp(navegador)
    try {
      await publicar(p, 'commit-nuevo')
      await p.reload()
      const aviso = p.getByTestId('version-nueva')
      await aviso.waitFor()
      assert.match(await aviso.innerText(), /Hay una versión nueva/)
      // Recargar: la página se vuelve a cargar (y, sin el aviso simulado, desaparece).
      await p.unroute('**/version.json')
      await Promise.all([p.waitForEvent('load'), aviso.getByRole('button', { name: 'Recargar' }).click()])
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)

      // Comprobación al volver a la app: aparece sin recargar la página.
      await publicar(p, 'otro-commit')
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await p.getByTestId('version-nueva').waitFor()
    } finally {
      await p.close()
    }
  })

  it('el aviso flota: no cambia la posición de nada, y se cierra hasta que haya otra versión distinta', async () => {
    const p = await abrirApp(navegador)
    try {
      const y0 = (await p.getByRole('heading', { name: 'dualkinema' }).boundingBox()).y
      await publicar(p, 'commit-nuevo')
      await p.reload()
      await p.getByTestId('version-nueva').waitFor()
      assert.equal((await p.getByRole('heading', { name: 'dualkinema' }).boundingBox()).y, y0, 'el aviso mueve la cabecera')
      assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=version-nueva]')).position), 'fixed')

      await p.getByTestId('version-nueva-cerrar').click()
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
      // Misma versión publicada al volver a verla: sigue cerrado. Otra distinta: vuelve a avisar.
      const alVolver = () =>
        p.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
        })
      await alVolver()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
      await p.unroute('**/version.json')
      await publicar(p, 'otra-mas')
      await alVolver()
      await p.getByTestId('version-nueva').waitFor()
    } finally {
      await p.close()
    }
  })

  it('un version.json que no es una versión (p. ej. sin conexión o una página) no avisa', async () => {
    const p = await abrirApp(navegador)
    try {
      await p.route('**/version.json', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }))
      await p.reload()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('app instalable', () => {
  it('el manifiesto está enlazado, es válido y sus iconos existen con el tamaño que dicen', async () => {
    const p = await abrirApp(navegador)
    try {
      const href = await p.locator('link[rel=manifest]').getAttribute('href')
      assert.ok(href, 'falta <link rel="manifest">')
      const url = new URL(href, p.url()).href
      const respuesta = await p.request.get(url)
      assert.ok(respuesta.ok())
      const m = await respuesta.json()
      // Sin la barra del navegador y con la URL de siempre (sin service worker: siempre la última versión).
      assert.equal(m.display, 'standalone')
      assert.equal(new URL(m.start_url, url).pathname, '/')
      assert.ok(m.name && m.short_name)
      const medidas = m.icons.map((i) => i.sizes)
      assert.ok(medidas.includes('192x192') && medidas.includes('512x512'), 'faltan los iconos de 192 y 512 px')
      assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'falta un icono maskable')
      for (const icono of m.icons) {
        const r = await p.request.get(new URL(icono.src, url).href)
        assert.ok(r.ok(), `no se sirve ${icono.src}`)
        assert.match(r.headers()['content-type'], /image\/png/)
        const png = await r.body()
        // Cabecera PNG: ancho y alto en los bytes 16–23.
        const [ancho, alto] = [png.readUInt32BE(16), png.readUInt32BE(20)]
        assert.equal(`${ancho}x${alto}`, icono.sizes, `${icono.src} no mide lo que dice el manifiesto`)
      }
    } finally {
      await p.close()
    }
  })
})

describe('el primer vídeo es el de perfil', () => {
  it('al abrir el primer vídeo se recuerda empezar por el de perfil; al añadir la segunda vista, no', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      const recordatorio = p.getByTestId('recordatorio-perfil')
      await recordatorio.waitFor({ timeout: 20000 })
      assert.match(await recordatorio.innerText(), /empieza por el vídeo de perfil: de él sale la pierna que se analiza/)
      // Solo opciones de perfil para el primero.
      assert.equal(await p.getByRole('button', { name: 'La cámara la ve de frente' }).count(), 0)
      await p.getByRole('button', { name: 'Mira a la derecha' }).click()
      await esperarQuieto(p)
      await abrirPestana(p, 'video')
      await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.frontal.ruta)
      await p.getByTestId('anadir-vista-orientacion').waitFor()
      assert.equal(await p.getByTestId('recordatorio-perfil').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('dos vistas: añadir la segunda, cursor común, A / B y recuperarlas', () => {
  // A = «verde» (30 fps con huecos, 4,03 s, seguida: ángulo real conocido) y B = «numerado25» (25 fps constantes, 3,6 s, con el número de cada frame
  // en bloques). Por tiempo común (desfase 0): al frame k de A le toca en B el último con t_B ≤ t_A(k), y A acaba (4,03 s) después que B (3,6 s).
  let p
  // El contenedor guarda los tiempos en milisegundos: los de 30 fps (33,33…) se redondean, y con ellos se decide qué frame toca.
  const tA = (k) => Math.round(videos.verde.verdad[k].t * 1000) / 1000
  let tB
  const frameBEn = (t) => tB.reduce((mejor, x, k) => (x <= t + 1e-6 ? k : mejor), 0)
  const verB = () => leerFrameDibujado(p, videos.numerado25)

  before(async () => {
    tB = videos.numerado25.tiempos
    ;({ p } = await seguirVideo(videos.verde))
  })
  after(() => p?.close())

  it('con una sola vista no hay conmutador y la pestaña «Vídeo» ofrece añadir la segunda', async () => {
    assert.equal(await p.getByTestId('conmutador-vista').count(), 0)
    await abrirPestana(p, 'video')
    await p.getByRole('button', { name: 'Añadir la segunda vista' }).waitFor()
  })

  it('un vídeo igual al abierto se rechaza', async () => {
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.verde.ruta)
    await p.getByText(/es el mismo vídeo que ya está abierto/).waitFor({ timeout: 20000 })
    assert.equal(await p.getByTestId('conmutador-vista').count(), 0)
  })

  it('al añadir el otro vídeo y decir cómo se ve la persona, entra como vista B y la A sigue siendo la activa', async () => {
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.numerado25.ruta)
    await p.getByTestId('anadir-vista-orientacion').waitFor({ timeout: 20000 })
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    assert.equal(await p.getByTestId('vista-A').getAttribute('aria-pressed'), 'true')
    assert.equal(await p.getByTestId('vista-B').getAttribute('aria-pressed'), 'false')
    assert.equal(await p.getByTestId('miniatura-vista').count(), 1)
    // Sigue en la pestaña «Vídeo» y la sección de añadir ya no está.
    assert.equal(await p.getByTestId('pestana-video').getAttribute('aria-selected'), 'true')
    assert.equal(await p.getByRole('button', { name: 'Añadir la segunda vista' }).count(), 0)
    // Lo de A no se ha perdido al volver a montar el cuerpo del visor: el vídeo sigue pintado (no en blanco) y el ángulo es el real.
    await esperarQuieto(p)
    const pintado = await p.evaluate(() => {
      const c = document.querySelector('[data-testid=lienzo]')
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let claros = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) claros++
      return claros / (d.length / 4)
    })
    assert.ok(pintado > 0.5, `el lienzo de A quedó en blanco al añadir la segunda vista (píxeles con imagen: ${pintado})`)
    await irAFrame(p, 60)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
  })

  it('el cursor común lleva B al frame que toca por tiempo (25 y 30 fps), no al mismo número', async () => {
    for (const k of [0, 10, 40, 41, 59, 80, 81, 100]) {
      await abrirPestana(p, 'video')
      await irAFrame(p, k)
      // Las dos vistas viven en el mismo cursor: B se ve en la miniatura y, al activarla, en su lienzo.
      await p.getByTestId('vista-B').click()
      await esperarQuieto(p)
      const esperado = frameBEn(tA(k))
      assert.equal(await verB(), esperado, `A en el frame ${k + 1} (t = ${tA(k).toFixed(3)} s): B debería mostrar el frame ${esperado}`)
      assert.equal((await leerPosicion(p)).frame, esperado + 1)
      // Volver a A no la mueve: sigue en su frame.
      await p.getByTestId('vista-A').click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, k + 1, `volver a A deja su frame ${k + 1}`)
    }
  })

  it('al revés: moviendo B (activa) A va al frame que toca por tiempo', async () => {
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    for (const j of [5, 33, 70]) {
      await irAFrame(p, j)
      await p.getByTestId('vista-A').click()
      await esperarQuieto(p)
      const esperado = videos.verde.verdad.reduce((mejor, _, k) => (tA(k) <= tB[j] + 1e-6 ? k : mejor), 0)
      assert.equal((await leerPosicion(p)).frame, esperado + 1, `B en el frame ${j + 1} (t = ${tB[j].toFixed(3)} s)`)
      await p.getByTestId('vista-B').click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, j + 1)
    }
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })

  it('el teclado mueve solo la vista activa', async () => {
    await irAFrame(p, 20)
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 22)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    const antes = (await leerPosicion(p)).frame
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, antes + 1, 'B avanza un frame (no dos: A no responde al teclado)')
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })

  it('pasado el final de B (3,6 s), su miniatura dice «Fuera de este vídeo» y no se mueve; al volver dentro, B vuelve a su sitio', async () => {
    const k = 110
    assert.ok(tA(k) > tB[tB.length - 1] + 1 / 25, 'el frame 111 de A está después del final de B')
    await irAFrame(p, k)
    const miniatura = p.getByTestId('miniatura-vista')
    await p.waitForFunction(() => document.querySelector('[data-testid=miniatura-vista]')?.getAttribute('data-fuera') === 'true')
    assert.match(await miniatura.innerText(), /Fuera de este vídeo/)
    await irAFrame(p, 60)
    await p.waitForFunction(() => document.querySelector('[data-testid=miniatura-vista]')?.getAttribute('data-fuera') === 'false')
    assert.doesNotMatch(await miniatura.innerText(), /Fuera/)
  })

  it('con el cursor fuera del vídeo de B, pasar a B la lleva a su último frame', async () => {
    await irAFrame(p, 110)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    assert.equal(await verB(), tB.length - 1)
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await irAFrame(p, 0)
  })

  it('marcar en B no toca lo de A, y mientras sigue una vista la otra espera', async () => {
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    // B no tiene nada marcado: su ángulo no existe y el recuento de A no cambia.
    await abrirPestana(p, 'marcar')
    assert.equal(await p.getByTestId('angulo').innerText(), '—')
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await irAFrame(p, 60)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
  })

  it('la sesión se guarda con las dos vistas', async () => {
    await esperarGuardado(p, videos.verde.verdad.length)
    const cabecera = await p.evaluate(async () => {
      const bd = await new Promise((ok) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
      })
      const todas = await new Promise((ok) => {
        const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
        r.onsuccess = () => ok(r.result)
      })
      bd.close()
      return todas[0]
    })
    assert.equal(cabecera.vistas.length, 2)
    assert.deepEqual(cabecera.vistas.map((v) => v.id), ['v1', 'v2'])
    assert.equal(cabecera.referencia, 'v1')
    assert.deepEqual(cabecera.vistas.map((v) => v.desfase), [0, 0])
    assert.deepEqual(cabecera.vistas[1].orientacion, { plano: 'frontal', ve: 'delante' })
    assert.equal(cabecera.claves.length, 2)
  })

  it('tras recargar, la portada la lista con sus dos vistas', async () => {
    await p.reload()
    const sesion = p.getByTestId('sesion-guardada')
    await sesion.waitFor()
    assert.equal(await sesion.count(), 1)
    assert.match(await sesion.innerText(), /mira a la derecha \+ vista desde delante/)
  })

  it('abriendo solo uno de los vídeos pide el otro; uno que no es de la sesión se rechaza; con el bueno recupera las dos vistas', async () => {
    await p.setInputFiles('input[type=file]', videos.numerado25.ruta)
    await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
    assert.match(await p.getByTestId('candidata').innerText(), /Tiene 2 vistas/)
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await p.getByTestId('faltan-videos').waitFor({ timeout: 20000 })
    assert.match(await p.getByTestId('faltan-videos').innerText(), /verde\.webm/)
    // Un vídeo ajeno no vale.
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.numerado.ruta)
    await p.getByText(/no es ninguno de los vídeos que faltan/).waitFor({ timeout: 20000 })
    assert.equal(await p.getByTestId('conmutador-vista').count(), 0)
    // El suyo sí.
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.verde.ruta)
    await p.getByTestId('conmutador-vista').waitFor({ timeout: 20000 })
    await esperarQuieto(p)
    // La referencia (A) es verde, con su seguimiento intacto, y B es el de 25 fps.
    assert.equal(await p.getByTestId('vista-A').getAttribute('aria-pressed'), 'true')
    assert.equal((await leerPosicion(p)).total, videos.verde.verdad.length)
    await irAFrame(p, 60)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).total, videos.numerado25.tiempos.length)
    assert.equal(await verB(), frameBEn(tA(60)))
  })

  it('«Continuar» desde la lista con el vídeo de la vista A también pide el otro, y sigue siendo la misma sesión', async () => {
    await p.reload()
    await p.getByTestId('sesion-guardada').waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 1)
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.verde.ruta)
    await p.getByTestId('faltan-videos').waitFor({ timeout: 20000 })
    assert.match(await p.getByTestId('faltan-videos').innerText(), /numerado25\.webm/)
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.numerado25.ruta)
    await p.getByTestId('conmutador-vista').waitFor({ timeout: 20000 })
    await esperarQuieto(p)
    await p.reload()
    await p.getByTestId('sesion-guardada').waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 1, 'recuperar no crea otra sesión')
  })
})

describe('dos vistas: se sigue de una en una y cada vista conserva lo suyo', () => {
  // A = «verde» y B = «rojo» (otra cámara, vista de frente: sin ángulo, pero se marca y se sigue igual). El worker va frenado
  // para que dé tiempo a cambiar de vista a mitad del seguimiento de A.
  let p
  before(async () => {
    p = await abrirApp(navegador, { ancho: 1280 })
    await frenarWorker(p)
    await cargarVideo(p, videos.verde.ruta)
    await marcarTres(p, videos.verde.verdad[0].ps)
    await abrirPestana(p, 'video')
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.rojo.ruta)
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'marcar')
    await marcarTres(p, videos.rojo.verdad[0].ps)
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })
  after(() => p?.close())

  it('mientras A sigue, B espera (no se puede empezar a seguir) y avisa; al acabar A, B puede seguir y termina sin huecos', async () => {
    await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
    await p.waitForFunction(() => Number.parseInt(document.querySelector('[data-testid=progreso-seguimiento]')?.textContent ?? '0') >= 10, null, { timeout: 60000 })
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    assert.equal(await p.getByRole('button', { name: 'Seguir desde aquí' }).isDisabled(), true, 'B no puede seguir mientras A sigue')
    assert.match(await p.getByTestId('aviso').innerText(), /Se está siguiendo la otra vista/)
    // A termina (sigue en segundo plano mientras se mira B): al volver a A, está seguida entera con el ángulo real.
    await p.getByRole('button', { name: 'Seguir desde aquí' }).waitFor({ state: 'visible' })
    await p.waitForFunction(() => !document.querySelector('[data-testid=aviso]')?.textContent?.includes('Se está siguiendo la otra vista'), null, { timeout: 90000 })
    await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
    await p.getByTestId('aviso').filter({ hasText: /completado hasta el final del vídeo, sin huecos/ }).waitFor({ timeout: 90000 })
  })

  it('cada vista conserva lo suyo: A, el ángulo real; B, sus tres marcadores', async () => {
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    for (const i of [20, 60, 100]) {
      await irAFrame(p, i)
      assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[i].flexion) < TOLERANCIA_GRADOS, `A, frame ${i + 1}`)
    }
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await irAFrame(p, 60)
    // B está seguida en todos sus frames: los tres marcadores tienen posición («seguido»), no «—» ni «perdido».
    assert.doesNotMatch(await p.getByRole('radiogroup').innerText(), /perdido|—/)
  })
})

describe('dos vistas: sincronizar por un evento visual y ajuste fino', () => {
  // A = «verde» (30 fps con huecos) y B = «numerado25» (25 fps). El «evento» es el frame 46 de A y el 13 de B: el desfase de B es la diferencia de sus
  // instantes (los del contenedor, en milisegundos) y con él cada vista debe mostrar el evento a la vez.
  let p
  let tB
  const KA = 45
  const KB = 12
  const tA = (k) => Math.round(videos.verde.verdad[k].t * 1000) / 1000
  const desfaseEsperado = () => tA(KA) - tB[KB]
  const frameBEn = (t) => tB.reduce((mejor, x, k) => (x <= t + 1e-6 ? k : mejor), 0)
  const verB = () => leerFrameDibujado(p, videos.numerado25)
  const signo = (s) => `${s < 0 ? '−' : '+'}${Math.abs(s).toFixed(3).replace('.', ',')} s`
  const leerDesfase = async () => (await p.getByTestId('desfase-sincronia').innerText()).trim()
  const cabeceraGuardada = () =>
    p.evaluate(async () => {
      const bd = await new Promise((ok) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
      })
      const todas = await new Promise((ok) => {
        const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
        r.onsuccess = () => ok(r.result)
      })
      bd.close()
      return todas[0]
    })

  before(async () => {
    tB = videos.numerado25.tiempos
    ;({ p } = await seguirVideo(videos.verde, { ancho: 1280 }))
    await abrirPestana(p, 'video')
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.numerado25.ruta)
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    await esperarQuieto(p)
  })
  after(() => p?.close())

  it('con las dos vistas, la pestaña «Vídeo» ofrece sincronizar y parte sin sincronía', async () => {
    await abrirPestana(p, 'video')
    await p.getByTestId('sincronizar-vistas').waitFor()
    assert.equal(await leerDesfase(), '+0,000 s')
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Sin sincronizar')
    assert.equal(await p.getByTestId('incertidumbre-sincronia').count(), 0)
  })

  it('marcando el evento, cada vista se mueve sola y el desfase propuesto es la diferencia de instantes', async () => {
    await p.getByRole('button', { name: 'Marcar el evento en las dos vistas' }).click()
    await p.getByTestId('marcando-evento').waitFor()
    // A al frame del evento.
    await irAFrame(p, KA)
    // El botón sobre el vídeo marca la vista activa (en el móvil el panel de la pestaña queda fuera de pantalla).
    await p.getByTestId('marcar-evento-video').click()
    assert.match(await p.getByTestId('evento-A').innerText(), new RegExp(`frame ${KA + 1}\\)`))
    // B al suyo (sin arrastrar a A: el cursor está desenlazado).
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await irAFrame(p, KB)
    await p.getByRole('button', { name: 'Este es el evento en B' }).click()
    assert.match(await p.getByTestId('evento-B').innerText(), new RegExp(`frame ${KB + 1}\\)`))
    assert.match(await p.getByTestId('desfase-propuesto').innerText(), new RegExp(`Desfase de B: ${signo(desfaseEsperado()).replace('+', '\\+')}`))
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, KA + 1, 'A sigue en su frame del evento')
  })

  it('al aplicar, el desfase y su precisión salen en pantalla, y los dos vídeos muestran el evento a la vez', async () => {
    await p.getByRole('button', { name: 'Aplicar' }).click()
    await p.getByTestId('incertidumbre-sincronia').waitFor()
    assert.equal(await leerDesfase(), signo(desfaseEsperado()))
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Por evento visual')
    // ± ½ frame de cada vista: (33,3 + 40) / 2 = 36,7 → 37 ms.
    assert.match(await p.getByTestId('incertidumbre-sincronia').innerText(), /± 37 ms/)
    // Con A en su frame del evento, B muestra el suyo.
    await esperarQuieto(p)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    assert.equal(await verB(), KB, 'B muestra el frame del evento')
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, KA + 1)
  })

  it('el cursor común usa el desfase: moviendo A, B va al frame de t − desfase', async () => {
    for (const k of [20, 60, 90]) {
      await irAFrame(p, k)
      await p.getByTestId('vista-B').click()
      await esperarQuieto(p)
      const t = tA(k) - desfaseEsperado()
      if (t >= 0 && t < tB[tB.length - 1] + 1 / 25) assert.equal(await verB(), frameBEn(t), `A en el frame ${k + 1} (t = ${tA(k)} s)`)
      await p.getByTestId('vista-A').click()
      await esperarQuieto(p)
    }
  })

  it('el ajuste fino mueve B un frame suyo (40 ms) cada vez y lo dice; volver deja el desfase del evento', async () => {
    await irAFrame(p, KA)
    await p.getByRole('button', { name: 'B un frame después' }).click()
    await p.waitForFunction((t) => document.querySelector('[data-testid=desfase-sincronia]')?.textContent?.trim() === t, signo(desfaseEsperado() + 0.04))
    assert.match(await p.getByTestId('metodo-sincronia').innerText(), /Por evento visual · ajustada \+40 ms/)
    // Con B 40 ms más tarde, en el instante del evento B enseña un frame antes.
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    assert.equal(await verB(), KB - 1)
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await p.getByRole('button', { name: 'B un frame antes' }).click()
    await p.waitForFunction((t) => document.querySelector('[data-testid=desfase-sincronia]')?.textContent?.trim() === t, signo(desfaseEsperado()))
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Por evento visual')
  })

  it('cancelar a medias no cambia nada y el cursor vuelve a enlazar las vistas', async () => {
    await p.getByRole('button', { name: 'Marcar el evento en las dos vistas' }).click()
    await p.getByRole('button', { name: 'Cancelar' }).click()
    assert.equal(await leerDesfase(), signo(desfaseEsperado()))
    await irAFrame(p, 30)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    const t = tA(30) - desfaseEsperado()
    if (t >= 0) assert.equal(await verB(), frameBEn(t), 'enlazadas otra vez')
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })

  it('se guarda con las dos vistas: desfase, método y los instantes del evento', async () => {
    await esperarGuardado(p, videos.verde.verdad.length)
    await p.waitForFunction(
      async (d) => {
        const bd = await new Promise((ok) => {
          const r = indexedDB.open('dualkinema')
          r.onsuccess = () => ok(r.result)
        })
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        bd.close()
        return todas[0]?.vistas?.[1] && Math.abs(todas[0].vistas[1].desfase - d) < 1e-6 && todas[0].vistas[1].sincronia.metodo === 'evento'
      },
      desfaseEsperado(),
      { timeout: 20000, polling: 200 },
    )
    const c = await cabeceraGuardada()
    assert.equal(c.vistas[0].desfase, 0)
    assert.ok(Math.abs(c.vistas[1].sincronia.evento.referencia - tA(KA)) < 1e-6)
    assert.ok(Math.abs(c.vistas[1].sincronia.evento.vista - tB[KB]) < 1e-6)
  })

  it('al recuperar la sesión sigue sincronizada: mismo desfase y B va por tiempo', async () => {
    await p.reload()
    await p.setInputFiles('input[type=file]', videos.verde.ruta)
    await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await p.getByTestId('faltan-videos').waitFor({ timeout: 20000 })
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.numerado25.ruta)
    await p.getByTestId('conmutador-vista').waitFor({ timeout: 20000 })
    await esperarQuieto(p)
    await abrirPestana(p, 'video')
    assert.equal(await leerDesfase(), signo(desfaseEsperado()))
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Por evento visual')
    await irAFrame(p, 80)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    const t = tA(80) - desfaseEsperado()
    if (t >= 0 && t < tB[tB.length - 1] + 1 / 25) assert.equal(await verB(), frameBEn(t))
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })

  it('«Quitar la sincronía» deja el desfase en 0 y sin método', async () => {
    await abrirPestana(p, 'video')
    await p.getByRole('button', { name: 'Quitar la sincronía' }).click()
    await p.waitForFunction(() => document.querySelector('[data-testid=desfase-sincronia]')?.textContent?.trim() === '+0,000 s')
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Sin sincronizar')
    assert.equal(await p.getByRole('button', { name: 'Quitar la sincronía' }).count(), 0)
  })
})

describe('dos vistas: sincronizar por el audio y comprobar con el evento visual', () => {
  // A = «verde» y B = «numerado25», cada uno con un pitido (`verdeAudio`, `numerado25Audio`): en A suena en el instante de su
  // frame 46 y en B 40 ms después del de su frame 13, como un móvil que guarda el sonido 40 ms tarde. El audio debe dar
  // pitido_A − pitido_B (a menos de 1 ms) y el evento visual (frames 46 y 13), 40 ms más: la comparación lo dice y no corrige nada.
  let p
  const KA = 45
  const KB = 12
  const tA = (k) => Math.round(videos.verde.verdad[k].t * 1000) / 1000
  const desfaseAudio = () => videos.verdeAudio.pitido - videos.numerado25Audio.pitido
  const desfaseEvento = () => tA(KA) - videos.numerado25.tiempos[KB]
  const leerDesfase = async () => {
    const texto = (await p.getByTestId('desfase-sincronia').innerText()).trim()
    return (texto.startsWith('−') ? -1 : 1) * Number(texto.slice(1).replace(' s', '').replace(',', '.'))
  }
  /** La vista B guardada, cuando cumpla `cond` (se reintenta durante 20 s: el guardado va con retraso). */
  const vistaGuardada = async (cond) => {
    const leer = () =>
      p.evaluate(async () => {
        const bd = await new Promise((ok) => {
          const r = indexedDB.open('dualkinema')
          r.onsuccess = () => ok(r.result)
        })
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        bd.close()
        return todas[0]?.vistas?.[1] ?? null
      })
    const hasta = Date.now() + 20000
    for (;;) {
      const v = await leer()
      if (v && cond(v)) return v
      if (Date.now() > hasta) throw new Error(`La vista B guardada no cumple la condición: ${JSON.stringify(v?.sincronia)}`)
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  before(async () => {
    ;({ p } = await seguirVideo({ ...videos.verde, ruta: videos.verdeAudio.ruta }, { ancho: 1280 }))
    await abrirPestana(p, 'video')
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.numerado25Audio.ruta)
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    await esperarQuieto(p)
    await abrirPestana(p, 'video')
  })
  after(() => p?.close())

  it('el audio propone el desfase del pitido, con calidad suficiente, y no cambia nada hasta aplicarlo', async () => {
    await p.getByRole('button', { name: 'Sincronizar por el audio' }).click()
    await p.getByTestId('resultado-audio').waitFor({ timeout: 60000 })
    const texto = await p.getByTestId('desfase-audio').innerText()
    const m = texto.match(/([+−])(\d+,\d{3}) s \(calidad (\d+(?:,\d)?)\)/)
    assert.ok(m, texto)
    const propuesto = (m[1] === '−' ? -1 : 1) * Number(m[2].replace(',', '.'))
    assert.ok(Math.abs(propuesto - desfaseAudio()) <= 0.0015, `${propuesto} frente a ${desfaseAudio()}`)
    assert.ok(Number(m[3].replace(',', '.')) >= 2, `calidad ${m[3]}`)
    assert.match(await p.getByTestId('tiempo-audio').innerText(), /^Leído en \d+,\d s$/)
    assert.equal(await leerDesfase(), 0)
    assert.equal(await p.getByTestId('metodo-sincronia').innerText(), 'Sin sincronizar')
  })

  it('al aplicarlo: método, calidad y precisión del audio, y se guarda el desfase a menos de 1 ms del real', async () => {
    await p.getByTestId('resultado-audio').getByRole('button', { name: 'Aplicar' }).click()
    await p.getByTestId('incertidumbre-sincronia').waitFor()
    assert.match(await p.getByTestId('metodo-sincronia').innerText(), /^Por audio \(calidad \d+(,\d)?\)$/)
    assert.equal(await p.getByTestId('incertidumbre-sincronia').innerText(), '± 0,5 ms del audio')
    assert.ok(Math.abs((await leerDesfase()) - desfaseAudio()) <= 0.0015)
    const v = await vistaGuardada((v) => v.sincronia.metodo === 'audio')
    assert.ok(Math.abs(v.desfase - desfaseAudio()) < 0.001, `guardado ${v.desfase}, real ${desfaseAudio()}`)
    assert.equal(v.sincronia.audio.desfase, v.desfase)
    assert.ok(v.sincronia.audio.calidad >= 2)
  })

  it('comprobar con el evento visual muestra los dos desfases y la diferencia (40 ms: discrepan) sin cambiar el desfase', async () => {
    const antes = await leerDesfase()
    await p.getByRole('button', { name: 'Comprobar con un evento visual' }).click()
    await p.getByTestId('marcando-evento').waitFor()
    await irAFrame(p, KA)
    await p.getByTestId('marcar-evento-video').click()
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await irAFrame(p, KB)
    await p.getByRole('button', { name: 'Este es el evento en B' }).click()
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await p.getByRole('button', { name: 'Comprobar', exact: true }).click()
    await p.getByTestId('comprobacion-audio').waitFor()
    assert.equal(await leerDesfase(), antes, 'el desfase sigue siendo el del audio')
    assert.match(await p.getByTestId('metodo-sincronia').innerText(), /^Por audio/)
    const texto = await p.getByTestId('comparacion-audio-evento').innerText()
    const evento = desfaseEvento().toFixed(3).replace('.', ',')
    assert.ok(texto.includes(`evento visual +${evento} s (± 37 ms)`), texto)
    assert.match(texto, /diferencia \+40 ms$/)
    await p.getByTestId('aviso-discrepan').waitFor()
    const v = await vistaGuardada((v) => v.sincronia.metodo === 'audio' && !!v.sincronia.evento)
    assert.ok(Math.abs(v.sincronia.evento.referencia - tA(KA)) < 1e-6)
    assert.ok(Math.abs(v.desfase - desfaseAudio()) < 0.001)
  })

  it('el CSV de B dice que el desfase es del audio, con su calidad, y el evento va aparte como comprobación', async () => {
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'analisis')
    const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByTestId('panel-exportar').getByTestId('descargar-csv').click()])
    const { readFile } = await import('node:fs/promises')
    const { cabecera } = leerCsv(await readFile(await descarga.path(), 'utf8'))
    const sinc = cabecera.find((l) => l.startsWith('# sincronización;'))
    assert.match(sinc, /método: audio; calidad del pico \d+(,\d)?; precisión del audio ±0,5 ms/)
    assert.doesNotMatch(sinc, /evento en/)
    const comprobacion = cabecera.find((l) => l.startsWith('# sincronización: comprobación;'))
    assert.match(comprobacion, /con un evento visual \(no da el desfase\)/)
    assert.match(comprobacion, /diferencia con el audio \+40 ms \(discrepan\)/)
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'video')
  })

  it('«Usar el desfase del evento visual» pasa al de la imagen, a petición, y sigue mostrando la comparación', async () => {
    await p.getByRole('button', { name: 'Usar el desfase del evento visual' }).click()
    await p.waitForFunction(() => document.querySelector('[data-testid=metodo-sincronia]')?.textContent === 'Por evento visual')
    assert.ok(Math.abs((await leerDesfase()) - desfaseEvento()) <= 0.0005)
    assert.match(await p.getByTestId('comparacion-audio-evento').innerText(), /diferencia \+40 ms$/)
    assert.equal(await p.getByRole('button', { name: 'Usar el desfase del evento visual' }).count(), 0)
    const v = await vistaGuardada((v) => v.sincronia.metodo === 'evento')
    assert.ok(Math.abs(v.desfase - desfaseEvento()) < 1e-6)
    assert.ok(Math.abs(v.sincronia.audio.desfase - desfaseAudio()) < 0.001, 'conserva lo que dio el audio')
  })

  it('con un vídeo sin sonido lo dice y propone el evento visual', async () => {
    const q = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(q, videos.verde.ruta)
      await abrirPestana(q, 'video')
      await q.getByTestId('archivo-segunda-vista').setInputFiles(videos.numerado25Audio.ruta)
      await q.getByRole('button', { name: 'La cámara la ve de frente' }).click()
      await q.getByTestId('conmutador-vista').waitFor()
      await esperarQuieto(q)
      await abrirPestana(q, 'video')
      await q.getByRole('button', { name: 'Sincronizar por el audio' }).click()
      const aviso = q.getByTestId('aviso-audio')
      await aviso.waitFor({ timeout: 60000 })
      assert.match(await aviso.innerText(), /El vídeo A no tiene sonido\. Usa el evento visual\./)
      await aviso.getByRole('button', { name: 'Marcar el evento visual' }).click()
      await q.getByTestId('marcando-evento').waitFor()
    } finally {
      await q.close()
    }
  })
})

describe('glosario', () => {
  it('desde la cabecera (también en la portada): abre el listado de entradas y Escape lo cierra devolviendo el foco', async () => {
    const p = await abrirApp(navegador)
    try {
      const boton = p.getByTestId('abrir-glosario')
      await boton.click()
      const dialogo = p.getByRole('dialog', { name: 'Glosario' })
      await dialogo.waitFor()
      assert.ok((await p.locator('[data-testid^=glosario-]').count()) >= 12, 'el listado tiene las entradas')
      // Ninguna está abierta si no se pidió una concreta.
      assert.equal(await dialogo.locator('details[open]').count(), 0)
      await p.getByText('Filtro y frecuencia de corte').click()
      assert.match(await p.getByTestId('glosario-filtro').innerText(), /Butterworth/)
      await p.keyboard.press('Escape')
      await dialogo.waitFor({ state: 'detached' })
      assert.equal(await boton.evaluate((el) => document.activeElement === el), true, 'el foco vuelve al botón')
    } finally {
      await p.close()
    }
  })

  it('un icono de información abre su entrada, la página no se mueve ni el teclado mueve el vídeo mientras está abierto', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      await abrirPestana(p, 'analisis')
      await p.getByTestId('info-filtro').click()
      await p.getByRole('dialog', { name: 'Glosario' }).waitFor()
      assert.equal(await p.getByTestId('glosario-filtro').evaluate((el) => el.open), true, 'la entrada pedida está abierta')
      assert.equal(await p.getByTestId('glosario-cero').evaluate((el) => el.open), false)
      assert.equal(await p.evaluate(() => document.body.style.overflow), 'hidden')
      // Las flechas son del glosario: el vídeo no avanza.
      const antes = (await leerPosicion(p)).frame
      await p.keyboard.press('ArrowRight')
      await p.waitForTimeout(300)
      assert.equal((await leerPosicion(p)).frame, antes)
      await p.getByTestId('cerrar-glosario').click()
      await p.getByRole('dialog', { name: 'Glosario' }).waitFor({ state: 'detached' })
      assert.equal(await p.evaluate(() => document.body.style.overflow), '')
      // Cerrado, las flechas vuelven a mover el vídeo.
      await p.keyboard.press('ArrowRight')
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, antes + 1)
    } finally {
      await p.close()
    }
  })

  it('los valores y avisos tienen su icono, cada uno con su entrada', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      const esperados = { velocidad: 'Velocidad y aceleración', angulo: 'Ángulo: sin cero y relativo', cero: 'Cero de referencia', filtro: 'Filtro y frecuencia de corte', escala: 'Escala y su precisión', calidad: 'Seguido, dudoso, perdido y a mano', huecos: 'Huecos y huecos cortos', fps: 'Tiempo del vídeo y fps variable' }
      for (const [id, titulo] of Object.entries(esperados)) {
        const icono = p.getByTestId(`info-${id}`).first()
        assert.ok((await p.getByTestId(`info-${id}`).count()) > 0, `no hay icono de «${id}»`)
        await icono.evaluate((el) => el.click())
        await p.getByRole('dialog', { name: 'Glosario' }).waitFor()
        assert.equal(await p.getByTestId(`glosario-${id}`).evaluate((el) => el.open), true, `«${id}» abierta`)
        assert.match(await p.getByTestId(`glosario-${id}`).innerText(), new RegExp(titulo))
        await p.keyboard.press('Escape')
        await p.getByRole('dialog', { name: 'Glosario' }).waitFor({ state: 'detached' })
      }
    } finally {
      await p.close()
    }
  })

  it('lo interpolado y los huecos del resumen de la gráfica llevan a su entrada', async () => {
    const { p } = await seguirVideo(videos.corto, { ancho: 1280 })
    try {
      // Con un hueco por rellenar, el resumen dice «sin valor» y lo explica el glosario.
      await p.getByTestId('resumen-grafica').getByTestId('info-huecos').click()
      await p.getByRole('dialog', { name: 'Glosario' }).waitFor()
      assert.equal(await p.getByTestId('glosario-huecos').evaluate((el) => el.open), true)
      await p.keyboard.press('Escape')
      await p.getByRole('button', { name: /Rellenar \d+ hueco/ }).click()
      await p.getByTestId('resumen-grafica').getByTestId('info-interpolado').click()
      await p.getByRole('dialog', { name: 'Glosario' }).waitFor()
      assert.match(await p.getByTestId('glosario-interpolado').innerText(), /a trazos en la gráfica/)
      await p.keyboard.press('Escape')
    } finally {
      await p.close()
    }
  })

  it('con dos vistas, la sincronía tiene sus iconos (tiempo común y precisión)', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      await abrirPestana(p, 'video')
      await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.numerado25.ruta)
      await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
      await p.getByTestId('conmutador-vista').waitFor()
      // Dos iconos llevan a esta entrada (la comparación de las gráficas y la sincronía): se prueba el de la sincronía.
      await p.getByTestId('sincronizar-vistas').getByTestId('info-tiempo-comun').click()
      await p.getByRole('dialog', { name: 'Glosario' }).waitFor()
      assert.match(await p.getByTestId('glosario-tiempo-comun').innerText(), /tiempo común = tiempo del vídeo \+ desfase/)
      await p.keyboard.press('Escape')
    } finally {
      await p.close()
    }
  })
})

describe('dos vistas: el FPPA de la rodilla en la vista de frente', () => {
  // A = «verde» (perfil, la persona mira a la derecha: pierna derecha) y B = «frontal» (la misma pierna de frente, con
  // gomets en el muslo proximal, el centro de la rodilla y el centro del tobillo, y un valgo real de 0 → 20 → 0°).
  let p
  const verdad = () => videos.frontal.verdad
  before(async () => {
    ;({ p } = await seguirVideo(videos.verde, { ancho: 1280 }))
    await abrirPestana(p, 'video')
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.frontal.ruta)
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'marcar')
  })
  after(() => p?.close())

  it('la vista de frente sigue sus tres marcadores (no los de perfil) y mide el FPPA, valgo positivo', async () => {
    const radios = await p.getByRole('radiogroup').innerText()
    assert.match(radios, /Muslo proximal/)
    assert.match(radios, /Centro de la rodilla/)
    assert.match(radios, /Centro del tobillo/)
    assert.doesNotMatch(radios, /Trocánter|Epicóndilo|Maléolo/)
    // De frente se ven las dos piernas: no dice «la que ve la cámara».
    assert.match(await p.getByText(/^pierna derecha/).innerText(), /^pierna derecha$/)
    const grafica = await p.getByTestId('panel-grafica').innerText()
    assert.match(grafica, /RODILLA DERECHA/i)
    assert.match(grafica, /valgo \+/)
  })

  it('marcar y seguir en la vista de frente da el FPPA real en todo el vídeo', async () => {
    await irAFrame(p, 0)
    await marcarTres(p, verdad()[0].ps)
    const aviso = await seguirHastaElFinal(p)
    assert.match(aviso, /completado hasta el final del vídeo, sin huecos/, `aviso: «${aviso}»`)
    for (const i of FRAMES_A_COMPARAR) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].fppa) < TOLERANCIA_GRADOS, `frame ${i + 1}: FPPA medido ${medido}°, real ${verdad()[i].fppa.toFixed(2)}°`)
    }
  })

  it('la vista de perfil sigue con su flexión real, sin los marcadores de frente', async () => {
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    assert.doesNotMatch(await p.getByRole('radiogroup').innerText(), /Muslo proximal|Centro/)
    await irAFrame(p, 60)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
  })

  it('se guarda (cada vista con sus marcadores) y al recuperar la vista de frente sigue dando el FPPA real', async () => {
    await esperarGuardado(p, videos.verde.verdad.length * 2)
    const c = await p.evaluate(async () => {
      const bd = await new Promise((ok) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
      })
      const todas = await new Promise((ok) => {
        const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
        r.onsuccess = () => ok(r.result)
      })
      bd.close()
      return todas[0]
    })
    assert.deepEqual(c.vistas[0].marcadores, ['trocanter_der', 'epicondilo_femoral_der', 'maleolo_der'])
    assert.deepEqual(c.vistas[1].marcadores, ['muslo_proximal_der', 'centro_rodilla_der', 'centro_tobillo_der'])
    assert.deepEqual(c.modelo.articulaciones.map((a) => a.id), ['rodilla_sagital_der', 'rodilla_frontal_der'])
    await p.reload()
    await p.setInputFiles('input[type=file]', videos.frontal.ruta)
    await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await p.getByTestId('faltan-videos').waitFor({ timeout: 20000 })
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Elegir el vídeo que falta' }), videos.verde.ruta)
    await p.getByTestId('conmutador-vista').waitFor({ timeout: 20000 })
    await esperarQuieto(p)
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'marcar')
    for (const i of [20, 60, 100]) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].fppa) < TOLERANCIA_GRADOS, `recuperado, frame ${i + 1}: ${medido}°, real ${verdad()[i].fppa.toFixed(2)}°`)
    }
  })
})

describe('dos vistas: gráficas en el tiempo común y CSV con tiempo común', () => {
  // A = «verde» (perfil, 30 fps con huecos, flexión real) y B = «frontal25» (de frente, 25 fps, FPPA real de 0 → 20 → 0°). Evento: el frame 46 de A
  // (1,533 s) y el 26 de B (1,000 s): el desfase de B es 0,533 s, y como 30 y 25 fps no casan, los instantes de las dos vistas se intercalan.
  let p
  const KA = 45
  const KB = 25
  const tA = (k) => Math.round(videos.verde.verdad[k].t * 1000) / 1000
  const tB = (k) => videos.frontal25.verdad[k].t
  const desfase = () => tA(KA) - tB(KB)
  const frameBEn = (t) => videos.frontal25.verdad.reduce((mejor, x, k) => (x.t <= t + 1e-6 ? k : mejor), -1)
  const numero = (texto) => Number(texto.replace('°', '').replace(',', '.'))
  const cursorX = async (id) => {
    const r = await p.getByTestId(id).evaluate((el) => ({ oculto: el.style.display === 'none', x: Number.parseFloat(/translateX\(([-\d.]+)px/.exec(el.style.transform)?.[1] ?? 'NaN') }))
    return r.oculto ? null : r.x
  }
  const valor = async (letra) => (await p.getByTestId(`comparacion-valor-${letra}`).innerText()).trim()
  /** Columnas del canvas de una gráfica con algún píxel del color dado (±tolerancia por canal). */
  const columnasConColor = (testid, [r, g, b], tol = 40) =>
    p.getByTestId(testid).evaluate(
      (el, [r, g, b, tol]) => {
        const c = el.querySelector('canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        const col = new Array(c.width).fill(0)
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const k = (y * c.width + x) * 4
            if (Math.abs(d[k] - r) < tol && Math.abs(d[k + 1] - g) < tol && Math.abs(d[k + 2] - b) < tol) col[x] = 1
          }
        return col
      },
      [r, g, b, tol],
    )

  before(async () => {
    ;({ p } = await seguirVideo(videos.verde, { ancho: 1280 }))
    await abrirPestana(p, 'video')
    await p.getByTestId('archivo-segunda-vista').setInputFiles(videos.frontal25.ruta)
    await p.getByRole('button', { name: 'La cámara la ve de frente' }).click()
    await p.getByTestId('conmutador-vista').waitFor()
    // B: marcar y seguir.
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'marcar')
    await marcarTres(p, videos.frontal25.verdad[0].ps)
    assert.match(await seguirHastaElFinal(p), /completado hasta el final del vídeo, sin huecos/)
    // Sincronizar por el evento.
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
    await abrirPestana(p, 'video')
    await p.getByRole('button', { name: 'Marcar el evento en las dos vistas' }).click()
    await irAFrame(p, KA)
    await p.getByTestId('marcar-evento-video').click()
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    await irAFrame(p, KB)
    await p.getByTestId('marcar-evento-video').click()
    await p.getByRole('button', { name: 'Aplicar' }).click()
    await p.getByTestId('incertidumbre-sincronia').waitFor()
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })
  after(() => p?.close())

  it('con dos vistas sale la comparación (alineadas por defecto) y con una sola vista no', async () => {
    await p.getByTestId('comparacion').waitFor()
    assert.equal(await p.getByTestId('comparacion-alineadas').getAttribute('aria-pressed'), 'true')
    assert.equal(await p.getByTestId('comparacion-grafica-A').count(), 1)
    assert.equal(await p.getByTestId('comparacion-grafica-B').count(), 1)
    const { p: solo } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      assert.equal(await solo.getByTestId('comparacion').count(), 0)
    } finally {
      await solo.close()
    }
  })

  it('cambiar de frame no redibuja las gráficas de la comparación (el cursor va en su capa), alineadas ni superpuestas', async () => {
    const redibujos = (ids) => Promise.all(ids.map((id) => p.getByTestId(id).getAttribute('data-redibujos')))
    const mover = async () => {
      for (const k of [30, 60, 90]) await irAFrame(p, k)
    }
    const alineadas = ['comparacion-grafica-A', 'comparacion-grafica-B']
    const antes = await redibujos(alineadas)
    await mover()
    // Antes, en «Alineadas», las series se creaban en cada render y la gráfica entera se redibujaba con cada frame.
    assert.deepEqual(await redibujos(alineadas), antes, 'alineadas')
    await p.getByTestId('comparacion-superpuestas').click()
    await p.getByTestId('comparacion-grafica').waitFor()
    // Recién creada se dibuja al tomar su tamaño: se espera a que se quede quieta antes de contar.
    let antesSuper = await redibujos(['comparacion-grafica'])
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(100)
      const ahora = await redibujos(['comparacion-grafica'])
      if (ahora[0] === antesSuper[0]) break
      antesSuper = ahora
    }
    await mover()
    assert.deepEqual(await redibujos(['comparacion-grafica']), antesSuper, 'superpuestas')
    await p.getByTestId('comparacion-alineadas').click()
    await p.getByTestId('comparacion-grafica-A').waitFor()
  })

  it('los valores de cada vista en el cursor son los reales de su vídeo en ese instante común', async () => {
    for (const k of [45, 70, 100]) {
      await irAFrame(p, k)
      const esperadoA = videos.verde.verdad[k].flexion
      assert.ok(Math.abs(numero(await valor('A')) - esperadoA) < TOLERANCIA_GRADOS, `A, frame ${k + 1}: ${await valor('A')} frente a ${esperadoA.toFixed(2)}°`)
      const j = frameBEn(tA(k) - desfase())
      const esperadoB = videos.frontal25.verdad[j].fppa
      assert.ok(Math.abs(numero(await valor('B')) - esperadoB) < TOLERANCIA_GRADOS, `B (frame ${j + 1}) con A en ${k + 1}: ${await valor('B')} frente a ${esperadoB.toFixed(2)}°`)
    }
  })

  it('alineadas: en el mismo instante común los cursores de las dos gráficas caen en la misma X (B va desplazada por su desfase)', async () => {
    for (const k of [45, 60, 100]) {
      await irAFrame(p, k)
      const xa = await cursorX('comparacion-grafica-A-cursor')
      const xb = await cursorX('comparacion-grafica-B-cursor')
      assert.ok(xa !== null && xb !== null, `con A en el frame ${k + 1} los dos cursores se ven`)
      // B enseña el frame visible en ese instante, que empieza hasta 40 ms antes (un frame suyo): como mucho ese desfase en px. Sin el desfase
      // de la sincronía el cursor de B caería 0,53 s a la izquierda (13 veces más).
      const ancho = (await p.getByTestId('comparacion-grafica-A-area').boundingBox()).width
      const rango = tB(videos.frontal25.verdad.length - 1) + 1 / 25 + desfase()
      const unFrameB = (0.04 / rango) * ancho
      assert.ok(Math.abs(xa - xb) <= unFrameB + 0.6, `A en ${xa.toFixed(1)} px y B en ${xb.toFixed(1)} px (un frame de B son ${unFrameB.toFixed(1)} px)`)
      assert.ok(xb <= xa + 0.6, 'el frame de B visible en ese instante no es posterior al instante')
    }
  })

  it('antes de que empiece el vídeo de B (en tiempo común) no hay cursor ni valor en su gráfica', async () => {
    await irAFrame(p, 5)
    assert.ok(tA(5) < desfase(), 'el frame 6 de A es anterior al inicio de B')
    assert.equal(await cursorX('comparacion-grafica-B-cursor'), null)
    assert.equal(await valor('B'), '—')
    assert.ok((await cursorX('comparacion-grafica-A-cursor')) !== null)
  })

  it('tocar la gráfica de B lleva el cursor al instante común tocado (la vista activa va a ese instante)', async () => {
    const caja = await p.getByTestId('comparacion-grafica-B-area').boundingBox()
    // El eje abarca la sesión: de 0 a lo que acaba B en tiempo común (3,96 s + 0,533 s + el último frame).
    const hasta = tB(videos.frontal25.verdad.length - 1) + 1 / 25 + desfase()
    await p.mouse.click(caja.x + caja.width * 0.5, caja.y + caja.height / 2)
    await p.waitForTimeout(400)
    await esperarQuieto(p)
    const t = hasta * 0.5
    const { t: tVista } = await leerPosicion(p)
    assert.ok(tVista <= t + 1e-3 && t - tVista < 1 / 30 + 0.01, `se tocó el instante ${t.toFixed(3)} s y A está en ${tVista} s`)
  })

  it('superpuestas: un solo cursor en el instante común, la curva de A sigue continua entre los instantes de B y se ven las dos', async () => {
    await irAFrame(p, 60)
    const xAlineada = await cursorX('comparacion-grafica-A-cursor')
    await p.getByTestId('comparacion-superpuestas').click()
    await p.getByTestId('comparacion-grafica').waitFor()
    assert.equal(await p.getByTestId('comparacion-grafica-A').count(), 0)
    // El mismo instante, la misma X que en las alineadas (mismo eje).
    assert.ok(Math.abs((await cursorX('comparacion-grafica-cursor')) - xAlineada) < 1.5)
    // Las dos curvas se dibujan: el ámbar de A y el claro de B.
    const AMBAR = [242, 166, 90]
    const CLARO = [232, 236, 241]
    const sinB = async () => {
      // Se oculta B en la leyenda para medir solo la línea de A, ya unida con los instantes de B (join).
      await p.getByTestId('comparacion-vista-B').click()
      await p.waitForTimeout(300)
    }
    const conB = await columnasConColor('comparacion-grafica', CLARO)
    assert.ok(conB.some(Boolean), 'se ve la curva de B')
    await sinB()
    const colsA = await columnasConColor('comparacion-grafica', AMBAR)
    const primera = colsA.indexOf(1)
    const ultima = colsA.lastIndexOf(1)
    assert.ok(primera >= 0 && ultima > primera, 'se ve la curva de A')
    const huecos = colsA.slice(primera, ultima + 1).filter((c) => c === 0).length
    // Unida con los instantes de B (undefined), la línea de A no se corta: ninguna columna sin línea entre su primer y su último punto.
    assert.ok(huecos <= 1, `la curva de A tiene ${huecos} columnas sin línea entre ${primera} y ${ultima}`)
    await p.getByTestId('comparacion-vista-B').click()
    await p.getByTestId('comparacion-alineadas').click()
  })

  it('el modo elegido se recuerda al recargar', async () => {
    await p.getByTestId('comparacion-superpuestas').click()
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.comparacion')), 'superpuestas')
    await p.getByTestId('comparacion-alineadas').click()
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.comparacion')), 'alineadas')
  })

  it('CSV: la referencia lleva t_comun_s = t_s y su cabecera lo dice; B lleva t_s + desfase, el método y la precisión', async () => {
    const descargar = async () => {
      await abrirPestana(p, 'analisis')
      const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByTestId('panel-exportar').getByTestId('descargar-csv').click()])
      const { readFile } = await import('node:fs/promises')
      return leerCsv(await readFile(await descarga.path(), 'utf8'))
    }
    // A (referencia).
    const a = await descargar()
    assert.deepEqual(a.columnas.slice(0, 3), ['t_s', 't_comun_s', 'frame'])
    assert.ok(a.cabecera.some((l) => l.startsWith('# sincronización;vista de referencia')))
    for (const f of [a.filas[0], a.filas[60], a.filas.at(-1)]) assert.equal(f[0], f[1], 'en la referencia, tiempo común = tiempo del vídeo')
    assert.equal(a.filas.length, videos.verde.verdad.length)
    // B.
    await p.getByTestId('vista-B').click()
    await esperarQuieto(p)
    const b = await descargar()
    assert.deepEqual(b.columnas.slice(0, 3), ['t_s', 't_comun_s', 'frame'])
    const sinc = b.cabecera.find((l) => l.startsWith('# sincronización;'))
    assert.match(sinc, /desfase 0,533 s/)
    assert.match(sinc, /método: evento visual/)
    assert.match(sinc, /±37 ms/)
    assert.equal(b.filas.length, videos.frontal25.verdad.length)
    for (const f of [b.filas[0], b.filas[50], b.filas.at(-1)]) {
      const dif = Number(f[1].replace(',', '.')) - Number(f[0].replace(',', '.'))
      assert.ok(Math.abs(dif - desfase()) < 1e-3, `t_comun − t = ${dif}, desfase ${desfase()}`)
    }
    // Los valores de la tabla siguen siendo los de siempre: el FPPA real en el frame 51 (columna del ángulo).
    const iAng = b.columnas.findIndex((c) => c.endsWith('_filtrado_grados'))
    assert.ok(Math.abs(Number(b.filas[50][iAng].replace(',', '.')) - videos.frontal25.verdad[50].fppa) < TOLERANCIA_GRADOS)
    await p.getByTestId('vista-A').click()
    await esperarQuieto(p)
  })
})

describe('laboratorio de grabación (fase 4, paso 1)', () => {
  let nav
  before(async () => {
    nav = await lanzarNavegadorConCamaraFalsa()
  })
  after(() => nav?.close())

  /** Lo que dice el informe de una clave («frames: 90» → 90). */
  const numeroDe = (informe, clave) => {
    const m = new RegExp(`^\\s*${clave}: (-?[\\d.]+)$`, 'm').exec(informe)
    assert.ok(m, `el informe no tiene «${clave}»:\n${informe}`)
    return Number(m[1])
  }

  it('sin ?laboratorio no aparece', async () => {
    const p = await abrirApp(nav)
    try {
      assert.equal(await p.getByTestId('laboratorio').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('mide el móvil: entorno, códecs, micrófono y la cámara en cada modo, con los fps que entrega', async () => {
    const p = await abrirApp(nav, { consulta: '?laboratorio' })
    try {
      await p.getByTestId('lab-medir').click()
      await p.getByTestId('lab-informe').waitFor({ timeout: 10000 })
      // El último apartado es el de las cámaras: cuando está, están todos.
      await p.waitForFunction(() => document.querySelector('[data-testid=lab-informe]')?.value.includes('## Cámaras'), null, { timeout: 120000 })
      const informe = await p.getByTestId('lab-informe').inputValue()
      for (const titulo of ['## Entorno', '## Almacenamiento y pantalla', '## Códecs que codifica', '## Micrófono sin procesar', '## Cámaras']) {
        assert.ok(informe.includes(titulo), `falta ${titulo}`)
      }
      assert.match(informe, /VideoEncoder: sí/)
      assert.match(informe, /MediaStreamTrackProcessor: sí/)
      assert.match(informe, /echoCancellation: no/, 'el micrófono se abre sin cancelación de eco')
      assert.match(informe, /autoGainControl: no/)
      // La cámara falsa da 20 fps aunque se le pidan 30: el laboratorio mide lo que entrega (no se fía de lo pedido), dice
      // que no es lo pedido, y lo medido coincide con lo concedido.
      const modo = informe.slice(informe.indexOf('pedido: 1280×720 a 30'))
      const concedido = Number(/concedido: \d+×\d+ a ([\d.]+)/.exec(modo)?.[1])
      assert.ok(Math.abs(numeroDe(modo, 'fpsMediano') - concedido) < 0.1 * concedido, `medido ${numeroDe(modo, 'fpsMediano')}, concedido ${concedido}`)
      assert.match(modo, /esLoPedido: no/)
      assert.equal(await p.getByTestId('lab-error').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('graba una prueba, la analiza y se abre en el visor con los frames que el informe cuenta', async () => {
    const p = await abrirApp(nav, { consulta: '?laboratorio&duracion=3' })
    try {
      await p.getByTestId('lab-modo').selectOption('720p30')
      // La cámara falsa no tiene control de exposición: la opción no debe romper la grabación y el informe lo dice.
      await p.getByTestId('lab-exposicion').selectOption('corta')
      await p.getByTestId('lab-grabar').click()
      // La vista previa se ve mientras graba.
      await p.getByTestId('lab-vista').waitFor({ state: 'visible', timeout: 10000 })
      await p.getByTestId('lab-resultado').waitFor({ timeout: 60000 })
      assert.equal(await p.getByTestId('lab-error').count(), 0)
      const informe = await p.getByTestId('lab-informe').inputValue()
      const grabado = informe.slice(informe.indexOf('vídeoGrabado:'))
      const frames = numeroDe(grabado, 'frames')
      assert.ok(frames >= 50 && frames <= 100, `frames de 3 s (la cámara falsa da 20 fps): ${frames}`)
      assert.match(informe, /exposicion:\n\s+modo: corta/)
      assert.ok(numeroDe(grabado, 'duracionS') > 2.5 && numeroDe(grabado, 'duracionS') < 4)
      assert.ok(numeroDe(grabado, 'fotogramasClave') >= 2, 'un fotograma clave por segundo')
      assert.match(informe, /audioGrabado:\n\s+codec: /, 'el archivo lleva audio')
      assert.ok(Number.isFinite(numeroDe(informe, 'inicioAudioMenosVideoMs')))

      // Lo que dice el informe es lo que abre el visor: el mismo número de frames.
      await p.getByTestId('lab-abrir').click()
      await p.getByRole('button', { name: 'Mira a la derecha' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).total, frames)
    } finally {
      await p.close()
    }
  })
})

describe('grabar con este móvil (fase 4, paso 2)', () => {
  let nav
  let p
  let frames
  before(async () => {
    nav = await lanzarNavegadorConCamaraFalsa()
    p = await abrirApp(nav)
  })
  after(async () => {
    await p?.close()
    await nav?.close()
  })

  /** Abre «Grabar con este móvil» y espera a la cámara. Devuelve los fps que concede. */
  async function entrarAGrabar() {
    await p.getByTestId('ir-grabar').click()
    await p.waitForFunction(() => document.querySelector('[data-testid=grabar-camara]')?.textContent.includes(' fps · '), null, { timeout: 20000 })
    return Number(/a (\d+) fps/.exec(await p.getByTestId('grabar-camara').innerText())[1])
  }

  it('pitido de claqueta en la portada (paso 6): cuenta atrás de 3 s y la secuencia programada a los 3 s del toque', async () => {
    await p.evaluate(() => {
      window.__pitidos = []
      const original = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (cuando = 0, ...resto) {
        const c = this.context
        window.__pitidos.push({ ahora: performance.now(), cuando, actual: c.currentTime, latencia: (c.baseLatency || 0) + (c.outputLatency || 0) })
        return original.call(this, cuando, ...resto)
      }
    })
    const toque = await p.evaluate(() => performance.now())
    await p.getByTestId('claqueta').click()
    await p.waitForFunction(() => document.querySelector('[data-testid=claqueta]')?.dataset.estado === '2', null, { timeout: 5000 })
    await p.waitForFunction(() => document.querySelector('[data-testid=claqueta]')?.dataset.estado === 'hecho', null, { timeout: 6000 })
    const [x] = await p.evaluate(() => window.__pitidos)
    const suena = x.ahora + (x.cuando - x.actual + x.latencia) * 1000
    assert.ok(Math.abs(suena - toque - 3000) < 150, `suena a ${(suena - toque).toFixed(0)} ms del toque`)
  })

  it('graba, para y revisa lo grabado: frames y fps de verdad, datos de la app dentro y aviso si faltan fps', async () => {
    const concedidos = await entrarAGrabar()
    await p.getByTestId('grabar-empezar').click()
    await p.getByTestId('grabar-parar').waitFor({ timeout: 20000 })
    await p.waitForTimeout(3000)
    await p.getByTestId('grabar-parar').click()
    await p.getByTestId('grabar-resultado').waitFor({ timeout: 30000 })
    assert.equal(await p.getByTestId('grabar-error').count(), 0)
    assert.equal(await p.getByTestId('grabar-resultado').getAttribute('data-metadatos'), 'sí', 'el MP4 lleva los datos de dualkinema y se leen')
    frames = Number(await p.getByTestId('grabar-frames').innerText())
    const fps = Number((await p.getByTestId('grabar-fps').innerText()).replace(',', '.'))
    // Los fps contados en el archivo son los que da la cámara (la falsa: 20), no los pedidos (30).
    assert.ok(Math.abs(fps - concedidos) < 0.1 * concedidos, `fps en el archivo ${fps}, concedidos ${concedidos}`)
    assert.ok(frames >= 2.5 * concedidos, `${frames} frames en unos 3 s a ${concedidos} fps`)
    // 20 de 30 pedidos (< 90 %): se avisa en el momento.
    assert.ok(concedidos < 27, 'la cámara falsa da menos de 30 fps')
    assert.ok(await p.getByTestId('grabar-aviso-fps').isVisible())
    assert.match(await p.getByTestId('grabar-revision').innerText(), /con sonido/)
    assert.equal(await p.getByTestId('grabacion').count(), 1)
  })

  it('«Abrir en el visor» abre la grabación con los mismos frames que contó la revisión', async () => {
    await p.getByTestId('grabar-abrir').click()
    await p.getByRole('button', { name: 'Mira a la derecha' }).click({ timeout: 20000 })
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).total, frames)
  })

  it('sigue en la lista al recargar; «Guardar» descarga el archivo entero y «Borrar» pide confirmación', async () => {
    await p.reload()
    await entrarAGrabar()
    const item = p.getByTestId('grabacion')
    await item.first().waitFor({ timeout: 10000 })
    assert.equal(await item.count(), 1)
    const bytes = Number(await item.getAttribute('data-bytes'))
    const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByTestId('grabacion-guardar').click()])
    assert.match(descarga.suggestedFilename(), /^dualkinema-\d{4}-\d{2}-\d{2}-\d{6}\.mp4$/)
    assert.equal((await stat(await descarga.path())).size, bytes)
    await p.getByTestId('grabacion-borrar').click()
    // El primer toque solo pregunta.
    assert.equal(await item.count(), 1)
    await p.getByTestId('grabacion-confirmar-borrar').click()
    await p.getByTestId('grabaciones-vacia').waitFor()
    assert.equal(await item.count(), 0)
  })

  it('si Android apaga la cámara (la app pasó a segundo plano), se vuelve a abrir y se puede grabar', async () => {
    // Lo que hace Android: las pistas terminan solas (se paran y avisan con «ended»).
    const anterior = await p.evaluate(() => {
      const flujo = document.querySelector('[data-testid=grabar-vista]').srcObject
      for (const t of flujo.getTracks()) {
        t.stop()
        t.dispatchEvent(new Event('ended'))
      }
      return flujo.id
    })
    await p.waitForFunction(
      (id) => {
        const f = document.querySelector('[data-testid=grabar-vista]')?.srcObject
        return f && f.id !== id && f.getTracks().every((t) => t.readyState === 'live')
      },
      anterior,
      { timeout: 20000 },
    )
    await p.getByTestId('grabar-empezar').click()
    await p.getByTestId('grabar-parar').waitFor({ timeout: 20000 })
    await p.waitForTimeout(1500)
    await p.getByTestId('grabar-parar').click()
    await p.getByTestId('grabar-resultado').waitFor({ timeout: 30000 })
    assert.equal(await p.getByTestId('grabar-error').count(), 0)
    assert.ok(Number(await p.getByTestId('grabar-frames').innerText()) > 15)
  })
})

describe('grabar con dos móviles: emparejar (fase 4, paso 4b)', () => {
  // El reloj de la app de B lleva 1,5 s más (`?reloj=`, solo en localhost). El de cada página es su `performance.now()`,
  // que cuenta desde que se abrió la página (`performance.timeOrigin`, en el reloj del sistema, común a los dos
  // navegadores): el desfase real de B respecto a A es 1500 + (inicio de A − inicio de B).
  const DESFASE_B = 1500
  let navA
  let navB
  let pararRele
  let a
  let b
  // Los dos MP4 de la grabación de 10 s (descargados con «Guardar»), la verdad de su desfase y la cota del reloj (paso 7).
  const pareja = {}
  let codigo

  before(async () => {
    pararRele = await servirRele()
    navA = await lanzarNavegadorConCamaraFalsa()
    navB = await lanzarNavegadorConCamaraFalsa()
  })
  after(async () => {
    await navA?.close()
    await navB?.close()
    pararRele?.()
  })

  const conexion = (p, valor) =>
    p.waitForFunction((v) => document.querySelector('[data-testid=conexion]')?.dataset.conexion === v, valor, { timeout: 20000 })

  /** reloj de B − reloj de A, de verdad (ms). */
  const desfaseReal = async () =>
    DESFASE_B + (await a.evaluate(() => performance.timeOrigin)) - (await b.evaluate(() => performance.timeOrigin))

  /** Espera a tener reloj común y devuelve su desfase y su cota (ms). */
  async function relojDe(p) {
    await p.waitForFunction(() => document.querySelector('[data-testid=reloj-comun]')?.dataset.desfase, null, { timeout: 20000 })
    const el = p.getByTestId('reloj-comun')
    return { desfase: Number(await el.getAttribute('data-desfase')), cota: Number(await el.getAttribute('data-cota')) }
  }

  it('A crea la sala: código, QR con la dirección de la sala y esperando al otro', async () => {
    a = await abrirApp(navA, { consulta: `?senal=${URL_RELE}` })
    await a.getByTestId('ir-emparejar').click()
    await a.getByTestId('crear-sala').click()
    await conexion(a, 'esperando')
    codigo = (await a.getByTestId('codigo-sala').innerText()).replace('-', '')
    assert.match(codigo, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
    assert.equal(await a.getByTestId('qr-sala').getAttribute('data-url'), `${URL_APP}?sala=${codigo}`)
    // El QR tiene módulos dibujados y la dirección guarda la sala (al recargar se vuelve a ella) sin perder lo demás.
    assert.ok((await a.locator('[data-testid=qr-sala] path').getAttribute('d')).length > 200)
    assert.ok(a.url().includes(`sala=${codigo}`) && a.url().includes('senal='))
  })

  it('B se une por la dirección del QR: los dos conectados y cada uno con el desfase del otro dentro de su cota', async () => {
    b = await abrirApp(navB, { consulta: `?sala=${codigo}&senal=${URL_RELE}&reloj=${DESFASE_B}` })
    await conexion(b, 'emparejado')
    await conexion(a, 'emparejado')
    const ra = await relojDe(a)
    const rb = await relojDe(b)
    const real = await desfaseReal()
    // A mide el reloj de B y B el de A (con el signo contrario); en la misma máquina la red es casi inmediata.
    assert.ok(Math.abs(ra.desfase - real) <= ra.cota + 0.5, `A: ${ra.desfase} ± ${ra.cota}, real ${real}`)
    assert.ok(Math.abs(rb.desfase + real) <= rb.cota + 0.5, `B: ${rb.desfase} ± ${rb.cota}, real ${-real}`)
    assert.ok(ra.cota < 50 && rb.cota < 50, `cotas ${ra.cota} y ${rb.cota}`)
    assert.match(await a.getByTestId('reloj-comun').innerText(), /Reloj común ± [\d.,]+ ms/)
  })

  it('cada uno ve la vista y la cámara del otro, y se avisa si los dos están en el mismo plano', async () => {
    await a.getByTestId('vista-perfil-derecha').click()
    await b.getByTestId('vista-frente').click()
    await a.getByTestId('otro-vista').filter({ hasText: 'de frente' }).waitFor()
    await b.getByTestId('otro-vista').filter({ hasText: 'de perfil, mira a la derecha' }).waitFor()
    assert.equal(await a.getByTestId('aviso-vistas').count(), 0)
    await a.getByTestId('otro-estado').filter({ hasText: /Cámara \d+×\d+ a \d+ fps/ }).waitFor({ timeout: 10000 })
    await b.getByTestId('vista-perfil-izquierda').click()
    await a.getByTestId('aviso-vistas').waitFor()
    await b.getByTestId('aviso-vistas').waitFor()
    await b.getByTestId('vista-frente').click()
    await a.getByTestId('aviso-vistas').waitFor({ state: 'detached' })
  })

  it('un tercer móvil no entra: «la sala está llena»', async () => {
    const c = await abrirApp(navB, { consulta: `?sala=${codigo}&senal=${URL_RELE}` })
    try {
      await conexion(c, 'llena')
      assert.match(await c.getByTestId('conexion').innerText(), /llena/)
    } finally {
      await c.close()
    }
    // Los otros dos siguen emparejados.
    assert.equal(await a.getByTestId('conexion').getAttribute('data-conexion'), 'emparejado')
  })

  it('al salir B, A vuelve a esperar; B vuelve a entrar escribiendo el código, y el reloj empieza de cero', async () => {
    await b.getByTestId('salir-sala').click()
    await b.getByTestId('ir-emparejar').waitFor()
    await conexion(a, 'esperando')
    assert.equal(await a.getByTestId('otro-movil').count(), 0)
    await b.getByTestId('ir-emparejar').click()
    await b.getByTestId('codigo-escrito').fill(`${codigo.slice(0, 3).toLowerCase()}-${codigo.slice(3)}`)
    await b.getByTestId('unirse-sala').click()
    await conexion(b, 'emparejado')
    await conexion(a, 'emparejado')
    // B no ha recargado (mismo origen de reloj): el desfase real es el mismo de antes, medido de cero.
    const ra = await relojDe(a)
    const real = await desfaseReal()
    assert.ok(Math.abs(ra.desfase - real) <= ra.cota + 0.5, `A: ${ra.desfase} ± ${ra.cota}, real ${real}`)
  })

  it('un código mal escrito no se acepta', async () => {
    const p = await abrirApp(navA, { consulta: `?senal=${URL_RELE}` })
    try {
      await p.getByTestId('ir-emparejar').click()
      await p.getByTestId('codigo-escrito').fill('ABC1EF')
      await p.getByTestId('unirse-sala').click()
      assert.match(await p.getByTestId('error-codigo').innerText(), /no es válido/)
      assert.equal(await p.getByTestId('codigo-sala').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('grabar con dos móviles: grabación doble (fase 4, pasos 5 y 6)', () => {
  // Como en el emparejamiento: el reloj de la app de B lleva 1500 ms más, y la hora de verdad de un instante del reloj
  // de una página es su `performance.timeOrigin` + el instante (− 1500 en B).
  const DESFASE_B = 1500
  let navA
  let navB
  let pararRele
  let a
  let b

  before(async () => {
    pararRele = await servirRele()
    navA = await lanzarNavegadorConCamaraFalsa()
    navB = await lanzarNavegadorConCamaraFalsa()
    a = await abrirApp(navA, { consulta: `?senal=${URL_RELE}` })
    await a.getByTestId('ir-emparejar').click()
    await a.getByTestId('crear-sala').click()
    const codigo = (await a.getByTestId('codigo-sala').innerText()).replace('-', '')
    b = await abrirApp(navB, { consulta: `?sala=${codigo}&senal=${URL_RELE}&reloj=${DESFASE_B}` })
    for (const p of [a, b]) {
      await p.waitForFunction(() => document.querySelector('[data-testid=conexion]')?.dataset.conexion === 'emparejado', null, { timeout: 20000 })
    }
    await a.getByTestId('vista-perfil-derecha').click()
    await b.getByTestId('vista-frente').click()
    for (const p of [a, b]) {
      await p.waitForFunction(() => document.querySelector('[data-testid=reloj-comun]')?.dataset.desfase, null, { timeout: 20000 })
      await p.waitForFunction(() => !document.querySelector('[data-testid=grabar-los-dos]')?.disabled, null, { timeout: 20000 })
    }
  })
  after(async () => {
    await navA?.close()
    await navB?.close()
    pararRele?.()
  })

  const fase = (p, f, timeout = 20000) =>
    p.waitForFunction((v) => document.querySelector('[data-testid=grabar-doble]')?.dataset.fase === v, f, { timeout })
  /** Hora de verdad (ms del reloj del sistema) de un instante del reloj de la app de una página. */
  const horaReal = async (p, instante, desplazado) => (await p.evaluate(() => performance.timeOrigin)) + instante - (desplazado ? DESFASE_B : 0)
  const resultado = async (p) => {
    const r = p.getByTestId('resultado-doble')
    return {
      id: await r.getAttribute('data-doble-id'),
      inicio: Number(await r.getAttribute('data-inicio')),
      arranque: Number(await r.getAttribute('data-arranque')),
      frames: Number(await r.getAttribute('data-frames')),
    }
  }

  it('B programa (5 s, hasta parar) y A para: los dos graban a la vez la misma grabación doble', async () => {
    await b.getByTestId('cuenta-atras-s').selectOption('5')
    await b.getByTestId('duracion-s').selectOption('parar')
    await b.getByTestId('grabar-los-dos').click()
    await fase(a, 'programada')
    await fase(b, 'programada')
    assert.match(await a.getByTestId('cuenta-atras').innerText(), /^[1-5]$/)
    // Mientras tanto no se puede cambiar de vista ni salir.
    assert.ok(await a.getByTestId('vista-frente').isDisabled())
    assert.ok(await a.getByTestId('salir-sala').isDisabled())
    await fase(a, 'grabando', 10000)
    await fase(b, 'grabando', 10000)
    await a.waitForTimeout(2500)
    await a.getByTestId('parar-doble').click()
    await fase(a, 'hecha', 30000)
    await fase(b, 'hecha', 30000)
    const ra = await resultado(a)
    const rb = await resultado(b)
    assert.ok(ra.id && ra.id === rb.id, `mismo id de grabación doble en los dos MP4: ${ra.id} / ${rb.id}`)
    assert.ok(ra.frames > 30 && rb.frames > 30, `frames ${ra.frames} y ${rb.frames}`)
    // El inicio programado (escrito en cada MP4 en su reloj) es el mismo instante de verdad en los dos móviles: A lo
    // pasó a su reloj con su estimación del desfase, así que el error cabe en su cota.
    const cota = Number(await a.getByTestId('reloj-comun').getAttribute('data-cota'))
    const ia = await horaReal(a, ra.inicio, false)
    const ib = await horaReal(b, rb.inicio, true)
    assert.ok(Math.abs(ia - ib) <= cota + 0.5, `inicios a ${(ia - ib).toFixed(2)} ms (cota ${cota})`)
    // Y los dos arrancaron de verdad cerca de ese instante (temporizador y arranque del codificador).
    assert.ok(Math.abs((await horaReal(a, ra.arranque, false)) - ia) < 250, 'A arrancó a tiempo')
    assert.ok(Math.abs((await horaReal(b, rb.arranque, true)) - ib) < 250, 'B arrancó a tiempo')
    // Cada móvil tiene su vídeo en su lista, con la vista en el nombre.
    assert.match(await a.getByTestId('resultado-doble').innerText(), /-perfil\.mp4/)
    assert.match(await b.getByTestId('resultado-doble').innerText(), /-frente\.mp4/)
  })

  it('con la duración fijada (10 s), los dos paran solos; cada uno pita a su hora (paso 6)', async () => {
    await a.getByTestId('grabar-otra-vez').click()
    await b.getByTestId('grabar-otra-vez').click()
    // Se anota cada sonido programado con Web Audio (la secuencia de pitidos es el único AudioBufferSourceNode: la
    // cuenta atrás usa osciladores), para comprobar cuándo sonará en el reloj de la página.
    for (const p of [a, b]) {
      await p.evaluate(() => {
        window.__pitidos = []
        const original = AudioBufferSourceNode.prototype.start
        AudioBufferSourceNode.prototype.start = function (cuando = 0, ...resto) {
          const c = this.context
          window.__pitidos.push({ ahora: performance.now(), cuando, actual: c.currentTime, latencia: (c.baseLatency || 0) + (c.outputLatency || 0) })
          return original.call(this, cuando, ...resto)
        }
      })
    }
    await a.getByTestId('cuenta-atras-s').selectOption('5')
    await a.getByTestId('duracion-s').selectOption('10')
    await a.getByTestId('grabar-los-dos').click()
    await fase(a, 'grabando', 15000)
    await fase(b, 'grabando', 15000)
    await fase(a, 'hecha', 30000)
    await fase(b, 'hecha', 30000)
    for (const [p, desplazado, propio, otro] of [
      [a, false, 1, 2.5],
      [b, true, 2.5, 1],
    ]) {
      const r = await resultado(p)
      // La cámara falsa da 20 fps: 10 s son unos 200 frames.
      assert.ok(r.frames > 170 && r.frames < 230, `frames ${r.frames}`)
      // El de perfil pita al segundo y el otro a los 2,5 s, y cada MP4 lo lleva escrito.
      assert.deepEqual(JSON.parse(await p.getByTestId('resultado-doble').getAttribute('data-plan-pitidos')), { propio, otro })
      const pitidos = await p.evaluate(() => window.__pitidos)
      assert.equal(pitidos.length, 1, 'una secuencia por móvil')
      assert.equal(await p.getByTestId('pitidos-doble').getAttribute('data-pito'), 'true')
      // Cuándo sonará, en el reloj de la app de la página: el instante pedido (inicio + su turno), con la latencia de
      // salida ya descontada al programarlo.
      const x = pitidos[0]
      const suena = x.ahora + (x.cuando - x.actual + x.latencia) * 1000 + (desplazado ? DESFASE_B : 0)
      assert.ok(Math.abs(suena - (r.inicio + propio * 1000)) < 50, `suena a ${(suena - r.inicio).toFixed(1)} ms del inicio (debía a ${propio * 1000})`)
      // El micrófono falso no oye los altavoces: se dice que no se oyen bien y qué hacer.
      await p.getByTestId('aviso-pitidos').waitFor()
    }
    // Para abrir la pareja (paso 7): los dos archivos y la verdad del desfase. Cada vídeo empieza (su tiempo 0) cuando
    // arrancó su grabadora: desfase = t_A − t_B de un mismo instante = arranque de B − arranque de A (hora de verdad).
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    for (const [p, vista] of [
      [a, 'perfil'],
      [b, 'frente'],
    ]) {
      const [d] = await Promise.all([p.waitForEvent('download'), p.getByTestId('guardar-doble').click()])
      pareja[vista] = join(tmpdir(), `dualkinema-e2e-doble-${vista}.mp4`)
      await d.saveAs(pareja[vista])
    }
    const ra = await resultado(a)
    const rb = await resultado(b)
    pareja.verdad = ((await horaReal(b, rb.arranque, true)) - (await horaReal(a, ra.arranque, false))) / 1000
    pareja.cota = Number(await a.getByTestId('reloj-comun').getAttribute('data-cota')) / 1000
  })

  it('«Cancelar» en la cuenta atrás de uno cancela los dos y no graba nada', async () => {
    await a.getByTestId('grabar-otra-vez').click()
    await b.getByTestId('grabar-otra-vez').click()
    await a.getByTestId('cuenta-atras-s').selectOption('15')
    await a.getByTestId('grabar-los-dos').click()
    await fase(b, 'programada')
    await b.getByTestId('parar-doble').click()
    await fase(a, 'libre')
    await fase(b, 'libre')
    assert.match(await a.getByTestId('aviso-grabacion').innerText(), /cancel/i)
  })

  it('sin una vista de perfil y otra de frente no se ofrece grabar', async () => {
    await b.getByTestId('vista-perfil-izquierda').click()
    await a.getByTestId('grabar-doble').waitFor({ state: 'detached' })
    await b.getByTestId('vista-frente').click()
    await a.getByTestId('grabar-doble').waitFor()
  })

  /** Espera la propuesta de la grabación doble y comprueba lo que se abre. Devuelve la propuesta. */
  async function comprobarPareja(p) {
    const caja = p.getByTestId('propuesta-doble')
    await caja.waitFor({ timeout: 30000 })
    // Abre en «Vídeo», con las dos vistas.
    assert.equal(await p.getByTestId('pestana-video').getAttribute('aria-selected'), 'true')
    await p.getByTestId('conmutador-vista').waitFor()
    return { metodo: await caja.getAttribute('data-metodo'), desfase: Number(await caja.getAttribute('data-desfase')) }
  }

  it('«Abrir la grabación doble» (paso 7): pareja por sus metadatos, el de perfil como A y el desfase del reloj frente a la verdad', async () => {
    const q = await abrirApp(navB)
    try {
      // En orden inverso: el de perfil tiene que quedar como referencia igualmente.
      await q.setInputFiles('[data-testid=selector-doble]', [pareja.frente, pareja.perfil])
      const propuesta = await comprobarPareja(q)
      // El micrófono falso no oye los pitidos: se propone el reloj, y cae en su cota respecto a la verdad (más lo que
      // tarda en arrancar cada grabadora, el margen).
      assert.equal(propuesta.metodo, 'reloj')
      assert.ok(Math.abs(propuesta.desfase - pareja.verdad) <= pareja.cota + 0.05, `reloj ${propuesta.desfase} s, verdad ${pareja.verdad} s (cota ${pareja.cota})`)
      assert.match(await q.getByTestId('cifras-doble').innerText(), /reloj [+−]0,\d{3} s ± \d+ ms/)
      // Nada cambia hasta aplicar; aplicado, la sincronía dice el método y el desfase.
      assert.match(await q.getByTestId('metodo-sincronia').innerText(), /Sin sincronizar/)
      await q.getByTestId('aplicar-propuesta').click()
      await q.getByTestId('propuesta-aplicada').waitFor()
      assert.match(await q.getByTestId('metodo-sincronia').innerText(), /Por el reloj común/)
      assert.ok(Math.abs(parseFloat((await q.getByTestId('desfase-sincronia').innerText()).replace('−', '-').replace(',', '.')) - propuesta.desfase) < 0.0006)
      // El de perfil es la vista A y la orientación de cada una sale de sus metadatos (A mira a la derecha; B, de frente).
      assert.match(await q.getByTestId('vista-A').getAttribute('title'), /mira a la derecha/)
      assert.match(await q.getByTestId('vista-B').getAttribute('title'), /desde delante/)
    } finally {
      await q.close()
    }
  })

  it('un vídeo que no es de la pareja se rechaza con el motivo; desde «Grabaciones de este móvil», «Abrir con el otro vídeo»', async () => {
    const q = await abrirApp(navB)
    try {
      await q.setInputFiles('[data-testid=selector-doble]', [videos.verde.ruta, pareja.perfil])
      await q.getByText(/no está grabado con dualkinema/).waitFor({ timeout: 20000 })
    } finally {
      await q.close()
    }
    // En A (su almacenamiento tiene su vídeo): sale de la sala, abre su lista y elige el otro vídeo.
    await a.getByTestId('salir-sala').click()
    await a.getByTestId('ir-grabar').click()
    await a.getByTestId('grabacion-abrir-doble').first().click()
    await a.getByTestId('falta-doble').waitFor()
    await a.setInputFiles('[data-testid=selector-doble]', pareja.frente)
    assert.equal((await comprobarPareja(a)).metodo, 'reloj')
  })
})

it('no ha habido errores de consola ni de página en ninguna prueba', () => {
  assert.deepEqual(errores, [])
})

describe('minigráfica grande arriba del todo (móvil)', () => {
  let p
  before(async () => {
    ;({ p } = await seguirVideo(videos.verde, { ancho: 390 }))
  })
  after(() => p?.close())

  const asentar = async () => {
    await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 })
  }
  const arriba = async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
  }
  const altoMini = async () => (await p.getByTestId('minigrafica-caja').boundingBox()).height
  const cajas = async () => ({
    tira: await p.getByRole('tablist').locator('..').boundingBox(),
    barra: await p.getByTestId('barra-fija').boundingBox(),
    tarjetas: await p.getByTestId('panel-herramientas').boundingBox(),
    video: await p.getByTestId('lienzo').boundingBox(),
  })

  it('arriba del todo la primera pantalla es vídeo, gráfica, pestañas y barra: no asoma ninguna tarjeta', async () => {
    await arriba()
    const c = await cajas()
    assert.ok((await altoMini()) > 120, `la gráfica mide ${await altoMini()} px`)
    // La tira acaba justo sobre la barra y las tarjetas empiezan por debajo de ella (fuera de la pantalla visible).
    assert.ok(Math.abs(c.tira.y + c.tira.height - c.barra.y) <= 2, `tira hasta ${c.tira.y + c.tira.height}, barra desde ${c.barra.y}`)
    assert.ok(c.tarjetas.y >= c.barra.y, `las tarjetas asoman: empiezan en ${c.tarjetas.y}, la barra en ${c.barra.y}`)
    assert.ok(c.video.y >= 0 && c.video.y + c.video.height <= c.tira.y, 'el vídeo cabe sobre la gráfica y la tira')
    assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-grande'), 'true')
  })

  it('al bajar un poco vuelve a su alto de siempre y no vuelve sola arriba (sin saltos)', async () => {
    await arriba()
    await p.evaluate(() => window.scrollTo(0, 120))
    await asentar()
    assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-grande'), 'false')
    assert.equal(Math.round(await altoMini()), 76)
    // El scroll se queda donde se dejó (el navegador no lo «corrige» al encogerse la gráfica).
    assert.equal(await p.evaluate(() => Math.round(window.scrollY)), 120)
    // Vuelve a crecer al llegar arriba del todo.
    await arriba()
    assert.ok((await altoMini()) > 120)
  })

  it('tocar una pestaña desplaza hasta sus tarjetas: la tira queda pegada bajo el vídeo y las tarjetas se ven', async () => {
    for (const id of ['analisis', 'marcar']) {
      await arriba()
      await p.getByTestId(`pestana-${id}`).click()
      await p.waitForFunction(() => window.scrollY > 40)
      await asentar()
      const c = await cajas()
      assert.equal(Math.round(await altoMini()), 76)
      assert.ok(c.tarjetas.y < c.barra.y - 100, `${id}: las tarjetas empiezan en ${c.tarjetas.y} y la barra en ${c.barra.y}`)
      // La tira pegada bajo el vídeo con la gráfica en reposo.
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      assert.ok(Math.abs(c.tira.y - (fijo.y + fijo.height)) <= 4, `la tira está en ${c.tira.y} y el vídeo acaba en ${fijo.y + fijo.height}`)
    }
  })

  it('el estado del guardado está en la pestaña «Vídeo» en el móvil', async () => {
    await abrirPestana(p, 'video')
    await p.getByTestId('guardado').waitFor({ state: 'visible' })
    assert.equal(await p.getByTestId('guardado').count(), 1)
  })
})

describe('asa entre el vídeo y la gráfica pequeña (móvil)', () => {
  let p
  before(async () => {
    // Vídeo vertical: es el que puede crecer en alto (uno horizontal llena antes el ancho).
    p = await abrirApp(navegador, { ancho: 390 })
    await cargarVideo(p, videos.vertical.ruta)
  })
  after(() => p?.close())

  const asentar = async () => {
    await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 })
  }
  const asa = () => p.getByTestId('separador-video')
  const altoVideo = async () => (await p.getByTestId('lienzo').boundingBox()).height
  const altoMini = async () => (await p.getByTestId('minigrafica-caja').boundingBox()).height
  /** Arrastra el asa `dy` px y la suelta; devuelve el alto del vídeo justo antes de soltar. */
  const arrastrar = async (dy) => {
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + dy / 2, { steps: 4 })
    await p.mouse.move(x, y + dy, { steps: 4 })
    const durante = await altoVideo()
    await p.mouse.up()
    await asentar()
    return durante
  }
  /** La tira de pestañas acaba justo sobre la barra fija (la gráfica grande llena lo que deja el vídeo). */
  const tiraSobreLaBarra = async () => {
    const tira = await p.getByRole('tablist').locator('..').boundingBox()
    const barra = await p.getByTestId('barra-fija').boundingBox()
    assert.ok(Math.abs(tira.y + tira.height - barra.y) <= 2, `tira hasta ${tira.y + tira.height}, barra desde ${barra.y}`)
  }

  it('de partida, el reparto de siempre: el vídeo, un 30 % de la ventana', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'normal')
    assert.ok(Math.abs((await altoVideo()) - 0.3 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    await tiraSobreLaBarra()
  })

  it('arrastrar hacia abajo agranda el vídeo, encaja en «vídeo grande» y la gráfica cede el sitio', async () => {
    const miniAntes = await altoMini()
    const durante = await arrastrar(90)
    assert.ok(Math.abs(durante - (0.3 * 844 + 90)) <= 2, `durante el arrastre el vídeo mide ${durante} px`)
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.ok(Math.abs((await altoVideo()) - 0.45 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    assert.ok((await altoMini()) < miniAntes - 100, `la gráfica mide ${await altoMini()} px (antes ${miniAntes})`)
    await tiraSobreLaBarra()
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), 'video')
  })

  it('arrastrar hacia arriba agranda la gráfica', async () => {
    const miniAntes = await altoMini()
    await arrastrar(-200)
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
    assert.ok(Math.abs((await altoVideo()) - 0.2 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    assert.ok((await altoMini()) > miniAntes + 60, `la gráfica mide ${await altoMini()} px (antes ${miniAntes})`)
    await tiraSobreLaBarra()
  })

  it('dos toques vuelven al reparto de siempre; con el teclado, a la posición de al lado', async () => {
    await asa().dblclick()
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'normal')
    assert.ok(Math.abs((await altoVideo()) - 0.3 * 844) <= 2)
    await asa().focus()
    await p.keyboard.press('ArrowDown')
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    await p.keyboard.press('ArrowUp')
    await p.keyboard.press('ArrowUp')
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('tirar más allá de un extremo y soltar pasa a la vista ampliada y al volver se aterriza en ese extremo', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    const antes = await asa().getAttribute('data-reparto')
    // Hacia abajo, mucho más allá de «vídeo grande»: aviso mientras se tira y, al soltar, el vídeo ampliado.
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + 300, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), 'video')
    await p.getByTestId('aviso-ampliar').waitFor({ state: 'visible' })
    // Con resistencia: pasado el extremo (45 %), el vídeo sigue un poco más (56 × 0,35 ≈ 20 px como mucho), no se para en seco.
    const pasado = (await altoVideo()) - 0.45 * 844
    assert.ok(pasado > 8 && pasado < 25, `el vídeo pasa ${pasado} px del extremo`)
    await p.mouse.up()
    await p.getByTestId('reducir-video').waitFor({ state: 'visible' })
    await p.getByTestId('reducir-video').click()
    await asentar()
    // Se vuelve al extremo del que se viene (vídeo grande), sin tocar el reparto guardado.
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), antes)
    // Hacia arriba, más allá de «gráfica grande»: solo las gráficas.
    await arrastrar(-500)
    await p.getByTestId('vista-graficas').waitFor({ state: 'visible' })
    await p.getByTestId('reducir-graficas').click()
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('en las vistas ampliadas, tirar del asa en sentido contrario al de entrar vuelve a la mixta (con poco recorrido, no)', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    const antes = await asa().getAttribute('data-reparto')
    const tirar = async (id, dy) => {
      const c = await p.getByTestId(id).boundingBox()
      const x = c.x + c.width / 2
      const y = c.y + c.height / 2
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x, y + dy / 2, { steps: 4 })
      await p.mouse.move(x, y + dy, { steps: 4 })
      return () => p.mouse.up()
    }
    // Vídeo grande: se entra tirando hacia abajo y se sale tirando hacia arriba.
    await arrastrar(500)
    await p.getByTestId('reducir-video').waitFor({ state: 'visible' })
    let soltar = await tirar('asa-volver-video', -20)
    assert.equal(await p.getByTestId('asa-volver-video-aviso').count(), 0, 'con poco recorrido no avisa')
    await soltar()
    assert.equal(await p.getByTestId('reducir-video').count(), 1, 'con poco recorrido no vuelve')
    soltar = await tirar('asa-volver-video', -120)
    await p.getByTestId('asa-volver-video-aviso').waitFor({ state: 'visible' })
    await soltar()
    await p.getByTestId('reducir-video').waitFor({ state: 'detached' })
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), antes)
    // Solo gráficas: se entra tirando hacia arriba y se sale tirando hacia abajo.
    await arrastrar(-500)
    await p.getByTestId('vista-graficas').waitFor({ state: 'visible' })
    soltar = await tirar('asa-volver-graficas', 20)
    await soltar()
    assert.equal(await p.getByTestId('reducir-graficas').count(), 1, 'con poco recorrido no vuelve')
    soltar = await tirar('asa-volver-graficas', 120)
    await p.getByTestId('asa-volver-graficas-aviso').waitFor({ state: 'visible' })
    await soltar()
    await p.getByTestId('reducir-graficas').waitFor({ state: 'detached' })
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('pasado el margen, volver atrás sin soltar no amplía: encaja como siempre', async () => {
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + 300, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), 'video')
    await p.mouse.move(x, y + 5, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), null)
    await p.mouse.up()
    await asentar()
    assert.equal(await p.getByTestId('reducir-video').count(), 0)
    assert.equal(await p.getByTestId('aviso-ampliar').count(), 0)
  })

  it('«Cambiar vídeo» en el móvil es solo un icono (con su nombre accesible)', async () => {
    const b = p.getByRole('button', { name: 'Cambiar vídeo' })
    const c = await b.boundingBox()
    assert.ok(c.width <= 48 && c.height <= 48, `el botón mide ${c.width} × ${c.height} px`)
  })

  it('en pantalla ancha no hay asa', async () => {
    const q = await abrirApp(navegador, { ancho: 1280 })
    await cargarVideo(q, videos.vertical.ruta)
    assert.equal(await q.getByTestId('separador-video').count(), 0)
    await q.close()
  })
})

describe('móvil girado (horizontal)', () => {
  let navegador
  let videos
  before(async () => {
    videos = await asegurarVideos()
    navegador = await lanzarNavegador()
  })
  after(() => navegador.close())

  const caja = async (p, testid) => (await p.getByTestId(testid).boundingBox())

  it('el vídeo grande se reparte en dos columnas: el vídeo con todo el alto y, a su lado, el marcado y la barra fija', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 844, alto: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await esperarVideoAsentado(p, false)
      const capa = await caja(p, 'capa')
      const columna = await caja(p, 'columna-marcado')
      const barra = await caja(p, 'barra-fija')
      // Con el reparto de antes quedaba una rendija de 39 × 22 px: ahora el vídeo es grande y está a la izquierda.
      assert.ok(capa.width >= 380 && capa.height >= 200, `vídeo demasiado pequeño: ${capa.width} × ${capa.height}`)
      assert.ok(capa.x + capa.width <= columna.x + 1, 'el vídeo debe quedar a la izquierda de la columna de marcado')
      // La barra fija ocupa solo esa columna (mismo ancho y la misma posición), no todo el ancho de la ventana.
      assert.ok(Math.abs(barra.width - columna.width) <= 1 && Math.abs(barra.x - columna.x) <= 1, `barra ${JSON.stringify(barra)} / columna ${JSON.stringify(columna)}`)
      assert.ok(barra.y + barra.height <= 390 + 1 && columna.y + columna.height <= 390 + 1, 'nada se sale de la ventana')
      // La barra no tapa el marcado: su hueco de abajo es de la barra.
      const seguir = await caja(p, 'marcado-compacto')
      assert.ok(seguir.y + seguir.height <= barra.y + 1 || seguir.y < barra.y, 'el marcado empieza sobre la barra')
      assert.equal(await p.getByTestId('asa-volver-video').count(), 0, 'sin asa para volver: queda el botón del vídeo')
      // La página no se desplaza.
      assert.equal(await p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true)

      // Se marca tocando el vídeo y se sigue desde la columna de la derecha.
      await marcarTres(p, video.verdad[0].ps)
      for (const nombre of [/Trocánter/, /Epicóndilo/, /Maléolo/]) {
        assert.match(await p.getByTestId('marcado-compacto').getByRole('radio', { name: nombre }).innerText(), /a mano/)
      }
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('marcado-compacto').getByText(/Seguimiento completado hasta el final del vídeo, sin huecos/).waitFor({ timeout: 90000 })

      // Los botones de frame de la barra funcionan.
      const antes = (await leerPosicion(p)).frame
      await p.getByTestId('barra-fija').getByRole('button', { name: /Frame siguiente|siguiente/i }).first().click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, antes + 1)

      // Volver a la vista mixta: la barra vuelve a ocupar todo el ancho.
      await p.getByTestId('reducir-video').click()
      await esperarVideoAsentado(p, false)
      assert.equal(await p.getByTestId('columna-marcado').count(), 0)
      assert.ok(Math.abs((await caja(p, 'barra-fija')).width - 844) <= 1)
    } finally {
      await p.close()
    }
  })

  it('girar el móvil con el vídeo grande abierto cambia el reparto sin perder el vídeo ni lo marcado', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 844, alto: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await esperarVideoAsentado(p, false)
      await marcarTres(p, video.verdad[0].ps)
      assert.equal(await p.getByTestId('columna-marcado').count(), 1)
      // A vertical: vuelve el reparto de siempre (vídeo arriba, marcado debajo, barra a todo el ancho).
      await p.setViewportSize({ width: 390, height: 844 })
      await p.getByTestId('columna-marcado').waitFor({ state: 'detached' })
      await esperarVideoAsentado(p, false)
      assert.ok(Math.abs((await caja(p, 'barra-fija')).width - 390) <= 1)
      assert.match(await p.getByTestId('marcado-compacto').getByRole('radio', { name: /Trocánter/ }).innerText(), /a mano/)
      // Y otra vez a horizontal.
      await p.setViewportSize({ width: 844, height: 390 })
      await p.getByTestId('columna-marcado').waitFor()
      assert.match(await p.getByTestId('marcado-compacto').getByRole('radio', { name: /Maléolo/ }).innerText(), /a mano/)
      assert.ok((await caja(p, 'capa')).width >= 380)
    } finally {
      await p.close()
    }
  })

  it('en horizontal, con la vista mixta y solo gráficas siguen usables', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 844, alto: 390 })
    try {
      await cargarVideo(p, video.ruta)
      // Mixta: el vídeo se ve y se puede tocar (sin el reparto en columnas).
      const capa = await caja(p, 'capa')
      assert.ok(capa.width >= 150 && capa.height >= 80, `vídeo de la mixta: ${capa.width} × ${capa.height}`)
      assert.equal(await p.getByTestId('columna-marcado').count(), 0)
      // Solo gráficas: entra, la gráfica se ve y sale.
      await p.getByTestId('ampliar-graficas').click()
      const g = await p.getByTestId('vista-graficas').boundingBox()
      assert.ok(g.width >= 800 && g.height >= 200, `solo gráficas: ${g.width} × ${g.height}`)
      await p.getByTestId('reducir-graficas').click()
      await p.getByTestId('capa').waitFor()
    } finally {
      await p.close()
    }
  })

  it('en la columna de marcado, «a ojo» y «seguir» van en una fila y, con «Rellenar» a la vista, la columna no se desplaza', async () => {
    const video = videos.corto
    for (const [ancho, alto] of [
      [800, 360],
      [844, 390],
    ]) {
      const p = await abrirApp(navegador, { ancho, alto })
      try {
        await cargarVideo(p, video.ruta)
        await p.getByTestId('ampliar-video').click()
        await esperarVideoAsentado(p, false)
        await marcarTres(p, video.verdad[0].ps)
        // Los dos controles, en la misma fila: a la misma altura y uno junto al otro, y con sus nombres de siempre.
        const aOjo = await p.getByRole('switch', { name: 'Colocar a ojo' }).boundingBox()
        const seguir = await p.getByRole('button', { name: 'Seguir desde aquí' }).boundingBox()
        assert.ok(Math.abs(aOjo.y - seguir.y) <= 6, `no van en la misma fila (${ancho} × ${alto}): ${JSON.stringify({ aOjo, seguir })}`)
        assert.ok(aOjo.x + aOjo.width <= seguir.x + 1, 'el interruptor va a la izquierda del botón')
        assert.ok(aOjo.height >= 36 && seguir.height >= 36, `alto táctil: ${aOjo.height} y ${seguir.height}`)
        await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
        const marcado = p.getByTestId('marcado-compacto')
        await marcado.getByRole('button', { name: /Rellenar 1 hueco corto/ }).waitFor({ timeout: 90000 })
        // En un frame ya seguido, con «Rellenar» y el aviso a la vista, no hace falta desplazar la columna.
        await irAFrame(p, 30)
        await marcado.getByRole('button', { name: /Rellenar 1 hueco corto/ }).waitFor()
        const { scroll, cliente } = await p.getByTestId('columna-marcado').evaluate((e) => ({ scroll: e.scrollHeight, cliente: e.clientHeight }))
        assert.ok(scroll <= cliente, `la columna se desplaza a ${ancho} × ${alto}: ${scroll} > ${cliente}`)
        // Y «Rellenar» no queda tapado por la barra fija.
        const rellenar = await marcado.getByRole('button', { name: /Rellenar 1 hueco corto/ }).boundingBox()
        const barra = await p.getByTestId('barra-fija').boundingBox()
        assert.ok(rellenar.y + rellenar.height <= barra.y + 1, 'Rellenar queda tapado por la barra')
      } finally {
        await p.close()
      }
    }
  })

  it('«Solo gráficas» con el móvil girado: ángulo y velocidad lado a lado, enteras en pantalla y con el botón de volver en el título', async () => {
    const video = videos.verde
    for (const [ancho, alto] of [
      [740, 360],
      [844, 390],
    ]) {
      const p = await abrirApp(navegador, { ancho, alto })
      try {
        await cargarVideo(p, video.ruta)
        await p.getByTestId('ampliar-graficas').click()
        await p.getByTestId('grafica-velocidad').waitFor()
        const barra = await p.getByTestId('barra-fija').boundingBox()
        const angulo = await p.getByTestId('grafica-angulo').boundingBox()
        const velocidad = await p.getByTestId('grafica-velocidad').boundingBox()
        const dentro = (c, nombre) => {
          assert.ok(c.y >= 0 && c.y + c.height <= barra.y + 1, `${nombre} no cabe sobre la barra (${ancho} × ${alto}): ${JSON.stringify({ c, barraY: barra.y })}`)
          assert.ok(c.height >= 80 && c.width >= 200, `${nombre} demasiado pequeña: ${c.width} × ${c.height}`)
        }
        dentro(angulo, 'la gráfica del ángulo')
        dentro(velocidad, 'la gráfica de la velocidad')
        // Una al lado de la otra, no una debajo de la otra.
        assert.ok(velocidad.x >= angulo.x + angulo.width - 1, `la velocidad debe ir a la derecha del ángulo: ${JSON.stringify({ angulo, velocidad })}`)
        assert.ok(Math.abs(velocidad.y - angulo.y) <= 40, 'a una altura parecida')
        // Sin asa ni cabecera: el botón de volver está en la fila del título, sobre la barra.
        assert.equal(await p.getByTestId('asa-volver-graficas').count(), 0)
        const volver = await p.getByTestId('reducir-graficas').boundingBox()
        assert.ok(volver.y >= 0 && volver.y + volver.height <= angulo.y, 'el botón de volver va sobre las gráficas')
        // Con los segmentos encendidos, tres columnas y todo sigue dentro.
        await p.getByTestId('panel-grafica').getByRole('button', { name: /Trocánter – Epicóndilo/ }).click()
        const segmentos = await p.getByTestId('grafica-segmentos').boundingBox()
        assert.ok(segmentos.x >= velocidad.x + 1, 'los segmentos van en otra columna a la derecha')
        dentro(segmentos, 'la gráfica de los segmentos')
        // El botón vuelve a la vista mixta.
        await p.getByTestId('reducir-graficas').click()
        await p.getByTestId('capa').waitFor()
        assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
      } finally {
        await p.close()
      }
    }
  })
})

describe('preferencias recordadas en el dispositivo', () => {
  let navegador
  let videos
  before(async () => {
    videos = await asegurarVideos()
    navegador = await lanzarNavegador()
  })
  after(() => navegador.close())

  const abierta = async (p) => {
    const ids = ['marcar', 'analisis', 'escala', 'video']
    const marcas = await Promise.all(ids.map((id) => p.getByTestId(`pestana-${id}`).getAttribute('aria-selected')))
    return ids.filter((_, i) => marcas[i] === 'true')
  }

  it('la pestaña abierta se recuerda al recuperar un trabajo, pero un vídeo nuevo empieza en «Marcar»; con un valor ilegible, «Marcar»', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      assert.deepEqual(await abierta(p), ['marcar'], 'de partida, «Marcar»')
      await marcarTres(p, video.verdad[0].ps)
      await abrirPestana(p, 'analisis')
      assert.deepEqual(await abierta(p), ['analisis'])
      await esperarGuardado(p, video.verdad.length)
      // Recuperar el trabajo: vuelve la pestaña que se usó.
      await p.reload()
      await p.setInputFiles('input[type=file]', video.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.deepEqual(await abierta(p), ['analisis'], 'al recuperar, la última')
      // Un vídeo nuevo, sin nada marcado, empieza en «Marcar» aunque la última haya sido otra.
      await p.reload()
      await cargarVideo(p, videos.corto.ruta)
      assert.deepEqual(await abierta(p), ['marcar'], 'un vídeo nuevo empieza en «Marcar»')
      // Un valor que no es una pestaña no rompe nada al recuperar: «Marcar».
      await p.evaluate(() => localStorage.setItem('dualkinema.pestana', 'otra'))
      await p.reload()
      await p.setInputFiles('input[type=file]', video.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.deepEqual(await abierta(p), ['marcar'])
    } finally {
      await p.close()
    }
  })

  it('las series que se ven en la gráfica se recuerdan; un guardado roto se ignora', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      const serie = (id) => p.getByTestId(`serie-${id}`)
      assert.equal(await serie('velocidad').getAttribute('aria-pressed'), 'true')
      assert.equal(await serie('crudo').getAttribute('aria-pressed'), 'true')
      await serie('velocidad').click()
      await serie('crudo').click()
      assert.equal(await serie('velocidad').getAttribute('aria-pressed'), 'false')
      await p.reload()
      await cargarVideo(p, videos.verde.ruta)
      assert.equal(await serie('velocidad').getAttribute('aria-pressed'), 'false', 'la velocidad sigue oculta')
      assert.equal(await serie('crudo').getAttribute('aria-pressed'), 'false', 'lo crudo sigue oculto')
      assert.equal(await serie('filtrado').getAttribute('aria-pressed'), 'true', 'lo que no se tocó sigue a la vista')
      // Se vuelve a encender y se recuerda también.
      await serie('velocidad').click()
      await p.reload()
      await cargarVideo(p, videos.verde.ruta)
      assert.equal(await serie('velocidad').getAttribute('aria-pressed'), 'true')
      // Un guardado ilegible se ignora: las de por defecto.
      await p.evaluate(() => localStorage.setItem('dualkinema.seriesVisibles', '{roto'))
      await p.reload()
      await cargarVideo(p, videos.verde.ruta)
      for (const id of ['crudo', 'filtrado', 'velocidad']) assert.equal(await serie(id).getAttribute('aria-pressed'), 'true')
    } finally {
      await p.close()
    }
  })
})

