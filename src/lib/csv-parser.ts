/**
 * Minimal RFC 4180 CSV parser. Sufficient for "save as CSV" from Excel /
 * LibreOffice — handles quoted fields with embedded commas or semicolons,
 * double-escaped quotes, and CR/LF line endings. Strips the UTF-8 BOM if
 * present. Auto-detects delimiter: if the first line contains more semicolons
 * than commas it uses semicolons; otherwise commas.
 *
 * Returns rows as arrays of strings. Empty trailing lines are dropped.
 * Throws on a malformed quote (unterminated string, garbage after quote).
 */
export function parseCSV(input: string): string[][] {
  // BOM
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1)

  // Auto-detect delimiter from the first line (ignoring delimiters inside quotes)
  const firstLineEnd = input.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd).replace(/\r$/, '')
  let commas = 0
  let semicolons = 0
  let inQuotesDetect = false
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i]
    if (c === '"') { inQuotesDetect = !inQuotesDetect }
    else if (!inQuotesDetect) {
      if (c === ',') commas++
      else if (c === ';') semicolons++
    }
  }
  const delimiter = semicolons > commas ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const flushField = () => {
    row.push(field)
    field = ''
  }
  const flushRow = () => {
    flushField()
    // Drop fully-empty rows (a single empty field from a blank line)
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }

  while (i < input.length) {
    const c = input[i]
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        // After closing quote we expect a delimiter, EOL, or EOF.
        const next = input[i]
        if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') {
          throw new Error(`CSV: caracter inesperado após aspas (pos ${i})`)
        }
        continue
      }
      field += c
      i++
      continue
    }
    // Not in quotes
    if (c === '"') {
      if (field !== '') {
        throw new Error(`CSV: aspas não podem aparecer no meio do campo (pos ${i})`)
      }
      inQuotes = true
      i++
      continue
    }
    if (c === delimiter) { flushField(); i++; continue }
    if (c === '\r') {
      // CRLF or CR alone
      if (input[i + 1] === '\n') { flushRow(); i += 2; continue }
      flushRow(); i++; continue
    }
    if (c === '\n') { flushRow(); i++; continue }
    field += c
    i++
  }
  if (inQuotes) throw new Error('CSV: aspas não terminadas')
  // Flush the last row (no trailing newline)
  if (field !== '' || row.length > 0) flushRow()
  return rows
}

/**
 * Parses CSV with a required header row. Returns the header (first row) and
 * a list of row objects keyed by the header columns. Header columns are
 * trimmed; data cells are trimmed too unless they were quoted (we don't track
 * quoting after parsing, so we just trim everything — fine for the column
 * shapes this app uses).
 */
export function parseCSVWithHeader(input: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const raw = parseCSV(input)
  if (raw.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = raw[0]!.map((h) => h.trim())
  const rows = raw.slice(1).map((cols) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]!] = (cols[i] ?? '').trim()
    }
    return obj
  })
  return { headers, rows }
}
