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
    <Card className="w-full max-w-md mx-auto shadow-2xl border-0 overflow-hidden">
      {/* Header com gradiente */}
      <CardHeader className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground pb-6 pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl shadow-lg">
            <Bus className="h-7 w-7" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Escala Rio Acima</CardTitle>
            <p className="text-sm text-primary-foreground/80 mt-0.5">Transporte de Colaboradores</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-8 px-6">
        {/* Data */}
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-border">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-lg text-foreground">{dataFormatada}</p>
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
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <span className="font-semibold text-foreground">Passageiros do dia</span>
              <Badge className="ml-auto bg-accent text-accent-foreground shadow-sm">
                {escala.colaboradores.length} pessoas
              </Badge>
            </div>
            
            <ul className="space-y-3">
              {escala.colaboradores.map((colaborador, index) => {
                const localDiferente = escala.locaisDiferentes?.[colaborador];
                return (
                  <li
                    key={index}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-secondary/80 to-secondary/40 rounded-xl border border-border/50 shadow-sm"
                  >
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-md shrink-0">
                      <span className="text-sm font-bold text-primary-foreground">
                        {colaborador.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-foreground font-medium">{colaborador}</span>
                      {localDiferente && (
                        <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          📍 {localDiferente}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-sm text-muted-foreground text-center">
                Por favor, estejam nos pontos de embarque no horario combinado.
              </p>
            </div>
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
