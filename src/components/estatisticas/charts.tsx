'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
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

interface PorAno { ano: string; count: number }
interface PorEstado {
  estadoId: string
  codigo: string
  nome: string
  cor: string | null
  count: number
}
interface PorBrigada { brigadaId: string; nome: string; count: number }
interface PorInspetor { inspetorId: string; nome: string; count: number }
interface PorNatureza { natureza: string; count: number }
interface PorComarca { comarcaId: string; nome: string; count: number }
interface PorTribunal { tribunalId: string; nome: string; count: number }
interface PorLocalTratamento { localTratamentoId: string; nome: string; count: number }

export function AnoBarChart({ data }: { data: PorAno[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ano" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EstadoBarChart({ data }: { data: PorEstado[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="nome"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
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

export function InspetorBarChart({ data }: { data: PorInspetor[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="nome"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function NaturezaBarChart({ data }: { data: PorNatureza[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="natureza"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ComarcaBarChart({ data }: { data: PorComarca[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="nome"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TribunalBarChart({ data }: { data: PorTribunal[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="nome"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function LocalTratamentoBarChart({ data }: { data: PorLocalTratamento[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="nome"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Inquéritos" fill="#06b6d4" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
