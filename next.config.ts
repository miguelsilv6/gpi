import type { NextConfig } from 'next'

/**
 * Headers de segurança aplicados a TODAS as rotas (HTML + API).
 *
 * - `Strict-Transport-Security` (HSTS): força TLS por 1 ano + subdomínios.
 *   Inócuo em HTTP local (o browser ignora). Crítico em produção atrás
 *   de proxy TLS.
 * - `X-Frame-Options: DENY`: impede embedding em iframe (clickjacking).
 *   CSP `frame-ancestors 'none'` é o substituto moderno mas mantemos
 *   ambos para máxima compat.
 * - `X-Content-Type-Options: nosniff`: o browser não tenta inferir
 *   MIME types — defesa em profundidade contra polyglot files.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: evita vazar
 *   paths internos (NUIPCs em URLs) em referrers para domínios externos.
 * - `Permissions-Policy`: nega features que a app não usa.
 * - `Content-Security-Policy`: politica conservadora mas funcional.
 *   `'unsafe-inline' 'unsafe-eval'` em script-src são necessários pelo
 *   Next.js (inline bootstrap + hydration). Quando passarmos para
 *   nonces (App Router suporta via middleware), apertar isto.
 */
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
      // script-src: Next.js precisa de inline para o RSC bootstrap. unsafe-eval
      // só é necessário em dev (HMR). Em produção podia ser apertado.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Restringir conexões a self (impede SSRF do client + leaks).
      "connect-src 'self'",
      // PDFs renderizados por @react-pdf são servidos pela própria app
      // como application/pdf — não precisam de cross-origin.
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        // Aplica a todas as rotas. Rotas API podem ser excluídas via
        // outro objecto se algum endpoint precisar de CORS, mas hoje
        // toda a API é same-origin.
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
