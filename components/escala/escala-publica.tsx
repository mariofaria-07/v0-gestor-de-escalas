"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { EscalaCard } from "./escala-card"
import { getEscalaDia, getEscalaHoje, getTodasEscalas, getTodosColaboradoresNomes, salvarReporte } from "@/lib/firebase-service"
import type { EscalaDia } from "@/lib/firebase-types"
import { Spinner } from "@/components/ui/spinner"
import { Settings, Calendar as CalendarIcon, List, Search, AlertTriangle, MessageSquare } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AutocompleteInput } from "@/components/ui/autocomplete"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ptBR } from "date-fns/locale"

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
  const [escalaSelecionada, setEscalaSelecionada] = useState<EscalaDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSelecionada, setLoadingSelecionada] = useState(false)
  const [dataAtual, setDataAtual] = useState<Date | null>(null)
  const [dataSelecionada, setDataSelecionada] = useState<Date | undefined>(new Date())
  const [allColaboradores, setAllColaboradores] = useState<string[]>([])
  
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<EscalaDia[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Reporte State
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reporteTipo, setReporteTipo] = useState<'perigo' | 'alerta' | 'sugestao'>('alerta')
  const [reporteMensagem, setReporteMensagem] = useState("")
  const [isReporting, setIsReporting] = useState(false)

  const refreshData = async () => {
    if (dataSelecionada) {
      const dataStr = formatDate(dataSelecionada)
      const escala = await getEscalaDia(dataStr)
      setEscalaSelecionada(escala)
    }
    const hojeEscala = await getEscalaHoje()
    setEscalaHoje(hojeEscala)
    
    // Refresh colaboradores names list
    const nomes = await getTodosColaboradoresNomes()
    setAllColaboradores(nomes)
  }

  useEffect(() => {
    const hoje = new Date()
    setDataAtual(hoje)
    
    async function carregarDados() {
      try {
        const [escala, nomes] = await Promise.all([
          getEscalaHoje(),
          getTodosColaboradoresNomes()
        ])
        setEscalaHoje(escala)
        setEscalaSelecionada(escala)
        setAllColaboradores(nomes)
      } catch (error) {
        console.error("Erro ao carregar dados:", error)
      } finally {
        setLoading(false)
      }
    }
    
    carregarDados()
  }, [])

  useEffect(() => {
    if (!dataSelecionada) return

    async function buscarEscala() {
      setLoadingSelecionada(true)
      try {
        const dataStr = formatDate(dataSelecionada!)
        const escala = await getEscalaDia(dataStr)
        setEscalaSelecionada(escala)
      } catch (error) {
        console.error("Erro ao buscar escala da data:", error)
      } finally {
        setLoadingSelecionada(false)
      }
    }

    buscarEscala()
  }, [dataSelecionada])

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const todas = await getTodasEscalas()
      const term = searchTerm.toLowerCase()
      const results = todas.filter(e => 
        e.colaboradores.some(c => c.toLowerCase().includes(term))
      )
      setSearchResults(results)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleEnviarReporte = async () => {
    if (!reporteMensagem.trim()) return
    setIsReporting(true)
    try {
      await salvarReporte({
        tipo: reporteTipo,
        mensagem: reporteMensagem,
        data: new Date().toISOString(),
        lido: false
      })
      setIsReportOpen(false)
      setReporteMensagem("")
      setReporteTipo('alerta')
      alert("Reporte enviado com sucesso! O administrador foi notificado.")
    } catch (error) {
      console.error(error)
      alert("Erro ao enviar reporte.")
    } finally {
      setIsReporting(false)
    }
  }

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
      {/* Link discreto para admin */}
      <Link 
        href="/admin" 
        className="absolute top-4 right-4 p-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors rounded-full hover:bg-muted/50"
        title="Painel Admin"
      >
        <Settings className="h-5 w-5" />
      </Link>

      <div className="w-full max-w-md mx-auto">
        <Tabs defaultValue="hoje" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="hoje" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Escala de Hoje
            </TabsTrigger>
            <TabsTrigger value="calendario" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendário
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="hoje" className="mt-0">
            <EscalaCard
              escala={escalaHoje}
              dataFormatada={formatDate(dataAtual)}
              diaSemana={getDiaSemana(dataAtual)}
              onUpdate={refreshData}
              allColaboradores={allColaboradores}
            />
          </TabsContent>
          
          <TabsContent value="calendario" className="mt-0 flex flex-col items-center">
            {/* Search section */}
            <div className="w-full mb-6 bg-card rounded-xl shadow-sm border border-border p-4">
              <h3 className="text-sm font-medium mb-3">Buscar meu histórico</h3>
              <div className="flex gap-2">
                <AutocompleteInput 
                  placeholder="Digite seu nome..." 
                  value={searchTerm}
                  onChange={setSearchTerm}
                  onEnter={handleSearch}
                  options={allColaboradores}
                  className="h-10"
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Dias escalados:</p>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                    {searchResults.map(escala => (
                      <div key={escala.data} className="text-sm p-2 bg-secondary/50 rounded flex justify-between items-center">
                        <span>{escala.data}</span>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                          const parts = escala.data.split('/')
                          setDataSelecionada(new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])))
                          setSearchResults([])
                          setSearchTerm("")
                        }}>
                          Ver Escala
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl shadow-sm border border-border p-3 mb-6 w-full flex justify-center">
              <Calendar
                mode="single"
                selected={dataSelecionada}
                onSelect={setDataSelecionada}
                locale={ptBR}
                className="rounded-md"
              />
            </div>

            <div className="w-full">
              {loadingSelecionada ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-6 w-6 text-primary" />
                </div>
              ) : dataSelecionada ? (
                <EscalaCard
                  escala={escalaSelecionada}
                  dataFormatada={formatDate(dataSelecionada)}
                  diaSemana={getDiaSemana(dataSelecionada)}
                  onUpdate={refreshData}
                  allColaboradores={allColaboradores}
                />
              ) : null}
            </div>
          </TabsContent>
        </Tabs>

        {/* Reportar Button */}
        <div className="mt-8 flex justify-center">
          <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900 dark:text-amber-500 dark:hover:bg-amber-950">
                <AlertTriangle className="h-4 w-4" />
                Reportar Perigo / Sugestão
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reportar Situação</DialogTitle>
                <DialogDescription>
                  Use este espaço para reportar perigos na rota, enviar alertas ou fazer sugestões. Apenas o administrador verá isso.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant={reporteTipo === 'perigo' ? 'destructive' : 'outline'} 
                    onClick={() => setReporteTipo('perigo')}
                    className="flex-1"
                  >
                    Perigo
                  </Button>
                  <Button 
                    type="button" 
                    variant={reporteTipo === 'alerta' ? 'default' : 'outline'} 
                    onClick={() => setReporteTipo('alerta')}
                    className={reporteTipo === 'alerta' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'flex-1'}
                    style={reporteTipo === 'alerta' ? {} : { flex: 1 }}
                  >
                    Alerta
                  </Button>
                  <Button 
                    type="button" 
                    variant={reporteTipo === 'sugestao' ? 'default' : 'outline'} 
                    onClick={() => setReporteTipo('sugestao')}
                    className={reporteTipo === 'sugestao' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'flex-1'}
                    style={reporteTipo === 'sugestao' ? {} : { flex: 1 }}
                  >
                    Sugestão
                  </Button>
                </div>
                <Textarea 
                  placeholder="Descreva a situação aqui..." 
                  value={reporteMensagem}
                  onChange={e => setReporteMensagem(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsReportOpen(false)} disabled={isReporting}>Cancelar</Button>
                <Button onClick={handleEnviarReporte} disabled={!reporteMensagem.trim() || isReporting}>
                  {isReporting ? <Spinner className="h-4 w-4 mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Enviar Reporte
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Footer discreto */}
      <p className="mt-8 text-xs text-muted-foreground/50">
        Transporte Rio Acima
      </p>
    </main>
  )
}
