<script setup lang="ts">
import type { DocFilterStatus, DocFilterType, DocSortField, DocumentFile } from '~/types'

const props = defineProps<{
  uploading: boolean
  uploadDone: number
  uploadTotal: number
}>()

const emit = defineEmits<{
  'preview': [doc: DocumentFile]
  'unlock': [doc: DocumentFile]
  'upload': [files: FileList]
  'edit': [doc: DocumentFile]
  'reanalyze': [docId: string]
  'delete': [docId: string]
  'unassign-doc': [docId: string]
  'analyze-all': []
}>()

const {
  docSearch,
  docSort,
  docFilters,
  activeDocFilterCount,
  resetDocFilters,
  documents,
  unassignedDocuments,
  filteredSortedUnassignedDocuments,
} = useAppState()

const {
  pendingExtractions,
  batchTotal,
  batchCompleted,
  extractionProgressPercent,
} = useDocumentExtraction()
const { isConfigured } = useLlmSettings()

const dropActive = ref(false)
const uploadInputRef = ref<HTMLInputElement>()
const toolbarRef = ref<HTMLElement>()
const openPanel = ref<'filter' | 'sort' | null>(null)

const sortFields: Array<{ value: DocSortField; label: string }> = [
  { value: 'documentDate', label: 'Belegdatum' },
  { value: 'title', label: 'Titel' },
  { value: 'correspondent', label: 'Korrespondent' },
  { value: 'totalAmount', label: 'Betrag' },
  { value: 'name', label: 'Dateiname' },
]

const statusOptions: Array<{ value: DocFilterStatus; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'analyzed', label: 'Analysiert' },
  { value: 'unanalyzed', label: 'Offen' },
  { value: 'failed', label: 'Fehler' },
]

const typeOptions: Array<{ value: DocFilterType; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Bild' },
]

const hasSearch = computed(() => docSearch.value.trim().length > 0)
const isNarrowed = computed(() => hasSearch.value || activeDocFilterCount.value > 0)

const activeSortLabel = computed(() =>
  sortFields.find(f => f.value === docSort.value.field)?.label ?? '',
)

const uploadPercent = computed(() =>
  props.uploadTotal > 0 ? Math.round((props.uploadDone / props.uploadTotal) * 100) : 0,
)

/** Belege, deren Auswertung noch aussteht oder fehlgeschlagen ist. */
const notAnalyzedCount = computed(() =>
  documents.value.filter(d => d.extractionStatus !== 'done' && d.extractionStatus !== 'running').length,
)

function togglePanel(panel: 'filter' | 'sort') {
  openPanel.value = openPanel.value === panel ? null : panel
}

/** Erneutes Wählen des aktiven Felds kehrt die Reihenfolge um. */
function chooseSort(field: DocSortField) {
  if (docSort.value.field === field) {
    docSort.value.order = docSort.value.order === 'asc' ? 'desc' : 'asc'
    return
  }
  docSort.value.field = field
}

function clearAll() {
  docSearch.value = ''
  resetDocFilters()
}

