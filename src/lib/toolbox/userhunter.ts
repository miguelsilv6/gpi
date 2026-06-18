/**
 * Pesquisa de username em 70+ plataformas públicas (username enumeration /
 * OSINT). Lista de plataformas e heurísticas de deteção adaptadas do projeto
 * open-source cb-userhunter (ciberbrigada, MIT) — cada site é verificado por
 * presença/ausência de texto numa página pública, sem autenticação.
 *
 * As heurísticas dependem do HTML/JSON atual de cada site e podem deixar de
 * funcionar quando o site muda a sua página de erro — isto é uma limitação
 * inerente à técnica, não um bug a corrigir aqui.
 */

export const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/

const HEADERS_DEFAULT: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
}

const HEADERS_API: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'X-Requested-With': 'XMLHttpRequest',
}

const CAT = {
  REDES: 'Redes Sociais',
  TECH: 'Programação / Tecnologia',
  GAMING: 'Jogos',
  MUSICA: 'Música / Criadores de Conteúdo',
  FOTO: 'Fotografia / Design',
  CYBER: 'Cibersegurança',
  CRYPTO: 'Criptomoeda / Finanças',
  TRABALHO: 'Profissional',
  COMUNIDADE: 'Comunidades / Fóruns',
  OUTROS: 'Outros',
} as const

interface PlatformDef {
  name: string
  categoria: string
  url: string
  detect: string
  headers?: Record<string, string>
  fallbackUrl?: string
  fallbackDetect?: string
}

