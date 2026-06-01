import { handlers } from '@/auth'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { NextRequest } from 'next/server'

const { GET, POST: nextAuthPost } = handlers

// Apply per-IP rate limiting to the credentials sign-in callback only.
// Per-account lockout (LOGIN_MAX_FAILED_ATTEMPTS) still applies in authorize().
async function POST(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/auth/callback/credentials') {
    const limited = enforceRateLimit({
      key: `login:ip:${clientFingerprint(req)}`,
      ...RATE_LIMITS.LOGIN_PER_IP,
    })
    if (limited) return limited
  }
  return nextAuthPost(req)
}

export { GET, POST }
