<script setup lang="ts">
import type { DocumentFile } from '~/types'

const {
  currentStep,
  viewMode,
  filteredAndSortedBookings,
  unassignedDocuments,
  documents,
  bookings,
  assignDocument,
  unassignDocument,
  unassignAllDocuments,
  getDocumentForBooking,
  getDocument,
  addDocuments,
  removeDocument,
  toggleNoDocRequired,
  showColumnMapper,
  tableHeaders,
  tablePreviewRows,
  allTableRows,
  columnMapping,
  stats,
  sort,
} = useAppState()

const { parseFile, detectColumns, createBookings } = useTableParser()
const { generateThumbnail, extractTextFromPdf } = usePdfUtils()
const { recognizeText } = useOcr()
const { autoMatch } = useMatching()

const docInputRef = ref<HTMLInputElement>()
const docDropActive = ref(false)
const sidebarDropHighlight = ref(false)
const previewDocDirect = ref<DocumentFile | null>(null)
const showUnassignAllConfirm = ref(false)

const sidebarUploading = ref(false)
const sidebarUploadDone = ref(0)
const sidebarUploadTotal = ref(0)

const loadingBookingId = ref<string | null>(null)

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type ListItem =
  | { type: 'year'; year: number; key: string }
  | { type: 'month'; label: string; key: string }
  | { type: 'booking'; booking: typeof filteredAndSortedBookings.value[0]; key: string }

const bookingsWithSeparators = computed<ListItem[]>(() => {
  const items: ListItem[] = []

  if (sort.value.field !== 'date') {
    for (const b of filteredAndSortedBookings.value) {
      items.push({ type: 'booking', booking: b, key: b.id })
    }
    return items
  }

  let lastYear: number | null = null
  let lastMonth: number | null = null

  for (const b of filteredAndSortedBookings.value) {
    const d = b.date
    if (d) {
      const y = d.getFullYear()
      const m = d.getMonth()
      if (y !== lastYear) {
        items.push({ type: 'year', year: y, key: `year-${y}` })
        lastYear = y
        lastMonth = null
      }
      if (m !== lastMonth) {
        items.push({ type: 'month', label: MONTH_NAMES[m], key: `month-${y}-${m}` })
        lastMonth = m
      }
    } else if (lastYear === null) {
      items.push({ type: 'year', year: 0, key: 'year-unknown' })
      items.push({ type: 'month', label: 'Ohne Datum', key: 'month-unknown' })
      lastYear = 0
      lastMonth = -1
    }
    items.push({ type: 'booking', booking: b, key: b.id })
  }
  return items
})

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function handleDropDoc(bookingId: string, docId: string) {
  const booking = bookings.value.find(b => b.id === bookingId)
  if (booking) {
    booking.noDocRequired = false
    assignDocument(bookingId, docId)
  }
}

async function handleDropFile(bookingId: string, files: FileList) {
  const fileArray = Array.from(files).filter(f =>
    f.type === 'application/pdf' || f.type.startsWith('image/'),
  )
  if (fileArray.length === 0) return

  const booking = bookings.value.find(b => b.id === bookingId)
  if (!booking) return

  loadingBookingId.value = bookingId

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i]
    const doc = await processFile(file, i)

    addDocuments([doc])
    if (i === 0) {
      booking.noDocRequired = false
      assignDocument(bookingId, doc.id)
    }
  }

  loadingBookingId.value = null
}

function handleInlineUnassign(bookingId: string) {
  unassignDocument(bookingId)
}

function handleToggleNoDoc(bookingId: string) {
  toggleNoDocRequired(bookingId)
}

function handleBookingPreview(bookingId: string) {
  const doc = getDocumentForBooking(bookingId)
  if (doc) previewDocDirect.value = doc
}

function openDocPreview(doc: DocumentFile) {
  previewDocDirect.value = doc
}

