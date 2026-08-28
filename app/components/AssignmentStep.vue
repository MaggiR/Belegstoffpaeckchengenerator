<script setup lang="ts">
import type { DocumentFile } from '~/types'
import { PdfPasswordRequiredError } from '~/composables/usePdfUtils'
import { fallbackTitleFromName } from '~/composables/useDocumentExtraction'

const {
  viewMode,
  filteredAndSortedBookings,
  documents,
  bookings,
  assignDocument,
  unassignDocument,
  getDocumentsForBooking,
  getDocument,
  addDocuments,
  removeDocument,
  updateDocument,
  toggleNoDocRequired,
  toggleVerified,
  showColumnMapper,
  tableHeaders,
  tablePreviewRows,
  allTableRows,
  columnMapping,
  stats,
  sort,
  beginAssignmentBatch,
  endAssignmentBatch,
  undoAssignment,
  redoAssignment,
  canUndoAssignment,
  canRedoAssignment,
  clearAssignmentHistory,
} = useAppState()

const { createBookings } = useTableParser()
const { generateThumbnail, extractTextFromPdf, isPdfEncrypted } = usePdfUtils()
const { recognizeText } = useOcr()
const { queueExtraction, queueMissing, beginExtractionBatch, endExtractionBatch } = useDocumentExtraction()
const { uploadRequest, showUnassignAllConfirm, confirmUnassignAll } = useDocumentActions()

const passwordDialog = ref<{ doc: DocumentFile; wrongPassword: boolean } | null>(null)

const sidebarRef = ref<{ openFilePicker: () => void } | null>(null)
const previewDocDirect = ref<DocumentFile | null>(null)
const editDoc = ref<DocumentFile | null>(null)

// Der Dateidialog gehört der Seitenleiste; die Titelzeile stößt ihn über den Zähler an.
watch(uploadRequest, () => sidebarRef.value?.openFilePicker())

const sidebarUploading = ref(false)
const sidebarUploadDone = ref(0)
const sidebarUploadTotal = ref(0)

const loadingBookingId = ref<string | null>(null)

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type BookingItem = typeof filteredAndSortedBookings.value[0]

type ListItem =
  | { type: 'year'; year: number; key: string }
  | { type: 'monthGroup'; label: string; bookings: BookingItem[]; key: string }
  | { type: 'flat'; booking: BookingItem; key: string }

const bookingsWithSeparators = computed<ListItem[]>(() => {
  const items: ListItem[] = []

  if (sort.value.field !== 'date') {
    for (const b of filteredAndSortedBookings.value) {
      items.push({ type: 'flat', booking: b, key: b.id })
    }
    return items
  }

  let lastYear: number | null = null
  let lastMonth: number | null = null
  let currentGroup: Extract<ListItem, { type: 'monthGroup' }> | null = null

  for (const b of filteredAndSortedBookings.value) {
    const d = b.date
    if (d) {
      const y = d.getFullYear()
      const m = d.getMonth()
      if (y !== lastYear) {
        items.push({ type: 'year', year: y, key: `year-${y}` })
        lastYear = y
        lastMonth = null
        currentGroup = null
      }
      if (m !== lastMonth) {
        currentGroup = { type: 'monthGroup', label: MONTH_NAMES[m], bookings: [], key: `month-${y}-${m}` }
        items.push(currentGroup)
        lastMonth = m
      }
    } else if (currentGroup === null) {
      currentGroup = { type: 'monthGroup', label: 'Ohne Datum', bookings: [], key: 'month-unknown' }
      items.push(currentGroup)
      lastYear = 0
      lastMonth = -1
    }
    currentGroup!.bookings.push(b)
  }
  return items
})

