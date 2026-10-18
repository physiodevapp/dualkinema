import { describe, expect, it } from 'vitest'
import { claveAnterior, planificarLectura } from './planLectura'

// Fotogramas clave cada 25 frames, como el vídeo «numerado» de las pruebas e2e.
const claves = [0, 25, 50, 75, 100]

describe('plan de lectura de un frame', () => {
  it('fotograma clave anterior', () => {
    expect(claveAnterior(claves, 0)).toBe(0)
    expect(claveAnterior(claves, 24)).toBe(0)
    expect(claveAnterior(claves, 25)).toBe(25)
    expect(claveAnterior(claves, 119)).toBe(100)
    expect(claveAnterior([], 7)).toBe(0)
  })

  it('el siguiente frame sigue con el decodificador', () => {
    expect(planificarLectura({ indice: 31, siguiente: 31, claves, capacidad: 20 })).toEqual({ modo: 'seguir' })
  })

  it('saltarse unos frames hacia delante (pulsación mantenida) sigue, sin volver al fotograma clave', () => {
    expect(planificarLectura({ indice: 34, siguiente: 31, claves, capacidad: 20 })).toEqual({ modo: 'seguir' })
    // Hasta el mismo fotograma clave también: seguir llega a él sin decodificar nada de más.
    expect(planificarLectura({ indice: 50, siguiente: 50, claves, capacidad: 20 })).toEqual({ modo: 'seguir' })
  })

  it('si hay un fotograma clave entre medias, vuelve a empezar desde él', () => {
    expect(planificarLectura({ indice: 55, siguiente: 45, claves, capacidad: 20 })).toEqual({ modo: 'saltar', desde: 50 })
  })

  it('retroceder empieza en el fotograma clave, o en lo que cabe en la caché si queda lejos', () => {
    expect(planificarLectura({ indice: 40, siguiente: 41, claves, capacidad: 120 })).toEqual({ modo: 'saltar', desde: 25 })
    expect(planificarLectura({ indice: 99, siguiente: 100, claves, capacidad: 20 })).toEqual({ modo: 'saltar', desde: 80 })
  })

  it('sin decodificador abierto, empieza de nuevo', () => {
    expect(planificarLectura({ indice: 10, siguiente: null, claves, capacidad: 8 })).toEqual({ modo: 'saltar', desde: 3 })
  })
})