function runAutoMatch() {
  const assignedDocIds = new Set(bookings.value.map(b => b.documentId).filter(Boolean))
  const bookingsWithoutDoc = bookings.value.filter(b => !b.documentId)
  const unassignedDocs = documents.value.filter(d => !assignedDocIds.has(d.id))
  const assignments = autoMatch(bookingsWithoutDoc, unassignedDocs)
  for (const [bookingId, docId] of assignments) {
    const b = bookings.value.find(b => b.id === bookingId)
    if (b) b.documentId = docId
  }
}

function confirmUnassignAll() {
  unassignAllDocuments()
  showUnassignAllConfirm.value = false
}

function openColumnMapper() {
  showColumnMapper.value = true
}

function applyMapping(importFilters?: { dateFrom: string | null; dateTo: string | null; direction: 'all' | 'incoming' | 'outgoing' }) {
  let created = createBookings(allTableRows.value, columnMapping.value)

  if (importFilters) {
    if (importFilters.direction === 'incoming') {
      created = created.filter(b => b.amount > 0)
    } else if (importFilters.direction === 'outgoing') {
      created = created.filter(b => b.amount < 0)
    }
    if (importFilters.dateFrom) {
      const from = new Date(importFilters.dateFrom)
      from.setHours(0, 0, 0, 0)
      created = created.filter(b => b.date && b.date >= from)
    }
    if (importFilters.dateTo) {
      const to = new Date(importFilters.dateTo)
      to.setHours(23, 59, 59, 999)
      created = created.filter(b => b.date && b.date <= to)
    }
  }

  if (created.length > 0) {
    bookings.value = created
  }
  showColumnMapper.value = false
}

function onSidebarDocDragStart(e: DragEvent, docId: string) {
  e.dataTransfer!.setData('application/x-doc-id', docId)
  e.dataTransfer!.effectAllowed = 'move'
}

function onSidebarDragOver(e: DragEvent) {
  const hasDocId = e.dataTransfer?.types?.includes('application/x-doc-id')
  const hasFiles = e.dataTransfer?.types?.includes('Files')
  if (hasDocId || hasFiles) {
    e.preventDefault()
    sidebarDropHighlight.value = true
  }
}

function onSidebarDrop(e: DragEvent) {
  sidebarDropHighlight.value = false
  const docId = e.dataTransfer?.getData('application/x-doc-id')
  if (docId) {
    e.preventDefault()
    const booking = bookings.value.find(b => b.documentId === docId)
    if (booking) booking.documentId = null
    return
  }
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    e.preventDefault()
    handleAdditionalUpload(files)
  }
}

async function processFile(file: File, idx: number): Promise<DocumentFile> {
  const isPdf = file.type === 'application/pdf'
  const doc: DocumentFile = {
    id: `doc-${Date.now()}-${idx}`,
    file,
    name: file.name,
    type: isPdf ? 'pdf' : 'image',
    extractedText: '',
    thumbnailDataUrl: null,
    ocrProcessed: false,
  }

  try { doc.thumbnailDataUrl = await generateThumbnail(file) } catch {}

  try {
    if (isPdf) {
      const text = await extractTextFromPdf(file)
      doc.extractedText = text
      if (text.trim().length < 20) {
        try {
          doc.extractedText = await recognizeText(doc.thumbnailDataUrl || file)
          doc.ocrProcessed = true
        } catch {}
      }
    } else {
      try {
        doc.extractedText = await recognizeText(file)
        doc.ocrProcessed = true
      } catch {}
    }
  } catch {}

  return doc
}

