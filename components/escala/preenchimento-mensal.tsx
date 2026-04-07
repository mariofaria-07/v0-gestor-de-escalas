"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Upload, CalendarDays, Plus, Trash2, Save } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { parseCSVToEscala } from "@/lib/escala-utils"
import { importarEscalas } from "@/lib/firebase-service"

export function PreenchimentoMensal({ onUpdate }: { onUpdate: () => void }) {
  const [mes, setMes] = useState(new Date().getMonth().toString())
  const [ano, setAno] = useState(new Date().getFullYear().toString())
  const [uploading, setUploading] = useState(false)

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]

  const anos = [
    new Date().getFullYear().toString(),
    (new Date().getFullYear() + 1).toString()
  ]

  const baixarPlanilhaPadrao = () => {
    const diasNoMes = new Date(parseInt(ano), parseInt(mes) + 1, 0).getDate()
    let csvContent = "Data;Dia da Semana;Nome do Colaborador\n"

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const data = new Date(parseInt(ano), parseInt(mes), dia)
      const dataStr = `${String(dia).padStart(2, '0')}/${String(parseInt(mes) + 1).padStart(2, '0')}/${ano}`
      const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' })
      
      // Adiciona 5 linhas em branco por dia como sugestão
      for (let i = 0; i < 5; i++) {
        csvContent += `${dataStr};${diaSemana};\n`
      }
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `escala_padrao_${meses[parseInt(mes)]}_${ano}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
      onUpdate()
    } catch (error) {
      console.error("Erro ao importar:", error)
      alert("Erro ao importar arquivo. Verifique se está no formato correto.")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border">
          <CardTitle className="text-lg flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            Gerador de Escala Mensal
          </CardTitle>
          <CardDescription>
            Baixe a planilha padrão do mês, preencha com os nomes e importe novamente para o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Mês</label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m, i) => (
                    <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  {anos.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
            <div className="space-y-3 p-4 bg-secondary/30 rounded-xl border border-border">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">1</span>
                Baixar Planilha
              </h3>
              <p className="text-xs text-muted-foreground">
                Baixe o modelo em CSV já com todos os dias do mês selecionado.
              </p>
              <Button onClick={baixarPlanilhaPadrao} className="w-full" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Baixar Modelo ({meses[parseInt(mes)]})
              </Button>
            </div>

            <div className="space-y-3 p-4 bg-secondary/30 rounded-xl border border-border">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">2</span>
                Importar Planilha Preenchida
              </h3>
              <p className="text-xs text-muted-foreground">
                Faça o upload do arquivo CSV preenchido para alimentar o sistema.
              </p>
              <label className="block">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <Button
                  variant="default"
                  className="w-full cursor-pointer"
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
                        Importar CSV
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
