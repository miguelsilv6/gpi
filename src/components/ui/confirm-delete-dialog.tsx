'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertTriangle } from 'lucide-react'

interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Heading inside the dialog. */
  title: string
  /** One-line description of the entity being deleted, shown in the warning block. */
  entityLabel: string
  /** Extra explanatory text (audit trail kept, sessions invalidated, etc.). */
  description?: string
  /** Value the user must type verbatim to enable the destructive button. */
  confirmToken: string
  /** Label for the text input asking the user to type the token. */
  inputLabel: string
  /** Label for the destructive button itself ("Eliminar inquérito"). */
  destructiveLabel: string
  /** Handler executed when the user confirms. Should set loading externally if needed. */
  onConfirm: () => Promise<void> | void
  /** External loading indicator (the caller may want to disable other UI too). */
  loading?: boolean
}

/**
 * Reusable two-step deletion dialog.
 *
 * Step 1 (implicit): the caller opens the dialog when its destructive button
 * is clicked. The dialog shows what's about to be deleted and why this is
 * destructive.
 *
 * Step 2 (explicit, defensive): the user must type the entity's stable
 * identifier (NUIPC, email, ...) into the input. The destructive button stays
 * disabled until the text matches `confirmToken` exactly (case-sensitive,
 * trimmed).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  entityLabel,
  description,
  confirmToken,
  inputLabel,
  destructiveLabel,
  onConfirm,
  loading = false,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState('')

  // Reset typed value whenever the dialog opens/closes so a previous near-miss
  // can't be re-used.
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const tokenOk = typed.trim() === confirmToken

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3">
            <p className="font-medium text-red-900 dark:text-red-200">
              {entityLabel}
            </p>
            {description && (
              <p className="text-xs text-red-900/80 dark:text-red-200/80 mt-1">
                {description}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-token" className="text-xs">
              {inputLabel}{' '}
              <span className="font-mono font-semibold text-foreground">
                {confirmToken}
              </span>
            </Label>
            <Input
              id="confirm-token"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmToken}
              disabled={loading}
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm()}
            disabled={loading || !tokenOk}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {destructiveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
