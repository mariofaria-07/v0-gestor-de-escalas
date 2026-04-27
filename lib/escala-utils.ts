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
  const delimiter = text.includes(';') ? ';' : ','
  
  if (lines.length === 0) return newEscala

  const firstLineCols = lines[0].split(delimiter).map(c => c.trim().replace(/"/g, ''))
  const isMatrixFormat = firstLineCols[0]?.toLowerCase().includes('nome') || firstLineCols[0]?.toLowerCase().includes('colaborador') || firstLineCols.some(c => normalizeDate(c))

  if (isMatrixFormat && firstLineCols.length > 1) {
    // Matrix format: Col 0 is Name, Cols 1 is Telefone, Col 2 is Supervisor, Cols 3+ are Dates
    // Let's dynamically find columns
    let telIdx = -1
    let supIdx = -1
    let firstDateIdx = 1

    firstLineCols.forEach((col, idx) => {
      const c = col.toLowerCase()
      if (c.includes('telefone') || c.includes('contato')) telIdx = idx
      else if (c.includes('supervisor') || c.includes('líder') || c.includes('lider')) supIdx = idx
      else if (normalizeDate(c) && firstDateIdx === 1 && idx > 0) firstDateIdx = idx
    })

    const dates = firstLineCols.map(c => normalizeDate(c))
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim().replace(/"/g, '')
      if (!line) continue
      
      const cols = line.split(delimiter)
      const colabName = cleanName(cols[0]?.trim())
      
      if (!colabName || colabName.toLowerCase().includes('nome do colaborador') || colabName.startsWith('Colaborador ')) continue

      const telefone = telIdx !== -1 ? cols[telIdx]?.trim() : undefined
      const supervisor = supIdx !== -1 ? cols[supIdx]?.trim() : undefined
      
      for (let j = firstDateIdx; j < cols.length; j++) {
        const val = cols[j]?.trim().toLowerCase()
        const dateStr = dates[j]
        
        if (dateStr && (val === 'x' || val === 'sim' || val === 'v')) {
          if (!newEscala[dateStr]) newEscala[dateStr] = []
          if (!newEscala[dateStr].find(c => c.nome === colabName)) {
            newEscala[dateStr].push({ nome: colabName, telefone, supervisor })
          }
        }
      }
    }
    return newEscala
  }

  // Original list format parsing
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
          newEscala[currentDateStr] = [{ nome: collaboratorName }]
        } else if (
          !collaboratorName.toUpperCase().includes('NÃO TEVE ESCALA') &&
          !collaboratorName.toUpperCase().includes('SEM ESCALA')
        ) {
          const nameCleaned = cleanName(collaboratorName)
          if (!newEscala[currentDateStr].find(c => c.nome === nameCleaned)) {
            newEscala[currentDateStr].push({ nome: nameCleaned })
          }
        } else {
          newEscala[currentDateStr] = [{ nome: 'SEM ESCALA / NÃO HOUVE' }]
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
          const nameCleaned = cleanName(collaboratorName)
          if (!newEscala[currentDateStr].find(c => c.nome === nameCleaned)) {
            newEscala[currentDateStr].push({ nome: nameCleaned })
          }
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
