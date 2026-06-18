import { describe, test, expect, vi, afterEach } from 'vitest'
import type { EmailHunterResult } from '@/lib/toolbox/emailhunter'

const netState = vi.hoisted(() => ({ behavior: 'valid' as 'valid' | 'invalid' | 'error' }))

// Mock mínimo de net.Socket (sem depender de imports externos — o factory do
// vi.mock é hoisted acima de quaisquer imports do ficheiro, incluindo
// 'node:events', por isso a emissão de eventos é implementada à mão).
vi.mock('node:net', () => {
  class FakeSocket {
    private listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
    on(event: string, cb: (...args: unknown[]) => void) {
      (this.listeners[event] ??= []).push(cb)
      return this
    }
    once(event: string, cb: (...args: unknown[]) => void) {
      const wrapper = (...args: unknown[]) => {
        this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== wrapper)
        cb(...args)
      }
      return this.on(event, wrapper)
    }
    emit(event: string, ...args: unknown[]) {
      for (const cb of this.listeners[event] ?? []) cb(...args)
    }
    removeAllListeners() {
      this.listeners = {}
    }
    setTimeout() {
      // no-op — os testes não dependem de timeout real
    }
    destroy() {
      // no-op
    }
    connect() {
      if (netState.behavior === 'error') {
        queueMicrotask(() => this.emit('error', new Error('ECONNREFUSED')))
        return
      }
      queueMicrotask(() => this.emit('data', Buffer.from('220 mail.example.com ESMTP\r\n')))
    }
    write(data: string) {
      queueMicrotask(() => {
        if (data.startsWith('HELO')) this.emit('data', Buffer.from('250 Hello\r\n'))
        else if (data.startsWith('MAIL FROM')) this.emit('data', Buffer.from('250 OK\r\n'))
        else if (data.startsWith('RCPT TO')) {
          const code = netState.behavior === 'valid' ? 250 : 550
          this.emit('data', Buffer.from(`${code} done\r\n`))
        }
      })
    }
  }
  return { Socket: FakeSocket }
})

vi.mock('node:dns', () => ({
  promises: {
    resolveMx: vi.fn().mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]),
    lookup: vi.fn().mockResolvedValue({ address: '93.184.216.34' }),
  },
}))

const { promises: dnsMock } = await import('node:dns')
const { huntEmail, EMAIL_REGEX, toRelatorioRows } = await import('@/lib/toolbox/emailhunter')

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  netState.behavior = 'valid'
  vi.mocked(dnsMock.resolveMx).mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' } as never])
  vi.mocked(dnsMock.lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 } as never)
})

describe('EMAIL_REGEX', () => {
  test('aceita endereços de email simples', () => {
    expect(EMAIL_REGEX.test('user@example.com')).toBe(true)
    expect(EMAIL_REGEX.test('john.doe+test@sub.example.co.uk')).toBe(true)
  })

  test('rejeita endereços malformados', () => {
    expect(EMAIL_REGEX.test('user@')).toBe(false)
    expect(EMAIL_REGEX.test('userexample.com')).toBe(false)
    expect(EMAIL_REGEX.test('user @example.com')).toBe(false)
  })
})

function mockFetchSuccess(email: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('emailrep.io/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              reputation: 'high',
              suspicious: false,
              references: 5,
              details: {
                blacklisted: false,
                malicious_activity: false,
                credentials_leaked: true,
                data_breach: true,
                first_seen: '2018-01-01',
                last_seen: '2024-01-01',
                spf_strict: true,
                dmarc_enforced: true,
                deliverable: true,
                free_provider: false,
                disposable: false,
                profiles: ['linkedin', 'github'],
              },
            }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('cavalier.hudsonrock.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              stealers: [
                {
                  date_uploaded: '2023-05-01',
                  stealer_family: 'RedLine',
                  operating_system: 'Windows 10',
                  password: 'hunter2',
                  url: 'https://example.com/login',
                },
              ],
            }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('api.proxynova.com/comb')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ count: 2, lines: [`${email}:hunter2`, `${email}:s3cr3tpw`] }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('haveibeenpwned.com/api/v3/breaches')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                Name: 'ExampleBreach',
                Domain: 'example.com',
                BreachDate: '2019-06-01',
                PwnCount: 12345,
                DataClasses: ['Email addresses', 'Passwords'],
              },
            ]),
            { status: 200 },
          ),
        )
      }
      if (url.includes('gravatar.com/') && url.endsWith('.json')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              entry: [
                {
                  displayName: 'John Doe',
                  preferredUsername: 'johndoe',
                  aboutMe: 'OSINT enthusiast',
                  accounts: [{ shortname: 'github', url: 'https://github.com/johndoe' }],
                  urls: [{ value: 'https://johndoe.dev' }],
                },
              ],
            }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('rdap.org/domain/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [
                { eventAction: 'registration', eventDate: '2010-03-01' },
                { eventAction: 'expiration', eventDate: '2026-03-01' },
              ],
              entities: [
                { roles: ['registrar'], vcardArray: [null, [['fn', {}, 'text', 'Example Registrar Inc.']]] },
              ],
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(new Response('not found', { status: 404 }))
    }),
  )
}

