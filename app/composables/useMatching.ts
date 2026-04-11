import type { Booking, DocumentFile } from '~/types'

export function useMatching() {
  function extractAmountsFromText(text: string): number[] {
    const amounts: number[] = []

    // German format: 1.234,56 or 123,45
    const dePattern = /(\d{1,3}(?:\.\d{3})*,\d{2})\b/g
    let match
    while ((match = dePattern.exec(text)) !== null) {
      const cleaned = match[1].replace(/\./g, '').replace(',', '.')
      const val = parseFloat(cleaned)
      if (val > 0 && val < 1_000_000) amounts.push(val)
    }

    // English format: 1,234.56 or 123.45 (only if not already captured as German)
    const enPattern = /(\d{1,3}(?:,\d{3})*\.\d{2})\b/g
    while ((match = enPattern.exec(text)) !== null) {
      const cleaned = match[1].replace(/,/g, '')
      const val = parseFloat(cleaned)
      if (val > 0 && val < 1_000_000) amounts.push(val)
    }

    return [...new Set(amounts)]
  }

  function computeWordScore(booking: Booking, doc: DocumentFile): number {
    const text = (doc.extractedText + ' ' + doc.name).toLowerCase()
    let score = 0

    const allWords = (booking.description + ' ' + booking.remarks)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)

    for (const word of allWords) {
      if (text.includes(word)) score += 1
    }

    if (booking.date) {
      const d = booking.date
      const dateStrs = [
        `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`,
        `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`,
      ]
      for (const ds of dateStrs) {
        if (text.includes(ds)) {
          score += 3
          break
        }
      }
    }

    return score
  }

  function autoMatch(bookings: Booking[], documents: DocumentFile[]): Map<string, string> {
    const assignments = new Map<string, string>()
    const usedDocIds = new Set<string>()
    const eligibleBookings = bookings.filter(b => b.amount <= 0 && !b.noDocRequired)

    // Phase 1: Amount-based matching
    const docAmounts = new Map<string, number[]>()
    for (const doc of documents) {
      const text = doc.extractedText + ' ' + doc.name
      docAmounts.set(doc.id, extractAmountsFromText(text))
    }

    // Build a map of amount → bookings for quick lookup
    const amountToBookings = new Map<number, Booking[]>()
    for (const b of eligibleBookings) {
      const key = Math.round(Math.abs(b.amount) * 100)
      if (!amountToBookings.has(key)) amountToBookings.set(key, [])
      amountToBookings.get(key)!.push(b)
    }

    // Try to match each document by amount
    const amountMatches: { bookingId: string; docId: string; wordScore: number }[] = []

    for (const doc of documents) {
      const amounts = docAmounts.get(doc.id) || []
      for (const amt of amounts) {
        const key = Math.round(amt * 100)
        const matchingBookings = amountToBookings.get(key) || []
        for (const b of matchingBookings) {
          const wordScore = computeWordScore(b, doc)
          amountMatches.push({ bookingId: b.id, docId: doc.id, wordScore })
        }
      }
    }

    // Sort: prefer higher word score as tiebreaker
    amountMatches.sort((a, b) => b.wordScore - a.wordScore)

    for (const { bookingId, docId } of amountMatches) {
      if (assignments.has(bookingId) || usedDocIds.has(docId)) continue
      assignments.set(bookingId, docId)
      usedDocIds.add(docId)
    }

    // Phase 2: Word-pattern matching for remaining unmatched docs/bookings
    const unmatchedBookings = eligibleBookings.filter(b => !assignments.has(b.id))
    const unmatchedDocs = documents.filter(d => !usedDocIds.has(d.id))

    const wordMatches: { bookingId: string; docId: string; score: number }[] = []
    for (const b of unmatchedBookings) {
      for (const doc of unmatchedDocs) {
        const score = computeWordScore(b, doc)
        if (score >= 2) {
          wordMatches.push({ bookingId: b.id, docId: doc.id, score })
        }
      }
    }

    wordMatches.sort((a, b) => b.score - a.score)

    for (const { bookingId, docId } of wordMatches) {
      if (assignments.has(bookingId) || usedDocIds.has(docId)) continue
      assignments.set(bookingId, docId)
      usedDocIds.add(docId)
    }

    return assignments
  }

  return { autoMatch, extractAmountsFromText, computeWordScore }
}
