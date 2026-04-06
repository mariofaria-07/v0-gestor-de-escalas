export interface Colaborador {
  nome: string
  ativo: boolean
}

export interface EscalaDia {
  id?: string
  data: string // formato DD/MM/YYYY
  colaboradores: string[]
  locaisDiferentes?: Record<string, string>
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
