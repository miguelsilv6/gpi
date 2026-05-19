'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export function ExportButton() {
  const searchParams = useSearchParams()

  function handleExport() {
    const params = new URLSearchParams()
    const estado = searchParams.get('estado')
    const crimeId = searchParams.get('crimeId')
    const brigadaId = searchParams.get('brigadaId')
    if (estado) params.set('estado', estado)
    if (crimeId) params.set('crimeId', crimeId)
    if (brigadaId) params.set('brigadaId', brigadaId)

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
