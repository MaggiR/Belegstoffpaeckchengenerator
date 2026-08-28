import type {
  Booking,
  DocumentFile,
  ColumnMapping,
  ViewMode,
  FilterState,
  SortState,
  DocSortState,
  DocFilterState,
  AppView,
  BspMeta,
} from '~/types'
import { documentKindLabel } from '~/types'
import { fieldsMatchSearch } from '~/composables/searchText'

function emptyDocFilters(): DocFilterState {
  return { status: 'all', type: 'all', dateFrom: null, dateTo: null }
}

/** Belege ohne Wert sortieren unabhängig von der Richtung ans Ende. */
function compareOptional<T extends string | number>(
  a: T | null,
  b: T | null,
  direction: number,
  compare: (x: T, y: T) => number,
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direction * compare(a, b)
}

const activeView = ref<AppView>('editor')
const currentBspId = ref<string | null>(null)
const bspList = ref<BspMeta[]>([])

const currentStep = ref(1)
const bookings = ref<Booking[]>([])
const documents = ref<DocumentFile[]>([])

const tableHeaders = ref<string[]>([])
const tablePreviewRows = ref<Record<string, string>[]>([])
const allTableRows = ref<Record<string, string>[]>([])
const columnMapping = ref<ColumnMapping>({ date: null, amount: null, description: null, remarks: null })
const showColumnMapper = ref(false)
const tableFileName = ref('')

const viewMode = ref<ViewMode>('list')
const filters = ref<FilterState>({
  direction: 'all',
  docStatus: 'all',
  amountMin: null,
  amountMax: null,
  searchText: '',
  dateFrom: null,
  dateTo: null,
})
const sort = ref<SortState>({ field: 'date', order: 'asc' })

const docSearch = ref('')
const docSort = ref<DocSortState>({ field: 'documentDate', order: 'asc' })
const docFilters = ref<DocFilterState>(emptyDocFilters())
const showSettings = ref(false)

const isProcessing = ref(false)
const processingMessage = ref('')
const processingProgress = ref(0)

interface AssignmentSnapshotEntry {
  bookingId: string
  documentIds: string[]
  verified: boolean
  noDocRequired: boolean
}

interface AssignmentSnapshot {
  entries: AssignmentSnapshotEntry[]
}

const assignmentUndoStack = ref<AssignmentSnapshot[]>([])
const assignmentRedoStack = ref<AssignmentSnapshot[]>([])
const MAX_ASSIGNMENT_HISTORY = 100

let applyingAssignmentHistory = false
let assignmentBatchDepth = 0

function assignmentSnapshotFromBookings(source: Booking[]): AssignmentSnapshot {
  return {
    entries: source.map(b => ({
      bookingId: b.id,
      documentIds: [...b.documentIds],
      verified: b.verified,
      noDocRequired: b.noDocRequired,
    })),
  }
}

function assignmentSnapshotsEqual(a: AssignmentSnapshot, b: AssignmentSnapshot): boolean {
  if (a.entries.length !== b.entries.length) return false
  return a.entries.every((entry, i) => {
    const other = b.entries[i]
    if (!other || entry.bookingId !== other.bookingId) return false
    if (entry.verified !== other.verified || entry.noDocRequired !== other.noDocRequired) return false
    if (entry.documentIds.length !== other.documentIds.length) return false
    return entry.documentIds.every((id, j) => id === other.documentIds[j])
  })
}

function pushAssignmentUndoSnapshot() {
  if (applyingAssignmentHistory || assignmentBatchDepth > 0) return
  const snapshot = assignmentSnapshotFromBookings(bookings.value)
  const last = assignmentUndoStack.value[assignmentUndoStack.value.length - 1]
  if (last && assignmentSnapshotsEqual(last, snapshot)) return
  assignmentUndoStack.value.push(snapshot)
  if (assignmentUndoStack.value.length > MAX_ASSIGNMENT_HISTORY) {
    assignmentUndoStack.value.shift()
  }
  assignmentRedoStack.value = []
}

