<script setup lang="ts">
const {
  bookings,
  tableHeaders,
  tablePreviewRows,
  allTableRows,
  columnMapping,
  showColumnMapper,
  tableFileName,
  currentStep,
  currentBspId,
  bspList,
  isProcessing,
  processingMessage,
} = useAppState()

const { parseFile, detectColumns, createBookings } = useTableParser()

const tableDropActive = ref(false)
const tableInputRef = ref<HTMLInputElement>()
const parseError = ref('')

async function handleTableUpload(file: File) {
  parseError.value = ''
  try {
    isProcessing.value = true
    processingMessage.value = 'Tabelle wird eingelesen…'

    const { headers, rows } = await parseFile(file)
    tableHeaders.value = headers
    allTableRows.value = rows
    tablePreviewRows.value = rows.slice(0, 50)
    tableFileName.value = file.name

    const meta = bspList.value.find(b => b.id === currentBspId.value)
    if (meta) {
      meta.name = file.name.replace(/\.[^.]+$/, '')
    }

    const detected = detectColumns(headers, rows)
    columnMapping.value = detected

    if (detected.date && detected.amount) {
      const created = createBookings(rows, detected)
      const hasValidAmounts = created.some(b => b.amount !== 0)
      if (created.length === 0) {
        parseError.value = 'Keine gültigen Buchungen gefunden. Bitte prüfen Sie die Spaltenzuordnung.'
        showColumnMapper.value = true
      } else if (!hasValidAmounts) {
        parseError.value = 'Die erkannte Betragsspalte enthält keine gültigen Zahlenwerte. Bitte wählen Sie die korrekte Spalte aus.'
        showColumnMapper.value = true
      } else {
        bookings.value = created
        currentStep.value = 2
      }
    } else {
      if (!detected.date && !detected.amount) {
        parseError.value = 'Die Spalten für Buchungsdatum und Betrag konnten nicht automatisch erkannt werden.'
      } else if (!detected.date) {
        parseError.value = 'Die Spalte für das Buchungsdatum konnte nicht automatisch erkannt werden.'
      } else {
        parseError.value = 'Die Spalte für den Betrag konnte nicht automatisch erkannt werden.'
      }
      showColumnMapper.value = true
    }
  } catch (e: any) {
    parseError.value = `Fehler beim Einlesen: ${e.message}`
  } finally {
    isProcessing.value = false
    processingMessage.value = ''
  }
}

function onTableDrop(e: DragEvent) {
  tableDropActive.value = false
  const file = e.dataTransfer?.files[0]
  if (file) handleTableUpload(file)
}

function onTableFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleTableUpload(file)
}

function applyMapping(importFilters?: { dateFrom: string | null; dateTo: string | null; direction: 'all' | 'incoming' | 'outgoing' }) {
  parseError.value = ''
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

  if (created.length === 0) {
    parseError.value = 'Keine gültigen Buchungen gefunden. Bitte überprüfen Sie die Spaltenzuordnung oder die Filtereinstellungen.'
    return
  }
  bookings.value = created
  showColumnMapper.value = false
  currentStep.value = 2
}

</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
    <section>
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        <font-awesome-icon icon="table" class="text-primary-500 mr-2" />
        Buchungstabelle importieren
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Laden Sie Ihre Buchungstabelle als CSV- oder Excel-Datei hoch.
      </p>

      <div
        class="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all"
        :class="tableDropActive
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
        @dragover.prevent="tableDropActive = true"
        @dragleave="tableDropActive = false"
        @drop.prevent="onTableDrop"
        @click="tableInputRef?.click()"
      >
        <font-awesome-icon icon="arrow-up-from-bracket" class="text-4xl text-gray-400 dark:text-gray-500 mb-3" />
        <p class="text-gray-600 dark:text-gray-400 font-medium">
          CSV- oder Excel-Datei hierher ziehen
        </p>
        <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">
          oder klicken zum Auswählen · .csv, .xlsx, .xls
        </p>
        <input
          ref="tableInputRef"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          class="hidden"
          @change="onTableFileSelect"
        >
      </div>
    </section>

    <!-- Fehleranzeige -->
    <div
      v-if="parseError"
      class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
    >
      <div class="flex items-start gap-3">
        <font-awesome-icon icon="triangle-exclamation" class="text-red-500 mt-0.5" />
        <p class="text-sm text-red-700 dark:text-red-300">{{ parseError }}</p>
      </div>
    </div>

    <!-- Fortschritt -->
    <div v-if="isProcessing" class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div class="flex items-center gap-3">
        <font-awesome-icon icon="spinner" class="text-primary-500 animate-spin" />
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ processingMessage }}</span>
      </div>
    </div>

    <!-- Weiter-Button wenn Buchungen bereits vorhanden -->
    <div v-if="bookings.length > 0 && !showColumnMapper" class="flex justify-end">
      <button
        class="px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 bg-primary-500 text-white hover:bg-primary-600 shadow-md shadow-primary-500/25 transition-all"
        @click="currentStep = 2"
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
  </div>
</template>
