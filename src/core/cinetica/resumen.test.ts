import { describe, expect, it } from 'vitest'
import { posturaEn } from '../esqueleto/sintetico'
import { medidasDe } from '../esqueleto/sintetico'
import { construirCsvCinetica } from '../exportacion/csvCinetica'
import { cineticaDeLaToma, G } from './dinamica'
import { asimetria, maximo, media, picos, repartoPeso } from './resumen'

const H = 1.75
// Las sentadillas de la persona sintética (6–12 s), quietas en el abajo de la primera para tener valores conocidos.
const tiempos = Array.from({ length: 90 }, (_, k) => 6 + k / 30)
const r = cineticaDeLaToma({ tiempos, posturas: tiempos.map((t) => posturaEn(t, H)), medidas: medidasDe(H), metrosPorUnidad: 1, suelo: 0, fs: 30, corteHz: 6, modo: 'cuasiestatica' })

describe('cinética: resumen', () => {
  it('máximo, media y asimetría de valores conocidos (NaN sin valores, nunca 0)', () => {
    expect(maximo([NaN, 1, 3, 2])).toBe(3)
    expect(maximo([NaN])).toBeNaN()
    expect(media([1, NaN, 3])).toBe(2)
    expect(media([])).toBeNaN()
    expect(asimetria(1.1, 0.9)).toBeCloseTo(20, 9)
    expect(asimetria(0.01, 0.02)).toBeNaN()
    expect(asimetria(NaN, 1)).toBeNaN()
  })

  it('sentadilla con el tronco inclinado a la izquierda: el pie izquierdo lleva más peso; los dos suman el 100 %', () => {
    const rp = repartoPeso(r)
    const k = 45
    expect(rp.der[k]! + rp.izq[k]!).toBeCloseTo(100, 9)
    expect(rp.izq[k]!).toBeGreaterThan(51)
    expect(rp.izq[k]!).toBeLessThan(60)
    expect(rp.der[0]).toBeNaN() // el borde del tramo, sin valor
    const p = picos(r, 'sagital')
    expect(p.rodilla.der).toBeGreaterThan(0.3)
    expect(p.rodilla.izq).toBeGreaterThan(0.3)
    expect(p.rodilla.asimetria).toBeCloseTo(asimetria(p.rodilla.der, p.rodilla.izq), 12)
  })

  it('el CSV: una fila por frame, celdas vacías sin valor, la fuerza en % del peso y los convenios en la cabecera', () => {
    const texto = construirCsvCinetica({ exportado: '2026-11-14T10:00:00Z', resultado: r, modo: 'cuasiestatica', corteHz: 6 }, 'internacional')
    const lineas = texto.trim().split('\r\n')
    expect(lineas.some((l) => l.startsWith('# momentos,') && l.includes('+ extensor'))).toBe(true)
    const i = lineas.findIndex((l) => l.startsWith('t_comun_s'))
    const col = lineas[i]!.split(',')
    expect(col).toContain('rodilla_der_sagital_Nm_kg')
    expect(col).not.toContain('tobillo_der_frontal_Nm_kg')
    const filas = lineas.slice(i + 1).map((l) => l.split(','))
    expect(filas).toHaveLength(tiempos.length)
    const c = (f: string[], nombre: string) => f[col.indexOf(nombre)]!
    expect(c(filas[0]!, 'fuerza_z_N_kg')).toBe('')
    expect(Number(c(filas[45]!, 'fuerza_z_pct_peso'))).toBeCloseTo(100, 1)
    expect(Number(c(filas[45]!, 'fuerza_z_N_kg'))).toBeCloseTo(G, 2)
    expect(c(filas[45]!, 'apoyo_der')).toBe('1')
    expect(Number(c(filas[45]!, 'peso_izq_pct'))).toBeCloseTo(repartoPeso(r).izq[45]!, 1)
    expect(Number(c(filas[45]!, 'rodilla_izq_sagital_Nm_kg'))).toBeCloseTo(r.articulaciones.izq.rodilla.sagital[45]!, 3)
  })
})
