import type { NextRequest } from 'next/server'

export function getClientIp(req: NextRequest | Request): string | null {
  const headers = 'headers' in req ? req.headers : null
  if (!headers) return null
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? null
}

export function getUserAgent(req: NextRequest | Request): string | null {
  return req.headers.get('user-agent') ?? null
}

export function getRequestInfo(req: NextRequest | Request) {
  return { ip: getClientIp(req), userAgent: getUserAgent(req) }
}