function onPointerDownOutside(e: PointerEvent) {
  if (!openPanel.value) return
  if (toolbarRef.value?.contains(e.target as Node)) return
  openPanel.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') openPanel.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDownOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDownOutside)
  document.removeEventListener('keydown', onKeydown)
})

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00`)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatAmount(amount: number | null): string {
  if (amount === null) return ''
  return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function onDragStart(e: DragEvent, docId: string) {
  e.dataTransfer!.setData('application/x-doc-id', docId)
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types
  if (types?.includes('application/x-doc-id') || types?.includes('Files')) {
    e.preventDefault()
    dropActive.value = true
  }
}

function onDrop(e: DragEvent) {
  dropActive.value = false
  const docId = e.dataTransfer?.getData('application/x-doc-id')
  if (docId) {
    e.preventDefault()
    emit('unassign-doc', docId)
    return
  }
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    e.preventDefault()
    emit('upload', files)
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) emit('upload', input.files)
  input.value = ''
}

defineExpose({ openFilePicker: () => uploadInputRef.value?.click() })
</script>

<template>
  <div
    class="w-80 flex-shrink-0 sticky top-4 self-start flex flex-col h-[calc(100dvh-2rem)] min-h-0"
    @dragover="onDragOver"
    @dragleave="dropActive = false"
    @drop="onDrop"
  >
    <!-- Kopfzeile -->
    <div class="flex items-center gap-2 mb-2 h-5 flex-shrink-0">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Belege
      </h3>
      <span
        v-if="unassignedDocuments.length > 0"
        class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
      >
        {{ unassignedDocuments.length }}
      </span>
      <div
        v-if="batchTotal > 0"
        class="ml-auto flex items-center gap-1.5 min-w-[88px]"
        :title="`${batchCompleted} von ${batchTotal} Belegen analysiert`"
      >
        <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500 ease-out"
            :style="{ width: `${extractionProgressPercent}%` }"
          />
        </div>
        <span class="text-[10px] font-medium tabular-nums text-primary-600 dark:text-primary-400">
          {{ batchCompleted }}/{{ batchTotal }}
        </span>
      </div>
      <span
        v-else-if="pendingExtractions > 0"
        class="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-primary-600 dark:text-primary-400"
        title="Beleg wird analysiert"
      >
        <font-awesome-icon icon="spinner" class="animate-spin w-2.5 h-2.5" />
      </span>
    </div>

    <input
      ref="uploadInputRef"
      type="file"
      accept=".pdf,.jpg,.jpeg,.png"
      multiple
      class="hidden"
      @change="onFileSelect"
    >

    <!-- Werkzeugleiste: Suche, Filter und Sortierung in einer Zeile -->
    <div v-if="unassignedDocuments.length > 0" ref="toolbarRef" class="relative mb-2 flex-shrink-0">
      <div class="flex items-center gap-1">
        <div class="relative flex-1 min-w-0">
          <font-awesome-icon
            icon="magnifying-glass"
            class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none"
          />
          <input
            v-model="docSearch"
            type="search"
            placeholder="Suchen…"
            class="w-full h-8 pl-8 pr-7 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
          >
          <button
            v-if="hasSearch"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
            title="Suche zurücksetzen"
            @click="docSearch = ''"
          >
            <font-awesome-icon icon="xmark" class="w-2.5 h-2.5" />
          </button>
        </div>

        <button
          class="relative w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center transition-colors"
          :class="openPanel === 'filter' || activeDocFilterCount > 0
            ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
          :title="activeDocFilterCount > 0 ? `${activeDocFilterCount} Filter aktiv` : 'Belege filtern'"
          @click="togglePanel('filter')"
        >
          <font-awesome-icon icon="filter" class="w-3 h-3" />
          <span
            v-if="activeDocFilterCount > 0"
            class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-gray-50 dark:ring-gray-950"
          >
            {{ activeDocFilterCount }}
          </span>
        </button>

        <button
          class="w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center transition-colors"
          :class="openPanel === 'sort'
            ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
          :title="`Sortierung: ${activeSortLabel} ${docSort.order === 'asc' ? 'aufsteigend' : 'absteigend'}`"
          @click="togglePanel('sort')"
        >
          <font-awesome-icon :icon="docSort.order === 'asc' ? 'sort-up' : 'sort-down'" class="w-3 h-3" />
        </button>
      </div>

      <!-- Filterpanel -->
      <Transition name="popover">
        <div
          v-if="openPanel === 'filter'"
          class="absolute top-full right-0 mt-1.5 w-full z-30 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl shadow-gray-900/10 dark:shadow-black/40 p-3 space-y-3"
        >
          <div>
            <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Analyse
            </p>
            <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
              <button
                v-for="option in statusOptions"
                :key="option.value"
                class="flex-1 px-1 py-1 rounded-md text-[11px] font-medium transition-all"
                :class="docFilters.status === option.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="docFilters.status = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div>
            <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Dateityp
            </p>
            <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
              <button
                v-for="option in typeOptions"
                :key="option.value"
                class="flex-1 px-1 py-1 rounded-md text-[11px] font-medium transition-all"
                :class="docFilters.type === option.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="docFilters.type = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div>
            <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              Belegdatum
            </p>
            <div class="flex items-center gap-1.5">
              <input
                :value="docFilters.dateFrom ?? ''"
                type="date"
                class="flex-1 min-w-0 h-7 px-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                @input="docFilters.dateFrom = ($event.target as HTMLInputElement).value || null"
              >
              <span class="text-gray-300 dark:text-gray-600 text-[10px]">–</span>
              <input
                :value="docFilters.dateTo ?? ''"
                type="date"
                class="flex-1 min-w-0 h-7 px-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                @input="docFilters.dateTo = ($event.target as HTMLInputElement).value || null"
              >
            </div>
            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Belege ohne erkanntes Datum werden dabei ausgeblendet.
            </p>
          </div>

          <button
            v-if="activeDocFilterCount > 0"
            class="w-full py-1.5 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="resetDocFilters"
          >
            Filter zurücksetzen
          </button>
        </div>
      </Transition>

      <!-- Sortierpanel -->
      <Transition name="popover">
        <div
          v-if="openPanel === 'sort'"
          class="absolute top-full right-0 mt-1.5 w-full z-30 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl shadow-gray-900/10 dark:shadow-black/40 p-1.5"
        >
          <button
            v-for="field in sortFields"
            :key="field.value"
            class="w-full px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors"
            :class="docSort.field === field.value
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
            @click="chooseSort(field.value)"
          >
            {{ field.label }}
            <font-awesome-icon
              v-if="docSort.field === field.value"
              :icon="docSort.order === 'asc' ? 'sort-up' : 'sort-down'"
              class="w-3 h-3"
            />
          </button>
          <p class="px-2 pt-1.5 pb-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            Erneut klicken kehrt die Reihenfolge um.
          </p>
        </div>
      </Transition>
    </div>

    <!-- Trefferanzeige bei aktiver Suche oder Filterung -->
    <div
      v-if="isNarrowed && unassignedDocuments.length > 0"
      class="flex items-center justify-between mb-1.5 px-0.5 flex-shrink-0"
    >
      <span class="text-[10px] text-gray-400 dark:text-gray-500">
        {{ filteredSortedUnassignedDocuments.length }} von {{ unassignedDocuments.length }}
      </span>
      <button
        class="text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
        @click="clearAll"
      >
        Zurücksetzen
      </button>
    </div>

    <!-- Sammelanalyse, sobald ein Anbieter eingerichtet ist -->
    <button
      v-if="isConfigured && notAnalyzedCount > 0 && pendingExtractions === 0"
      class="w-full mb-2 h-8 flex-shrink-0 text-[11px] font-medium rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center justify-center gap-1.5"
      @click="emit('analyze-all')"
    >
      <font-awesome-icon icon="brain" class="w-3 h-3" />
      {{ notAnalyzedCount }} Beleg{{ notAnalyzedCount === 1 ? '' : 'e' }} analysieren
    </button>

    <!-- Fortschritt beim Hochladen -->
    <div v-if="uploading" class="mb-2 flex-shrink-0">
      <div class="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
        <span>{{ uploadDone }} / {{ uploadTotal }} verarbeitet</span>
        <span>{{ uploadPercent }}%</span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
        <div
          class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500 ease-out"
          :style="{ width: `${uploadPercent}%` }"
        />
      </div>
    </div>

    <!-- Upload-Bereich wenn keine unzugeordneten Belege -->
    <div
      v-if="unassignedDocuments.length === 0 && !uploading"
      class="flex-1 min-h-0 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center"
      :class="dropActive
        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
      @click="uploadInputRef?.click()"
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
      v-else
      class="flex-1 min-h-0 space-y-1.5 overflow-auto rounded-lg"
      :class="dropActive ? 'ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-gray-950' : ''"
    >
      <div
        v-if="filteredSortedUnassignedDocuments.length === 0 && unassignedDocuments.length > 0"
        class="text-center py-8"
      >
        <font-awesome-icon icon="magnifying-glass" class="text-gray-300 dark:text-gray-600 text-lg mb-2" />
        <p class="text-[11px] text-gray-400 dark:text-gray-500">Kein Beleg passt zur Auswahl.</p>
      </div>

      <div
        v-for="doc in filteredSortedUnassignedDocuments"
        :key="doc.id"
        class="relative bg-white dark:bg-gray-800 border rounded-xl p-2.5 flex gap-2.5 group/doc transition-all"
        :class="doc.locked
          ? 'border-amber-300 dark:border-amber-700/70 bg-amber-50/60 dark:bg-amber-900/10 cursor-pointer hover:border-amber-400'
          : 'border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md hover:shadow-gray-900/5'"
        :draggable="!doc.locked"
        :title="doc.locked ? 'Passwortgeschützt – zum Entsperren klicken' : doc.name"
        @dragstart="doc.locked ? $event.preventDefault() : onDragStart($event, doc.id)"
        @click.stop="doc.locked ? emit('unlock', doc) : emit('preview', doc)"
      >
        <!-- Vorschaubild -->
        <div
          class="w-11 h-14 flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center ring-1 ring-inset"
          :class="doc.locked
            ? 'bg-amber-100 dark:bg-amber-900/30 ring-amber-200 dark:ring-amber-800'
            : 'bg-gray-50 dark:bg-gray-900 ring-gray-900/5 dark:ring-white/5'"
        >
          <font-awesome-icon
            v-if="doc.locked"
            icon="lock"
            class="text-amber-500 dark:text-amber-400 text-sm"
          />
          <img
            v-else-if="doc.thumbnailDataUrl"
            :src="doc.thumbnailDataUrl"
            :alt="doc.title"
            class="w-full h-full object-cover pointer-events-none"
          >
          <font-awesome-icon
            v-else
            :icon="doc.type === 'pdf' ? 'file-pdf' : 'file-image'"
            class="text-gray-300 dark:text-gray-600 text-xs"
          />
        </div>

        <!-- Eckdaten -->
        <div class="flex-1 min-w-0 flex flex-col">
          <p
            class="text-xs font-semibold leading-snug line-clamp-2 pr-12"
            :class="doc.locked ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'"
          >
            {{ doc.title }}
          </p>

          <div v-if="doc.documentKind || doc.correspondent" class="flex items-center gap-1.5 mt-1 min-w-0">
            <DocumentKindChip v-if="doc.documentKind" :kind="doc.documentKind" />
            <p
              v-if="doc.correspondent"
              class="text-[11px] text-gray-500 dark:text-gray-400 truncate"
            >
              {{ doc.correspondent }}
            </p>
          </div>

          <div class="flex items-center gap-2 mt-auto pt-1 min-h-[16px]">
            <span
              v-if="doc.documentDate"
              class="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 tabular-nums"
            >
              <font-awesome-icon icon="calendar-day" class="w-2.5 h-2.5 text-gray-400 dark:text-gray-500" />
              {{ formatDate(doc.documentDate) }}
            </span>

            <span
              v-if="doc.extractionStatus === 'running'"
              class="inline-flex items-center gap-1 text-[10px] font-medium text-primary-600 dark:text-primary-400"
            >
              <font-awesome-icon icon="spinner" class="animate-spin w-2.5 h-2.5" />
              Analyse
            </span>
            <span
              v-else-if="doc.extractionStatus !== 'done' && doc.extractionStatus !== 'failed'"
              class="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500"
              :title="doc.extractionError || 'Noch nicht per Sprachmodell ausgewertet'"
            >
              <font-awesome-icon icon="circle-info" class="w-2.5 h-2.5" />
              Nicht analysiert
            </span>

            <span
              v-if="doc.totalAmount !== null"
              class="ml-auto text-[11px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums"
            >
              {{ formatAmount(doc.totalAmount) }}
            </span>
          </div>

          <!-- Fehlerursache im Klartext statt nur als Tooltip -->
          <div
            v-if="doc.extractionStatus === 'failed'"
            class="mt-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 px-2 py-1.5 flex items-start gap-1.5"
          >
            <font-awesome-icon
              icon="triangle-exclamation"
              class="w-2.5 h-2.5 mt-[3px] flex-shrink-0 text-red-500 dark:text-red-400"
            />
            <div class="min-w-0">
              <p
                class="text-[10px] leading-snug text-red-700 dark:text-red-300 line-clamp-3"
                :title="doc.extractionError"
              >
                {{ doc.extractionError || 'Analyse fehlgeschlagen' }}
              </p>
              <button
                class="mt-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400 hover:underline"
                @click.stop="emit('reanalyze', doc.id)"
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>

        <!-- Aktionen nur beim Hover, damit kein dauerhafter Platz belegt wird -->
        <div
          class="absolute top-1.5 right-1.5 flex items-center gap-0.5 p-0.5 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10 opacity-0 group-hover/doc:opacity-100 focus-within:opacity-100 transition-opacity"
        >
          <button
            class="w-5 h-5 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 flex items-center justify-center"
            title="Eckdaten bearbeiten"
            @click.stop="emit('edit', doc)"
          >
            <font-awesome-icon icon="pen" class="w-2.5 h-2.5" />
          </button>
          <button
            v-if="doc.extractionStatus !== 'running'"
            class="w-5 h-5 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 flex items-center justify-center"
            title="Neu analysieren"
            @click.stop="emit('reanalyze', doc.id)"
          >
            <font-awesome-icon icon="rotate-right" class="w-2.5 h-2.5" />
          </button>
          <button
            class="w-5 h-5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
            title="Beleg löschen"
            @click.stop="emit('delete', doc.id)"
          >
            <font-awesome-icon icon="trash" class="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
