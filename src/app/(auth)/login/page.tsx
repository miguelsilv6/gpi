'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useBrand, useBrandAssetUrl } from '@/components/brand-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { LOGIN_CAPTCHA_REQUIRED_AFTER } from '@/lib/constants'

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: {
        sitekey: string
        theme?: 'light' | 'dark' | 'auto'
        callback(token: string): void
        'expired-callback'?(): void
        'error-callback'?(): void
      }): string
      reset(widgetId: string): void
    }
  }
}

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Password obrigatória'),
})

type FormData = z.infer<typeof schema>

const CF_SITE_KEY = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY ?? ''

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const brand = useBrand()
  const { resolvedTheme } = useTheme()
  const lightLogo = useBrandAssetUrl('light')
  const darkLogo = useBrandAssetUrl('dark')
  // Hydration guard: ver sidebar-nav.tsx para detalhes.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const logo = mounted && resolvedTheme === 'dark' && darkLogo ? darkLogo : lightLogo

  const [failedAttempts, setFailedAttempts] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const showCaptcha = failedAttempts >= LOGIN_CAPTCHA_REQUIRED_AFTER && !!CF_SITE_KEY

  // Carrega e renderiza o widget Turnstile quando o threshold é atingido.
  // Usa flag `active` + cleanup para evitar race condition se o componente
  // for desmontado enquanto o script ainda está a carregar.
  useEffect(() => {
    if (!showCaptcha || !captchaRef.current) return

    let active = true
    let scriptElement: HTMLScriptElement | null = null

    function render() {
      if (!active || !captchaRef.current || !window.turnstile) return
      if (widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: CF_SITE_KEY,
        theme: 'auto',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
        'error-callback': () => setCaptchaToken(null),
      })
    }

    const existingScript = document.getElementById('cf-turnstile-js') as HTMLScriptElement | null

    if (window.turnstile) {
      render()
    } else if (existingScript) {
      // Script já no DOM mas ainda a carregar — regista listener
      scriptElement = existingScript
      scriptElement.addEventListener('load', render)
    } else {
      const s = document.createElement('script')
      s.id = 'cf-turnstile-js'
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = render
      document.head.appendChild(s)
      scriptElement = s
    }

    return () => {
      active = false
      if (scriptElement) {
        scriptElement.removeEventListener('load', render)
        if (scriptElement.onload === render) scriptElement.onload = null
      }
      widgetIdRef.current = null
    }
  }, [showCaptcha])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Só permite paths relativos — regex bloqueia //, /\ e \/ usados em bypasses
  const rawCallbackUrl = searchParams.get('callbackUrl') ?? ''
  const callbackUrl = /^\/(?!\/|\\)/.test(rawCallbackUrl) ? rawCallbackUrl : '/dashboard'

  async function onSubmit(data: FormData) {
    setError(null)
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      captchaToken: captchaToken ?? '',
      redirect: false,
    })

    if (result?.error) {
      setError('Email ou password incorretos.')
      setFailedAttempts((n) => n + 1)
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
        setCaptchaToken(null)
      }
      return
    }

    // Full page navigation garante que o cookie de sessão é enviado
    // na primeira request ao middleware (router.push pode criar race condition).
    window.location.href = callbackUrl
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className="flex justify-center mb-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-14 w-14 rounded-full object-contain" />
            ) : (
              <div className="bg-blue-600 p-3 rounded-full">
                <Shield className="h-8 w-8 text-white" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold">{brand.appName}</CardTitle>
          <CardDescription className="text-sm">{brand.appDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="utilizador@gpi.pt"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            {showCaptcha && (
              <div className="space-y-1">
                <div ref={captchaRef} className="flex justify-center" />
                {!captchaToken && (
                  <p className="text-xs text-muted-foreground text-center">
                    Conclua a verificação acima para continuar.
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || (showCaptcha && !captchaToken)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A entrar...
                </>
              ) : (
                'Entrar'
              )}
            </Button>

            <div className="text-center text-sm">
              <Link
                href="/password-reset"
                className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Esqueci a password
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
