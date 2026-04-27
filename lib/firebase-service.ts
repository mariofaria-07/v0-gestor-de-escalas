import { db } from "./firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  addDoc,
} from "firebase/firestore"
import type { EscalaDia, Reporte } from "./firebase-types"

const ESCALAS_COLLECTION = "escalas"
const REPORTES_COLLECTION = "reportes"

// Converter data DD/MM/YYYY para YYYYMMDD para ordenacao
function dateToSortKey(date: string): string {
  const parts = date.split("/")
  if (parts.length === 3) {
    return `${parts[2]}${parts[1]}${parts[0]}`
  }
  return date
}

// Obter escala de um dia especifico
export async function getEscalaDia(data: string): Promise<EscalaDia | null> {
  try {
    const docRef = doc(db, ESCALAS_COLLECTION, dateToSortKey(data))
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as EscalaDia
    }
    return null
  } catch (error) {
    console.error("Erro ao buscar escala:", error)
    return null
  }
}

// Obter escala de hoje
export async function getEscalaHoje(): Promise<EscalaDia | null> {
  const hoje = new Date()
  const dataFormatada = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`
  return getEscalaDia(dataFormatada)
}

// Obter todas as escalas
export async function getTodasEscalas(): Promise<EscalaDia[]> {
  try {
    const querySnapshot = await getDocs(collection(db, ESCALAS_COLLECTION))
    const escalas: EscalaDia[] = []
    
    querySnapshot.forEach((doc) => {
      escalas.push({ id: doc.id, ...doc.data() } as EscalaDia)
    })
    
    // Ordenar por data (mais recente primeiro)
    escalas.sort((a, b) => dateToSortKey(b.data).localeCompare(dateToSortKey(a.data)))
    
    return escalas
  } catch (error) {
    console.error("Erro ao buscar escalas:", error)
    return []
  }
}

// Obter todos os nomes de colaboradores únicos do histórico
export async function getTodosColaboradoresNomes(): Promise<string[]> {
  try {
    const escalas = await getTodasEscalas()
    const nomes = new Set<string>()
    escalas.forEach(e => {
      e.colaboradores?.forEach(c => nomes.add(c))
    })
    return Array.from(nomes).sort()
  } catch (error) {
    console.error("Erro ao buscar nomes de colaboradores:", error)
    return []
  }
}

// Salvar ou atualizar escala
export async function salvarEscala(escala: EscalaDia): Promise<boolean> {
  try {
    const docId = dateToSortKey(escala.data)
    await setDoc(doc(db, ESCALAS_COLLECTION, docId), {
      data: escala.data,
      colaboradores: escala.colaboradores,
      locaisDiferentes: escala.locaisDiferentes || {},
      solicitacoes: escala.solicitacoes || [],
      enviado: escala.enviado || false,
      enviadoEm: escala.enviadoEm || null,
      observacao: escala.observacao || null,
      feriado: escala.feriado || false,
      descricaoFeriado: escala.descricaoFeriado || null,
    })
    return true
  } catch (error) {
    console.error("Erro ao salvar escala:", error)
    return false
  }
}

// Importar escalas do CSV parseado
export async function importarEscalas(escalaData: import("./escala-types").EscalaData): Promise<number> {
  let count = 0
  
  for (const [data, dadosDia] of Object.entries(escalaData)) {
    // Check se a escala ja existe
    const escalaExistente = await getEscalaDia(data)
    
    const isFeriado = dadosDia.length === 1 && dadosDia[0].nome.toLowerCase().includes("feriado")
    
    let colaboradoresNomes = escalaExistente?.colaboradores || []
    let dadosColaboradores = escalaExistente?.dadosColaboradores || {}
    
    if (isFeriado) {
      colaboradoresNomes = []
    } else {
      for (const colab of dadosDia) {
        if (!colaboradoresNomes.includes(colab.nome)) {
          colaboradoresNomes.push(colab.nome)
        }
        if (colab.telefone || colab.supervisor) {
          dadosColaboradores[colab.nome] = {
            ...dadosColaboradores[colab.nome],
            ...(colab.telefone ? { telefone: colab.telefone } : {}),
            ...(colab.supervisor ? { supervisor: colab.supervisor } : {})
          }
        }
      }
    }
    
    const escala: EscalaDia = {
      ...escalaExistente,
      data,
      colaboradores: colaboradoresNomes,
      dadosColaboradores,
      enviado: escalaExistente?.enviado || false,
      feriado: isFeriado || (escalaExistente?.feriado || false),
      descricaoFeriado: isFeriado ? dadosDia[0].nome : (escalaExistente?.descricaoFeriado || undefined),
    }
    
    const success = await salvarEscala(escala)
    if (success) count++
  }
  
  return count
}

// Atualizar colaboradores de uma escala
export async function atualizarColaboradores(data: string, colaboradores: string[], locaisDiferentes?: Record<string, string>): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    await updateDoc(doc(db, ESCALAS_COLLECTION, docId), {
      colaboradores,
      locaisDiferentes: locaisDiferentes || {},
    })
    return true
  } catch (error) {
    console.error("Erro ao atualizar colaboradores:", error)
    return false
  }
}

// Marcar escala como enviada
export async function marcarComoEnviada(data: string): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    await updateDoc(doc(db, ESCALAS_COLLECTION, docId), {
      enviado: true,
      enviadoEm: new Date().toISOString(),
    })
    return true
  } catch (error) {
    console.error("Erro ao marcar como enviada:", error)
    return false
  }
}

// Deletar escala
export async function deletarEscala(data: string): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    await deleteDoc(doc(db, ESCALAS_COLLECTION, docId))
    return true
  } catch (error) {
    console.error("Erro ao deletar escala:", error)
    return false
  }
}

// Atualizar local de um colaborador
export async function atualizarLocal(data: string, colaborador: string, local: string | null): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    const docRef = doc(db, ESCALAS_COLLECTION, docId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const escala = docSnap.data() as EscalaDia
      const locais = escala.locaisDiferentes || {}
      
      if (local) {
        locais[colaborador] = local
      } else {
        delete locais[colaborador]
      }
      
      await updateDoc(docRef, { locaisDiferentes: locais })
      return true
    }
    return false
  } catch (error) {
    console.error("Erro ao atualizar local:", error)
    return false
  }
}

// Adicionar solicitação de alteração
export async function adicionarSolicitacao(data: string, solicitacao: import("./firebase-types").SolicitacaoAlteracao): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    const docRef = doc(db, ESCALAS_COLLECTION, docId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const escala = docSnap.data() as EscalaDia
      const solicitacoes = escala.solicitacoes || []
      solicitacoes.push(solicitacao)
      
      await updateDoc(docRef, { solicitacoes })
      return true
    }
    return false
  } catch (error) {
    console.error("Erro ao adicionar solicitacao:", error)
    return false
  }
}

// Registrar falta (exclusão automática)
export async function registrarFalta(data: string, colaborador: string, motivo: string): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    const docRef = doc(db, ESCALAS_COLLECTION, docId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const escala = docSnap.data() as EscalaDia
      const solicitacoes = escala.solicitacoes || []
      
      const solicitacao: import("./firebase-types").SolicitacaoAlteracao = {
        id: Math.random().toString(36).substring(2, 9),
        tipo: 'exclusao',
        colaboradorOriginal: colaborador,
        motivo,
        status: 'aprovado', // Já entra como aprovado para sumir da lista
        dataSolicitacao: new Date().toISOString()
      }
      
      solicitacoes.push(solicitacao)
      
      const colaboradores = (escala.colaboradores || []).filter(c => c !== colaborador)
      
      await updateDoc(docRef, { 
        solicitacoes,
        colaboradores
      })
      return true
    }
    return false
  } catch (error) {
    console.error("Erro ao registrar falta:", error)
    return false
  }
}

// Processar solicitação de alteração
export async function processarSolicitacao(
  data: string, 
  solicitacaoId: string, 
  acao: 'aprovar' | 'rejeitar'
): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    const docRef = doc(db, ESCALAS_COLLECTION, docId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const escala = docSnap.data() as EscalaDia
      const solicitacoes = escala.solicitacoes || []
      const index = solicitacoes.findIndex(s => s.id === solicitacaoId)
      
      if (index === -1) return false;
      
      const sol = solicitacoes[index];
      sol.status = acao === 'aprovar' ? 'aprovado' : 'rejeitado';
      
      let colaboradores = [...(escala.colaboradores || [])];
      
      if (acao === 'aprovar') {
        if (sol.tipo === 'exclusao' && sol.colaboradorOriginal) {
          colaboradores = colaboradores.filter(c => c !== sol.colaboradorOriginal);
        } else if (sol.tipo === 'substituicao' && sol.colaboradorOriginal && sol.colaboradorNovo) {
          const colIndex = colaboradores.indexOf(sol.colaboradorOriginal);
          if (colIndex !== -1) {
            colaboradores[colIndex] = sol.colaboradorNovo;
          } else {
            // Se por algum motivo não achar, adiciona
            colaboradores.push(sol.colaboradorNovo);
          }
        } else if (sol.tipo === 'adicao' && sol.colaboradorNovo) {
          if (!colaboradores.includes(sol.colaboradorNovo)) {
            colaboradores.push(sol.colaboradorNovo);
          }
        }
      }
      
      await updateDoc(docRef, { 
        solicitacoes,
        colaboradores
      })
      return true
    }
    return false
  } catch (error) {
    console.error("Erro ao processar solicitacao:", error)
    return false
  }
}

// Salvar um novo reporte
export async function salvarReporte(reporte: Omit<Reporte, 'id'>): Promise<boolean> {
  try {
    await addDoc(collection(db, REPORTES_COLLECTION), reporte)
    return true
  } catch (error) {
    console.error("Erro ao salvar reporte:", error)
    return false
  }
}

// Obter todos os reportes
export async function getReportes(): Promise<Reporte[]> {
  try {
    const querySnapshot = await getDocs(collection(db, REPORTES_COLLECTION))
    const reportes: Reporte[] = []
    querySnapshot.forEach((doc) => {
      reportes.push({ id: doc.id, ...doc.data() } as Reporte)
    })
    return reportes.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  } catch (error) {
    console.error("Erro ao buscar reportes:", error)
    return []
  }
}

// Marcar reporte como lido
export async function marcarReporteLido(id: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, REPORTES_COLLECTION, id), { lido: true })
    return true
  } catch (error) {
    console.error("Erro ao marcar reporte como lido:", error)
    return false
  }
}
