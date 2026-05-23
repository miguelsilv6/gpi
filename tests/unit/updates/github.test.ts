import { describe, test, expect } from 'vitest'
import {
  parseSemver,
  compareSemver,
  isNewerVersion,
  fetchLatestRelease,
} from '@/lib/updates/github'

describe('parseSemver', () => {
  test('aceita formato canónico', () => {
    expect(parseSemver('0.1.0')).toEqual([0, 1, 0])
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3])
    expect(parseSemver('12.34.56')).toEqual([12, 34, 56])
  })

  test('aceita prefixo v', () => {
    expect(parseSemver('v0.1.0')).toEqual([0, 1, 0])
    expect(parseSemver('v10.20.30')).toEqual([10, 20, 30])
  })

  test('rejeita formatos inválidos', () => {
    expect(parseSemver('')).toBeNull()
    expect(parseSemver('1.0')).toBeNull()
    expect(parseSemver('1.0.0-rc1')).toBeNull()
    expect(parseSemver('abc')).toBeNull()
    expect(parseSemver('main')).toBeNull()
  })
})

describe('compareSemver', () => {
  test('compara major / minor / patch corretamente', () => {
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareSemver('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareSemver('0.1.10', '0.1.2')).toBeGreaterThan(0)
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0)
    expect(compareSemver('0.1.0', '0.2.0')).toBeLessThan(0)
  })

  test('lida com prefixo v dos dois lados', () => {
    expect(compareSemver('v1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareSemver('v1.0.0', 'v1.0.0')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  test('detecta upgrade', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  })

  test('rejeita downgrade e igualdade', () => {
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
  })

  test('safe default false em tags inválidas', () => {
    expect(isNewerVersion('foo', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', 'foo')).toBe(false)
  })
})

describe('fetchLatestRelease', () => {
  function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    return async () =>
      ({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
      } as unknown as Response)
  }

  test('extrai tag, url e notes da resposta GitHub', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/x/y/releases/tag/v0.2.0',
        body: '## Changes\n- foo\n- bar',
        published_at: '2026-05-23T10:00:00Z',
      }) as typeof fetch,
    })
    expect(r).not.toBeNull()
    expect(r!.tag).toBe('0.2.0')
    expect(r!.rawTag).toBe('v0.2.0')
    expect(r!.url).toContain('v0.2.0')
    expect(r!.notes).toContain('## Changes')
  })

  test('ignora prereleases', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({
        tag_name: 'v0.2.0-rc1',
        prerelease: true,
      }) as typeof fetch,
    })
    expect(r).toBeNull()
  })

  test('ignora drafts', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({
        tag_name: 'v0.2.0',
        draft: true,
      }) as typeof fetch,
    })
    expect(r).toBeNull()
  })

  test('ignora tags não-semver', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({
        tag_name: 'release-2026-05',
      }) as typeof fetch,
    })
    expect(r).toBeNull()
  })

  test('devolve null em erro HTTP', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({}, { ok: false, status: 403 }) as typeof fetch,
    })
    expect(r).toBeNull()
  })

  test('devolve null em falha de rede', async () => {
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch,
    })
    expect(r).toBeNull()
  })

  test('trunca notes longas', async () => {
    const long = 'x'.repeat(10_000)
    const r = await fetchLatestRelease({
      apiUrl: 'http://stub',
      fetchImpl: mockFetch({
        tag_name: 'v0.2.0',
        body: long,
      }) as typeof fetch,
    })
    expect(r!.notes.length).toBeLessThan(long.length)
    expect(r!.notes.endsWith('…')).toBe(true)
  })
})