function applyAssignmentSnapshot(snapshot: AssignmentSnapshot) {
  applyingAssignmentHistory = true
  try {
    for (const entry of snapshot.entries) {
      const booking = bookings.value.find(b => b.id === entry.bookingId)
      if (!booking) continue
      booking.documentIds = [...entry.documentIds]
      booking.verified = entry.verified
      booking.noDocRequired = entry.noDocRequired
    }
  } finally {
    applyingAssignmentHistory = false
  }
}

export function useAppState() {
  const assignedDocumentIds = computed(() =>
    new Set(bookings.value.flatMap(b => b.documentIds)),
  )

  const unassignedDocuments = computed(() =>
    documents.value.filter(d => !assignedDocumentIds.value.has(d.id)),
  )

  /** Anzahl gesetzter Belegfilter – steuert die Markierung am Filter-Icon. */
  const activeDocFilterCount = computed(() => {
    const f = docFilters.value
    let count = 0
    if (f.status !== 'all') count++
    if (f.type !== 'all') count++
    if (f.dateFrom) count++
    if (f.dateTo) count++
    return count
  })

  function resetDocFilters() {
    docFilters.value = emptyDocFilters()
  }

  /** Unzugeordnete Belege nach Suche, Filtern und gewählter Sortierung. */
  const filteredSortedUnassignedDocuments = computed(() => {
    const search = docSearch.value.trim()
    let result = unassignedDocuments.value

    if (search) {
      result = result.filter(d =>
        fieldsMatchSearch([d.title, d.correspondent, d.name, d.extractedText, documentKindLabel(d.documentKind)], search),
      )
    }

    const { status, type, dateFrom, dateTo } = docFilters.value

    if (status === 'analyzed') {
      result = result.filter(d => d.extractionStatus === 'done')
    } else if (status === 'unanalyzed') {
      result = result.filter(d => d.extractionStatus !== 'done' && d.extractionStatus !== 'failed')
    } else if (status === 'failed') {
      result = result.filter(d => d.extractionStatus === 'failed')
    }

    if (type !== 'all') {
      result = result.filter(d => d.type === type)
    }

    // Belege ohne erkanntes Datum fallen aus einer Zeitraumeingrenzung heraus.
    if (dateFrom) {
      result = result.filter(d => d.documentDate !== null && d.documentDate >= dateFrom)
    }
    if (dateTo) {
      result = result.filter(d => d.documentDate !== null && d.documentDate <= dateTo)
    }

    const direction = docSort.value.order === 'asc' ? 1 : -1
    const byText = (x: string, y: string) => x.localeCompare(y, 'de')
    const byNumber = (x: number, y: number) => x - y

    return [...result].sort((a, b) => {
      switch (docSort.value.field) {
        case 'title':
          return direction * byText(a.title, b.title)
        case 'correspondent':
          return compareOptional(a.correspondent, b.correspondent, direction, byText)
        case 'totalAmount':
          return compareOptional(a.totalAmount, b.totalAmount, direction, byNumber)
        case 'name':
          return direction * byText(a.name, b.name)
        default:
          return compareOptional(a.documentDate, b.documentDate, direction, byText)
      }
    })
  })

  const filteredAndSortedBookings = computed(() => {
    let result = [...bookings.value]

    if (filters.value.direction === 'incoming') {
      result = result.filter(b => b.amount > 0)
    } else if (filters.value.direction === 'outgoing') {
      result = result.filter(b => b.amount < 0)
    }

    if (filters.value.docStatus === 'with') {
      result = result.filter(b => b.documentIds.length > 0)
    } else if (filters.value.docStatus === 'without') {
      result = result.filter(b => b.documentIds.length === 0 && !b.noDocRequired)
    } else if (filters.value.docStatus === 'required') {
      result = result.filter(b => !b.noDocRequired)
    } else if (filters.value.docStatus === 'not-required') {
      result = result.filter(b => b.noDocRequired)
    }

    if (filters.value.amountMin !== null) {
      result = result.filter(b => Math.abs(b.amount) >= filters.value.amountMin!)
    }
    if (filters.value.amountMax !== null) {
      result = result.filter(b => Math.abs(b.amount) <= filters.value.amountMax!)
    }

    if (filters.value.dateFrom) {
      const from = new Date(filters.value.dateFrom)
      from.setHours(0, 0, 0, 0)
      result = result.filter(b => b.date && b.date >= from)
    }
    if (filters.value.dateTo) {
      const to = new Date(filters.value.dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(b => b.date && b.date <= to)
    }

    if (filters.value.searchText) {
      const search = filters.value.searchText.trim()
      result = result.filter(b =>
        fieldsMatchSearch([b.description, b.remarks], search),
      )
    }

    result.sort((a, b) => {
      let cmp = 0
      if (sort.value.field === 'date') {
        const da = a.date?.getTime() ?? 0
        const db = b.date?.getTime() ?? 0
        cmp = da - db
      } else {
        cmp = a.amount - b.amount
      }
      return sort.value.order === 'asc' ? cmp : -cmp
    })

    return result
  })

  const stats = computed(() => {
    const withDoc = bookings.value.filter(b => b.documentIds.length > 0).length
    const noDocReq = bookings.value.filter(b => b.documentIds.length === 0 && b.noDocRequired).length
    const missing = bookings.value.filter(b => b.documentIds.length === 0 && !b.noDocRequired).length
    const verified = bookings.value.filter(b => b.documentIds.length > 0 && b.verified).length
    return {
      total: bookings.value.length,
      withDoc,
      noDocRequired: noDocReq,
      missing,
      verified,
      totalDocuments: documents.value.length,
      unassigned: unassignedDocuments.value.length,
    }
  })

  function getDocument(id: string): DocumentFile | undefined {
    return documents.value.find(d => d.id === id)
  }

  function getDocumentsForBooking(bookingId: string): DocumentFile[] {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (!booking) return []
    return booking.documentIds
      .map(id => getDocument(id))
      .filter((d): d is DocumentFile => d !== undefined)
  }

  /** Ein Beleg gehört zu höchstens einer Buchung, daher zuerst überall lösen. */
  function assignDocument(bookingId: string, documentId: string) {
    const target = bookings.value.find(b => b.id === bookingId)
    if (!target) return

    const alreadyOnTarget = target.documentIds.includes(documentId)
    const assignedElsewhere = bookings.value.some(
      b => b.id !== bookingId && b.documentIds.includes(documentId),
    )
    if (alreadyOnTarget && !assignedElsewhere) return

    pushAssignmentUndoSnapshot()

    for (const booking of bookings.value) {
      if (booking.id === bookingId) continue
      if (booking.documentIds.includes(documentId)) {
        booking.documentIds = booking.documentIds.filter(id => id !== documentId)
        booking.verified = false
      }
    }

    if (!target.documentIds.includes(documentId)) {
      target.documentIds = [...target.documentIds, documentId]
      target.verified = false
    }
  }

  /** Ohne `documentId` werden alle Belege der Buchung gelöst. */
  function unassignDocument(bookingId: string, documentId?: string) {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (!booking) return

    const willChange = documentId
      ? booking.documentIds.includes(documentId)
      : booking.documentIds.length > 0
    if (!willChange) return

    pushAssignmentUndoSnapshot()

    booking.documentIds = documentId
      ? booking.documentIds.filter(id => id !== documentId)
      : []
    booking.verified = false
  }

  function unassignAllDocuments() {
    if (!bookings.value.some(b => b.documentIds.length > 0)) return

    pushAssignmentUndoSnapshot()

    for (const booking of bookings.value) {
      booking.documentIds = []
      booking.verified = false
    }
  }

  function toggleNoDocRequired(bookingId: string) {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (!booking) return

    pushAssignmentUndoSnapshot()

    booking.noDocRequired = !booking.noDocRequired
    if (booking.noDocRequired) {
      booking.documentIds = []
      booking.verified = false
    }
  }

  function toggleVerified(bookingId: string) {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (!booking || booking.documentIds.length === 0) return

    pushAssignmentUndoSnapshot()
    booking.verified = !booking.verified
  }

  function addDocuments(newDocs: DocumentFile[]) {
    documents.value.push(...newDocs)
  }

  function removeDocument(docId: string) {
    for (const booking of bookings.value) {
      if (!booking.documentIds.includes(docId)) continue
      booking.documentIds = booking.documentIds.filter(id => id !== docId)
      booking.verified = false
    }
    documents.value = documents.value.filter(d => d.id !== docId)
  }

  function updateDocument(docId: string, patch: Partial<DocumentFile>) {
    const doc = documents.value.find(d => d.id === docId)
    if (!doc) return
    Object.assign(doc, patch)
  }

  function clearEditorState() {
    currentStep.value = 1
    bookings.value = []
    documents.value = []
    tableHeaders.value = []
    tablePreviewRows.value = []
    allTableRows.value = []
    columnMapping.value = { date: null, amount: null, description: null, remarks: null }
    showColumnMapper.value = false
    tableFileName.value = ''
    docSearch.value = ''
    docFilters.value = emptyDocFilters()
    isProcessing.value = false
    processingMessage.value = ''
    processingProgress.value = 0
    clearAssignmentHistory()
  }

  function beginAssignmentBatch() {
    if (assignmentBatchDepth === 0) pushAssignmentUndoSnapshot()
    assignmentBatchDepth++
  }

  function endAssignmentBatch() {
    assignmentBatchDepth = Math.max(0, assignmentBatchDepth - 1)
  }

  function undoAssignment(): boolean {
    if (assignmentUndoStack.value.length === 0) return false
    const current = assignmentSnapshotFromBookings(bookings.value)
    const previous = assignmentUndoStack.value.pop()!
    assignmentRedoStack.value.push(current)
    applyAssignmentSnapshot(previous)
    return true
  }

  function redoAssignment(): boolean {
    if (assignmentRedoStack.value.length === 0) return false
    const current = assignmentSnapshotFromBookings(bookings.value)
    const next = assignmentRedoStack.value.pop()!
    assignmentUndoStack.value.push(current)
    applyAssignmentSnapshot(next)
    return true
  }

  function clearAssignmentHistory() {
    assignmentUndoStack.value = []
    assignmentRedoStack.value = []
    assignmentBatchDepth = 0
  }

  const canUndoAssignment = computed(() => assignmentUndoStack.value.length > 0)
  const canRedoAssignment = computed(() => assignmentRedoStack.value.length > 0)

  async function reset() {
    clearEditorState()
    const meta = bspList.value.find(b => b.id === currentBspId.value)
    if (meta) {
      meta.bookingCount = 0
      meta.documentCount = 0
      meta.assignedCount = 0
      meta.missingCount = 0
      meta.updatedAt = new Date().toISOString()
    }
    try {
      const { clearBspStorage, saveBspList } = usePersistence()
      await clearBspStorage(currentBspId.value)
      saveBspList()
    } catch {}
  }

  function updateCurrentBspMeta() {
    if (!currentBspId.value) return
    const meta = bspList.value.find(b => b.id === currentBspId.value)
    if (meta) {
      meta.updatedAt = new Date().toISOString()
      meta.bookingCount = bookings.value.length
      meta.documentCount = documents.value.length
      meta.assignedCount = bookings.value.filter(b => b.documentIds.length > 0).length
      meta.missingCount = bookings.value.filter(b => b.documentIds.length === 0 && !b.noDocRequired).length
    }
  }

  return {
    activeView,
    currentBspId,
    bspList,
    currentStep,
    bookings,
    documents,
    tableHeaders,
    tablePreviewRows,
    allTableRows,
    columnMapping,
    showColumnMapper,
    tableFileName,
    viewMode,
    filters,
    sort,
    docSearch,
    docSort,
    docFilters,
    activeDocFilterCount,
    resetDocFilters,
    showSettings,
    isProcessing,
    processingMessage,
    processingProgress,
    assignedDocumentIds,
    unassignedDocuments,
    filteredSortedUnassignedDocuments,
    filteredAndSortedBookings,
    stats,
    getDocument,
    getDocumentsForBooking,
    assignDocument,
    unassignDocument,
    unassignAllDocuments,
    beginAssignmentBatch,
    endAssignmentBatch,
    undoAssignment,
    redoAssignment,
    clearAssignmentHistory,
    canUndoAssignment,
    canRedoAssignment,
    addDocuments,
    removeDocument,
    updateDocument,
    toggleNoDocRequired,
    toggleVerified,
    clearEditorState,
    updateCurrentBspMeta,
    reset,
  }
}
