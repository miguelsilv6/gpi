import type { NextConfig } from 'next'

/**
 * Headers de segurança aplicados a TODAS as rotas (HTML + API).
 *
 * - `Strict-Transport-Security` (HSTS): força TLS por 1 ano + subdomínios.
 * - `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`: anti-clickjacking.
 * - `X-Content-Type-Options: nosniff`: defesa contra polyglot files.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: evita vazar NUIPCs
 *   em URLs para domínios externos.
 * - `X-DNS-Prefetch-Control: off`: evita pré-resolução DNS de recursos externos.
 * - `Permissions-Policy`: nega features que a app não usa.
 *
 * A `Content-Security-Policy` das páginas HTML é definida no middleware
 * (src/middleware.ts) com um nonce por pedido — `script-src` deixou de usar
 * `'unsafe-inline'`. As respostas de API recebem uma CSP estática mínima
 * (`default-src 'none'`) abaixo, já que nunca renderizam recursos.
 */
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
    ].join(', '),
  },
]

const API_CACHE_HEADERS = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
  // Pragma + Expires: defence-in-depth for HTTP/1.0 proxies and misconfigured caches.
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
  // As respostas de API são JSON e nunca devem carregar recursos nem ser
  // enquadradas. CSP mínima e estática (o nonce só é necessário em HTML).
  { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // O CI já corre `npx tsc --noEmit` como step próprio antes de qualquer
    // merge para main (ver .github/workflows/ci.yml) — repetir o typecheck
    // do projeto inteiro aqui dentro do `next build` é redundante e é a
    // fase mais pesada em memória do build. Em servidores self-hosted com
    // RAM limitada (scripts/update.sh compila `app` + `worker` em
    // paralelo), essa fase chega a levar o OOM killer a matar o processo
    // (SIGKILL) mesmo com o build a compilar sem problemas.
    // `ignoreBuildErrors` salta por completo o type-checking do `next
    // build` (não corre e ignora — não corre mesmo, ver docs oficiais) —
    // seguro aqui porque a garantia de tipos já vem do CI antes do merge.
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      {
        // Respostas de API nunca devem ser cacheadas por proxies intermédios
        // — contêm dados sensíveis (inquéritos, utilizadores, etc.).
        source: '/api/:path*',
        headers: API_CACHE_HEADERS,
      },
    ]
  },
}

export default nextConfig
