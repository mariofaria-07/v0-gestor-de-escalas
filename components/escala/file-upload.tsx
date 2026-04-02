"use client"

import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileSpreadsheet, Upload, X, Trash2 } from "lucide-react"
import type { EscalaData } from "@/lib/escala-types"
import { parseCSVToEscala } from "@/lib/escala-utils"
import * as XLSX from "xlsx"

interface FileUploadProps {
  hasData: boolean
  onDataLoaded: (data: EscalaData) => void
  onReset: () => void
  onClose: () => void
}

export function FileUpload({
  hasData,
  onDataLoaded,
  onReset,
  onClose,
}: FileUploadProps) {
  const [errorMsg, setErrorMsg] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File) => {
    setErrorMsg("")
    const fileName = file.name.toLowerCase()

    if (fileName.endsWith(".csv")) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        const escala = parseCSVToEscala(result)
        onDataLoaded(escala)
      }
      reader.readAsText(file, "utf-8")
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const csvText = XLSX.utils.sheet_to_csv(worksheet, { FS: "," })
          const escala = parseCSVToEscala(csvText)
          onDataLoaded(escala)
        } catch {
          setErrorMsg("Erro ao processar o arquivo Excel.")
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      setErrorMsg("Formato não suportado. Use .csv, .xlsx ou .xls.")
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  return (
    <Card className="p-5 border-2 border-primary/20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Importar Nova Planilha
        </h2>
        {hasData && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/50 hover:bg-muted"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Clique aqui</span> ou
          arraste o arquivo
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          .xlsx, .xls ou .csv
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={handleFileChange}
        />
      </div>

      {errorMsg && (
        <p className="text-destructive text-sm mt-2 font-semibold text-center">
          {errorMsg}
        </p>
      )}

      {hasData && (
        <Button
          variant="ghost"
          onClick={onReset}
          className="w-full mt-3 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Apagar escala da memória
        </Button>
      )}
    </Card>
  )
}
