import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { isModuloBugReportsAtivo } from '@/lib/bugreports-module'
import { AccessDenied } from '@/components/access-denied'
import { BugReportForm } from '@/components/bug-reports/bug-report-form'
import type { Role } from '@/generated/prisma/enums'
import { Bug } from 'lucide-react'

export default async function ReportarBugPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'bugreport:create')) {
    return <AccessDenied message="Não dispões de privilégios para reportar bugs." />
  }

  const moduloAtivo = await isModuloBugReportsAtivo(role)
  if (!moduloAtivo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground">
          <Bug className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Módulo desativado</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          O reporte de bugs está desativado. Contacte o administrador do sistema para mais informações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportar Bug</h1>
        <p className="text-muted-foreground text-sm">
          Descreva o problema que encontrou. O administrador será notificado e poderá analisá-lo.
        </p>
      </div>
      <BugReportForm />
    </div>
  )
}
