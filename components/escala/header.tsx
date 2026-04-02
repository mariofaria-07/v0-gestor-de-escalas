"use client"

import { Bus } from "lucide-react"

export function Header() {
  return (
    <div className="bg-primary p-6 rounded-2xl shadow-md text-primary-foreground flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bus className="h-7 w-7" />
          Gestor de Escalas
        </h1>
        <p className="text-primary-foreground/80 text-sm mt-1">
          Gerador Automático WhatsApp
        </p>
      </div>
    </div>
  )
}
