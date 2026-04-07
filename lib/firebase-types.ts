export interface Colaborador {
  nome: string
  ativo: boolean
}

export interface SolicitacaoAlteracao {
  id: string;
  tipo: 'exclusao' | 'substituicao' | 'adicao';
  colaboradorOriginal?: string; // Opcional para adicao
  colaboradorNovo?: string;
  motivo?: string; // Motivo para exclusao
  status: 'pendente' | 'aprovado' | 'rejeitado';
  dataSolicitacao: string;
}

export interface EscalaDia {
  id?: string
  data: string // formato DD/MM/YYYY
  colaboradores: string[]
  locaisDiferentes?: Record<string, string>
  solicitacoes?: SolicitacaoAlteracao[]
  enviado: boolean
  enviadoEm?: string
  observacao?: string
  feriado?: boolean
  descricaoFeriado?: string
}

export interface ConfiguracaoEnvio {
  horarioEnvio: string // formato HH:MM
  diasSemana: number[] // 1-5 para seg-sex
  telefoneMotorista: string
  ativo: boolean
}

export interface Reporte {
  id?: string;
  tipo: 'perigo' | 'alerta' | 'sugestao';
  mensagem: string;
  data: string;
  lido: boolean;
}
