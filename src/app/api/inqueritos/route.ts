import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { checkPermission, buildInqueritoWhere, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { inqueritoSchema } from '@/lib/validations/inquerito'
import type { Role } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  try {
    const session = await checkPermission('inquerito:read:own')
    const role = session.user.role as Role
    const { searchParams } = req.nextUrl

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))
    const skip = (page - 1) * limit

    const search = searchParams.get('search') ?? ''
    const estado = searchParams.get('estado') ?? ''
    const faseProcessual = searchParams.get('faseProcessual') ?? ''
    const brigadaId = searchParams.get('brigadaId') ?? ''
    const inspetorId = searchParams.get('inspetorId') ?? ''
    const overdue = searchParams.get('overdue') === '1'
    const semInspetor = searchParams.get('semInspetor') === '1'
    const dataAberturaFrom = searchParams.get('dataAberturaFrom') ?? ''
    const dataAberturaTo = searchParams.get('dataAberturaTo') ?? ''
    const sort = searchParams.get('sort') ?? 'updatedAt'
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'

    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const where = {
      deletedAt: null,
      ...roleWhere,
      ...(search && {
        OR: [
          { nuipc: { contains: search, mode: 'insensitive' as const } },
          { nai: { contains: search, mode: 'insensitive' as const } },
          { natureza: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(estado && { estado: estado as never }),
      ...(faseProcessual && { faseProcessual: faseProcessual as never }),
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(semInspetor && { inspetorId: null }),
      ...(overdue && {
        dataPrazo: { lt: new Date() },
        estado: { notIn: ['CONCLUIDO', 'ARQUIVADO'] as never[] },
      }),
      ...((dataAberturaFrom || dataAberturaTo) && {
        dataAbertura: {
          ...(dataAberturaFrom && { gte: new Date(dataAberturaFrom) }),
          ...(dataAberturaTo && { lte: new Date(dataAberturaTo) }),
        },
      }),
    }

    const ALLOWED_SORT: Record<string, true> = {
      updatedAt: true,
      dataAbertura: true,
      dataPrazo: true,
      nuipc: true,
      estado: true,
    }
    const orderBy = (ALLOWED_SORT[sort] ? { [sort]: order } : { updatedAt: 'desc' }) as never

    const [inqueritos, total] = await Promise.all([
      prisma.inquerito.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          brigada: { select: { id: true, nome: true } },
          inspetor: { select: { id: true, nome: true } },
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
    const body = await req.json()
    const parsed = inqueritoSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400)
    }

    const data = parsed.data
    // Normalize empty string → null for optional FK
    const inspetorId = data.inspetorId && data.inspetorId.length > 0 ? data.inspetorId : null

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

    const inquerito = await prisma.inquerito.create({
      data: {
        nuipc: data.nuipc,
        nai: data.nai || null,
        natureza: data.natureza,
        estado: data.estado,
        faseProcessual: data.faseProcessual,
        dataAbertura: new Date(data.dataAbertura),
        dataPrazo: data.dataPrazo ? new Date(data.dataPrazo) : null,
        dataConclusao: data.dataConclusao ? new Date(data.dataConclusao) : null,
        notas: data.notas ?? null,
        brigadaId: data.brigadaId,
        inspetorId,
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
        natureza: inquerito.natureza,
        estado: inquerito.estado,
        brigadaId: inquerito.brigadaId,
        inspetorId: inquerito.inspetorId ?? null,
      },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')

    return Response.json(inquerito, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
