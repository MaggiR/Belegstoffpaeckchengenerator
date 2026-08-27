import type { Booking, DocumentFile } from '~/types'

const BASE_SCORE = 100
/** Werte aus der LLM-Auswertung sind verlässlicher als Regex-Treffer im OCR-Text. */
const LLM_AMOUNT_BONUS = 25
const LLM_DATE_BONUS = 10
/** Zeitliche Nähe entscheidet zwischen sonst gleichwertigen Kandidaten. */
const MAX_PROXIMITY_BONUS = 45
const PROXIMITY_WINDOW_DAYS = 45
const CORRESPONDENT_BONUS = 30
const TITLE_BONUS = 10
const REF_BONUS = 15
const MAX_REF_BONUS = 30

const DAY_MS = 86_400_000

/** Rechtsformen und Floskeln, die für den Abgleich keinen Informationswert haben. */
const STOPWORDS = new Set([
  'gmbh', 'mbh', 'ohg', 'kgaa', 'gbr', 'ltd', 'inc', 'co', 'kg', 'ag', 'ug', 'ev',
  'und', 'der', 'die', 'das', 'den', 'dem', 'des', 'für', 'fuer', 'von', 'vom',
  'rechnung', 'rechnungsnr', 'quittung', 'beleg', 'kunde', 'kundennummer',
  'zahlung', 'ueberweisung', 'überweisung', 'lastschrift', 'gutschrift',
  'sepa', 'iban', 'bic', 'euro', 'eur', 'betrag', 'summe', 'datum',
  'deutschland', 'germany', 'strasse', 'straße', 'www', 'http', 'https',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/i)
    .filter(token => token.length >= 4 && !STOPWORDS.has(token))
}

function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

