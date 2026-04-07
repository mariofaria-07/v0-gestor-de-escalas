"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AutocompleteInput } from "@/components/ui/autocomplete"
import {
  getTodasEscalas,
  salvarEscala,
  atualizarColaboradores,
  importarEscalas,
  marcarComoEnviada,
  getReportes,
  marcarReporteLido,
} from "@/lib/firebase-service"
import { parseCSVToEscala } from "@/lib/escala-utils"
import type { EscalaDia, Reporte } from "@/lib/firebase-types"
import {
  LogOut,
  Upload,
  Calendar,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Home,
  Bus,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"

interface AdminPanelProps {
  onLogout: () => void
}

export function AdminPanel({ onLogout }: AdminPanelProps) {
  const [escalas, setEscalas] = useState<EscalaDia[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editColaboradores, setEditColaboradores] = useState<string[]>([])
  const [editLocaisDiferentes, setEditLocaisDiferentes] = useState<Record<string, string>>({})
  const [novoColaborador, setNovoColaborador] = useState("")
  const [isLocalDiferente, setIsLocalDiferente] = useState(false)
  const [novoLocal, setNovoLocal] = useState("")
  const [uploading, setUploading] = useState(false)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [loadingReportes, setLoadingReportes] = useState(false)
  const [allColaboradores, setAllColaboradores] = useState<string[]>([])

  const carregarEscalas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTodasEscalas()
      setEscalas(data)
      
      // Extrair todos os colaboradores unicos
      const nomes = new Set<string>()
      data.forEach(e => {
        e.colaboradores?.forEach(c => nomes.add(c))
      })
      setAllColaboradores(Array.from(nomes).sort())
      
    } catch (error) {
      console.error("Erro ao carregar escalas:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarEscalas()
    carregarReportes()
  }, [carregarEscalas])

  async function carregarReportes() {
    setLoadingReportes(true)
    try {
      const data = await getReportes()
      setReportes(data)
    } catch (error) {
      console.error("Erro ao carregar reportes:", error)
    } finally {
      setLoadingReportes(false)
    }
  }

  async function handleMarcarLido(id: string) {
    const success = await marcarReporteLido(id)
    if (success) {
      setReportes(reportes.map(r => r.id === id ? { ...r, lido: true } : r))
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" })
    onLogout()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const text = await file.text()
      const escalaData = parseCSVToEscala(text)
      const count = await importarEscalas(escalaData)
      alert(`${count} escalas importadas com sucesso!`)
      carregarEscalas()
    } catch (error) {
      console.error("Erro ao importar:", error)
      alert("Erro ao importar arquivo")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  function startEditing(escala: EscalaDia) {
    setEditingDate(escala.data)
    setEditColaboradores([...escala.colaboradores])
    setEditLocaisDiferentes({ ...(escala.locaisDiferentes || {}) })
    setNovoColaborador("")
    setIsLocalDiferente(false)
    setNovoLocal("")
  }

  function cancelEditing() {
    setEditingDate(null)
    setEditColaboradores([])
    setEditLocaisDiferentes({})
    setNovoColaborador("")
    setIsLocalDiferente(false)
    setNovoLocal("")
  }

  async function saveEditing() {
    if (!editingDate) return

    try {
      await atualizarColaboradores(editingDate, editColaboradores, editLocaisDiferentes)
      setEscalas((prev) =>
        prev.map((e) =>
          e.data === editingDate ? { ...e, colaboradores: editColaboradores, locaisDiferentes: editLocaisDiferentes } : e
        )
      )
      cancelEditing()
    } catch (error) {
      console.error("Erro ao salvar:", error)
      alert("Erro ao salvar alteracoes")
    }
  }

  function addColaborador() {
    const nome = novoColaborador.trim()
    if (nome) {
      setEditColaboradores((prev) => [...prev, nome])
      if (isLocalDiferente && novoLocal.trim()) {
        setEditLocaisDiferentes((prev) => ({ ...prev, [nome]: novoLocal.trim() }))
      }
      setNovoColaborador("")
      setIsLocalDiferente(false)
      setNovoLocal("")
    }
  }

  function removeColaborador(index: number) {
    const nome = editColaboradores[index]
    setEditColaboradores((prev) => prev.filter((_, i) => i !== index))
    setEditLocaisDiferentes((prev) => {
      const next = { ...prev }
      delete next[nome]
      return next
    })
  }

  async function handleEnviarManual(escala: EscalaDia) {
    if (!confirm(`Enviar escala de ${escala.data} para o motorista?`)) return

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: escala.data }),
      })

      if (response.ok) {
        await marcarComoEnviada(escala.data)
        setEscalas((prev) =>
          prev.map((e) =>
            e.data === escala.data ? { ...e, enviado: true } : e
          )
        )
        alert("Mensagem enviada com sucesso!")
      } else {
        const error = await response.json()
        alert(`Erro ao enviar: ${error.message || "Erro desconhecido"}`)
      }
    } catch (error) {
      console.error("Erro ao enviar:", error)
      alert("Erro ao enviar mensagem")
    }
  }

  // Filtrar para mostrar apenas escalas futuras ou de hoje
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  function parseDate(dateStr: string): Date {
    const parts = dateStr.split("/")
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  }

  const escalasFiltradas = escalas.filter((e) => {
    const escalaDate = parseDate(e.data)
    return escalaDate >= hoje
  })

  const reportesNaoLidos = reportes.filter(r => !r.lido).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Bus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Painel Admin</h1>
              <p className="text-xs text-primary-foreground/70">Gestor de Escalas Rio Acima</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground border-0">
                <Home className="h-4 w-4 mr-2" />
                Ver Escala
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={handleLogout} className="bg-white/10 hover:bg-white/20 text-primary-foreground border-0">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Tabs defaultValue="escala" className="w-full">
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="escala">Gerenciar Escalas</TabsTrigger>
            <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
            <TabsTrigger value="reportes" className="relative">
              Reportes
              {reportesNaoLidos > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full">
                  {reportesNaoLidos}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="escala" className="space-y-6">
            {/* Upload e Refresh */}
            <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-accent/10 to-transparent border-b border-border">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <Upload className="h-5 w-5 text-accent" />
              </div>
              Importar Escala
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex gap-4 flex-wrap">
              <label className="flex-1 min-w-[200px]">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={uploading}
                  asChild
                >
                  <span>
                    {uploading ? (
                      <>
                        <Spinner className="h-4 w-4 mr-2" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar arquivo CSV
                      </>
                    )}
                  </span>
                </Button>
              </label>
              <Button variant="outline" onClick={carregarEscalas} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Escalas */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              Escalas
              <Badge variant="secondary" className="ml-auto">{escalasFiltradas.length} dias</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            ) : escalasFiltradas.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma escala encontrada. Importe um arquivo CSV.
              </p>
            ) : (
              <div className="space-y-4">
                {escalasFiltradas.map((escala) => (
                  <div
                    key={escala.data}
                    className="border border-border rounded-lg p-4"
                  >
                    {/* Cabecalho da Escala */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">
                          {escala.data}
                        </span>
                        {escala.feriado && (
                          <Badge variant="secondary">{escala.descricaoFeriado}</Badge>
                        )}
                        {escala.enviado && (
                          <Badge className="bg-accent text-accent-foreground">
                            Enviado
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!escala.feriado && editingDate !== escala.data && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditing(escala)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEnviarManual(escala)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edicao */}
                    {editingDate === escala.data ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <AutocompleteInput
                              placeholder="Nome do colaborador"
                              value={novoColaborador}
                              onChange={setNovoColaborador}
                              onEnter={addColaborador}
                              options={allColaboradores}
                            />
                            <Button onClick={addColaborador} size="sm">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input 
                              type="checkbox" 
                              id={`diff-location-${escala.data}`}
                              checked={isLocalDiferente}
                              onChange={(e) => setIsLocalDiferente(e.target.checked)}
                              className="rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <label htmlFor={`diff-location-${escala.data}`} className="text-sm text-muted-foreground cursor-pointer">
                              Pegar em local diferente da Matriz?
                            </label>
                          </div>
                          {isLocalDiferente && (
                            <Input
                              placeholder="Descreva o local de embarque"
                              value={novoLocal}
                              onChange={(e) => setNovoLocal(e.target.value)}
                              className="text-sm"
                            />
                          )}
                        </div>
                        <ul className="space-y-2">
                          {editColaboradores.map((col, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between p-2 bg-secondary/50 rounded"
                            >
                              <div className="flex flex-col">
                                <span>{col}</span>
                                {editLocaisDiferentes[col] && (
                                  <span className="text-xs text-muted-foreground">📍 {editLocaisDiferentes[col]}</span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeColaborador(idx)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2 pt-2">
                          <Button onClick={saveEditing} size="sm">
                            <Check className="h-4 w-4 mr-1" />
                            Salvar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={cancelEditing}
                            size="sm"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Lista de Colaboradores */
                      !escala.feriado && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {escala.colaboradores.length > 0 ? (
                            escala.colaboradores.map((col, idx) => (
                              <Badge key={idx} variant="outline">
                                {col}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Nenhum colaborador
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="indicadores">
            <Card className="border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-500/10 to-transparent border-b border-border">
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  Indicadores de Alterações
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Spinner className="h-8 w-8 text-primary" />
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-secondary/50 rounded-xl border border-border">
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Substituições</h4>
                        <p className="text-2xl font-bold mb-2">
                          {escalas.reduce((acc, e) => acc + (e.solicitacoes?.filter(s => s.tipo === 'substituicao' && s.status === 'aprovado').length || 0), 0)}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {escalas.flatMap(e => (e.solicitacoes || []).filter(s => s.tipo === 'substituicao' && s.status === 'aprovado').map(s => (
                            <div key={s.id}>{s.colaboradorOriginal} → {s.colaboradorNovo} ({e.data})</div>
                          )))}
                        </div>
                      </div>
                      <div className="p-4 bg-secondary/50 rounded-xl border border-border">
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Faltas (Exclusões)</h4>
                        <p className="text-2xl font-bold mb-2">
                          {escalas.reduce((acc, e) => acc + (e.solicitacoes?.filter(s => s.tipo === 'exclusao' && s.status === 'aprovado').length || 0), 0)}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-2">
                          {escalas.flatMap(e => (e.solicitacoes || []).filter(s => s.tipo === 'exclusao' && s.status === 'aprovado').map(s => (
                            <div key={s.id} className="bg-background/50 p-2 rounded border border-border/50">
                              <span className="font-medium text-foreground">{s.colaboradorOriginal}</span> ({e.data})
                              {s.motivo && <p className="mt-1 text-muted-foreground italic">"{s.motivo}"</p>}
                            </div>
                          )))}
                        </div>
                      </div>
                      <div className="p-4 bg-secondary/50 rounded-xl border border-border">
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Adições Esporádicas</h4>
                        <p className="text-2xl font-bold mb-2">
                          {escalas.reduce((acc, e) => acc + (e.solicitacoes?.filter(s => s.tipo === 'adicao' && s.status === 'aprovado').length || 0), 0)}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {escalas.flatMap(e => (e.solicitacoes || []).filter(s => s.tipo === 'adicao' && s.status === 'aprovado').map(s => (
                            <div key={s.id}>{s.colaboradorNovo} ({e.data})</div>
                          )))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">Endereços Frequentes (Fora da Matriz)</h3>
                      <div className="space-y-3">
                        {(() => {
                          const enderecos: Record<string, { count: number, pessoas: Set<string> }> = {};
                          escalas.forEach(e => {
                            if (e.locaisDiferentes) {
                              Object.entries(e.locaisDiferentes).forEach(([pessoa, local]) => {
                                if (local && local !== 'Bamaq Matriz') {
                                  if (!enderecos[local]) enderecos[local] = { count: 0, pessoas: new Set() };
                                  enderecos[local].count++;
                                  enderecos[local].pessoas.add(pessoa);
                                }
                              });
                            }
                          });
                          
                          const sortedEnderecos = Object.entries(enderecos).sort((a, b) => b[1].count - a[1].count);
                          
                          if (sortedEnderecos.length === 0) {
                            return <p className="text-sm text-muted-foreground">Nenhum endereço diferente registrado.</p>
                          }
                          
                          return sortedEnderecos.map(([local, data]) => (
                            <div key={local} className="p-3 bg-card border rounded-lg shadow-sm flex justify-between items-center">
                              <div>
                                <p className="font-medium">{local}</p>
                                <p className="text-xs text-muted-foreground">
                                  Utilizado por: {Array.from(data.pessoas).join(', ')}
                                </p>
                              </div>
                              <Badge variant="secondary">{data.count} vezes</Badge>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reportes">
            <Card className="border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-amber-500/10 to-transparent border-b border-border">
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  Reportes dos Colaboradores
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {loadingReportes ? (
                  <div className="flex justify-center py-12">
                    <Spinner className="h-8 w-8 text-primary" />
                  </div>
                ) : reportes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhum reporte recebido.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reportes.map(reporte => (
                      <div 
                        key={reporte.id} 
                        className={`p-4 rounded-lg border ${
                          reporte.lido ? 'bg-muted/30 border-border' : 
                          reporte.tipo === 'perigo' ? 'bg-destructive/10 border-destructive/30' :
                          reporte.tipo === 'alerta' ? 'bg-amber-500/10 border-amber-500/30' :
                          'bg-blue-500/10 border-blue-500/30'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            {reporte.tipo === 'perigo' && <AlertTriangle className="h-5 w-5 text-destructive" />}
                            {reporte.tipo === 'alerta' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                            {reporte.tipo === 'sugestao' && <MessageSquare className="h-5 w-5 text-blue-500" />}
                            <span className="font-semibold capitalize">{reporte.tipo}</span>
                            {!reporte.lido && <Badge variant="default" className="ml-2 text-[10px] h-4">Novo</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(reporte.data).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{reporte.mensagem}</p>
                        
                        {!reporte.lido && (
                          <div className="mt-4 flex justify-end">
                            <Button size="sm" variant="outline" onClick={() => handleMarcarLido(reporte.id!)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Marcar como lido
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
