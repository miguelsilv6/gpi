'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Paperclip, Upload, Download, Trash2, Loader2, FileText, Image as ImageIcon, FileArchive, Mail, File } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface DocumentoItem {
  id: string
  filename: string
  mimeType: string
  tamanho: number
  createdAt: string
  uploadedBy: { id: string; nome: string }
}

interface Props {
  inqueritoid: string
  documentos: DocumentoItem[]
  canUpload: boolean
  currentUserId: string
  isAdmin: boolean
}

function mimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon
  if (mimeType === 'application/pdf') return FileText
  if (mimeType.includes('zip') || mimeType.includes('7z')) return FileArchive
  if (mimeType === 'message/rfc822' || mimeType.includes('outlook')) return Mail
  return File
}

export function DocumentosSection({ inqueritoid, documentos, canUpload, currentUserId, isAdmin }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [toDelete, setToDelete] = useState<DocumentoItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/inqueritos/${inqueritoid}/documentos`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao carregar o ficheiro')
        return
      }
      toast.success('Documento anexado')
      router.refresh()
    } catch {
      toast.error('Erro de rede ao carregar o ficheiro')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/documentos/${toDelete.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar o documento')
        return
      }
      toast.success('Documento eliminado')
      setToDelete(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar o documento')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Documentos
          {documentos.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({documentos.length})</span>
          )}
        </CardTitle>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Anexar
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sem documentos anexados.
            {canUpload && ' Use "Anexar" para adicionar provas, relatórios ou ofícios.'}
          </p>
        ) : (
          <ul className="divide-y">
            {documentos.map((d) => {
              const Icon = mimeIcon(d.mimeType)
              const canDelete = isAdmin || d.uploadedBy.id === currentUserId
              return (
                <li key={d.id} className="py-2.5 flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/documentos/${d.id}/download`}
                      className="text-sm font-medium hover:text-blue-600 hover:underline truncate block"
                      download
                    >
                      {d.filename}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(d.tamanho)} · {d.uploadedBy.nome} · {formatDateTime(d.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/api/documentos/${d.id}/download`}
                      download
                      title="Transferir"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Eliminar"
                        onClick={() => setToDelete(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar documento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vai eliminar permanentemente <strong>{toDelete?.filename}</strong>. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
