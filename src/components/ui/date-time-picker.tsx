"use client"

import * as React from "react"
import { ptBR } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  value: string     // "YYYY-MM-DDTHH:MM" ou ""
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  className?: string
}

function parseParts(value: string): { dateStr: string; timeStr: string } {
  if (!value || typeof value !== 'string') return { dateStr: '', timeStr: '00:00' }
  const idx = value.indexOf('T')
  if (idx === -1) return { dateStr: '', timeStr: '00:00' }
  const dateStr = value.slice(0, idx)
  const rawTime = value.slice(idx + 1)
  const timeStr = rawTime.slice(0, 5) || '00:00'
  return { dateStr, timeStr }
}

function toDisplay(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return 'Data inválida'
  return `${d}/${m}/${y}  ${timeStr}`
}

export function DateTimePicker({
  value,
  onChange,
  id,
  placeholder = 'Selecionar data e hora',
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const { dateStr, timeStr } = parseParts(value)
  const selected = React.useMemo(() => {
    if (!dateStr) return undefined
    const [y, m, d] = dateStr.split('-').map(Number)
    if (y === undefined || m === undefined || d === undefined) return undefined
    const date = new Date(y, m - 1, d)
    return isNaN(date.getTime()) ? undefined : date
  }, [dateStr])

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      onChange('')
      return
    }
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const d = String(day.getDate()).padStart(2, '0')
    onChange(`${y}-${m}-${d}T${timeStr}`)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (dateStr) onChange(`${dateStr}T${e.target.value}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn(
          "inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{value ? toDisplay(dateStr, timeStr) : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          captionLayout="dropdown"
          locale={ptBR}
        />
        <div className="border-t px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-xs text-muted-foreground">Hora</Label>
            <Input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              disabled={!dateStr}
              className="h-8"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!dateStr}
            onClick={() => setOpen(false)}
          >
            Confirmar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
