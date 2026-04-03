"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { EscalaCard } from "./escala-card"
import { getEscalaHoje, getTodasEscalas } from "@/lib/firebase-service"
import type { EscalaDia } from "@/lib/firebase-types"
import { Spinner } from "@/components/ui/spinner"
import { Settings, Search, Calendar as CalendarIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
  const [escalaHoje, setEscalaHoje] = useState<EscalaDia | null>(null)
  const [todasEscalas, setTodasEscalas] = useState<EscalaDia[]>([])
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState<Date | null>(null)
  
  // Estados para a visualização do motorista
  const [buscaMotorista, setBuscaMotorista] = useState("")
  const [view, setView] = useState<"hoje" | "mensal">("hoje")

  useEffect(() => {
    const hoje = new Date()
    setDataAtual(hoje)
    
    async function carregarDados() {
      try {
        const [escalaDia, escalas] = await Promise.all([
          getEscalaHoje(),
          getTodasEscalas()
        ])
        setEscalaHoje(escalaDia)
        setTodasEscalas(escalas)
      } catch (error) {
        console.error("Erro ao carregar dados:", error)
      } finally {
        setLoading(false)
      }
    }
    
    carregarDados()
  }, [])

  const todosColaboradores = Array.from(
    new Set(todasEscalas.flatMap((e) => e.colaboradores))
  ).sort()

  // Filtrar escalas do motorista buscado
  const escalasDoMotorista = todasEscalas.filter(e => 
    buscaMotorista && e.colaboradores.some(c => c.toLowerCase().includes(buscaMotorista.toLowerCase()))
  )

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
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex flex-col items-center p-4 relative pt-16">
      <Link 
        href="/admin" 
        className="absolute top-4 right-4 p-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors rounded-full hover:bg-muted/50"
        title="Painel Admin"
      >
        <Settings className="h-5 w-5" />
      </Link>

      {/* Alternador de Visualização */}
      <div className="flex bg-muted/50 p-1 rounded-lg mb-8">
        <button
          onClick={() => setView("hoje")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === "hoje" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Plantão de Hoje
        </button>
        <button
          onClick={() => setView("mensal")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === "mensal" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Minha Escala
        </button>
      </div>
      
      {view === "hoje" ? (
        <EscalaCard
          escala={escalaHoje}
          dataFormatada={formatDate(dataAtual)}
          diaSemana={getDiaSemana(dataAtual)}
        />
      ) : (
        <Card className="w-full max-w-md border-0 shadow-xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold text-primary flex items-center justify-center gap-2">
              <CalendarIcon className="h-6 w-6" />
              Buscar Meus Plantões
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                list="motoristas-list"
                placeholder="Digite seu nome..."
                className="pl-9"
                value={buscaMotorista}
                onChange={(e) => setBuscaMotorista(e.target.value)}
              />
              <datalist id="motoristas-list">
                {todosColaboradores.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
            </div>

            {buscaMotorista && (
              <div className="space-y-4 mt-6">
                <h3 className="font-medium text-muted-foreground text-sm">
                  Plantões encontrados para <strong className="text-foreground">{buscaMotorista}</strong>:
                </h3>
                
                {escalasDoMotorista.length > 0 ? (
                  <div className="grid gap-3">
                    {escalasDoMotorista.map(escala => (
                      <div key={escala.data} className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary p-2 rounded-md font-bold">
                            {escala.data.split('/')[0]}
                          </div>
                          <div>
                            <p className="font-medium">{escala.data}</p>
                            {escala.feriado && <p className="text-xs text-muted-foreground">{escala.descricaoFeriado}</p>}
                          </div>
                        </div>
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">Escalado</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6 border rounded-lg bg-muted/20 border-dashed">
                    <p className="text-muted-foreground">Nenhum plantão encontrado.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      <p className="mt-8 text-xs text-muted-foreground/50">
        Transporte Rio Acima
      </p>
    </main>
  )
}
