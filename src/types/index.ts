import { InvoiceData } from "../lib/parser";

export interface SystemInvoice {
  emissao: string;
  fornecedor: string;
  cnpjFornecedor?: string;
  numero: string;
  pis: number;
  cofins: number;
  csll: number;
  irrf: number;
  iss: number;
  inss: number;
  valorServico?: number;
}

export interface ReconciliationResult {
  id: string;
  xmlInvoice?: InvoiceData;
  systemInvoice?: SystemInvoice;
  status: 'Conciliado' | 'Divergente' | 'Não Lançado' | 'Falta XML';
  divergences: string[];
  justification?: string;
  takerCnpj?: string;
  takerName?: string;
  competence?: string;
  manuallyLinked?: boolean;
  reconciledBy?: string;
  reconciledAt?: string;
}

export interface Company {
  id?: string;
  cnpj: string;
  rootCnpj: string;
  name: string;
  identifier?: string;
  address?: string;
  city?: string;
  state?: string;
}

export interface ClosedMonth {
  id: string;
  competence: string;
  cnpj: string;
  closedAt: string;
  closedBy: string;
}
