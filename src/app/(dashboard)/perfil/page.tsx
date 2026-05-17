'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, User, Shield, Building2, KeyRound } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

const profileSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
})

const passwordSchema = z.object({
  passwordAtual: z.string().min(1, 'Obrigatório'),
  passwordNova: z.string().min(8, 'Mínimo 8 caracteres'),
  passwordConfirmar: z.string().min(1, 'Obrigatório'),
}).refine((d) => d.passwordNova === d.passwordConfirmar, {
  message: 'As passwords não coincidem',
  path: ['passwordConfirmar'],
})

type ProfileData = z.infer<typeof profileSchema>
type PasswordData = z.infer<typeof passwordSchema>

interface UserProfile {
  id: string
  nome: string
  email: string
  role: Role
  brigada: { id: string; nome: string } | null
}

export default function PerfilPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const profileForm = useForm<ProfileData>({ resolver: zodResolver(profileSchema) })
  const passwordForm = useForm<PasswordData>({ resolver: zodResolver(passwordSchema) })

  useUnsavedChangesWarning(
    (profileForm.formState.isDirty && !profileForm.formState.isSubmitting && !profileForm.formState.isSubmitSuccessful) ||
      (passwordForm.formState.isDirty && !passwordForm.formState.isSubmitting && !passwordForm.formState.isSubmitSuccessful),
  )

  useEffect(() => {
    fetch('/api/perfil')
      .then((r) => r.json())
      .then((data) => {
        setUser(data)
        profileForm.reset({ nome: data.nome, email: data.email })
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar perfil')
        setLoading(false)
      })
  }, [profileForm])

  async function onProfileSubmit(data: ProfileData) {
    const res = await fetch('/api/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao actualizar perfil')
      return
    }
    const updated = await res.json()
    setUser((prev) => prev ? { ...prev, ...updated } : prev)
    toast.success('Perfil actualizado')
  }

  async function onPasswordSubmit(data: PasswordData) {
    const res = await fetch('/api/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordAtual: data.passwordAtual, passwordNova: data.passwordNova }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao alterar password')
      return
    }
    toast.success('Password alterada com sucesso')
    passwordForm.reset()
  }

  if (loading) return <div className="text-muted-foreground text-sm">A carregar...</div>
  if (!user) return null

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
        <p className="text-muted-foreground text-sm">Gerir as suas informações pessoais</p>
      </div>

      {/* Role & Brigade info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Perfil</span>
            <span className="font-medium">{ROLE_LABELS[user.role]}</span>
          </div>
          {user.brigada && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> Brigada
              </span>
              <span className="font-medium">{user.brigada.nome}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile info edit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <User className="h-4 w-4" />
            Informações pessoais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" {...profileForm.register('nome')} />
              {profileForm.formState.errors.nome && (
                <p className="text-xs text-red-600">{profileForm.formState.errors.nome.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...profileForm.register('email')} />
              {profileForm.formState.errors.email && (
                <p className="text-xs text-red-600">{profileForm.formState.errors.email.message}</p>
              )}
            </div>
            <Button type="submit" disabled={profileForm.formState.isSubmitting} size="sm">
              {profileForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Alterar password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="passwordAtual">Password atual</Label>
              <Input id="passwordAtual" type="password" {...passwordForm.register('passwordAtual')} />
              {passwordForm.formState.errors.passwordAtual && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordAtual.message}</p>
              )}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="passwordNova">Nova password</Label>
              <Input id="passwordNova" type="password" {...passwordForm.register('passwordNova')} />
              {passwordForm.formState.errors.passwordNova && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordNova.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirmar">Confirmar nova password</Label>
              <Input id="passwordConfirmar" type="password" {...passwordForm.register('passwordConfirmar')} />
              {passwordForm.formState.errors.passwordConfirmar && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordConfirmar.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordForm.formState.isSubmitting} size="sm" variant="outline">
              {passwordForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
