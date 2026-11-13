import { describe, expect, it } from 'vitest'
import { instalarBarreraRed, permitida } from './barreraRed'

const BASE = 'https://dualkinema.edu-gamboa-rodriguez.workers.dev/assets/pose.worker.js'

describe('barrera de red', () => {
  it('deja pasar lo del propio sitio, data:, blob: y el modelo heavy; nada más', () => {
    expect(permitida('/modelos/pose_landmarker_full_float16_1.task', BASE)).toBe(true)
    expect(permitida('https://dualkinema.edu-gamboa-rodriguez.workers.dev/version.json', BASE)).toBe(true)
    expect(permitida('data:application/octet-stream;base64,AA==', BASE)).toBe(true)
    expect(permitida('blob:https://dualkinema.edu-gamboa-rodriguez.workers.dev/1234', BASE)).toBe(true)
    expect(permitida('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task', BASE)).toBe(true)
    expect(permitida('https://odml.pa.googleapis.com/v1/log', BASE)).toBe(false)
    expect(permitida('https://storage.googleapis.com/otra-cosa', BASE)).toBe(false)
    expect(permitida('https://feat-x-dualkinema.edu-gamboa-rodriguez.workers.dev/', BASE)).toBe(false)
  })

  it('fetch y sendBeacon a otro sitio se bloquean y se cuentan; lo propio pasa', async () => {
    const llamadas: string[] = []
    const balizas: string[] = []
    const scope = {
      location: { href: BASE },
      fetch: (u: string) => {
        llamadas.push(u)
        return Promise.resolve('ok')
      },
      navigator: { sendBeacon: (u: string) => (balizas.push(u), true) },
    } as unknown as typeof globalThis
    const avisos: string[] = []
    const b = instalarBarreraRed(scope, (h) => avisos.push(h))
    await expect(scope.fetch('https://odml.pa.googleapis.com/v1/log')).rejects.toThrow(/privacidad/)
    expect(scope.navigator.sendBeacon('https://odml.pa.googleapis.com/v1/log')).toBe(false)
    await expect(scope.fetch('/modelos/x.task')).resolves.toBe('ok')
    expect(llamadas).toEqual(['/modelos/x.task'])
    expect(balizas).toEqual([])
    expect([...b.bloqueados]).toEqual(['odml.pa.googleapis.com'])
    expect(avisos).toEqual(['odml.pa.googleapis.com', 'odml.pa.googleapis.com'])
    // Ponerla dos veces no la duplica.
    expect(instalarBarreraRed(scope)).toBe(b)
  })
})
