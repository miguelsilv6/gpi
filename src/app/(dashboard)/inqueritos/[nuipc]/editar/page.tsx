import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { InqueritoForm } from '@/components/inqueritos/inquerito-form'
import { listEstados } from '@/lib/estados'
import { listEtiquetasByOwner } from '@/lib/etiquetas'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { AccessDenied } from '@/components/access-denied'
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
    include: { etiquetas: { select: { id: true, nome: true } } },
  })

  if (!inquerito) {
    const existsOutsideScope = await prisma.inquerito.findFirst({
      where: { nuipc, deletedAt: null },
      select: { id: true, brigadaId: true },
    })
    if (existsOutsideScope) {
      const isSameBrigada = session.user.brigadaId && existsOutsideScope.brigadaId === session.user.brigadaId
      const message = isSameBrigada
        ? 'Este inquérito pertence à tua brigada, mas está atribuído a outro inspetor.'
        : 'Este inquérito pertence a outra brigada — não dispões de privilégios para o consultar.'
      return (
        <AccessDenied
          title="Inquérito fora do teu âmbito"
          message={message}
          backHref="/inqueritos"
          backLabel="Voltar aos inquéritos"
        />
      )
    }
    notFound()
  }

  const canEdit =
    (role === 'INSPETOR' && inquerito.inspetorId === session.user.id) ||
    (role === 'INSPETOR_CHEFE' && inquerito.brigadaId === session.user.brigadaId) ||
    hasPermission(role, 'inquerito:edit:all')

  if (!canEdit) {
    return (
      <AccessDenied
        title="Edição não permitida"
        message="Podes consultar este inquérito, mas não dispões de privilégios para o editar."
        backHref={`/inqueritos/${nuipcToSlug(nuipc)}`}
        backLabel="Ver inquérito"
      />
    )
  }

  const [brigadas, inspetores, estados, crimes, etiquetasDisponiveis] = await Promise.all([
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
    prisma.crime.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, ativo: true },
    }),
    listEtiquetasByOwner(session.user.id),
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
        crimes={crimes}
        etiquetasDisponiveis={etiquetasDisponiveis}
        etiquetasAtribuidas={inquerito.etiquetas}
        defaultValues={{
          nuipc: inquerito.nuipc,
          etiquetaIds: inquerito.etiquetas.map((e) => e.id),
          nai: inquerito.nai ?? undefined,
          crimeId: inquerito.crimeId ?? '',
          estadoId: inquerito.estadoId,
          dataAbertura: format(inquerito.dataAbertura, 'yyyy-MM-dd'),
          dataPrazo: formatForInput(inquerito.dataPrazo),
          dataConclusao: formatForInput(inquerito.dataConclusao),
          notas: inquerito.notas ?? undefined,
          brigadaId: inquerito.brigadaId ?? undefined,
          inspetorId: inquerito.inspetorId ?? undefined,
          tribunal: inquerito.tribunal ?? undefined,
          procurador: inquerito.procurador ?? undefined,
          oficialJustica: inquerito.oficialJustica ?? undefined,
          voip: inquerito.voip ?? undefined,
          notasTribunal: inquerito.notasTribunal ?? undefined,
          denuncianteNome: inquerito.denuncianteNome ?? undefined,
          denuncianteTipo: (inquerito.denuncianteTipo as 'SINGULAR' | 'COLETIVA' | 'ENTIDADE_PUBLICA' | 'OUTROS' | null) ?? undefined,
          denuncianteNif: inquerito.denuncianteNif ?? undefined,
          denuncianteMorada: inquerito.denuncianteMorada ?? undefined,
          denuncianteCodPostal: inquerito.denuncianteCodPostal ?? undefined,
          denuncianteLocalidade: inquerito.denuncianteLocalidade ?? undefined,
          denuncianteContacto: inquerito.denuncianteContacto ?? undefined,
          denuncianteEmail: inquerito.denuncianteEmail ?? undefined,
          denuncianteResponsavel: inquerito.denuncianteResponsavel ?? undefined,
          denuncianteNotas: inquerito.denuncianteNotas ?? undefined,
        }}
      />
    </div>
  )
}
