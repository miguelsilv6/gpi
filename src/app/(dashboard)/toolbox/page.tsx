import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { ToolboxView } from '@/components/toolbox/toolbox-view'
import { Wrench } from 'lucide-react'
import type { Role } from '@/generated/prisma/enums'

export default async function ToolboxPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  const moduloAtivo = await isModuloToolboxAtivo(role)
  if (!moduloAtivo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground">
          <Wrench className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Módulo desativado</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          A Toolbox está desativada. Contacte o administrador do sistema para mais informações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Toolbox</h1>
        <p className="text-muted-foreground text-sm">
          Ferramentas OSINT de apoio à investigação: IPs, DNS, domínios e o seu histórico — com a fonte consultada sempre identificada.
        </p>
      </div>
      <ToolboxView />
    </div>
  )
}
