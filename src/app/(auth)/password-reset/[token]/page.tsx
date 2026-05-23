'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useBrand } from '@/components/brand-provider'

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password tem de ter pelo menos 8 caracteres')
      .max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'As passwords não coincidem',
    path: ['confirm'],
  })

type FormData = z.infer<typeof schema>

/**
 * Página de confirmação do reset. O `token` vem do path; a UI submete
 * token + password para `/api/auth/password-reset/confirm`. Em sucesso
 * redireciona para login (a sessão actual fica invalidada pelo bump do
 * tokenVersion no servidor).
 */
export default function PasswordResetConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const brand = useBrand()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const res = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: data.password }),
    })

    if (res.status === 429) {
      setServerError(
        'Demasiadas tentativas. Aguarda alguns minutos antes de tentar de novo.',
      )
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setServerError(body.error ?? 'Pedido inválido ou expirado.')
      return
    }
    setSuccess(true)
    // Redireciona para login após 3s
    setTimeout(() => router.push('/login'), 3000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Nova password</CardTitle>
          <CardDescription className="text-sm">
            {success
              ? 'Password redefinida. A redirecionar para o login…'
              : `Define a nova password da tua conta ${brand.appName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 p-4 rounded-md">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm">Sucesso — vai entrar com a nova password.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirma a nova password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirm')}
                />
                {errors.confirm && (
                  <p className="text-sm text-red-600">{errors.confirm.message}</p>
                )}
              </div>

              {serverError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">
                  {serverError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    A redefinir...
                  </>
                ) : (
                  'Redefinir password'
                )}
              </Button>

              <Link
                href="/login"
                className="text-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar ao login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
