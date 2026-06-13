/**
 * Verificação server-side do Cloudflare Turnstile.
 * Se CF_TURNSTILE_SECRET_KEY não estiver definido, a verificação é ignorada
 * (degradação graciosa para instâncias sem CAPTCHA configurado).
 */
export async function verifyCaptcha(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY
  if (!secret) return true

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(5_000),
    })
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch (error) {
    console.error('Erro ao verificar CAPTCHA Turnstile:', error)
    return false
  }
}
