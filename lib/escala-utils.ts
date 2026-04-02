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

  // Detect delimiter: semicolon or comma
  const firstDataLine = lines.find(l => l.trim() && !l.toLowerCase().includes('data;') && !l.toLowerCase().includes('data,'))
  const delimiter = text.includes(';') ? ';' : ','

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim().replace(/"/g, '')
    if (!line) continue
    
    const cols = line.split(delimiter)

    // Check if first column has a date
    const firstCol = cols[0]?.trim() || ''
    const foundDate = normalizeDate(firstCol)

    if (foundDate) {
      // New date found - this is the start of a new day's entries
      currentDateStr = foundDate
      if (!newEscala[currentDateStr]) newEscala[currentDateStr] = []

      // Get the collaborator name from the third column (index 2)
      const collaboratorName = cols[2]?.trim() || ''
      
      if (collaboratorName && 
          !['COLABORADORES', 'DIA', 'DATA'].includes(collaboratorName.toUpperCase())) {
        // Check for holidays or special days
        if (collaboratorName.toLowerCase().includes('feriado')) {
          newEscala[currentDateStr] = [collaboratorName]
        } else if (
          !collaboratorName.toUpperCase().includes('NÃO TEVE ESCALA') &&
          !collaboratorName.toUpperCase().includes('SEM ESCALA')
        ) {
          newEscala[currentDateStr].push(cleanName(collaboratorName))
        } else {
          newEscala[currentDateStr] = ['SEM ESCALA / NÃO HOUVE']
        }
      }
    } else if (currentDateStr) {
      // No date in first column - continuation of previous date's entries
      // The collaborator name is in the third column (index 2)
      const collaboratorName = cols[2]?.trim() || cols[0]?.trim() || ''
      
      if (collaboratorName) {
        if (
          !collaboratorName.toUpperCase().includes('NÃO TEVE ESCALA') &&
          !collaboratorName.toUpperCase().includes('SEM ESCALA') &&
          !collaboratorName.toLowerCase().includes('feriado')
        ) {
          newEscala[currentDateStr].push(cleanName(collaboratorName))
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
    return `*Escala Rio Acima - ${date}*\n\nNAO HAVERA ESCALA NESTE DIA.`
  }

  // Check if it's a holiday
  if (people.length === 1 && people[0].toLowerCase().includes('feriado')) {
    return `*Escala Rio Acima - ${date}*\n\n${people[0].toUpperCase()}\n\nNAO HAVERA ESCALA NESTE DIA.`
  }

  let msg = `*Escala Rio Acima - ${date}*\n*Atencao Motorista e Colaboradores*\n\n*Passageiros do dia:*\n`

  people.forEach((pessoa) => {
    const nomeFormatado = formatNameCapitalized(pessoa)
    msg += `- ${nomeFormatado}\n`
  })

  msg += `\nPor favor, estejam nos pontos de embarque no horario combinado.`

  return msg
}
