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
} from "lucide-react"

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Painel Admin - Escalas</h1>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Upload e Refresh */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Escala
            </CardTitle>
          </CardHeader>
          <CardContent>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Escalas ({escalasFiltradas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nome do colaborador"
                            value={novoColaborador}
                            onChange={(e) => setNovoColaborador(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addColaborador()}
                          />
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
      </main>
    </div>
  )
}