async function handleAdditionalUpload(files: FileList) {
  const fileArray = Array.from(files).filter(f =>
    f.type === 'application/pdf' || f.type.startsWith('image/'),
  )
  if (fileArray.length === 0) return

  sidebarUploading.value = true
  sidebarUploadDone.value = 0
  sidebarUploadTotal.value = fileArray.length

  for (let i = 0; i < fileArray.length; i++) {
    const doc = await processFile(fileArray[i], i)
    addDocuments([doc])
    sidebarUploadDone.value = i + 1
  }

  sidebarUploading.value = false
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-4">
    <div class="flex gap-4 items-start">
      <!-- Hauptbereich: Buchungen -->
      <div class="flex-1 min-w-0">
        <FilterBar @open-column-mapper="openColumnMapper" />
        <div
          v-if="viewMode === 'tile'"
          class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          <BookingCard
            v-for="booking in filteredAndSortedBookings"
            :key="booking.id"
            :booking="booking"
            :is-tile="true"
            :is-loading="loadingBookingId === booking.id"
            @preview="handleBookingPreview"
            @drop-doc="handleDropDoc"
            @drop-file="handleDropFile"
            @unassign="handleInlineUnassign"
            @toggle-no-doc="handleToggleNoDoc"
          />
        </div>

        <div v-else class="space-y-1.5">
          <template v-for="item in bookingsWithSeparators" :key="item.key">
            <div
              v-if="item.type === 'year' && item.year !== 0"
              class="pt-4 pb-1 first:pt-0"
            >
              <span class="text-lg font-bold text-gray-900 dark:text-white">
                {{ item.year }}
              </span>
            </div>
            <div
              v-else-if="item.type === 'month'"
              class="pt-2 pb-1 flex items-center gap-3"
            >
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ item.label }}
              </span>
            </div>
            <BookingCard
              v-else-if="item.type === 'booking'"
              :booking="item.booking"
              :is-tile="false"
              :is-loading="loadingBookingId === item.booking.id"
              @preview="handleBookingPreview"
              @drop-doc="handleDropDoc"
              @drop-file="handleDropFile"
              @unassign="handleInlineUnassign"
              @toggle-no-doc="handleToggleNoDoc"
            />
          </template>
        </div>

        <div
          v-if="filteredAndSortedBookings.length === 0"
          class="text-center py-12 text-gray-400 dark:text-gray-500"
        >
          <font-awesome-icon icon="magnifying-glass" class="text-3xl mb-3" />
          <p class="text-sm">Keine Buchungen gefunden</p>
        </div>
      </div>

      <!-- Seitenleiste: Belege -->
      <div
        class="w-80 flex-shrink-0 sticky top-4 self-start"
        @dragover="onSidebarDragOver"
        @dragleave="sidebarDropHighlight = false"
        @drop="onSidebarDrop"
      >
        <div class="mb-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Belege
              </h3>
              <span
                v-if="unassignedDocuments.length > 0"
                class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
              >
                {{ unassignedDocuments.length }}
              </span>
            </div>
            <button
              class="px-2.5 py-1 text-[11px] font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
              @click="docInputRef?.click()"
            >
              <font-awesome-icon icon="plus" class="w-3 h-3" />
              Nachladen
            </button>
          </div>
          <div
            v-if="unassignedDocuments.length > 0 || stats.withDoc > 0"
            class="flex items-center gap-1.5 mt-1.5"
          >
            <button
              v-if="unassignedDocuments.length > 0"
              class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center gap-1"
              @click="runAutoMatch"
            >
              <font-awesome-icon icon="wand-magic-sparkles" class="w-3 h-3" />
              Auto-Zuordnung
            </button>
            <button
              v-if="stats.withDoc > 0"
              class="px-2.5 py-1 text-[11px] font-medium rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1"
              title="Alle Zuordnungen aufheben"
              @click="showUnassignAllConfirm = true"
            >
              <font-awesome-icon icon="link-slash" class="w-3 h-3" />
              Alle lösen
            </button>
          </div>
        </div>

        <input
          ref="docInputRef"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          class="hidden"
          @change="(e: Event) => handleAdditionalUpload((e.target as HTMLInputElement).files!)"
        >

        <!-- Sidebar Upload Progress -->
        <div v-if="sidebarUploading" class="mb-2">
          <div class="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
            <span>{{ sidebarUploadDone }} / {{ sidebarUploadTotal }} verarbeitet</span>
            <span>{{ Math.round((sidebarUploadDone / sidebarUploadTotal) * 100) }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div
              class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500 ease-out animate-pulse"
              :style="{ width: `${(sidebarUploadDone / sidebarUploadTotal) * 100}%` }"
            />
          </div>
        </div>

        <!-- Upload-Bereich wenn keine unzugeordneten Belege -->
        <div
          v-if="unassignedDocuments.length === 0 && !sidebarUploading"
          class="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all"
          :class="docDropActive || sidebarDropHighlight
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
          @dragover.prevent="docDropActive = true"
          @dragleave="docDropActive = false"
          @drop.prevent.stop="docDropActive = false; sidebarDropHighlight = false; handleAdditionalUpload($event.dataTransfer?.files!)"
          @click="docInputRef?.click()"
        >
          <font-awesome-icon icon="file-pdf" class="text-2xl text-gray-400 dark:text-gray-500 mb-2" />
          <p class="text-xs text-gray-600 dark:text-gray-400 font-medium">
            Belegdateien hochladen
          </p>
          <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            PDF, JPEG, PNG hierher ziehen oder klicken
          </p>
        </div>

        <!-- Belegliste -->
        <div
          v-if="unassignedDocuments.length > 0 || sidebarUploading"
          class="space-y-1 max-h-[calc(100vh-140px)] overflow-auto pr-1 rounded-lg transition-colors"
          :class="sidebarDropHighlight ? 'ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-gray-950' : ''"
        >
          <div
            v-for="doc in unassignedDocuments"
            :key="doc.id"
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 flex items-center gap-2.5 cursor-grab active:cursor-grabbing group/doc hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
            draggable="true"
            @dragstart="(e) => onSidebarDocDragStart(e, doc.id)"
            @click.stop="openDocPreview(doc)"
          >
            <div class="w-8 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-50 dark:bg-gray-900">
              <img
                v-if="doc.thumbnailDataUrl"
                :src="doc.thumbnailDataUrl"
                :alt="doc.name"
                class="w-full h-full object-cover pointer-events-none"
              >
              <div v-else class="w-full h-full flex items-center justify-center">
                <font-awesome-icon
                  :icon="doc.type === 'pdf' ? 'file-pdf' : 'file-image'"
                  class="text-gray-300 dark:text-gray-600 text-[10px]"
                />
              </div>
            </div>
            <span class="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 line-clamp-2 break-all leading-tight">
              {{ stripExtension(doc.name) }}
            </span>
            <button
              class="w-5 h-5 flex-shrink-0 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center opacity-0 group-hover/doc:opacity-100 transition-opacity"
              title="Beleg löschen"
              @click.stop="removeDocument(doc.id)"
            >
              <font-awesome-icon icon="trash" class="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between pt-4">
      <button
        class="px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        @click="currentStep = 1"
      >
        <font-awesome-icon icon="arrow-left" class="w-3.5 h-3.5" />
        Zurück
      </button>
      <button
        class="px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 bg-primary-500 text-white hover:bg-primary-600 shadow-md shadow-primary-500/25 transition-all"
        @click="currentStep = 3"
      >
        Weiter
        <font-awesome-icon icon="arrow-right" class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- ColumnMapper Modal -->
    <ColumnMapper
      v-if="showColumnMapper"
      :headers="tableHeaders"
      :preview-rows="tablePreviewRows.slice(0, 5)"
      :all-rows="allTableRows"
      :mapping="columnMapping"
      @update:mapping="columnMapping = $event"
      @apply="applyMapping"
      @close="showColumnMapper = false"
    />

    <!-- Dokumentenvorschau -->
    <DocumentPreview
      v-if="previewDocDirect"
      :document="previewDocDirect"
      @close="previewDocDirect = null"
    />

    <!-- Bestätigungsdialog: Alle Zuordnungen lösen -->
    <Teleport to="body">
      <div
        v-if="showUnassignAllConfirm"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
        @click.self="showUnassignAllConfirm = false"
      >
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Alle Zuordnungen aufheben?
          </h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
            Sämtliche {{ stats.withDoc }} Beleg-Zuordnungen werden gelöst.
            Die Belege bleiben erhalten und können neu zugeordnet werden.
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="showUnassignAllConfirm = false"
            >
              Abbrechen
            </button>
            <button
              class="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              @click="confirmUnassignAll"
            >
              Alle lösen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
