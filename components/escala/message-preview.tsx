"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Copy, Check, Bus, MessageCircle, AlertTriangle } from "lucide-react"

interface MessagePreviewProps {
  message: string
  peopleCount: number
  hasPeople: boolean
  selectedDate: string
  telefoneMotorista: string
}

export function MessagePreview({
  message,
  peopleCount,
  hasPeople,
  selectedDate,
  telefoneMotorista,
}: MessagePreviewProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendToWhatsApp = (to: "motorista" | "grupo") => {
    const encodedMsg = encodeURIComponent(message)
    let url = ""
    if (to === "motorista" && telefoneMotorista) {
      url = `https://wa.me/55${telefoneMotorista.replace(/\D/g, "")}?text=${encodedMsg}`
    } else {
      url = `https://api.whatsapp.com/send?text=${encodedMsg}`
    }
    window.open(url, "_blank")
  }

  if (!hasPeople) {
    return (
      <Card className="p-5">
        <div className="text-center p-8 border border-dashed border-destructive/30 bg-destructive/5 rounded-xl text-destructive">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="mt-2">
            Nenhuma escala para a data: <strong>{selectedDate}</strong>
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Preview da Mensagem
        </h2>
        <Badge variant="secondary" className="bg-accent/10 text-accent">
          {peopleCount} Pessoas
        </Badge>
      </div>

      {/* WhatsApp Style Preview */}
      <div className="bg-[#e5ddd5] p-4 rounded-xl mb-5 relative overflow-hidden shadow-inner">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'url("https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png")',
          }}
        />
        <div className="relative bg-[#d9fdd3] text-foreground p-4 rounded-lg shadow-sm whitespace-pre-wrap text-sm max-w-[90%] border border-[#c1e8ba]">
          {message}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button
          variant="secondary"
          onClick={copyToClipboard}
          className="flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copiar Texto
            </>
          )}
        </Button>
        <Button
          onClick={() => sendToWhatsApp("motorista")}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90"
        >
          <Bus className="h-4 w-4" />
          Enviar Motorista
        </Button>
        <Button
          onClick={() => sendToWhatsApp("grupo")}
          className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          Enviar no Grupo
        </Button>
      </div>
    </Card>
  )
}
