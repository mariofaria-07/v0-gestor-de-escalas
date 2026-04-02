"use client"

import { useState, useEffect, useMemo } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "./header"
import { Filters } from "./filters"
import { MessagePreview } from "./message-preview"
import { FileUpload } from "./file-upload"
import { NoDataAlert } from "./no-data-alert"
import type { EscalaData } from "@/lib/escala-types"
import { getTodayFormatted, generateWhatsAppMessage } from "@/lib/escala-utils"

const STORAGE_KEY = "escalaDataSalva"

export function GestorEscalas() {
  const [escalaData, setEscalaData] = useState<EscalaData>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [telefoneMotorista, setTelefoneMotorista] = useState("31993410980")
  const [showUpload, setShowUpload] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      try {
        setEscalaData(JSON.parse(savedData))
      } catch {
        console.error("Erro ao carregar dados salvos")
      }
    }
    setSelectedDate(getTodayFormatted())
    setIsLoaded(true)
  }, [])

  const hasData = Object.keys(escalaData).length > 0

  // Show upload section if no data
  useEffect(() => {
    if (isLoaded && !hasData) {
      setShowUpload(true)
    }
  }, [hasData, isLoaded])

  const pessoasHoje = useMemo(
    () => (selectedDate ? escalaData[selectedDate] || [] : []),
    [escalaData, selectedDate]
  )

  const mensagemFormatada = useMemo(
    () => (selectedDate ? generateWhatsAppMessage(selectedDate, pessoasHoje) : ""),
    [selectedDate, pessoasHoje]
  )

  const handleDataLoaded = (data: EscalaData) => {
    setEscalaData(data)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    setShowUpload(false)
  }

  const handleReset = () => {
    if (window.confirm("Isso irá apagar a escala salva atual. Tem certeza?")) {
      localStorage.removeItem(STORAGE_KEY)
      setEscalaData({})
      setShowUpload(true)
    }
  }

  // Avoid hydration mismatch by not rendering until client-side data is loaded
  if (!isLoaded) {
    return (
      <div className="min-h-screen p-4 md:p-8 pb-20">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-primary p-6 rounded-2xl shadow-md animate-pulse h-24" />
          <div className="bg-card p-5 rounded-2xl shadow-sm border animate-pulse h-24" />
          <div className="bg-card p-5 rounded-2xl shadow-sm border animate-pulse h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20">
      <div className="max-w-2xl mx-auto space-y-5">
        <Header />

        <Filters
          selectedDate={selectedDate || ""}
          onDateChange={setSelectedDate}
          telefoneMotorista={telefoneMotorista}
          onTelefoneChange={setTelefoneMotorista}
        />

        {!hasData ? (
          <NoDataAlert />
        ) : (
          <MessagePreview
            message={mensagemFormatada}
            peopleCount={pessoasHoje.length}
            hasPeople={pessoasHoje.length > 0}
            selectedDate={selectedDate || ""}
            telefoneMotorista={telefoneMotorista}
          />
        )}

        {showUpload && (
          <FileUpload
            hasData={hasData}
            onDataLoaded={handleDataLoaded}
            onReset={handleReset}
            onClose={() => setShowUpload(false)}
          />
        )}

        {!showUpload && (
          <div className="text-center mt-8">
            <Button
              variant="ghost"
              onClick={() => setShowUpload(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4 mr-2" />
              Atualizar Planilha do Mês
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
