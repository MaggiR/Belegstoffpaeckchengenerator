export interface Booking {
  id: string
  date: Date | null
  amount: number
  description: string
  remarks: string
  documentId: string | null
  noDocRequired: boolean
  verified: boolean
}

export interface DocumentFile {
  id: string
  file: File
  name: string
  type: 'pdf' | 'image'
  extractedText: string
  thumbnailDataUrl: string | null
  ocrProcessed: boolean
  /** PDF enthält einen /Encrypt-Eintrag. Beim Export wird in dem Fall rasterisiert. */
  encrypted?: boolean
  /** PDF konnte (noch) nicht geöffnet werden – Passwort erforderlich. */
  locked?: boolean
  /** Vom Benutzer eingegebenes Passwort (nötig zum Rendern und Rastern). */
  password?: string
}

export interface ColumnMapping {
  date: string | null
  amount: string | null
  description: string | null
  remarks: string | null
}

export type ViewMode = 'list' | 'tile'
export type FilterDirection = 'all' | 'incoming' | 'outgoing'
export type FilterDocStatus = 'all' | 'with' | 'without' | 'required' | 'not-required'
export type SortField = 'date' | 'amount'
export type SortOrder = 'asc' | 'desc'

export interface FilterState {
  direction: FilterDirection
  docStatus: FilterDocStatus
  amountMin: number | null
  amountMax: number | null
  searchText: string
  dateFrom: string | null
  dateTo: string | null
}

export interface SortState {
  field: SortField
  order: SortOrder
}

export type AppView = 'overview' | 'editor'

export interface BspMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  bookingCount: number
  documentCount: number
  assignedCount: number
  missingCount?: number
}
