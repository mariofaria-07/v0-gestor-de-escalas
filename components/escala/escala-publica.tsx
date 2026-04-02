"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { EscalaCard } from "./escala-card"
import { getEscalaHoje } from "@/lib/firebase-service"
import type { EscalaDia } from "@/lib/firebase-types"
import { Spinner } from "@/components/ui/spinner"
import { Settings } from "lucide-react"

function getDiaSemana(date: Date): string {
  const dias = [
    "Domingo",
    "Segunda-feira",
    "Terca-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sabado",
  ]
  return dias[date.getDay()]
}

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}

export function EscalaPublica() {
  const [escala, setEscala] = useState<EscalaDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState<Date | null>(null)

  useEffect(() => {
    const hoje = new Date()
    setDataAtual(hoje)
    
    async function carregarEscala() {
      try {
        const escalaHoje = await getEscalaHoje()
        setEscala(escalaHoje)
      } catch (error) {
        console.error("Erro ao carregar escala:", error)
      } finally {
        setLoading(false)
      }
    }
    
    carregarEscala()
  }, [])

  if (loading || !dataAtual) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-full">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Carregando escala...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex flex-col items-center justify-center p-4 relative">
      {/* Link discreto para admin */}
      <Link 
        href="/admin" 
        className="absolute top-4 right-4 p-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors rounded-full hover:bg-muted/50"
        title="Painel Admin"
      >
        <Settings className="h-5 w-5" />
      </Link>
      
      <EscalaCard
        escala={escala}
        dataFormatada={formatDate(dataAtual)}
        diaSemana={getDiaSemana(dataAtual)}
      />
      
      {/* Footer discreto */}
      <p className="mt-8 text-xs text-muted-foreground/50">
        Transporte Rio Acima
      </p>
    </main>
  )
}
