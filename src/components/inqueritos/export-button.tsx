'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

const EXPORT_FILTER_KEYS = [
  'estado',
  'crimeId',
  'brigadaId',
  'inspetorId',
  'etiquetaId',
  'overdue',
  'semInspetor',
  'search',
  'dataAberturaFrom',
  'dataAberturaTo',
] as const

export function ExportButton() {
  const searchParams = useSearchParams()

  function handleExport() {
    const params = new URLSearchParams()
    for (const key of EXPORT_FILTER_KEYS) {
      const v = searchParams.get(key)
      if (v) params.set(key, v)
    }
    const url = `/api/inqueritos/export${params.size > 0 ? `?${params.toString()}` : ''}`
    window.open(url, '_blank')
  }

  return (
    <Button size="sm" variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-1.5" />
      Exportar CSV
    </Button>
  )
}

