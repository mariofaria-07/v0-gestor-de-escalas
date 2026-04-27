"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AutocompleteInput } from "@/components/ui/autocomplete"
import type { EscalaDia, SolicitacaoAlteracao } from "@/lib/firebase-types"
import { Bus, Users, Calendar, AlertTriangle, MoreVertical, MapPin, UserMinus, UserPlus, Check, X, Plus } from "lucide-react"
import { atualizarLocal, adicionarSolicitacao, processarSolicitacao, registrarFalta } from "@/lib/firebase-service"

interface EscalaCardProps {
  escala: EscalaDia | null
  dataFormatada: string
  diaSemana: string
  onUpdate?: () => void
  allColaboradores?: string[]
}

export function EscalaCard({ escala, dataFormatada, diaSemana, onUpdate, allColaboradores = [] }: EscalaCardProps) {
  const [actionState, setActionState] = useState<Record<string, 'local' | 'excluir' | 'substituir' | null>>({})
  const [localInput, setLocalInput] = useState("")
  const [substitutoInput, setSubstitutoInput] = useState("")
  const [motivoInput, setMotivoInput] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  const [isAdding, setIsAdding] = useState(false)
  const [novoColaboradorInput, setNovoColaboradorInput] = useState("")

  const hasEscala = escala && escala.colaboradores.length > 0
  const isFeriado = escala?.feriado
  const solicitacoesPendentes = escala?.solicitacoes?.filter(s => s.status === 'pendente') || []

  const toggleAction = (colaborador: string, action: 'local' | 'excluir' | 'substituir' | null) => {
    setActionState(prev => ({ ...prev, [colaborador]: prev[colaborador] === action ? null : action }))
    setLocalInput("")
    setSubstitutoInput("")
    setMotivoInput("")
  }

  const handleSetLocal = async (colaborador: string, tipo: 'matriz' | 'outro') => {
    if (!escala) return
    setIsProcessing(true)
    const local = tipo === 'matriz' ? 'Bamaq Matriz' : localInput
    const success = await atualizarLocal(escala.data, colaborador, local)
    if (success && onUpdate) onUpdate()
    toggleAction(colaborador, null)
    setIsProcessing(false)
  }

  const handleExclusao = async (colaborador: string) => {
    if (!escala || !motivoInput.trim()) return
    
    setIsProcessing(true)
    const success = await registrarFalta(escala.data, colaborador, motivoInput.trim())
    if (success && onUpdate) onUpdate()
    toggleAction(colaborador, null)
    setIsProcessing(false)
  }

  const handleSolicitacao = async (colaborador: string, tipo: 'substituicao') => {
    if (!escala) return
    if (tipo === 'substituicao' && !substitutoInput.trim()) return
    
    setIsProcessing(true)
    const solicitacao: SolicitacaoAlteracao = {
      id: Math.random().toString(36).substring(2, 9),
      tipo,
      colaboradorOriginal: colaborador,
      colaboradorNovo: substitutoInput.trim(),
      status: 'pendente',
      dataSolicitacao: new Date().toISOString()
    }
    
    const success = await adicionarSolicitacao(escala.data, solicitacao)
    if (success && onUpdate) onUpdate()
    toggleAction(colaborador, null)
    setIsProcessing(false)
  }

  const handleAdicionarPessoa = async () => {
    if (!escala || !novoColaboradorInput.trim()) return
    
    setIsProcessing(true)
    const solicitacao: SolicitacaoAlteracao = {
      id: Math.random().toString(36).substring(2, 9),
      tipo: 'adicao',
      colaboradorNovo: novoColaboradorInput.trim(),
      status: 'pendente',
      dataSolicitacao: new Date().toISOString()
    }
    
    const success = await adicionarSolicitacao(escala.data, solicitacao)
    if (success && onUpdate) onUpdate()
    setIsAdding(false)
    setNovoColaboradorInput("")
    setIsProcessing(false)
  }

  const handleAprovarRejeitar = async (solicitacaoId: string, acao: 'aprovar' | 'rejeitar') => {
    if (!escala) return
    if (acao === 'aprovar' && adminPassword !== 'RA2026') {
      alert("Senha incorreta!")
      return
    }
    
    setIsProcessing(true)
    const success = await processarSolicitacao(escala.data, solicitacaoId, acao)
    if (success && onUpdate) onUpdate()
    setApprovingId(null)
    setAdminPassword("")
    setIsProcessing(false)
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/40 bg-card/90 backdrop-blur-xl overflow-hidden rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header com gradiente */}
      <CardHeader className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground pb-8 pt-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-black/10 rounded-full blur-2xl"></div>
        
        {/* Logo Grupo Bamaq */}
        <div className="absolute top-4 left-4 z-20">
          <div className="flex items-center gap-1 font-bold text-lg tracking-tighter text-white drop-shadow-sm">
            <span className="bg-white text-primary px-1.5 py-0.5 rounded-sm text-sm">BAMAQ</span>
            <span className="opacity-90 text-sm font-medium">GRUPO</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 relative z-10 text-center mt-6">
          <div className="p-4 bg-white/20 rounded-2xl shadow-inner backdrop-blur-sm border border-white/10">
            <Bus className="h-8 w-8 text-white drop-shadow-md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black tracking-tight drop-shadow-sm">Escala Rio Acima</CardTitle>
            <p className="text-sm font-medium text-primary-foreground/90 mt-1 tracking-wide uppercase opacity-90">Transporte de Colaboradores</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-8 pb-8 px-6">
        {/* Data */}
        <div className="flex items-center justify-center gap-3 mb-8 pb-6 border-b border-border/60">
          <div className="flex flex-col items-center">
            <p className="font-black text-3xl text-foreground tracking-tight">{dataFormatada.substring(0, 5)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{diaSemana}</p>
            </div>
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
            
            <ul className="space-y-0">
              {escala.colaboradores.map((colaborador, index) => {
                const localDiferente = escala.locaisDiferentes?.[colaborador];
                const dadosExtra = escala.dadosColaboradores?.[colaborador];
                const solicitacaoPendente = solicitacoesPendentes.find(s => s.colaboradorOriginal === colaborador);
                const action = actionState[colaborador];

                return (
                  <li
                    key={index}
                    className="flex flex-col p-4 bg-gradient-to-r from-secondary/80 to-secondary/40 rounded-xl border border-border/50 shadow-sm mb-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-md shrink-0">
                          <span className="text-sm font-bold text-primary-foreground">
                            {colaborador.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-foreground font-medium leading-tight mb-0.5">{colaborador}</span>
                          {dadosExtra?.supervisor && (
                            <span className="text-[10px] text-muted-foreground">Sup: {dadosExtra.supervisor}</span>
                          )}
                          {dadosExtra?.telefone && (
                            <span className="text-[10px] text-muted-foreground">📞 {dadosExtra.telefone}</span>
                          )}
                          {localDiferente && (
                            <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              📍 {localDiferente}
                            </span>
                          )}
                          {solicitacaoPendente && (
                            <span className="text-xs text-amber-600 mt-0.5 font-medium">
                              ⏳ {solicitacaoPendente.tipo === 'exclusao' ? 'Exclusão pendente' : `Substituição por ${solicitacaoPendente.colaboradorNovo} pendente`}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {!solicitacaoPendente && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleAction(colaborador, 'local')}>
                              <MapPin className="h-4 w-4 mr-2" /> Definir Local
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleAction(colaborador, 'substituir')}>
                              <UserPlus className="h-4 w-4 mr-2" /> Substituir
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleAction(colaborador, 'excluir')} className="text-destructive">
                              <UserMinus className="h-4 w-4 mr-2" /> Não vou
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Action Forms */}
                    {action === 'local' && (
                      <div className="mt-4 pt-3 border-t border-border/50 flex flex-col gap-2">
                        <p className="text-sm font-medium">Onde você vai pegar o transporte?</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleSetLocal(colaborador, 'matriz')} disabled={isProcessing}>
                            Na Matriz
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleAction(colaborador, null)} disabled={isProcessing}>
                            Cancelar
                          </Button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Input 
                            placeholder="Outro local..." 
                            value={localInput} 
                            onChange={e => setLocalInput(e.target.value)}
                            className="h-8 text-sm"
                          />
                          <Button size="sm" onClick={() => handleSetLocal(colaborador, 'outro')} disabled={!localInput.trim() || isProcessing}>
                            Salvar
                          </Button>
                        </div>
                      </div>
                    )}

                    {action === 'excluir' && (
                      <div className="mt-4 pt-3 border-t border-border/50 flex flex-col gap-2">
                        <p className="text-sm font-medium text-destructive">Por que você não vai?</p>
                        <Input 
                          placeholder="Motivo da falta..." 
                          value={motivoInput} 
                          onChange={e => setMotivoInput(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2 mt-1">
                          <Button size="sm" variant="destructive" onClick={() => handleExclusao(colaborador)} disabled={!motivoInput.trim() || isProcessing}>
                            Confirmar Falta
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleAction(colaborador, null)} disabled={isProcessing}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}

                    {action === 'substituir' && (
                      <div className="mt-4 pt-3 border-t border-border/50 flex flex-col gap-2">
                        <p className="text-sm font-medium">Quem vai no seu lugar?</p>
                        <div className="flex gap-2">
                          <AutocompleteInput 
                            placeholder="Nome do substituto" 
                            value={substitutoInput} 
                            onChange={setSubstitutoInput}
                            options={allColaboradores}
                          />
                          <Button size="sm" onClick={() => handleSolicitacao(colaborador, 'substituicao')} disabled={!substitutoInput.trim() || isProcessing}>
                            Solicitar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleAction(colaborador, null)} disabled={isProcessing}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Add New Person Section */}
            <div className="mt-4">
              {isAdding ? (
                <div className="p-4 bg-secondary/30 rounded-xl border border-border/50 shadow-sm flex flex-col gap-3">
                  <p className="text-sm font-medium">Adicionar nova pessoa (esporádico)</p>
                  <div className="flex gap-2">
                    <AutocompleteInput 
                      placeholder="Nome da pessoa" 
                      value={novoColaboradorInput} 
                      onChange={setNovoColaboradorInput}
                      options={allColaboradores}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => { setIsAdding(false); setNovoColaboradorInput(""); }} disabled={isProcessing}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleAdicionarPessoa} disabled={!novoColaboradorInput.trim() || isProcessing}>
                      Solicitar Adição
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full border-dashed border-2 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsAdding(true)}
                >
                  <Plus className="h-4 w-4" /> Adicionar pessoa na rota hoje
                </Button>
              )}
            </div>

            {/* Pending Solicitacoes Admin Approval Section */}
            {solicitacoesPendentes.length > 0 && (
              <div className="mt-6 pt-5 border-t border-border">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Aprovações Pendentes (Admin)
                </h4>
                <ul className="space-y-3">
                  {solicitacoesPendentes.map(sol => (
                    <li key={sol.id} className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50 text-sm">
                      <div className="mb-2">
                        <span className="font-medium">
                          {sol.tipo === 'adicao' ? sol.colaboradorNovo : sol.colaboradorOriginal}
                        </span>
                        {sol.tipo === 'exclusao' && ' solicitou exclusão.'}
                        {sol.tipo === 'substituicao' && ` solicitou substituição por ${sol.colaboradorNovo}.`}
                        {sol.tipo === 'adicao' && ' solicitou adição esporádica.'}
                      </div>
                      
                      {approvingId === sol.id ? (
                        <div className="flex gap-2 items-center flex-wrap">
                          <Input 
                            type="password" 
                            placeholder="Senha Admin" 
                            value={adminPassword} 
                            onChange={e => setAdminPassword(e.target.value)}
                            className="h-8 w-32 text-xs"
                          />
                          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => handleAprovarRejeitar(sol.id, 'aprovar')} disabled={isProcessing}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8" onClick={() => handleAprovarRejeitar(sol.id, 'rejeitar')} disabled={isProcessing}>
                            <X className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setApprovingId(null)} disabled={isProcessing}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setApprovingId(sol.id)}>
                          Avaliar Solicitação
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
