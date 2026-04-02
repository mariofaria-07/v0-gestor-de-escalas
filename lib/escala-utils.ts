import type { EscalaData } from "./escala-types"

export function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null
  dateStr = dateStr.trim()
  
  // Format: YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }
  
  // Format: DD/MM/YYYY
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateStr
  }
  
  return null
}

export function cleanName(rawName: string): string {
  return rawName ? rawName.split('-')[0].trim() : ''
}

export function formatNameCapitalized(name: string): string {
  return name.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
}

export function getTodayFormatted(): string {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function parseCSVToEscala(text: string): EscalaData {
  const lines = text.split('\n')
  const newEscala: EscalaData = {}
  let currentDateStr: string | null = null

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim().replace(/"/g, '')
    if (!line) continue
    const cols = line.split(',')

    let foundDate: string | null = null
    for (const col of cols) {
      const normalized = normalizeDate(col)
      if (normalized) {
        foundDate = normalized
        break
      }
    }

    if (foundDate) {
      currentDateStr = foundDate
      if (!newEscala[currentDateStr]) newEscala[currentDateStr] = []

      const nonEmptyCols = cols.filter(
        (c) =>
          c.trim().length > 0 &&
          !normalizeDate(c) &&
          !c.toLowerCase().includes('feira')
      )
      if (nonEmptyCols.length > 0) {
        const possibleName = nonEmptyCols[nonEmptyCols.length - 1]
        if (
          possibleName &&
          !['COLABORADORES', 'DIA', 'DATA'].includes(possibleName.toUpperCase())
        ) {
          newEscala[currentDateStr].push(cleanName(possibleName))
        }
      }
    } else if (currentDateStr) {
      const nonEmptyCols = cols.filter((c) => c.trim().length > 0)
      if (nonEmptyCols.length > 0) {
        const possibleName = nonEmptyCols[nonEmptyCols.length - 1]
        if (
          !possibleName.toUpperCase().includes('NÃO TEVE ESCALA') &&
          !possibleName.toUpperCase().includes('SEM ESCALA')
        ) {
          newEscala[currentDateStr].push(cleanName(possibleName))
        } else {
          newEscala[currentDateStr] = ['SEM ESCALA / NÃO HOUVE']
        }
      }
    }
  }

  return newEscala
}

export function generateWhatsAppMessage(
  date: string,
  people: string[]
): string {
  if (people.length === 0) {
    return `Nenhuma escala encontrada para ${date}.`
  }

  if (people[0] === 'SEM ESCALA / NÃO HOUVE') {
    return `📅 *Escala Rio Acima - ${date}*\n\nNÃO HAVERÁ ESCALA NESTE DIA.`
  }

  let msg = `📅 *Escala Rio Acima - ${date}*\n🚐 *Atenção Motorista e Colaboradores*\n\n👥 *Passageiros do dia:*\n`

  people.forEach((pessoa) => {
    const nomeFormatado = formatNameCapitalized(pessoa)
    msg += `▪️ ${nomeFormatado}\n`
  })

  msg += `\n⏰ Por favor, estejam nos pontos de embarque no horário combinado.`

  return msg
}