function handleDropDoc(bookingId: string, docId: string) {
  const booking = bookings.value.find(b => b.id === bookingId)
  if (!booking) return

  beginAssignmentBatch()
  try {
    booking.noDocRequired = false
    assignDocument(bookingId, docId)
  } finally {
    endAssignmentBatch()
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

  beginAssignmentBatch()
  try {
    beginExtractionBatch(fileArray.length)
    // Alle abgelegten Dateien landen bei dieser Buchung – mehrere Belege sind erlaubt.
    for (let i = 0; i < fileArray.length; i++) {
      const doc = await processFile(fileArray[i], i)
      addDocuments([doc])
      booking.noDocRequired = false
      assignDocument(bookingId, doc.id)
      queueExtraction(doc.id)
    }
  } finally {
    endExtractionBatch()
    endAssignmentBatch()
  }

  loadingBookingId.value = null
}

function handleInlineUnassign(bookingId: string, docId?: string) {
  unassignDocument(bookingId, docId)
}

function handleToggleNoDoc(bookingId: string) {
  toggleNoDocRequired(bookingId)
}

function handleToggleVerified(bookingId: string) {
  toggleVerified(bookingId)
}

function handleUnlockDoc(docId: string) {
  const doc = documents.value.find(d => d.id === docId)
  if (doc) openPasswordDialog(doc)
}

function handleBookingPreview(bookingId: string, docId?: string) {
  const doc = docId ? getDocument(docId) : getDocumentsForBooking(bookingId)[0]
  if (doc) previewDocDirect.value = doc
}

function openDocPreview(doc: DocumentFile) {
  previewDocDirect.value = doc
}

/** Löst einen Beleg aus seiner Buchung, wenn er zurück in die Seitenleiste gezogen wird. */
function handleSidebarUnassign(docId: string) {
  const booking = bookings.value.find(b => b.documentIds.includes(docId))
  if (booking) unassignDocument(booking.id, docId)
}

function handleDocFieldsSave(docId: string, patch: Partial<DocumentFile>) {
  updateDocument(docId, patch)
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
    clearAssignmentHistory()
  }
  showColumnMapper.value = false
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
    // Bis das Sprachmodell antwortet, dient der Dateiname als Titel.
    title: fallbackTitleFromName(file.name),
    correspondent: null,
    documentDate: null,
    totalAmount: null,
    documentKind: null,
    extractionStatus: 'pending',
  }

  if (isPdf) {
    doc.encrypted = await isPdfEncrypted(file).catch(() => false)
  }

  await enrichPdfMetadata(doc)

  return doc
}

/**
 * Versucht Thumbnail + Texterkennung für ein (ggf. verschlüsseltes) Dokument.
 * Scheitert es an einem Passwort, wird `locked: true` gesetzt, sodass die UI
 * ein Schloss-Icon anzeigen und den User zur Passworteingabe auffordern kann.
 */
async function enrichPdfMetadata(doc: DocumentFile) {
  try {
    doc.thumbnailDataUrl = await generateThumbnail(doc.file, 400, 560, doc.password)
    doc.locked = false
  } catch (e) {
    if (e instanceof PdfPasswordRequiredError) {
      doc.locked = true
      doc.encrypted = true
      doc.thumbnailDataUrl = null
      return
    }
  }

  try {
    if (doc.type === 'pdf') {
      const text = await extractTextFromPdf(doc.file, doc.password)
      doc.extractedText = text
      if (text.trim().length < 20) {
        try {
          doc.extractedText = await recognizeText(doc.thumbnailDataUrl || doc.file)
          doc.ocrProcessed = true
        } catch {}
      }
    } else {
      try {
        doc.extractedText = await recognizeText(doc.file)
        doc.ocrProcessed = true
      } catch {}
    }
  } catch (e) {
    if (e instanceof PdfPasswordRequiredError) {
      doc.locked = true
      doc.encrypted = true
    }
  }
}

function openPasswordDialog(doc: DocumentFile, wrongPassword = false) {
  passwordDialog.value = { doc, wrongPassword }
}

async function submitPassword(password: string) {
  const current = passwordDialog.value
  if (!current) return
  const doc = current.doc
  // Arbeitskopie, damit wir bei falschem Passwort keinen Teilzustand hinterlassen
  const attempt: DocumentFile = { ...doc, password }
  await enrichPdfMetadata(attempt)

  if (attempt.locked) {
    passwordDialog.value = { doc, wrongPassword: true }
    return
  }

  updateDocument(doc.id, {
    password,
    locked: false,
    encrypted: true,
    thumbnailDataUrl: attempt.thumbnailDataUrl,
    extractedText: attempt.extractedText,
    ocrProcessed: attempt.ocrProcessed,
  })
  passwordDialog.value = null

  // Vor dem Entsperren war keine Analyse möglich.
  if (doc.extractionStatus !== 'done') queueExtraction(doc.id)
}

