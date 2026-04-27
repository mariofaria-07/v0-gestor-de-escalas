export interface EscalaData {
  [date: string]: {
    nome: string;
    telefone?: string;
    supervisor?: string;
  }[]
}

export interface ParsedSchedule {
  date: string
  people: string[]
}
