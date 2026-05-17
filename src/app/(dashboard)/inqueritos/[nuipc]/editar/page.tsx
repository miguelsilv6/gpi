import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { InqueritoForm } from '@/components/inqueritos/inquerito-form'
import { listEstados } from '@/lib/estados'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { slugToNuipc, nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export default async function EditarInqueritoPage({
  params,
}: {
  params: Promise<{ nuipc: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { nuipc: slug } = await params
  const nuipc = slugToNuipc(slug)
  const role = session.user.role as Role
  const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  const inquerito = await prisma.inquerito.findFirst({
    where: { nuipc, ...roleWhere },
  })

  if (!inquerito) notFound()

  const canEdit =
    (role === 'INSPETOR' && inquerito.inspetorId === session.user.id) ||
    (role === 'INSPETOR_CHEFE' && inquerito.brigadaId === session.user.brigadaId) ||
    hasPermission(role, 'inquerito:edit:all')

  if (!canEdit) redirect(`/inqueritos/${nuipcToSlug(nuipc)}`)

  const [brigadas, inspetores, estados] = await Promise.all([
    prisma.brigada.findMany({
      where: { ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.utilizador.findMany({
      where: { role: 'INSPETOR', ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, brigadaId: true },
    }),
    listEstados({ onlyActive: true }),
  ])

  const formatForInput = (d: Date | null) =>
    d ? format(d, 'yyyy-MM-dd') : undefined

  const inqSlug = nuipcToSlug(inquerito.nuipc)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/inqueritos/${inqSlug}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {inquerito.nuipc}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Editar Inquérito</h1>
        <p className="text-muted-foreground text-sm font-mono">{inquerito.nuipc}</p>
      </div>

      <InqueritoForm
        mode="edit"
        nuipcOriginal={nuipc}
        brigadas={brigadas}
        inspetores={inspetores}
        estados={estados}
        defaultValues={{
          nuipc: inquerito.nuipc,
          natureza: inquerito.natureza,
          estadoId: inquerito.estadoId,
          faseProcessual: inquerito.faseProcessual,
          dataAbertura: format(inquerito.dataAbertura, 'yyyy-MM-dd'),
          dataPrazo: formatForInput(inquerito.dataPrazo),
          dataConclusao: formatForInput(inquerito.dataConclusao),
          notas: inquerito.notas ?? undefined,
          brigadaId: inquerito.brigadaId,
          inspetorId: inquerito.inspetorId ?? undefined,
        }}
      />
    </div>
  )
}
