// Pruebas del relé de salas (senal/, fase 4 paso 4) contra el Worker de verdad en local (`wrangler dev`, con workerd),
// con el cliente WebSocket de Node. Lo que decide el relé tiene además sus tests de núcleo (src/core/sala/rele.test.ts).
//
//   npm run test:senal
//
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, describe, it } from 'node:test'

const PUERTO = Number(process.env.SENAL_PUERTO ?? 8799)
const BASE = `http://127.0.0.1:${PUERTO}`
const ORIGEN = 'http://localhost:4173'
let relé

before(async () => {
  relé = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'senal/wrangler.jsonc', '--port', String(PUERTO), '--ip', '127.0.0.1'], {
    stdio: 'ignore',
  })
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`${BASE}/salud`)).ok) return
    } catch {
      /* arrancando */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('El relé no ha arrancado')
})

after(() => relé?.kill())

let salas = 0
/** Un código de sala nuevo para cada prueba (válido: del alfabeto sin 0/O/1/I/L). */
const codigoNuevo = () => `PRB${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[salas++ % 31]}${'XYZ'[Math.floor(salas / 31) % 3]}2`

/** Abre un WebSocket a una sala y guarda lo que llega. */
function conectar(codigo, origen = ORIGEN) {
  const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/sala/${codigo}`, { headers: { Origin: origen } })
  const recibidos = []
  const esperas = []
  let cierre = null
  ws.addEventListener('message', (e) => {
    recibidos.push(e.data)
    for (const f of esperas.splice(0)) f()
  })
  ws.addEventListener('close', (e) => {
    cierre = { code: e.code, reason: e.reason }
    for (const f of esperas.splice(0)) f()
  })
  const abierto = new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true })
    ws.addEventListener('error', () => mal(new Error('no conecta')), { once: true })
  })
  /** Espera a que se cumpla `cond` (con lo recibido y el cierre). */
  const esperar = async (cond, ms = 5000) => {
    const fin = Date.now() + ms
    while (!cond()) {
      if (Date.now() > fin) throw new Error(`no llega: ${JSON.stringify(recibidos)} ${JSON.stringify(cierre)}`)
      await Promise.race([new Promise((r) => esperas.push(r)), new Promise((r) => setTimeout(r, 50))])
    }
  }
  return { ws, recibidos, abierto, esperar, cierre: () => cierre }
}

const avisos = (c) => c.recibidos.map((t) => JSON.parse(t)).filter((m) => m.rele)

/** Dos móviles en una sala nueva, en orden (el segundo entra cuando el primero ya está dentro). */
async function pareja() {
  const codigo = codigoNuevo()
  const a = conectar(codigo)
  await a.abierto
  await a.esperar(() => avisos(a).length === 1)
  const b = conectar(codigo)
  await b.abierto
  await a.esperar(() => avisos(a).length === 2)
  await b.esperar(() => avisos(b).length === 1)
  return { codigo, a, b }
}

describe('relé de salas', () => {
  it('/salud responde', async () => {
    assert.equal(await (await fetch(`${BASE}/salud`)).text(), 'ok')
  })

  it('dos móviles en la misma sala: bienvenida, aviso de entrada y los mensajes llegan tal cual al otro (y no vuelven)', async () => {
    const codigo = codigoNuevo()
    const a = conectar(codigo)
    await a.abierto
    await a.esperar(() => avisos(a).length === 1)
    assert.deepEqual(avisos(a), [{ rele: 'bienvenida', ocupantes: 1 }])
    const b = conectar(codigo.toLowerCase()) // escrito en minúsculas: la misma sala
    await b.abierto
    await b.esperar(() => avisos(b).length === 1)
    await a.esperar(() => avisos(a).length === 2)
    assert.deepEqual(avisos(b), [{ rele: 'bienvenida', ocupantes: 2 }])
    assert.deepEqual(avisos(a)[1], { rele: 'entra', ocupantes: 2 })
    const texto = JSON.stringify({ tipo: 'ping', id: 1, t1: 123.456 })
    a.ws.send(texto)
    await b.esperar(() => b.recibidos.includes(texto))
    await new Promise((r) => setTimeout(r, 200))
    assert.ok(!a.recibidos.includes(texto), 'no se devuelve a quien lo manda')
    // Al salir uno, el otro se entera.
    a.ws.close()
    await b.esperar(() => avisos(b).some((m) => m.rele === 'sale'))
    assert.deepEqual(avisos(b).at(-1), { rele: 'sale', ocupantes: 1 })
    b.ws.close()
  })

  it('un tercero no entra: se cierra con 4001 (sala llena) y los otros dos siguen', async () => {
    const { codigo, a, b } = await pareja()
    const c = conectar(codigo)
    await c.esperar(() => c.cierre() !== null)
    assert.equal(c.cierre().code, 4001)
    a.ws.send('{"tipo":"adios"}')
    await b.esperar(() => b.recibidos.includes('{"tipo":"adios"}'))
    a.ws.close()
    b.ws.close()
  })

  it('salas distintas no se oyen', async () => {
    const a = conectar(codigoNuevo())
    const b = conectar(codigoNuevo())
    await Promise.all([a.abierto, b.abierto])
    a.ws.send('{"tipo":"adios"}')
    await new Promise((r) => setTimeout(r, 300))
    assert.ok(!b.recibidos.includes('{"tipo":"adios"}'))
    a.ws.close()
    b.ws.close()
  })

  it('código no válido (400), sin WebSocket (426) y otra web (403)', async () => {
    assert.equal((await fetch(`${BASE}/sala/ABC1EF`)).status, 400)
    assert.equal((await fetch(`${BASE}/otra`)).status, 400)
    assert.equal((await fetch(`${BASE}/sala/${codigoNuevo()}`, { headers: { Origin: ORIGEN } })).status, 426)
    const c = conectar(codigoNuevo(), 'https://otra-web.example')
    await assert.rejects(c.abierto)
  })

  it('un mensaje de más de 2 KB cierra con 4004 y no llega al otro', async () => {
    const { a, b } = await pareja()
    a.ws.send('x'.repeat(2049))
    await a.esperar(() => a.cierre() !== null)
    assert.equal(a.cierre().code, 4004)
    assert.ok(!b.recibidos.some((t) => t.startsWith('xxx')))
    b.ws.close()
  })

  it('más de la ráfaga permitida de golpe cierra con 4003', async () => {
    const { a, b } = await pareja()
    for (let k = 0; k < 200; k++) a.ws.send(`{"tipo":"ping","id":${k},"t1":0}`)
    await a.esperar(() => a.cierre() !== null)
    assert.equal(a.cierre().code, 4003)
    // Lo que pasó antes del corte llegó: la ráfaga permitida (60).
    await b.esperar(() => b.recibidos.filter((t) => t.includes('"ping"')).length >= 60)
    b.ws.close()
  })
})
