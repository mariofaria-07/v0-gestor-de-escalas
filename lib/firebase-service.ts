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
} from "firebase/firestore"
import type { EscalaDia } from "./firebase-types"

const ESCALAS_COLLECTION = "escalas"

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

// Salvar ou atualizar escala
export async function salvarEscala(escala: EscalaDia): Promise<boolean> {
  try {
    const docId = dateToSortKey(escala.data)
    await setDoc(doc(db, ESCALAS_COLLECTION, docId), {
      data: escala.data,
      colaboradores: escala.colaboradores,
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
export async function importarEscalas(escalaData: Record<string, string[]>): Promise<number> {
  let count = 0
  
  for (const [data, colaboradores] of Object.entries(escalaData)) {
    const isFeriado = colaboradores.length === 1 && colaboradores[0].toLowerCase().includes("feriado")
    
    const escala: EscalaDia = {
      data,
      colaboradores: isFeriado ? [] : colaboradores,
      enviado: false,
      feriado: isFeriado,
      descricaoFeriado: isFeriado ? colaboradores[0] : undefined,
    }
    
    const success = await salvarEscala(escala)
    if (success) count++
  }
  
  return count
}

// Atualizar colaboradores de uma escala
export async function atualizarColaboradores(data: string, colaboradores: string[]): Promise<boolean> {
  try {
    const docId = dateToSortKey(data)
    await updateDoc(doc(db, ESCALAS_COLLECTION, docId), {
      colaboradores,
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
