"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel } from "@/components/ui/field"

interface FiltersProps {
  selectedDate: string
  onDateChange: (date: string) => void
  telefoneMotorista: string
  onTelefoneChange: (telefone: string) => void
}

export function Filters({
  selectedDate,
  onDateChange,
  telefoneMotorista,
  onTelefoneChange,
}: FiltersProps) {
  return (
    <Card className="p-5 grid grid-cols-2 gap-4">
      <Field>
        <FieldLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Data
        </FieldLabel>
        <Input
          type="text"
          className="font-bold text-lg"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          placeholder="DD/MM/YYYY"
        />
      </Field>
      <Field>
        <FieldLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Motorista
        </FieldLabel>
        <Input
          type="text"
          value={telefoneMotorista}
          onChange={(e) => onTelefoneChange(e.target.value)}
          placeholder="31999999999"
        />
      </Field>
    </Card>
  )
}
