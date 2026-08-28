export interface Booking {
  id: string
  date: Date | null
  amount: number
  description: string
  remarks: string
  documentIds: string[]
  noDocRequired: boolean
  verified: boolean
}

/**
 * Stand der LLM-Auswertung eines Belegs.
 * `skipped` bedeutet, dass kein Provider konfiguriert war – der Beleg kann
 * später nachträglich analysiert werden.
 */
export type ExtractionStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

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
  /** Kurzer Inhaltstitel, Pflichtfeld. Fallback ist der Dateiname ohne Endung. */
  title: string
  /** Aussteller oder Empfänger. Nur bei hoher Sicherheit gesetzt. */
  correspondent: string | null
  /** Belegdatum als `YYYY-MM-DD`. Nur bei hoher Sicherheit gesetzt. */
  documentDate: string | null
  /** Gesamtbetrag des Belegs. Nur bei hoher Sicherheit gesetzt. */
  totalAmount: number | null
  /** Art des Belegs. `null`, solange nicht analysiert bzw. nicht manuell gesetzt. */
  documentKind: DocumentKind | null
  extractionStatus: ExtractionStatus
  extractionError?: string
}

/** Vom LLM geliefertes und validiertes Ergebnis einer Belegauswertung. */
export interface DocumentExtraction {
  title: string
  correspondent: string | null
  documentDate: string | null
  totalAmount: number | null
  documentKind: DocumentKind
}

export const DOCUMENT_KINDS = ['invoice', 'bank_statement', 'reimbursement', 'contract', 'other'] as const
export type DocumentKind = typeof DOCUMENT_KINDS[number]

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  invoice: 'Rechnung/Quittung',
  bank_statement: 'Kontoauszug',
  reimbursement: 'Rückerstattungsantrag',
  contract: 'Vertrag',
  other: 'Sonstige',
}

export function documentKindLabel(kind: DocumentKind | null | undefined): string {
  if (!kind) return ''
  return DOCUMENT_KIND_LABELS[kind]
}

/** Leere/fehlende Werte bleiben `null`. Nur gesetzte, unklare Strings werden `other`. */
export function parseDocumentKind(value: unknown): DocumentKind | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  for (const kind of DOCUMENT_KINDS) {
    if (kind === lower) return kind
    if (DOCUMENT_KIND_LABELS[kind].toLowerCase() === lower) return kind
  }
  if (/rechnung|quittung|invoice|receipt/.test(lower)) return 'invoice'
  if (/konto|auszug|bank.?statement/.test(lower)) return 'bank_statement'
  if (/r[uü]ckerstatt|erstattungsantrag|reimburs/.test(lower)) return 'reimbursement'
  if (/vertrag|contract/.test(lower)) return 'contract'
  return 'other'
}

export type LlmProvider = 'none' | 'ollama' | 'openai'
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'
/** Ollama `/api/chat` `think`. Leer = Parameter wird nicht mitgeschickt. */
export type OllamaReasoningEffort = '' | 'low' | 'medium' | 'high' | 'max'

export interface LlmSettings {
  provider: LlmProvider
  /** Name der Parteigliederung, z. B. „FDP Kreisverband Darmstadt“. */
  organizationName: string
  ollamaBaseUrl: string
  ollamaModel: string
  /** Optionaler Bearer-Token für Ollama (Authorization: Bearer …). */
  ollamaBearerToken: string
  ollamaReasoningEffort: OllamaReasoningEffort
  openaiApiKey: string
  openaiModel: string
  openaiReasoningEffort: ReasoningEffort
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

export type DocSortField = 'documentDate' | 'title' | 'correspondent' | 'totalAmount' | 'name'

export interface DocSortState {
  field: DocSortField
  order: SortOrder
}

export type DocFilterStatus = 'all' | 'analyzed' | 'unanalyzed' | 'failed'
export type DocFilterType = 'all' | 'pdf' | 'image'

export interface DocFilterState {
  status: DocFilterStatus
  type: DocFilterType
  dateFrom: string | null
  dateTo: string | null
}

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
