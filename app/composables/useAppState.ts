import type {
  Booking,
  DocumentFile,
  ColumnMapping,
  ViewMode,
  FilterState,
  SortState,
} from '~/types'

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

const isProcessing = ref(false)
const processingMessage = ref('')
const processingProgress = ref(0)

export function useAppState() {
  const assignedDocumentIds = computed(() =>
    new Set(bookings.value.map(b => b.documentId).filter(Boolean)),
  )

  const unassignedDocuments = computed(() =>
    documents.value.filter(d => !assignedDocumentIds.value.has(d.id)),
  )

  const filteredAndSortedBookings = computed(() => {
    let result = [...bookings.value]

    if (filters.value.direction === 'incoming') {
      result = result.filter(b => b.amount > 0)
    } else if (filters.value.direction === 'outgoing') {
      result = result.filter(b => b.amount < 0)
    }

    if (filters.value.docStatus === 'with') {
      result = result.filter(b => b.documentId !== null)
    } else if (filters.value.docStatus === 'without') {
      result = result.filter(b => b.documentId === null && !b.noDocRequired)
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
      const search = filters.value.searchText.toLowerCase()
      result = result.filter(b =>
        b.description.toLowerCase().includes(search)
        || b.remarks.toLowerCase().includes(search),
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
    const withDoc = bookings.value.filter(b => b.documentId !== null).length
    const noDocReq = bookings.value.filter(b => b.documentId === null && b.noDocRequired).length
    const missing = bookings.value.filter(b => b.documentId === null && !b.noDocRequired).length
    return {
      total: bookings.value.length,
      withDoc,
      noDocRequired: noDocReq,
      missing,
      totalDocuments: documents.value.length,
      unassigned: unassignedDocuments.value.length,
    }
  })

  function getDocument(id: string): DocumentFile | undefined {
    return documents.value.find(d => d.id === id)
  }

  function getDocumentForBooking(bookingId: string): DocumentFile | undefined {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (!booking?.documentId) return undefined
    return getDocument(booking.documentId)
  }

  function assignDocument(bookingId: string, documentId: string) {
    const prevBooking = bookings.value.find(b => b.documentId === documentId)
    if (prevBooking) {
      prevBooking.documentId = null
    }
    const booking = bookings.value.find(b => b.id === bookingId)
    if (booking) {
      booking.documentId = documentId
    }
  }

  function unassignDocument(bookingId: string) {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (booking) {
      booking.documentId = null
    }
  }

  function unassignAllDocuments() {
    for (const booking of bookings.value) {
      booking.documentId = null
    }
  }

  function toggleNoDocRequired(bookingId: string) {
    const booking = bookings.value.find(b => b.id === bookingId)
    if (booking) {
      booking.noDocRequired = !booking.noDocRequired
      if (booking.noDocRequired) {
        booking.documentId = null
      }
    }
  }

  function addDocuments(newDocs: DocumentFile[]) {
    documents.value.push(...newDocs)
  }

  function removeDocument(docId: string) {
    const booking = bookings.value.find(b => b.documentId === docId)
    if (booking) booking.documentId = null
    documents.value = documents.value.filter(d => d.id !== docId)
  }

  async function reset() {
    currentStep.value = 1
    bookings.value = []
    documents.value = []
    tableHeaders.value = []
    tablePreviewRows.value = []
    allTableRows.value = []
    columnMapping.value = { date: null, amount: null, description: null, remarks: null }
    showColumnMapper.value = false
    tableFileName.value = ''
    isProcessing.value = false
    processingMessage.value = ''
    processingProgress.value = 0
    try {
      const { clearStorage } = usePersistence()
      await clearStorage()
    } catch {}
  }

  return {
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
    isProcessing,
    processingMessage,
    processingProgress,
    assignedDocumentIds,
    unassignedDocuments,
    filteredAndSortedBookings,
    stats,
    getDocument,
    getDocumentForBooking,
    assignDocument,
    unassignDocument,
    unassignAllDocuments,
    addDocuments,
    removeDocument,
    toggleNoDocRequired,
    reset,
  }
}