async function handleAdditionalUpload(files: FileList) {
  const fileArray = Array.from(files).filter(f =>
    f.type === 'application/pdf' || f.type.startsWith('image/'),
  )
  if (fileArray.length === 0) return

  sidebarUploading.value = true
  sidebarUploadDone.value = 0
  sidebarUploadTotal.value = fileArray.length
  beginExtractionBatch(fileArray.length)

  try {
    for (let i = 0; i < fileArray.length; i++) {
      const doc = await processFile(fileArray[i], i)
      addDocuments([doc])
      queueExtraction(doc.id)
      sidebarUploadDone.value = i + 1
    }
  } finally {
    endExtractionBatch()
    sidebarUploading.value = false
  }
}

// Dynamische Messung der FilterBar-Höhe für sticky Monatslabels
const filterBarRef = ref<{ $el?: HTMLElement } | null>(null)
const filterBarHeight = ref(64)
let resizeObserver: ResizeObserver | null = null

// Drag-Autoscroll: beim Ziehen an den oberen/unteren Bildschirmrand scrollt die Seite
const AUTOSCROLL_ZONE = 110
const MAX_SCROLL_SPEED = 26
let autoscrollRAF: number | null = null
let lastPointerY = 0
let dragActive = false

function onWindowDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types
  const isRelevant =
    types && (types.includes('application/x-doc-id') || types.includes('Files'))
  if (!isRelevant) return
  dragActive = true
  lastPointerY = e.clientY
  startAutoScroll()
}

function stopDrag() {
  dragActive = false
  if (autoscrollRAF !== null) {
    cancelAnimationFrame(autoscrollRAF)
    autoscrollRAF = null
  }
}

function startAutoScroll() {
  if (autoscrollRAF !== null) return
  autoscrollRAF = requestAnimationFrame(tickAutoScroll)
}

function tickAutoScroll() {
  if (!dragActive) {
    autoscrollRAF = null
    return
  }
  const vh = window.innerHeight
  let delta = 0
  if (lastPointerY < AUTOSCROLL_ZONE) {
    const factor = 1 - lastPointerY / AUTOSCROLL_ZONE
    delta = -MAX_SCROLL_SPEED * Math.max(0, factor)
  } else if (lastPointerY > vh - AUTOSCROLL_ZONE) {
    const factor = 1 - (vh - lastPointerY) / AUTOSCROLL_ZONE
    delta = MAX_SCROLL_SPEED * Math.max(0, factor)
  }
  if (delta !== 0) {
    window.scrollBy(0, delta)
  }
  autoscrollRAF = requestAnimationFrame(tickAutoScroll)
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onAssignmentHistoryKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target)) return

  if (e.key === 'z' || e.key === 'Z') {
    if (e.shiftKey) {
      if (!canRedoAssignment.value) return
      e.preventDefault()
      redoAssignment()
      return
    }
    if (!canUndoAssignment.value) return
    e.preventDefault()
    undoAssignment()
    return
  }

  if (e.key === 'y' || e.key === 'Y') {
    if (!canRedoAssignment.value) return
    e.preventDefault()
    redoAssignment()
  }
}

