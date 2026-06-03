import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { checkPermission, buildInqueritoWhere, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { inqueritoSchema } from '@/lib/validations/inquerito'
import { findEstadoById, getDistribuidoEstado } from '@/lib/estados'
import { isTerminal } from '@/lib/inquerito-state'
import type { Role } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  try {
    const session = await checkPermission('inquerito:read:own')
    const role = session.user.role as Role
    const { searchParams } = req.nextUrl

    // Defesa contra inputs não-numéricos (`?page=abc`): parseInt(.) sem
    // radix devolve NaN, Math.max(1, NaN) = NaN, e Prisma rebenta. Fallback
    // para defaults seguros.
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10)
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10)
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1)
    const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20))
    const skip = (page - 1) * limit

    const search = searchParams.get('search') ?? ''
    const estadoCodigo = searchParams.get('estado') ?? ''
    const crimeId = searchParams.get('crimeId') ?? ''
    const brigadaId = searchParams.get('brigadaId') ?? ''
    const inspetorId = searchParams.get('inspetorId') ?? ''
    const etiquetaId = searchParams.get('etiquetaId') ?? ''
    const overdue = searchParams.get('overdue') === '1'
    const semInspetor = searchParams.get('semInspetor') === '1'
    const dataAberturaFrom = searchParams.get('dataAberturaFrom') ?? ''
    const dataAberturaTo = searchParams.get('dataAberturaTo') ?? ''
    const sort = searchParams.get('sort') ?? 'updatedAt'
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'

    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { nuipc: { contains: search, mode: 'insensitive' as const } },
          { nai: { contains: search, mode: 'insensitive' as const } },
          { denuncianteNome: { contains: search, mode: 'insensitive' as const } },
          { denuncianteNif: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(estadoCodigo && { estado: { codigo: estadoCodigo } }),
      ...(crimeId && {
        AND: [{ OR: [{ crimeId }, { crimesAssociados: { some: { id: crimeId } } }] }],
      }),
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(etiquetaId && { etiquetas: { some: { id: etiquetaId } } }),
      ...(semInspetor && { inspetorId: null }),
      ...(overdue && {
        dataPrazo: { lt: new Date() },
        estado: { terminal: false },
      }),
      ...((() => {
        // Datas via query string: validar formato ISO antes de criar Date,
        // senão `new Date('foo')` devolve Invalid Date e Prisma erra com 500.
        const parsed: { gte?: Date; lte?: Date } = {}
        const isValidDate = (s: string) => !Number.isNaN(new Date(s).getTime())
        if (dataAberturaFrom && isValidDate(dataAberturaFrom)) {
          parsed.gte = new Date(dataAberturaFrom)
        }
        if (dataAberturaTo && isValidDate(dataAberturaTo)) {
          parsed.lte = new Date(dataAberturaTo)
        }
        return Object.keys(parsed).length > 0 ? { dataAbertura: parsed } : {}
      })()),
      // roleWhere LAST: scope-locking não pode ser substituído por query
      // string (INSPETOR_CHEFE/INSPETOR). Esta ordem é crítica para segurança.
      ...roleWhere,
    }

    const ALLOWED_SORT: Record<string, true> = {
      updatedAt: true,
      dataAbertura: true,
      dataPrazo: true,
      nuipc: true,
    }
    const orderBy = (ALLOWED_SORT[sort] ? { [sort]: order } : { updatedAt: 'desc' }) as never

    const [inqueritos, total] = await Promise.all([
      prisma.inquerito.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          estado: { select: { id: true, codigo: true, nome: true, cor: true, terminal: true } },
          crime: { select: { id: true, nome: true } },
          crimesAssociados: { select: { id: true, nome: true } },
          brigada: { select: { id: true, nome: true } },
          inspetor: { select: { id: true, nome: true } },
          etiquetas: { select: { id: true, nome: true } },
          tribunal: { select: { id: true, nome: true } },
          seccao: { select: { id: true, nome: true } },
          localTratamento: { select: { id: true, nome: true } },
          _count: { select: { atividades: true } },
        },
      }),
      prisma.inquerito.count({ where }),
    ])

    return Response.json({
      data: inqueritos,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkPermission('inquerito:create')
    const role = session.user.role as Role
    const body = await req.json()
    const parsed = inqueritoSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400)
    }

    const data = parsed.data

    // INSPETOR is locked to their own brigade — they cannot create inquiries for
    // another brigade even if they craft the request manually.
    if (role === 'INSPETOR') {
      if (!session.user.brigadaId) return apiError('Sessão sem brigada associada — refresh ou re-login', 403)
      if (data.brigadaId !== session.user.brigadaId) return apiError('Não pode criar inquéritos para outra brigada', 403)
    }

    const inspetorId = data.inspetorId && data.inspetorId.length > 0 ? data.inspetorId : null

    // Resolve estado and validate
    const estado = await findEstadoById(data.estadoId)
    if (!estado || !estado.ativo) return apiError('Estado inválido', 400)

    // Resolve crime and validate
    const crime = await prisma.crime.findUnique({
      where: { id: data.crimeId },
      select: { id: true, nome: true, ativo: true },
    })
    if (!crime || !crime.ativo) return apiError('Crime inválido', 400)

    // Date/state consistency: terminal estado requires dataConclusao
    const conclusao = data.dataConclusao ? new Date(data.dataConclusao) : null
    if (isTerminal(estado) && !conclusao) {
      return apiError('Estado terminal exige data de conclusão', 400)
    }
    if (!isTerminal(estado) && conclusao) {
      return apiError('Data de conclusão só se aplica a estados terminais', 400)
    }

    // Validate inspetor (if any) belongs to the brigada
    if (inspetorId) {
      const inspetor = await prisma.utilizador.findUnique({
        where: { id: inspetorId },
        select: { ativo: true, brigadaId: true },
      })
      if (!inspetor || !inspetor.ativo) return apiError('Inspetor inválido', 400)
      if (inspetor.brigadaId !== data.brigadaId) {
        return apiError('Inspetor não pertence à brigada indicada', 409)
      }
    }

    // Validate crimes associados (if any): must exist and be active.
    // Deduplicate and exclude the primary crime to avoid redundancy.
    const crimeIdsAssociados = [...new Set((data.crimeIdsAssociados ?? []).filter((id) => id !== crime.id))]
    if (crimeIdsAssociados.length > 0) {
      const foundAssociados = await prisma.crime.findMany({
        where: { id: { in: crimeIdsAssociados }, ativo: true },
        select: { id: true },
      })
      if (foundAssociados.length !== crimeIdsAssociados.length) {
        return apiError('Um ou mais crimes associados são inválidos ou inativos', 400)
      }
    }

    // Validate etiquetas (if any): must be the current user's own personal tags.
    const etiquetaIds = [...new Set(data.etiquetaIds ?? [])]
    let etiquetaNomes: string[] = []
    if (etiquetaIds.length > 0) {
      const found = await prisma.etiqueta.findMany({
        where: { id: { in: etiquetaIds }, criadoPorId: session.user.id },
        select: { id: true, nome: true },
      })
      if (found.length !== etiquetaIds.length) {
        return apiError('Uma ou mais etiquetas são inválidas', 400)
      }
      etiquetaNomes = found.map((e) => e.nome)
    }

    // Auto-transition: creating an inquérito already assigned to a brigada or
    // inspector while in ABERTO → move directly to DISTRIBUIDO.
    let finalEstadoId = data.estadoId
    if ((inspetorId || data.brigadaId) && estado.codigo === 'ABERTO') {
      const distribuido = await getDistribuidoEstado()
      if (distribuido?.ativo) {
        finalEstadoId = distribuido.id
        // Reflect the effective estado in the local reference used below.
        Object.assign(estado, distribuido)
      }
    }

    const inquerito = await prisma.inquerito.create({
      data: {
        nuipc: data.nuipc,
        nai: data.nai || null,
        // natureza is denormalized from crime.nome while the legacy column still exists
        natureza: crime.nome,
        crimeId: crime.id,
        estadoId: finalEstadoId,
        dataAbertura: new Date(data.dataAbertura),
        dataPrazo: data.dataPrazo ? new Date(data.dataPrazo) : null,
        dataConclusao: conclusao,
        notas: data.notas ?? null,
        brigadaId: data.brigadaId,
        inspetorId,
        tribunalId: data.tribunalId || null,
        seccaoId: data.seccaoId || null,
        localTratamentoId: data.localTratamentoId || null,
        procurador: data.procurador?.trim() || null,
        oficialJustica: data.oficialJustica?.trim() || null,
        voip: data.voip?.trim() || null,
        notasTribunal: data.notasTribunal?.trim() || null,
        denuncianteNome: data.denuncianteNome?.trim() || null,
        denuncianteTipo: data.denuncianteTipo || null,
        denuncianteNif: data.denuncianteNif?.trim() || null,
        denuncianteMorada: data.denuncianteMorada?.trim() || null,
        denuncianteCodPostal: data.denuncianteCodPostal?.trim() || null,
        denuncianteLocalidade: data.denuncianteLocalidade?.trim() || null,
        denuncianteContacto: data.denuncianteContacto?.trim() || null,
        denuncianteEmail: data.denuncianteEmail?.trim() || null,
        denuncianteResponsavel: data.denuncianteResponsavel?.trim() || null,
        denuncianteNotas: data.denuncianteNotas?.trim() || null,
        ...(etiquetaIds.length > 0 && {
          etiquetas: { connect: etiquetaIds.map((id) => ({ id })) },
        }),
        ...(crimeIdsAssociados.length > 0 && {
          crimesAssociados: { connect: crimeIdsAssociados.map((id) => ({ id })) },
        }),
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_INQUERITO',
      entidade: 'Inquerito',
      entidadeId: inquerito.id,
      utilizadorId: session.user.id,
      detalhes: {
        nuipc: inquerito.nuipc,
        crimeNome: crime.nome,
        estadoCodigo: estado.codigo,
        brigadaId: inquerito.brigadaId,
        inspetorId: inquerito.inspetorId ?? null,
        ...(etiquetaNomes.length > 0 && { etiquetas: etiquetaNomes }),
        ...(crimeIdsAssociados.length > 0 && { crimesAssociados: crimeIdsAssociados }),
      },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')

    return Response.json(inquerito, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
