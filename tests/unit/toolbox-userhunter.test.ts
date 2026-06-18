import { describe, test, expect, vi, afterEach } from 'vitest'
import { searchUsername, PLATFORMS, USERNAME_REGEX } from '@/lib/toolbox/userhunter'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('USERNAME_REGEX', () => {
  test('aceita letras, números, ponto, underscore e hífen', () => {
    expect(USERNAME_REGEX.test('john.doe_99-x')).toBe(true)
  })

  test('rejeita espaços e caracteres especiais', () => {
    expect(USERNAME_REGEX.test('john doe')).toBe(false)
    expect(USERNAME_REGEX.test('john@doe')).toBe(false)
    expect(USERNAME_REGEX.test('../../etc/passwd')).toBe(false)
  })
})

describe('PLATFORMS', () => {
  test('tem mais de 70 plataformas, todas com nome único e URL com placeholder', () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(70)
    const names = new Set<string>()
    for (const p of PLATFORMS) {
      expect(names.has(p.name)).toBe(false)
      names.add(p.name)
      expect(p.url).toContain('{}')
      expect(p.detect.length).toBeGreaterThan(0)
    }
  })
})

describe('searchUsername', () => {
  test('encontra plataformas com deteção not_contains, contains e status_200; ignora as restantes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('x.com/')) {
          // not_contains — corpo longo sem a frase de "não existe"
          return Promise.resolve(new Response('Perfil de teste '.repeat(30), { status: 200 }))
        }
        if (url.includes('api.github.com/users/')) {
          // contains:"login"
          return Promise.resolve(new Response('{"login":"testuser","id":1}', { status: 200 }))
        }
        if (url.includes('registry.npmjs.org/~')) {
          // status_200 — corpo irrelevante
          return Promise.resolve(new Response('{}', { status: 200 }))
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )

    const result = await searchUsername('testuser')

    expect(result.plataformasAnalisadas).toBe(PLATFORMS.length)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    const nomesEncontrados = result.encontrados.map((p) => p.name)
    expect(nomesEncontrados).toEqual(expect.arrayContaining(['Twitter/X', 'GitHub', 'NPM']))
    // As restantes (todas 404 por defeito) não devem aparecer.
    expect(result.encontrados.length).toBe(3)
  })

  test('corpo demasiado curto não conta como encontrado mesmo sem a frase de "não existe"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('x.com/')) {
          return Promise.resolve(new Response('ok', { status: 200 }))
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )

    const result = await searchUsername('testuser')
    expect(result.encontrados.find((p) => p.name === 'Twitter/X')).toBeUndefined()
  })

  test('usa o fallbackUrl quando a deteção primária falha (ex: Instagram)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('instagram.com')) {
          if (url.includes('__a=1')) {
            // primário: corpo curto, não conta como encontrado
            return Promise.resolve(new Response('{}', { status: 200 }))
          }
          // fallback: corpo longo sem "Page Not Found"
          return Promise.resolve(new Response('Perfil público de teste. '.repeat(20), { status: 200 }))
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )

    const result = await searchUsername('testuser')
    const instagram = result.encontrados.find((p) => p.name === 'Instagram')
    expect(instagram).toBeDefined()
    expect(instagram?.url).toContain('https://www.instagram.com/testuser/')
    expect(instagram?.url).not.toContain('__a=1')
  })

  test('falhas de rede (timeout/DNS) não interrompem a pesquisa — tratadas como não encontrado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await searchUsername('testuser')
    expect(result.encontrados).toEqual([])
    expect(result.plataformasAnalisadas).toBe(PLATFORMS.length)
  })
})
