import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

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
 * - `Content-Security-Policy`: `unsafe-eval` removido em produção (só necessário
 *   em dev para HMR). `unsafe-inline` mantido para o RSC bootstrap do Next.js.
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
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // unsafe-eval removido em produção. Dev ainda precisa para HMR.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const API_CACHE_HEADERS = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
  // Pragma + Expires: defence-in-depth for HTTP/1.0 proxies and misconfigured caches.
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
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
