import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Una síntesis de voz falsa: cada frase dura hasta que se llama a `acabar()`. */
function vozFalsa() {
  const dichas: string[] = []
  let actual: { text: string; onend?: () => void } | null = null
  const s = {
    get speaking() {
      return actual !== null
    },
    pending: false,
    speak(u: { text: string; onend?: () => void }) {
      dichas.push(u.text)
      actual = u
    },
    cancel() {
      actual = null
    },
    getVoices: () => [],
  }
  return {
    s,
    dichas,
    acabar() {
      const u = actual
      actual = null
      u?.onend?.()
    },
  }
}

describe('anunciar: sin pisar la frase en curso', () => {
  let v: ReturnType<typeof vozFalsa>
  beforeEach(() => {
    v = vozFalsa()
    vi.stubGlobal('window', { speechSynthesis: v.s })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string
      onend?: () => void
      onerror?: () => void
      constructor(t: string) {
        this.text = t
      }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('espera a que acabe y dice solo la última que se pidió entretanto', async () => {
    const { anunciar } = await import('./voz')
    anunciar('uno')
    anunciar('dos')
    anunciar('tres')
    expect(v.dichas).toEqual(['uno'])
    v.acabar()
    expect(v.dichas).toEqual(['uno', 'tres'])
    v.acabar()
    expect(v.dichas).toEqual(['uno', 'tres'])
  })

  it('la misma frase que se está diciendo no se repite al acabar', async () => {
    const { anunciar, callar } = await import('./voz')
    callar()
    anunciar('igual')
    anunciar('igual')
    v.acabar()
    expect(v.dichas).toEqual(['igual'])
  })

  it('callar descarta lo pendiente; hablar corta y dice ya', async () => {
    const { anunciar, callar, hablar } = await import('./voz')
    callar()
    anunciar('a')
    anunciar('b')
    callar()
    v.acabar()
    expect(v.dichas).toEqual(['a'])
    hablar('c')
    expect(v.dichas).toEqual(['a', 'c'])
  })
})