export const PLATFORMS: PlatformDef[] = [
  // Redes Sociais
  {
    name: 'Instagram',
    categoria: CAT.REDES,
    url: 'https://www.instagram.com/{}/?__a=1&__d=dis',
    detect: 'not_contains:"user":null',
    headers: { ...HEADERS_API, 'X-IG-App-ID': '936619743392459' },
    fallbackUrl: 'https://www.instagram.com/{}/',
    fallbackDetect: 'not_contains:Page Not Found',
  },
  { name: 'Twitter/X', categoria: CAT.REDES, url: 'https://x.com/{}', detect: "not_contains:This account doesn't exist" },
  { name: 'TikTok', categoria: CAT.REDES, url: 'https://www.tiktok.com/@{}', detect: "not_contains:Couldn't find this account" },
  { name: 'Facebook', categoria: CAT.REDES, url: 'https://www.facebook.com/{}', detect: 'not_contains:Page Not Found' },
  { name: 'LinkedIn', categoria: CAT.REDES, url: 'https://www.linkedin.com/in/{}', detect: 'not_contains:Page not found' },
  { name: 'Pinterest', categoria: CAT.REDES, url: 'https://www.pinterest.com/{}/', detect: 'not_contains:User not found' },
  { name: 'Snapchat', categoria: CAT.REDES, url: 'https://www.snapchat.com/add/{}', detect: "not_contains:Sorry, we couldn't find" },
  { name: 'Tumblr', categoria: CAT.REDES, url: 'https://{}.tumblr.com', detect: "not_contains:There's nothing here" },
  {
    name: 'Reddit',
    categoria: CAT.REDES,
    url: 'https://www.reddit.com/user/{}/about.json',
    detect: 'contains:"name"',
    headers: { ...HEADERS_DEFAULT, Accept: 'application/json' },
  },
  { name: 'VK', categoria: CAT.REDES, url: 'https://vk.com/{}', detect: 'not_contains:This page does not exist' },
  { name: 'Mastodon', categoria: CAT.REDES, url: 'https://mastodon.social/@{}', detect: 'not_contains:The page you are looking for' },
  { name: 'Threads', categoria: CAT.REDES, url: 'https://www.threads.net/@{}', detect: 'not_contains:Page Not Found' },
  { name: 'Bluesky', categoria: CAT.REDES, url: 'https://bsky.app/profile/{}', detect: 'not_contains:Profile not found' },

  // Programação / Tecnologia
  {
    name: 'GitHub',
    categoria: CAT.TECH,
    url: 'https://api.github.com/users/{}',
    detect: 'contains:"login"',
    headers: { ...HEADERS_DEFAULT, Accept: 'application/vnd.github.v3+json' },
  },
  { name: 'GitLab', categoria: CAT.TECH, url: 'https://gitlab.com/{}', detect: 'not_contains:404' },
  { name: 'Bitbucket', categoria: CAT.TECH, url: 'https://bitbucket.org/{}', detect: 'not_contains:Page not found' },
  { name: 'HackerNews', categoria: CAT.TECH, url: 'https://hacker-news.firebaseio.com/v0/user/{}.json', detect: 'contains:"id"' },
  {
    name: 'Dev.to',
    categoria: CAT.TECH,
    url: 'https://dev.to/api/users/by_username?url={}',
    detect: 'contains:"username"',
    headers: { ...HEADERS_DEFAULT, Accept: 'application/json' },
  },
  { name: 'Replit', categoria: CAT.TECH, url: 'https://replit.com/@{}', detect: "not_contains:page doesn't exist" },
  { name: 'Kaggle', categoria: CAT.TECH, url: 'https://www.kaggle.com/{}', detect: 'not_contains:No user found' },
  { name: 'Codepen', categoria: CAT.TECH, url: 'https://codepen.io/{}', detect: 'not_contains:404' },
  { name: 'Pastebin', categoria: CAT.TECH, url: 'https://pastebin.com/u/{}', detect: 'not_contains:Not Found' },
  { name: 'NPM', categoria: CAT.TECH, url: 'https://registry.npmjs.org/~{}', detect: 'status_200' },
  { name: 'PyPI', categoria: CAT.TECH, url: 'https://pypi.org/user/{}/', detect: 'not_contains:404' },
  {
    name: 'Dockerhub',
    categoria: CAT.TECH,
    url: 'https://hub.docker.com/v2/users/{}',
    detect: 'contains:"username"',
    headers: { ...HEADERS_DEFAULT, Accept: 'application/json' },
  },
  { name: 'StackOverflow', categoria: CAT.TECH, url: 'https://api.stackexchange.com/2.3/users?inname={}&site=stackoverflow', detect: 'json_nonempty:items' },

  // Jogos
  { name: 'Steam', categoria: CAT.GAMING, url: 'https://steamcommunity.com/id/{}', detect: 'not_contains:The specified profile could not be found' },
  { name: 'PSN', categoria: CAT.GAMING, url: 'https://psnprofiles.com/{}', detect: 'not_contains:User Not Found' },
  { name: 'Roblox', categoria: CAT.GAMING, url: 'https://api.roblox.com/users/get-by-username?username={}', detect: 'contains:"Id"' },
  { name: 'Chess.com', categoria: CAT.GAMING, url: 'https://api.chess.com/pub/player/{}', detect: 'contains:"username"' },
  { name: 'Minecraft', categoria: CAT.GAMING, url: 'https://api.mojang.com/users/profiles/minecraft/{}', detect: 'contains:"name"' },
  { name: 'Speedrun', categoria: CAT.GAMING, url: 'https://www.speedrun.com/api/v1/users/{}', detect: 'contains:"data"' },
  { name: 'Fortnite', categoria: CAT.GAMING, url: 'https://fortnitetracker.com/profile/all/{}', detect: 'not_contains:We could not find' },

  // Música / Criadores de Conteúdo
  { name: 'SoundCloud', categoria: CAT.MUSICA, url: 'https://soundcloud.com/{}', detect: "not_contains:We can't find that user" },
  { name: 'Bandcamp', categoria: CAT.MUSICA, url: 'https://{}.bandcamp.com', detect: 'not_contains:Sorry, that something' },
  { name: 'Last.fm', categoria: CAT.MUSICA, url: 'https://www.last.fm/user/{}', detect: 'not_contains:User not found' },
  { name: 'Mixcloud', categoria: CAT.MUSICA, url: 'https://api.mixcloud.com/{}/', detect: 'contains:"username"' },
  { name: 'Spotify', categoria: CAT.MUSICA, url: 'https://open.spotify.com/user/{}', detect: 'not_contains:Page not found' },
  { name: 'YouTube', categoria: CAT.MUSICA, url: 'https://www.youtube.com/@{}', detect: 'not_contains:channel/about' },
  { name: 'Twitch', categoria: CAT.MUSICA, url: 'https://www.twitch.tv/{}', detect: "not_contains:Sorry. Unless you've got a time machine" },
  { name: 'Kick', categoria: CAT.MUSICA, url: 'https://kick.com/{}', detect: 'not_contains:404' },
  { name: 'Vimeo', categoria: CAT.MUSICA, url: 'https://vimeo.com/{}', detect: "not_contains:Sorry, we couldn't find" },
  { name: 'Rumble', categoria: CAT.MUSICA, url: 'https://rumble.com/user/{}', detect: 'not_contains:Page Not Found' },
  { name: 'Patreon', categoria: CAT.MUSICA, url: 'https://www.patreon.com/{}', detect: "not_contains:page you're looking for" },
  { name: 'Ko-fi', categoria: CAT.MUSICA, url: 'https://ko-fi.com/{}', detect: 'not_contains:Page Not Found' },

  // Fotografia / Design
  { name: 'Flickr', categoria: CAT.FOTO, url: 'https://www.flickr.com/people/{}', detect: 'not_contains:Page Not Found' },
  { name: 'Behance', categoria: CAT.FOTO, url: 'https://www.behance.net/{}', detect: 'not_contains:page not found' },
  { name: 'Dribbble', categoria: CAT.FOTO, url: 'https://dribbble.com/{}', detect: 'not_contains:Whoops' },
  { name: 'DeviantArt', categoria: CAT.FOTO, url: 'https://www.deviantart.com/{}', detect: 'not_contains:page not found' },
  { name: 'ArtStation', categoria: CAT.FOTO, url: 'https://www.artstation.com/{}', detect: 'not_contains:Page not found' },

  // Comunidades / Fóruns
  { name: 'Quora', categoria: CAT.COMUNIDADE, url: 'https://www.quora.com/profile/{}', detect: 'not_contains:Page Not Found' },
  { name: 'Medium', categoria: CAT.COMUNIDADE, url: 'https://medium.com/@{}', detect: 'not_contains:Page not found' },
  { name: 'Substack', categoria: CAT.COMUNIDADE, url: 'https://substack.com/@{}', detect: 'not_contains:not found' },
  { name: 'Wordpress', categoria: CAT.COMUNIDADE, url: 'https://{}.wordpress.com', detect: "not_contains:doesn't exist" },
  { name: 'Goodreads', categoria: CAT.COMUNIDADE, url: 'https://www.goodreads.com/{}', detect: 'not_contains:Page not found' },
  { name: 'Letterboxd', categoria: CAT.COMUNIDADE, url: 'https://letterboxd.com/{}', detect: "not_contains:Sorry, we can't find" },
  { name: 'Strava', categoria: CAT.COMUNIDADE, url: 'https://www.strava.com/athletes/{}', detect: 'not_contains:Page Not Found' },

  // Cibersegurança
  { name: 'HackTheBox', categoria: CAT.CYBER, url: 'https://www.hackthebox.com/api/v4/user/profile/basic/{}', detect: 'contains:"profile"' },
  { name: 'TryHackMe', categoria: CAT.CYBER, url: 'https://tryhackme.com/api/user/exist/{}', detect: 'contains:true' },
  { name: 'BugCrowd', categoria: CAT.CYBER, url: 'https://bugcrowd.com/{}', detect: 'not_contains:The page you were looking for' },
  { name: 'HackerOne', categoria: CAT.CYBER, url: 'https://hackerone.com/{}', detect: 'not_contains:Page not found' },

  // Criptomoeda / Finanças
  { name: 'Keybase', categoria: CAT.CRYPTO, url: 'https://keybase.io/_/api/1.0/user/lookup.json?username={}', detect: 'json_nonempty:them' },
  { name: 'CoinMarketCap', categoria: CAT.CRYPTO, url: 'https://coinmarketcap.com/community/profile/{}/', detect: 'not_contains:Page not found' },
  { name: 'Cashapp', categoria: CAT.CRYPTO, url: 'https://cash.app/${}', detect: 'not_contains:Page Not Found' },

  // Profissional
  { name: 'ProductHunt', categoria: CAT.TRABALHO, url: 'https://www.producthunt.com/@{}', detect: 'not_contains:Page not found' },
  { name: 'Fiverr', categoria: CAT.TRABALHO, url: 'https://www.fiverr.com/{}', detect: 'not_contains:Page Not Found' },

  // Outros
  { name: 'Telegram', categoria: CAT.OUTROS, url: 'https://t.me/{}', detect: 'not_contains:If you have Telegram' },
  { name: 'Gravatar', categoria: CAT.OUTROS, url: 'https://en.gravatar.com/{}', detect: 'not_contains:404' },
  { name: 'About.me', categoria: CAT.OUTROS, url: 'https://about.me/{}', detect: "not_contains:page doesn't exist" },
  { name: 'Linktree', categoria: CAT.OUTROS, url: 'https://linktr.ee/{}', detect: 'not_contains:Sorry' },
]

