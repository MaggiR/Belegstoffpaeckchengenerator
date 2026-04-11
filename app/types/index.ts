export interface Booking {
  id: string
  date: Date | null
  amount: number
  description: string
  remarks: string
  documentId: string | null
  noDocRequired: boolean
}

export interface DocumentFile {
  id: string
  file: File
  name: string
  type: 'pdf' | 'image'
  extractedText: string
  thumbnailDataUrl: string | null
  ocrProcessed: boolean
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