describe('huntEmail — caminho de sucesso (domínio corporativo)', () => {
  test('corre todos os módulos e devolve dados parseados de cada fonte', async () => {
    const email = 'user@example.com'
    mockFetchSuccess(email)

    const result = await huntEmail(email)

    expect(result.smtp.estado).toBe('valido')
    expect(result.smtp.dominio).toBe('example.com')

    expect(result.emailRep.disponivel).toBe(true)
    expect(result.emailRep.reputacao).toBe('high')
    expect(result.emailRep.credenciaisExpostas).toBe(true)
    expect(result.emailRep.perfis).toEqual(['linkedin', 'github'])

    expect(result.hudsonRock.disponivel).toBe(true)
    expect(result.hudsonRock.encontrados).toBe(1)
    expect(result.hudsonRock.registos[0].stealer).toBe('RedLine')
    // a senha nunca deve aparecer em claro
    expect(result.hudsonRock.registos[0].passwordParcial).toBe('hu*****')
    expect(result.hudsonRock.registos[0].passwordParcial).not.toContain('hunter2')

    expect(result.breachCheck.proxynova.disponivel).toBe(true)
    expect(result.breachCheck.proxynova.total).toBe(2)
    for (const linha of result.breachCheck.proxynova.amostra) {
      expect(linha).not.toContain('hunter2')
      expect(linha).not.toContain('s3cr3tpw')
    }
    expect(result.breachCheck.hibp.breachesDominio).toHaveLength(1)
    expect(result.breachCheck.hibp.breachesDominio[0].nome).toBe('ExampleBreach')
    expect(result.breachCheck.linksManuais.length).toBeGreaterThan(0)

    expect(result.gravatar.encontrado).toBe(true)
    expect(result.gravatar.username).toBe('johndoe')

    expect(result.googleDorks).toHaveLength(10)
    for (const dork of result.googleDorks) {
      expect(dork.url).toContain('google.com/search')
    }

    expect(result.domainInfo.tipoProveedor).toBe('corporativo')
    expect(result.domainInfo.registrar).toBe('Example Registrar Inc.')
    expect(result.domainInfo.ip).toBe('93.184.216.34')

    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })
})

describe('huntEmail — ProxyNova com linha sem separador', () => {
  test('uma linha sem ":" é mascarada na íntegra, nunca devolvida em claro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.proxynova.com/comb')) {
          return Promise.resolve(new Response(JSON.stringify({ count: 1, lines: ['linhaSemSeparador'] }), { status: 200 }))
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )
    const result = await huntEmail('user@example.com')
    expect(result.breachCheck.proxynova.amostra).toHaveLength(1)
    expect(result.breachCheck.proxynova.amostra[0]).not.toBe('linhaSemSeparador')
    expect(result.breachCheck.proxynova.amostra[0]).toMatch(/^li\*+$/)
  })
})

describe('huntEmail — HIBP não associa breaches por substring curta do domínio', () => {
  test('domínio com rótulo curto não gera falsos positivos por nome de breach', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('haveibeenpwned.com/api/v3/breaches')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { Name: 'Adobe', Domain: 'adobe.com', BreachDate: '2013-10-04', PwnCount: 1, DataClasses: [] },
                { Name: 'AbDomainBreach', Domain: 'ab.io', BreachDate: '2020-01-01', PwnCount: 2, DataClasses: [] },
              ]),
              { status: 200 },
            ),
          )
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )
    const result = await huntEmail('user@ab.io')
    const nomes = result.breachCheck.hibp.breachesDominio.map((b) => b.nome)
    expect(nomes).not.toContain('Adobe')
    expect(nomes).toContain('AbDomainBreach')
  })
})

describe('huntEmail — classificação de domínio gratuito', () => {
  test('reconhece um provedor gratuito conhecido sem consultar RDAP', async () => {
    mockFetchSuccess('user@gmail.com')
    const result = await huntEmail('user@gmail.com')

    expect(result.domainInfo.tipoProveedor).toBe('gratuito')
    expect(result.domainInfo.proveedor).toBe('Google Gmail')
    expect(result.domainInfo.registrar).toBeNull()
  })
})