export interface FoundPlatform {
  name: string
  categoria: string
  url: string
  status: number
}

function buildUrl(template: string, username: string): string {
  return template.replace('{}', username)
}

async function fetchText(url: string, headers: Record<string, string>, timeoutMs: number) {
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  let text = ''
  try {
    text = await res.text()
  } catch {
    // corpo não decodificável (binário) — tratar como vazio
  }
  return { status: res.status, text }
}

async function checkPlatform(platform: PlatformDef, username: string): Promise<FoundPlatform | null> {
  const url = buildUrl(platform.url, username)
  const headers = platform.headers ?? HEADERS_DEFAULT

  try {
    const { status, text } = await fetchText(url, headers, 8_000)
    const body = text.toLowerCase()

    if (platform.detect === 'status_200') {
      return status === 200 ? { name: platform.name, categoria: platform.categoria, url, status } : null
    }

    if (platform.detect.startsWith('contains:')) {
      const needle = platform.detect.slice('contains:'.length).toLowerCase()
      return status === 200 && body.includes(needle)
        ? { name: platform.name, categoria: platform.categoria, url, status }
        : null
    }

    if (platform.detect.startsWith('json_nonempty:')) {
      // A chave existe na resposta mesmo sem resultados (ex.: "items":[]) —
      // só conta como encontrado se o array tiver pelo menos um elemento.
      const key = platform.detect.slice('json_nonempty:'.length)
      if (status !== 200) return null
      try {
        const data = JSON.parse(text) as Record<string, unknown>
        if (Array.isArray(data[key]) && (data[key] as unknown[]).length > 0) {
          return { name: platform.name, categoria: platform.categoria, url, status }
        }
      } catch {
        // corpo não é JSON válido — sem perfil detetado
      }
      return null
    }

    if (platform.detect.startsWith('not_contains:')) {
      const needle = platform.detect.slice('not_contains:'.length).toLowerCase()
      if (status === 200 && !body.includes(needle) && text.length > 200) {
        return { name: platform.name, categoria: platform.categoria, url, status }
      }
      if (platform.fallbackUrl) {
        try {
          const fbUrl = buildUrl(platform.fallbackUrl, username)
          const fb = await fetchText(fbUrl, HEADERS_DEFAULT, 6_000)
          const fbDetect = platform.fallbackDetect ?? 'status_200'
          if (fbDetect.startsWith('not_contains:')) {
            const fbNeedle = fbDetect.slice('not_contains:'.length).toLowerCase()
            if (fb.status === 200 && !fb.text.toLowerCase().includes(fbNeedle) && fb.text.length > 200) {
              return { name: platform.name, categoria: platform.categoria, url: fbUrl, status: fb.status }
            }
          }
        } catch {
          // fallback falhou — sem perfil detetado
        }
      }
      return null
    }

    return null
  } catch {
    // timeout, DNS, TLS, etc. — site indisponível, não é "não encontrado" mas tratamos como tal
    return null
  }
}

/** Corre `fn` sobre `items` com um número máximo de execuções em paralelo. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface UserHunterSearchResult {
  encontrados: FoundPlatform[]
  plataformasAnalisadas: number
  elapsedMs: number
}

/** Verifica a presença de `username` em todas as plataformas, 20 em paralelo. */
export async function searchUsername(username: string): Promise<UserHunterSearchResult> {
  const start = Date.now()
  const settled = await mapWithConcurrency(PLATFORMS, 20, (p) => checkPlatform(p, username))
  const encontrados = settled.filter((r): r is FoundPlatform => r !== null)
  return { encontrados, plataformasAnalisadas: PLATFORMS.length, elapsedMs: Date.now() - start }
}
