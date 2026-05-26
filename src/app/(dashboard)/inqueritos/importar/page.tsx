import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { ImportarInqueritosView } from '@/components/inqueritos/importar-inqueritos-view'
import { AccessDenied } from '@/components/access-denied'
import type { Role } from '@/generated/prisma/enums'

export default async function ImportarInqueritosPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'inquerito:bulk:all')) {
    return (
      <AccessDenied
        message="Não dispões de privilégios para importar inquéritos."
        backHref="/inqueritos"
        backLabel="Voltar aos inquéritos"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar inquéritos</h1>
        <p className="text-muted-foreground text-sm">
          Faça upload de um CSV para criar inquéritos em massa. O sistema
          valida cada linha antes de comprometer qualquer alteração.
        </p>
      </div>
      <ImportarInqueritosView />
    </div>
  )
}
