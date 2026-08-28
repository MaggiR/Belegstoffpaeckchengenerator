import Papa from 'papaparse'
import type { Booking, ColumnMapping, ImportBookingFilter } from '~/types'

const KNOWN_DATE_COLUMNS = ['datum', 'buchungsdatum', 'valuta', 'wertstellung', 'date', 'buchungstag']
const KNOWN_AMOUNT_COLUMNS = ['betrag', 'umsatz', 'wert', 'amount', 'soll', 'haben', 'betrag (eur)', 'betrag in eur']
const KNOWN_DESC_COLUMNS = ['verwendungszweck', 'buchungstext', 'text', 'beschreibung', 'description', 'empfänger', 'auftraggeber', 'name']
const KNOWN_REMARKS_COLUMNS = ['bemerkung', 'buchungsbemerkung', 'notiz', 'kommentar', 'hinweis', 'anmerkung', 'info', 'zusatzinfo', 'remarks', 'notes']

export function useTableParser() {
  function columnContainsNumbers(rows: Record<string, string>[], columnName: string): boolean {
    const sample = rows.slice(0, 20)
    let validCount = 0
    for (const row of sample) {
      const val = row[columnName]?.trim()
      if (!val) continue
      const parsed = parseAmount(val)
      if (parsed !== 0) validCount++
    }
    return validCount >= Math.min(sample.length * 0.3, 3)
  }

  function columnContainsDates(rows: Record<string, string>[], columnName: string): boolean {
    const sample = rows.slice(0, 20)
    let validCount = 0
    for (const row of sample) {
      const val = row[columnName]?.trim()
      if (!val) continue
      if (parseDate(val) !== null) validCount++
    }
    return validCount >= Math.min(sample.length * 0.3, 3)
  }

  function detectColumns(headers: string[], rows: Record<string, string>[] = []): ColumnMapping {
    const mapping: ColumnMapping = { date: null, amount: null, description: null, remarks: null }
    const lower = headers.map(h => h.toLowerCase().trim())

    for (let i = 0; i < lower.length; i++) {
      if (!mapping.date && KNOWN_DATE_COLUMNS.some(k => lower[i].includes(k))) {
        if (rows.length === 0 || columnContainsDates(rows, headers[i])) {
          mapping.date = headers[i]
        }
      }
      if (!mapping.amount && KNOWN_AMOUNT_COLUMNS.some(k => lower[i].includes(k))) {
        if (rows.length === 0 || columnContainsNumbers(rows, headers[i])) {
          mapping.amount = headers[i]
        }
      }
      if (!mapping.description && KNOWN_DESC_COLUMNS.some(k => lower[i].includes(k))) {
        mapping.description = headers[i]
      }
      if (!mapping.remarks && KNOWN_REMARKS_COLUMNS.some(k => lower[i].includes(k))) {
        mapping.remarks = headers[i]
      }
    }

    return mapping
  }

  function parseDate(value: string): Date | null {
    if (!value) return null
    const trimmed = value.trim()

    const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
    if (deMatch) {
      const year = deMatch[3].length === 2 ? 2000 + parseInt(deMatch[3]) : parseInt(deMatch[3])
      return new Date(year, parseInt(deMatch[2]) - 1, parseInt(deMatch[1]))
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
    }

    const parsed = new Date(trimmed)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  function parseAmount(value: string): number {
    if (!value) return 0
    let cleaned = value.trim()
    cleaned = cleaned.replace(/[€$\s]/g, '')

    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.')
      } else {
        cleaned = cleaned.replace(/,/g, '')
      }
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.')
    }

    return parseFloat(cleaned) || 0
  }

  function createBookings(
    rows: Record<string, string>[],
    mapping: ColumnMapping,
  ): Booking[] {
    const result: Booking[] = []
    rows.forEach((row, sourceRowIndex) => {
      const hasDate = mapping.date && row[mapping.date]?.trim()
      const hasAmount = mapping.amount && row[mapping.amount]?.trim()
      if (!hasDate && !hasAmount) return

      const amount = mapping.amount ? parseAmount(row[mapping.amount] || '') : 0
      result.push({
        id: `booking-row-${sourceRowIndex}`,
        sourceRowIndex,
        date: mapping.date ? parseDate(row[mapping.date] || '') : null,
        amount,
        description: mapping.description ? (row[mapping.description] || '').trim() : '',
        remarks: mapping.remarks ? (row[mapping.remarks] || '').trim() : '',
        documentIds: [],
        noDocRequired: amount > 0,
        verified: false,
      })
    })
    return result
  }

  function applyImportBookingFilter(
    bookings: Booking[],
    filters?: ImportBookingFilter,
  ): Booking[] {
    if (!filters) return bookings
    let created = bookings
    if (filters.direction === 'incoming') {
      created = created.filter(b => b.amount > 0)
    } else if (filters.direction === 'outgoing') {
      created = created.filter(b => b.amount < 0)
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom)
      from.setHours(0, 0, 0, 0)
      created = created.filter(b => b.date && b.date >= from)
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59, 999)
      created = created.filter(b => b.date && b.date <= to)
    }
    return created
  }

  function bookingFingerprint(b: Booking): string {
    const d = b.date
    const dateKey = d && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      : ''
    return `${dateKey}|${b.amount}|${b.description}|${b.remarks}`
  }

  /**
   * Überträgt Zuordnungen und manuelle Flags von bestehenden Buchungen auf
   * neu erzeugte. Treffer zuerst über die Tabellenzeile, sonst über Datum,
   * Betrag und Text – damit ein Filterwechsel nicht alle Belege löst.
   */
  function mergeBookingAssignments(previous: Booking[], next: Booking[]): Booking[] {
    const used = new Set<number>()

    function take(pred: (b: Booking) => boolean): Booking | undefined {
      for (let i = 0; i < previous.length; i++) {
        if (used.has(i)) continue
        if (!pred(previous[i])) continue
        used.add(i)
        return previous[i]
      }
      return undefined
    }

    return next.map((nb) => {
      const old =
        (nb.sourceRowIndex != null
          ? take(o => o.sourceRowIndex === nb.sourceRowIndex)
          : undefined)
        ?? take(o => bookingFingerprint(o) === bookingFingerprint(nb))
      if (!old) return nb
      return {
        ...nb,
        id: old.id,
        documentIds: [...old.documentIds],
        noDocRequired: old.noDocRequired,
        verified: old.verified,
      }
    })
  }

  /** Entfallene Buchungen sowie Belege, die dadurch ihre Zuordnung verlieren. */
  function countLostAssignments(previous: Booking[], merged: Booking[]): { bookingCount: number; documentCount: number } {
    const keptIds = new Set(merged.map(b => b.id))
    const bookingCount = previous.filter(b => !keptIds.has(b.id)).length

    const stillAssigned = new Set(merged.flatMap(b => b.documentIds))
    const lostDocs = new Set<string>()
    for (const booking of previous) {
      for (const id of booking.documentIds) {
        if (!stillAssigned.has(id)) lostDocs.add(id)
      }
    }
    return { bookingCount, documentCount: lostDocs.size }
  }

  async function decodeFileText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()

    try {
      const utf8 = new TextDecoder('utf-8', { fatal: true })
      const text = utf8.decode(buffer)
      if (!text.includes('\uFFFD')) return text
    } catch {}

    const win1252 = new TextDecoder('windows-1252')
    return win1252.decode(buffer)
  }

  function parseCsvString(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    })
    return {
      headers: result.meta.fields || [],
      rows: result.data as Record<string, string>[],
    }
  }

  async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const text = await decodeFileText(file)
      return parseCsvString(text)
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer())
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false })
      const headers = data.length > 0 ? Object.keys(data[0]) : []
      return { headers, rows: data }
    }

    throw new Error(`Nicht unterstütztes Dateiformat: .${ext}`)
  }

  return {
    parseFile,
    detectColumns,
    createBookings,
    applyImportBookingFilter,
    mergeBookingAssignments,
    countLostAssignments,
    parseDate,
    parseAmount,
    columnContainsNumbers,
    columnContainsDates,
  }
}