onMounted(() => {
  const filterEl = filterBarRef.value?.$el as HTMLElement | undefined
  if (filterEl) {
    const updateHeight = () => {
      filterBarHeight.value = filterEl.offsetHeight
    }
    updateHeight()
    resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(filterEl)
  }

  window.addEventListener('dragover', onWindowDragOver, { passive: true })
  window.addEventListener('dragend', stopDrag)
  window.addEventListener('drop', stopDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('keydown', onAssignmentHistoryKeydown)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('dragend', stopDrag)
  window.removeEventListener('drop', stopDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('keydown', onAssignmentHistoryKeydown)
  stopDrag()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
    <div class="flex gap-4 items-start">
      <!-- Hauptbereich: Buchungen -->
      <div class="flex-1 min-w-0">
        <FilterBar ref="filterBarRef" @open-column-mapper="openColumnMapper" />
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
            @toggle-verified="handleToggleVerified"
            @unlock-doc="handleUnlockDoc"
          />
        </div>

        <div v-else class="space-y-1.5">
          <template v-for="item in bookingsWithSeparators" :key="item.key">
            <div
              v-if="item.type === 'year' && item.year !== 0"
              class="pt-4 pb-1 first:pt-2 text-center"
            >
              <span class="text-lg font-bold text-gray-900 dark:text-white">
                {{ item.year }}
              </span>
            </div>
            <div v-else-if="item.type === 'monthGroup'" class="space-y-1.5">
              <div
                class="sticky z-20 pt-2 pb-2 flex items-center justify-center pointer-events-none"
                :style="{ top: filterBarHeight + 'px' }"
              >
                <span
                  class="pointer-events-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/50 backdrop-blur-md ring-1 ring-white/60 dark:ring-white/10 shadow-sm shadow-gray-900/5"
                >
                  {{ item.label }}
                </span>
              </div>
              <BookingCard
                v-for="b in item.bookings"
                :key="b.id"
                :booking="b"
                :is-tile="false"
                :is-loading="loadingBookingId === b.id"
                @preview="handleBookingPreview"
                @drop-doc="handleDropDoc"
                @drop-file="handleDropFile"
                @unassign="handleInlineUnassign"
                @toggle-no-doc="handleToggleNoDoc"
                @toggle-verified="handleToggleVerified"
                @unlock-doc="handleUnlockDoc"
              />
            </div>
            <BookingCard
              v-else-if="item.type === 'flat'"
              :booking="item.booking"
              :is-tile="false"
              :is-loading="loadingBookingId === item.booking.id"
              @preview="handleBookingPreview"
              @drop-doc="handleDropDoc"
              @drop-file="handleDropFile"
              @unassign="handleInlineUnassign"
              @toggle-no-doc="handleToggleNoDoc"
              @toggle-verified="handleToggleVerified"
              @unlock-doc="handleUnlockDoc"
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
      <DocumentSidebar
        ref="sidebarRef"
        :uploading="sidebarUploading"
        :upload-done="sidebarUploadDone"
        :upload-total="sidebarUploadTotal"
        @preview="openDocPreview"
        @unlock="openPasswordDialog"
        @upload="handleAdditionalUpload"
        @edit="editDoc = $event"
        @reanalyze="queueExtraction"
        @delete="removeDocument"
        @unassign-doc="handleSidebarUnassign"
        @analyze-all="queueMissing"
      />
    </div>

    <!-- ColumnMapper Modal -->
    <Teleport to="body">
      <Transition name="modal">
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
      </Transition>
    </Teleport>

    <!-- Dokumentenvorschau -->
    <Teleport to="body">
      <Transition name="preview">
        <DocumentPreview
          v-if="previewDocDirect"
          :document="previewDocDirect"
          @close="previewDocDirect = null"
          @edit="editDoc = previewDocDirect"
        />
      </Transition>
    </Teleport>

    <!-- Eckdaten eines Belegs bearbeiten -->
    <Teleport to="body">
      <Transition name="modal">
        <DocumentFieldsDialog
          v-if="editDoc"
          :key="editDoc.id"
          :document="editDoc"
          @save="handleDocFieldsSave"
          @close="editDoc = null"
        />
      </Transition>
    </Teleport>

    <!-- Passwort-Dialog für verschlüsselte PDFs -->
    <Teleport to="body">
      <Transition name="modal">
        <PdfPasswordDialog
          v-if="passwordDialog"
          :document-name="passwordDialog.doc.name"
          :wrong-password="passwordDialog.wrongPassword"
          @submit="submitPassword"
          @close="passwordDialog = null"
        />
      </Transition>
    </Teleport>

    <!-- Bestätigungsdialog: Alle Zuordnungen lösen -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showUnassignAllConfirm"
          class="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]"
          @click.self="showUnassignAllConfirm = false"
        >
          <div class="modal-panel bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4">
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
      </Transition>
    </Teleport>
  </div>
</template>
