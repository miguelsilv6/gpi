'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog'

interface HelpButtonProps {
  title: string
  children: ReactNode
  variant?: 'ghost' | 'outline'
  className?: string
}

export function HelpButton({ title, children, variant = 'ghost', className }: HelpButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={`gap-1.5 text-muted-foreground ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Ajuda</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">{children}</div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold">{title}</p>
      <div className="text-muted-foreground space-y-1">{children}</div>
    </div>
  )
}
