import type { Booking, DocumentFile } from '~/types'

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
    // Invoice/transaction numbers: sequences of digits (optionally with dashes/slashes) of length >= 4
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

  function autoMatch(bookings: Booking[], documents: DocumentFile[]): Map<string, string> {
    const assignments = new Map<string, string>()
    const usedDocIds = new Set<string>()
    const eligibleBookings = bookings.filter(b => !b.noDocRequired && b.documentId === null)

    // Pre-compute document data
    const docData = new Map<string, { amounts: number[]; dates: Date[]; refs: string[] }>()
    for (const doc of documents) {
      const text = doc.extractedText + ' ' + doc.name
      docData.set(doc.id, {
        amounts: extractAmountsFromText(text),
        dates: extractDatesFromText(text),
        refs: extractReferenceNumbers(text),
      })
    }

    // Step 1: Build candidate lists based on matching amount + date plausibility
    type CandidateEntry = { bookingId: string; docId: string }
    let candidates: CandidateEntry[] = []

    for (const booking of eligibleBookings) {
      const bookingAmount = Math.round(Math.abs(booking.amount) * 100)

      for (const doc of documents) {
        const data = docData.get(doc.id)!
        const amountMatch = data.amounts.some(a => Math.round(a * 100) === bookingAmount)
        if (!amountMatch) continue

        // Date plausibility: if doc has dates and booking has a date,
        // the earliest doc date (assumed issue date) must not be after the booking date
        if (booking.date && data.dates.length > 0) {
          const earliestDocDate = new Date(Math.min(...data.dates.map(d => d.getTime())))
          earliestDocDate.setHours(0, 0, 0, 0)
          const bookingDay = new Date(booking.date)
          bookingDay.setHours(23, 59, 59, 999)
          if (earliestDocDate > bookingDay) continue
        }

        candidates.push({ bookingId: booking.id, docId: doc.id })
      }
    }

    // Step 2: Iteratively assign documents that are the sole candidate for a booking
    let changed = true
    while (changed) {
      changed = false

      // Filter out already assigned
      candidates = candidates.filter(c => !assignments.has(c.bookingId) && !usedDocIds.has(c.docId))

      // Group candidates by booking
      const byBooking = new Map<string, string[]>()
      for (const c of candidates) {
        if (!byBooking.has(c.bookingId)) byBooking.set(c.bookingId, [])
        byBooking.get(c.bookingId)!.push(c.docId)
      }

      for (const [bookingId, docIds] of byBooking) {
        if (docIds.length === 1) {
          assignments.set(bookingId, docIds[0])
          usedDocIds.add(docIds[0])
          changed = true
        }
      }

      // Also check: if a doc is candidate for only one booking, assign it
      if (!changed) {
        const byDoc = new Map<string, string[]>()
        for (const c of candidates) {
          if (assignments.has(c.bookingId) || usedDocIds.has(c.docId)) continue
          if (!byDoc.has(c.docId)) byDoc.set(c.docId, [])
          byDoc.get(c.docId)!.push(c.bookingId)
        }

        for (const [docId, bookingIds] of byDoc) {
          if (bookingIds.length === 1) {
            assignments.set(bookingIds[0], docId)
            usedDocIds.add(docId)
            changed = true
          }
        }
      }
    }

    // Step 3: For remaining bookings with multiple candidates, use reference numbers
    candidates = candidates.filter(c => !assignments.has(c.bookingId) && !usedDocIds.has(c.docId))

    const remainingByBooking = new Map<string, string[]>()
    for (const c of candidates) {
      if (!remainingByBooking.has(c.bookingId)) remainingByBooking.set(c.bookingId, [])
      remainingByBooking.get(c.bookingId)!.push(c.docId)
    }

    // Pre-compute booking reference numbers
    const bookingRefs = new Map<string, string[]>()
    for (const booking of eligibleBookings) {
      const text = booking.description + ' ' + booking.remarks
      bookingRefs.set(booking.id, extractReferenceNumbers(text))
    }

    const refMatches: { bookingId: string; docId: string; refCount: number }[] = []

    for (const [bookingId, docIds] of remainingByBooking) {
      const bRefs = bookingRefs.get(bookingId) || []
      if (bRefs.length === 0) continue

      for (const docId of docIds) {
        const dRefs = docData.get(docId)?.refs || []
        const commonRefs = bRefs.filter(r => dRefs.includes(r)).length
        if (commonRefs > 0) {
          refMatches.push({ bookingId, docId, refCount: commonRefs })
        }
      }
    }

    // Sort by most shared references first
    refMatches.sort((a, b) => b.refCount - a.refCount)

    for (const { bookingId, docId } of refMatches) {
      if (assignments.has(bookingId) || usedDocIds.has(docId)) continue
      assignments.set(bookingId, docId)
      usedDocIds.add(docId)
    }

    return assignments
  }

  return { autoMatch, extractAmountsFromText }
}