describe('huntEmail — SMTP inválido', () => {
  test('RCPT 550 marca o endereço como inválido', async () => {
    netState.behavior = 'invalid'
    mockFetchSuccess('user@example.com')
    const result = await huntEmail('user@example.com')
    expect(result.smtp.estado).toBe('invalido')
  })
})

describe('huntEmail — EmailRep com limite de pedidos', () => {
  test('HTTP 429 é tratado como indisponível com mensagem clara', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('emailrep.io/')) return Promise.resolve(new Response('', { status: 429 }))
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )
    const result = await huntEmail('user@example.com')
    expect(result.emailRep.disponivel).toBe(false)
    expect(result.emailRep.mensagem).toMatch(/limite/i)
  })
})

describe('huntEmail — Gravatar sem perfil público', () => {
  test('404 é tratado como "não encontrado", sem mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('gravatar.com/') && url.endsWith('.json')) {
          return Promise.resolve(new Response('not found', { status: 404 }))
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      }),
    )
    const result = await huntEmail('user@example.com')
    expect(result.gravatar.encontrado).toBe(false)
    expect(result.gravatar.mensagem).toBeUndefined()
    expect(result.gravatar.avatarUrl).toContain('gravatar.com/avatar/')
  })
})

describe('huntEmail — falhas totais de rede', () => {
  test('nunca rejeita — todos os módulos caem para o estado "indisponível"', async () => {
    netState.behavior = 'error'
    vi.mocked(dnsMock.resolveMx).mockRejectedValue(new Error('ENOTFOUND'))
    vi.mocked(dnsMock.lookup).mockRejectedValue(new Error('ENOTFOUND'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await huntEmail('user@example.com')

    expect(result.smtp.estado).toBe('indeterminado')
    expect(result.emailRep.disponivel).toBe(false)
    expect(result.hudsonRock.disponivel).toBe(false)
    expect(result.breachCheck.proxynova.disponivel).toBe(false)
    expect(result.breachCheck.hibp.disponivel).toBe(false)
    expect(result.gravatar.encontrado).toBe(false)
    expect(result.domainInfo.ip).toBeNull()
    expect(result.googleDorks).toHaveLength(10)
  })
})

describe('toRelatorioRows', () => {
  test('achata o resultado em linhas Secção/Campo/Valor', () => {
    const fake: EmailHunterResult = {
      email: 'user@example.com',
      smtp: { dominio: 'example.com', servidorMx: 'mail.example.com', estado: 'valido', detalhe: 'RCPT 250' },
      emailRep: {
        disponivel: false,
        reputacao: null,
        suspeito: null,
        referencias: null,
        blacklisted: null,
        atividadeMaliciosa: null,
        credenciaisExpostas: null,
        dataBreach: null,
        primeiraVista: null,
        ultimaVista: null,
        spf: null,
        dmarc: null,
        deliverable: null,
        freeProvider: null,
        disposable: null,
        perfis: [],
        mensagem: 'indisponível',
      },
      hudsonRock: {
        disponivel: true,
        encontrados: 1,
        registos: [{ data: '2023-01-01', stealer: 'RedLine', os: 'Windows', passwordParcial: 'hu*****', url: 'https://x.test' }],
      },
      breachCheck: {
        proxynova: { disponivel: true, total: 0, amostra: [] },
        hibp: { disponivel: true, breachesDominio: [] },
        linksManuais: [{ nome: 'HIBP', url: 'https://haveibeenpwned.com/account/user%40example.com' }],
      },
      gravatar: { encontrado: false, displayName: null, username: null, perfilUrl: null, avatarUrl: 'https://www.gravatar.com/avatar/x', bio: null, redes: [] },
      googleDorks: [{ descricao: 'Email exato', url: 'https://www.google.com/search?q=x' }],
      domainInfo: { dominio: 'example.com', ip: '1.2.3.4', proveedor: null, tipoProveedor: 'corporativo', registrar: 'Example Registrar', criado: '2010-01-01', expira: '2030-01-01' },
      elapsedMs: 123,
    }

    const rows = toRelatorioRows(fake)

    expect(rows).toEqual(
      expect.arrayContaining([
        { seccao: 'SMTP Verify', campo: 'Domínio', valor: 'example.com' },
        { seccao: 'EmailRep.io', campo: 'Mensagem', valor: 'indisponível' },
        { seccao: 'HudsonRock (Infostealers)', campo: 'Registo #1 — Senha (parcial)', valor: 'hu*****' },
        { seccao: 'Google Dorks', campo: 'Email exato', valor: 'https://www.google.com/search?q=x' },
        { seccao: 'Domínio', campo: 'Registrar', valor: 'Example Registrar' },
      ]),
    )
    // nenhuma linha deve conter a senha em claro
    expect(rows.every((r) => r.valor !== 'hunter2')).toBe(true)
  })
})