export function useMatching() {
  function extractAmountsFromText(text: string): number[] {
    const amounts: number[] = []

    const dePattern = /(\d{1,3}(?:\.\d{3})*,\d{2})\b/g
    let match
    while ((match = dePattern.exec(text)) !== null) {
      const cleaned = match[1].replace(/\./g, '').replace(',', '.')
      const val = parseFloat(cleaned)
      if (val > 0 && val < 1_000_000) amounts.push(val)
    }

    const enPattern = /(\d{1,3}(?:,\d{3})*\.\d{2})\b/g
    while ((match = enPattern.exec(text)) !== null) {
      const cleaned = match[1].replace(/,/g, '')
      const val = parseFloat(cleaned)
      if (val > 0 && val < 1_000_000) amounts.push(val)
    }

    return [...new Set(amounts)]
  }

  function extractDatesFromText(text: string): Date[] {
    const dates: Date[] = []

    // DD.MM.YYYY
    const dePattern = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g
    let match
    while ((match = dePattern.exec(text)) !== null) {
      const d = new Date(+match[3], +match[2] - 1, +match[1])
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) dates.push(d)
    }

    // YYYY-MM-DD
    const isoPattern = /(\d{4})-(\d{2})-(\d{2})/g
    while ((match = isoPattern.exec(text)) !== null) {
      const d = new Date(+match[1], +match[2] - 1, +match[3])
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) dates.push(d)
    }

    return dates
  }

  function extractReferenceNumbers(text: string): string[] {
    // Rechnungs- und Transaktionsnummern: Ziffernfolgen ab Länge 4
    const pattern = /\b(\d[\d\-/]{3,})\b/g
    const refs: string[] = []
    let match
    while ((match = pattern.exec(text)) !== null) {
      const normalized = match[1].replace(/[\-/]/g, '')
      if (normalized.length >= 4 && normalized.length <= 20) {
        refs.push(normalized)
      }
    }
    return [...new Set(refs)]
  }

  interface DocSignals {
    /** Kandidaten für den Gesamtbetrag, in Cent. */
    amountsInCents: number[]
    amountFromLlm: boolean
    /** Belegdatum auf Tagesbeginn normiert, sonst null. */
    dateAtMidnight: number | null
    dateFromLlm: boolean
    refs: string[]
    correspondentTokens: string[]
    titleTokens: string[]
  }

  function buildDocSignals(doc: DocumentFile): DocSignals {
    const haystack = `${doc.extractedText} ${doc.name}`

    const amountFromLlm = doc.totalAmount !== null && doc.totalAmount > 0
    const amountsInCents = amountFromLlm
      ? [Math.round(doc.totalAmount! * 100)]
      : extractAmountsFromText(haystack).map(a => Math.round(a * 100))

    let dateAtMidnight: number | null = null
    let dateFromLlm = false
    if (doc.documentDate) {
      const parsed = new Date(`${doc.documentDate}T00:00:00`)
      if (!isNaN(parsed.getTime())) {
        dateAtMidnight = startOfDay(parsed)
        dateFromLlm = true
      }
    }
    if (dateAtMidnight === null) {
      const dates = extractDatesFromText(haystack)
      if (dates.length > 0) {
        // Das früheste Datum ist am ehesten das Ausstellungsdatum.
        dateAtMidnight = startOfDay(new Date(Math.min(...dates.map(d => d.getTime()))))
      }
    }

    return {
      amountsInCents,
      amountFromLlm,
      dateAtMidnight,
      dateFromLlm,
      refs: extractReferenceNumbers(haystack),
      correspondentTokens: doc.correspondent ? tokenize(doc.correspondent) : [],
      titleTokens: tokenize(doc.title ?? ''),
    }
  }

  interface Candidate {
    bookingId: string
    docId: string
    score: number
    /** Tage zwischen Beleg- und Buchungsdatum, für stabile Sortierung bei Gleichstand. */
    gapDays: number
  }

  /**
   * Ordnet Belege Buchungen zu. Voraussetzung ist ein centgenauer Betragstreffer;
   * ein Belegdatum nach dem Buchungsdatum schließt den Kandidaten aus. Unter den
   * verbleibenden gewinnt der zeitlich nächstliegende Beleg – das unterscheidet
   * monatlich wiederkehrende Belege mit identischem Betrag.
   */
  function autoMatch(bookings: Booking[], documents: DocumentFile[]): Map<string, string> {
    const eligibleBookings = bookings.filter(b => !b.noDocRequired && b.documentIds.length === 0)

    const signals = new Map<string, DocSignals>()
    for (const doc of documents) {
      signals.set(doc.id, buildDocSignals(doc))
    }

    const candidates: Candidate[] = []

    for (const booking of eligibleBookings) {
      const bookingCents = Math.round(Math.abs(booking.amount) * 100)
      const bookingDay = booking.date ? startOfDay(booking.date) : null
      const bookingText = `${booking.description} ${booking.remarks}`
      const bookingTokens = new Set(tokenize(bookingText))
      const bookingRefs = extractReferenceNumbers(bookingText)

      for (const doc of documents) {
        const signal = signals.get(doc.id)!

        if (!signal.amountsInCents.includes(bookingCents)) continue

        let gapDays = Number.POSITIVE_INFINITY
        if (bookingDay !== null && signal.dateAtMidnight !== null) {
          // Harte Bedingung: ein Beleg kann nicht nach seiner Buchung entstanden sein.
          if (signal.dateAtMidnight > bookingDay) continue
          gapDays = Math.round((bookingDay - signal.dateAtMidnight) / DAY_MS)
        }

        let score = BASE_SCORE
        if (signal.amountFromLlm) score += LLM_AMOUNT_BONUS
        if (signal.dateFromLlm) score += LLM_DATE_BONUS

        if (Number.isFinite(gapDays)) {
          const proximity = MAX_PROXIMITY_BONUS * (1 - gapDays / PROXIMITY_WINDOW_DAYS)
          if (proximity > 0) score += proximity
        }

        if (signal.correspondentTokens.some(t => bookingTokens.has(t))) {
          score += CORRESPONDENT_BONUS
        }
        if (signal.titleTokens.some(t => bookingTokens.has(t))) {
          score += TITLE_BONUS
        }

        const sharedRefs = bookingRefs.filter(r => signal.refs.includes(r)).length
        if (sharedRefs > 0) {
          score += Math.min(MAX_REF_BONUS, sharedRefs * REF_BONUS)
        }

        candidates.push({ bookingId: booking.id, docId: doc.id, score, gapDays })
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.gapDays !== b.gapDays) return a.gapDays - b.gapDays
      return a.docId.localeCompare(b.docId)
    })

    const assignments = new Map<string, string>()
    const usedDocIds = new Set<string>()

    for (const candidate of candidates) {
      if (assignments.has(candidate.bookingId) || usedDocIds.has(candidate.docId)) continue
      assignments.set(candidate.bookingId, candidate.docId)
      usedDocIds.add(candidate.docId)
    }

    return assignments
  }

  return { autoMatch, extractAmountsFromText }
}
