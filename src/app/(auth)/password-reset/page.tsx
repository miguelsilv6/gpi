'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2, ArrowLeft, MailCheck } from 'lucide-react'
import { useBrand } from '@/components/brand-provider'

const schema = z.object({
  email: z.string().email('Email inválido'),
})

type FormData = z.infer<typeof schema>

/**
 * Página de pedido de reset. Submete email; o servidor responde sempre
 * com 200 (não revela se o email existe). UI mostra sempre a mesma
 * mensagem de sucesso — defesa contra enumeração.
 */
export default function PasswordResetRequestPage() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const brand = useBrand()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setError(null)
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      })
      if (res.status === 429) {
        setError(
          'Demasiados pedidos. Aguarda alguns minutos antes de tentar de novo.',
        )
        return
      }
      // 200 — sempre. Não importa se o email existe ou não.
      setSubmitted(true)
    } catch {
      setError('Erro de rede. Tenta novamente.')
    }
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
          <CardTitle className="text-2xl font-bold">Redefinir password</CardTitle>
          <CardDescription className="text-sm">
            {submitted
              ? `Se o email estiver associado a uma conta ${brand.appName}, vais receber um link para redefinir.`
              : 'Indica o teu email — enviamos um link para definir uma nova password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 p-4 rounded-md">
                <MailCheck className="h-5 w-5" />
                <span className="text-sm">Pedido recebido.</span>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                O link expira em 1 hora. Verifica também a pasta de spam.
              </p>
              <Link
                href="/login"
                className="text-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar ao login
              </Link>
            </div>
          ) : (
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

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    A enviar...
                  </>
                ) : (
                  'Enviar link de redefinição'
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
