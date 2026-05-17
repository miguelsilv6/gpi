'use client'

import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// Maps a state codigo to a hex color, falling back to the `cor` field on the
// estado row if a codigo isn't recognized.
const COR_HEX: Record<string, string> = {
  blue: '#3b82f6',
  yellow: '#f59e0b',
  orange: '#f97316',
  green: '#10b981',
  gray: '#6b7280',
  red: '#ef4444',
  purple: '#8b5cf6',
  slate: '#64748b',
}

const FASE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444']

interface PorEstado {
  estadoId: string
  codigo: string
  nome: string
  cor: string | null
  count: number
}
interface PorFase { fase: string; count: number }
interface PorBrigada { brigadaId: string; nome: string; count: number }
interface PorNatureza { natureza: string; count: number }

const FASE_LABELS: Record<string, string> = {
  INQUERITO: 'Inquérito',
  INSTRUCAO: 'Instrução',
  JULGAMENTO: 'Julgamento',
  RECURSO: 'Recurso',
  TRANSITO_EM_JULGADO: 'Trânsito',
}

export function EstadoBarChart({ data }: { data: PorEstado[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={(entry.cor && COR_HEX[entry.cor]) ?? '#6b7280'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function FasePieChart({ data }: { data: PorFase[] }) {
  const formatted = data.map((d) => ({ ...d, label: FASE_LABELS[d.fase] ?? d.fase }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={formatted}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(props: { label?: string; percent?: number }) =>
            `${props.label ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {formatted.map((_, i) => (
            <Cell key={i} fill={FASE_COLORS[i % FASE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [value, 'Inquéritos']} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function BrigadaBarChart({ data }: { data: PorBrigada[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function NaturezaBarChart({ data }: { data: PorNatureza[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis dataKey="natureza" type="category" tick={{ fontSize: 11 }} width={130} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
