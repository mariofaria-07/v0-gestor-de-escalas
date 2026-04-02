"use client"

import { Card } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export function NoDataAlert() {
  return (
    <Card className="p-6 bg-amber-50 border-amber-200 text-amber-800">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
        <div>
          <p className="font-semibold text-lg">Nenhuma escala na memória!</p>
          <p className="text-sm mt-1 text-amber-700">
            Faça o upload da planilha abaixo para começar.
          </p>
        </div>
      </div>
    </Card>
  )
}
