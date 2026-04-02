"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { EscalaDia } from "@/lib/firebase-types"
import { Bus, Users, Calendar, AlertTriangle } from "lucide-react"

interface EscalaCardProps {
  escala: EscalaDia | null
  dataFormatada: string
  diaSemana: string
}

export function EscalaCard({ escala, dataFormatada, diaSemana }: EscalaCardProps) {
  const hasEscala = escala && escala.colaboradores.length > 0
  const isFeriado = escala?.feriado

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-0 overflow-hidden">
      {/* Header com cor de destaque */}
      <CardHeader className="bg-primary text-primary-foreground pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Bus className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold">Escala Rio Acima</CardTitle>
            <p className="text-sm text-primary-foreground/80">Transporte de Colaboradores</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-6">
        {/* Data */}
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-foreground">{dataFormatada}</p>
            <p className="text-sm text-muted-foreground capitalize">{diaSemana}</p>
          </div>
        </div>

        {/* Conteudo */}
        {isFeriado ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <p className="font-semibold text-amber-700 mb-1">{escala.descricaoFeriado}</p>
            <p className="text-sm text-muted-foreground">Nao havera escala neste dia</p>
          </div>
        ) : hasEscala ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Passageiros do dia</span>
              <Badge variant="secondary" className="ml-auto">
                {escala.colaboradores.length}
              </Badge>
            </div>
            
            <ul className="space-y-2">
              {escala.colaboradores.map((colaborador, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {colaborador.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-foreground">{colaborador}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm text-muted-foreground text-center border-t border-border pt-4">
              Por favor, estejam nos pontos de embarque no horario combinado.
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">Nenhuma escala encontrada</p>
            <p className="text-sm text-muted-foreground">Nao ha colaboradores escalados para este dia</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
