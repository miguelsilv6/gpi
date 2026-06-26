import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  buildInqueritoWhere,
  getInqueritoColumnsVisibility,
  canEditInquerito,
} from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { MarcarJuntaButton } from '@/components/inqueritos/marcar-junta-button'
import { nuipcToSlug, formatDate } from '@/lib/utils'
import { Paperclip } from 'lucide-react'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

// Perfis com acesso operacional a esta página (espelha nav-items.tsx). O
// ESTATISTICA, ainda que possa ler inquéritos para fins estatísticos, não tem
// o item no menu — aplicamos a mesma restrição ao nível da página.
const ROLES_PERMITIDOS: Role[] = ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO']

/**
 * Lista de inquéritos marcados com documentação por juntar (inquéritos já
 * enviados/concluídos a aguardar documentação que chega depois). Âmbito por
 * role garantido por buildInqueritoWhere. Ordenado pelos mais antigos primeiro.
 */
export default async function DocumentacaoPendentePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role
  if (!ROLES_PERMITIDOS.includes(role)) redirect('/dashboard')

  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
  const showBrigada = hasPermission(role, 'inquerito:read:all')
  const { showInspetor } = getInqueritoColumnsVisibility(role)

  const inqueritos = await prisma.inquerito.findMany({
    where: { ...where, deletedAt: null, documentacaoPendente: true },
    orderBy: { documentacaoPendenteDesde: 'asc' },
    select: {
      id: true,
      nuipc: true,
      brigadaId: true,
      inspetorId: true,
      documentacaoPendenteNota: true,
      documentacaoPendenteDesde: true,
      brigada: { select: { nome: true } },
      inspetor: { select: { nome: true } },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Paperclip className="h-5 w-5 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentação Pendente</h1>
          <p className="text-muted-foreground text-sm">
            {inqueritos.length} inquérito{inqueritos.length === 1 ? '' : 's'} a aguardar
            documentação por juntar.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {inqueritos.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum inquérito marcado com documentação pendente.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NUIPC</TableHead>
                  {showBrigada && <TableHead>Brigada</TableHead>}
                  {showInspetor && <TableHead>Inspetor</TableHead>}
                  <TableHead>Falta juntar</TableHead>
                  <TableHead>Pendente desde</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inqueritos.map((inq) => {
                  const canResolve = canEditInquerito(
                    role,
                    session.user.id,
                    session.user.brigadaId,
                    inq,
                  )
                  return (
                    <TableRow key={inq.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/inqueritos/${nuipcToSlug(inq.nuipc)}`}
                          className="text-primary hover:underline"
                        >
                          {inq.nuipc}
                        </Link>
                      </TableCell>
                      {showBrigada && (
                        <TableCell className="text-muted-foreground">
                          {inq.brigada?.nome ?? '—'}
                        </TableCell>
                      )}
                      {showInspetor && (
                        <TableCell className="text-muted-foreground">
                          {inq.inspetor?.nome ?? '—'}
                        </TableCell>
                      )}
                      <TableCell className="max-w-sm">
                        {inq.documentacaoPendenteNota || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(inq.documentacaoPendenteDesde)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canResolve && <MarcarJuntaButton slug={nuipcToSlug(inq.nuipc)} />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
