"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  getTodasEscalas,
  salvarEscala,
  atualizarColaboradores,
  importarEscalas,
  marcarComoEnviada,
} from "@/lib/firebase-service"
import { parseCSVToEscala } from "@/lib/escala-utils"
import type { EscalaDia } from "@/lib/firebase-types"
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
  Share2,
  MessageCircle
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
  const [novoColaborador, setNovoColaborador] = useState("")
  const [uploading, setUploading] = useState(false)

  // Estados para o modal de compartilhamento
  const [shareDriverModalOpen, setShareDriverModalOpen] = useState(false)
  const [shareDriverName, setShareDriverName] = useState("")

  const carregarEscalas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTodasEscalas()
      setEscalas(data)
    } catch (error) {
      console.error("Erro ao carregar escalas:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarEscalas()
  }, [carregarEscalas])

  // Extrai todos os colaboradores únicos para sugerir no input
  const todosColaboradores = Array.from(
    new Set(escalas.flatMap((e) => e.colaboradores))
  ).sort()

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
    setNovoColaborador("")
  }

  function cancelEditing() {
    setEditingDate(null)
    setEditColaboradores([])
    setNovoColaborador("")
  }

  async function saveEditing() {
    if (!editingDate) return

    try {
      await atualizarColaboradores(editingDate, editColaboradores)
      setEscalas((prev) =>
        prev.map((e) =>
          e.data === editingDate ? { ...e, colaboradores: editColaboradores } : e
        )
      )
      cancelEditing()
    } catch (error) {
      console.error("Erro ao salvar:", error)
      alert("Erro ao salvar alteracoes")
    }
  }

  function addColaborador() {
    if (novoColaborador.trim()) {
      setEditColaboradores((prev) => [...prev, novoColaborador.trim()])
      setNovoColaborador("")
    }
  }

  function removeColaborador(index: number) {
    setEditColaboradores((prev) => prev.filter((_, i) => i !== index))
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

  // Funções de Compartilhamento
  function handleShareGroup() {
    let text = `*Escala de Plantões*\n\n`
    let hasEntries = false

    escalasFiltradas.forEach((e) => {
      if (e.colaboradores.length > 0) {
        text += `🗓️ *${e.data}* - ${e.colaboradores.join(", ")}\n`
        hasEntries = true
      }
    })

    if (!hasEntries) {
      alert("Não há escalas futuras definidas.")
      return
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(whatsappUrl, "_blank")
  }

  function handleShareDriver() {
    if (!shareDriverName) {
      alert("Selecione um motorista.")
      return
    }

    let text = `Olá *${shareDriverName}*, aqui estão seus próximos plantões:\n\n`
    let count = 0

    escalasFiltradas.forEach((e) => {
      if (e.colaboradores.includes(shareDriverName)) {
        text += `✅ *${e.data}*\n`
        count++
      }
    })

    if (count === 0) {
      alert(`${shareDriverName} não tem plantões futuros definidos.`)
      return
    }

    text += `\nTotal: ${count} plantões. Bom trabalho! 🚐💨`

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(whatsappUrl, "_blank")
    setShareDriverModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
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
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-accent/10 to-transparent border-b border-border">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <Upload className="h-5 w-5 text-accent" />
              </div>
              Gerenciar Escalas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
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

            {/* Botões de Compartilhamento */}
            <div className="flex gap-2 pt-2 border-t border-border mt-4">
              <Button onClick={handleShareGroup} className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none">
                <Share2 className="h-4 w-4 mr-2" />
                Compartilhar no Grupo
              </Button>
              <Button onClick={() => setShareDriverModalOpen(true)} variant="outline" className="border-green-600 text-green-600 hover:bg-green-50 flex-1 sm:flex-none">
                <MessageCircle className="h-4 w-4 mr-2" />
                Compartilhar com Motorista
              </Button>
            </div>
          </CardContent>
        </Card>

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

                    {editingDate === escala.data ? (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          {/* Input com Datalist para Sugestão de Nomes */}
                          <Input
                            list="colaboradores-list"
                            placeholder="Nome do colaborador"
                            value={novoColaborador}
                            onChange={(e) => setNovoColaborador(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addColaborador()}
                          />
                          <datalist id="colaboradores-list">
                            {todosColaboradores.map((nome) => (
                              <option key={nome} value={nome} />
                            ))}
                          </datalist>
                          <Button onClick={addColaborador} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <ul className="space-y-2">
                          {editColaboradores.map((col, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between p-2 bg-secondary/50 rounded"
                            >
                              <span>{col}</span>
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
      </main>

      {/* Modal Compartilhar com Motorista */}
      {shareDriverModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-in fade-in zoom-in-95">
            <CardHeader>
              <CardTitle>Compartilhar com Motorista</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Selecione o motorista</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={shareDriverName}
                  onChange={(e) => setShareDriverName(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {todosColaboradores.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShareDriverModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleShareDriver} className="bg-green-600 hover:bg-green-700 text-white">
                  <Send className="h-4 w-4 mr-2" />
                  Enviar WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
