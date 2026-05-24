'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
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

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Password obrigatória'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  async function onSubmit(data: FormData) {
    setError(null)
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    if (result?.error) {
      setError('Email ou password incorretos.')
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
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
