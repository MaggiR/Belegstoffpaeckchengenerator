<script setup lang="ts">
import type { Booking } from '~/types'

const vTruncTitle = {
  mounted(el: HTMLElement) { updateTruncTitle(el) },
  updated(el: HTMLElement) { nextTick(() => updateTruncTitle(el)) },
}

function updateTruncTitle(el: HTMLElement) {
  el.title = el.scrollWidth > el.clientWidth ? (el.textContent?.trim() || '') : ''
}

const props = defineProps<{
  booking: Booking
  isTile: boolean
  isLoading?: boolean
}>()

const emit = defineEmits<{
  'preview': [bookingId: string, docId?: string]
  'drop-doc': [bookingId: string, docId: string]
  'drop-file': [bookingId: string, files: FileList]
  'toggle-no-doc': [bookingId: string]
  'toggle-verified': [bookingId: string]
  'unassign': [bookingId: string, docId?: string]
  'unlock-doc': [docId: string]
}>()

const { getDocumentsForBooking } = useAppState()

const docs = computed(() => getDocumentsForBooking(props.booking.id))
const hasDocs = computed(() => docs.value.length > 0)
const primaryDoc = computed(() => docs.value[0])

const expanded = ref(false)
const visibleDocs = computed(() => expanded.value ? docs.value : docs.value.slice(0, 1))
const hiddenCount = computed(() => Math.max(0, docs.value.length - 1))

// Beim Lösen des letzten Belegs bleibt sonst ein aufgeklappter Zustand zurück.
watch(hiddenCount, (count) => {
  if (count === 0) expanded.value = false
})

const dragOver = ref(false)

const formattedDate = computed(() => {
  if (!props.booking.date) return '—'
  return props.booking.date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
})

const formattedAmount = computed(() => {
  return props.booking.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
})

const isIncoming = computed(() => props.booking.amount > 0)

function onDragOver(e: DragEvent) {
  if (props.booking.noDocRequired) return
  const hasDocId = e.dataTransfer?.types?.includes('application/x-doc-id')
  const hasFiles = e.dataTransfer?.types?.includes('Files')
  if (!hasDocId && !hasFiles) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const docId = e.dataTransfer?.getData('application/x-doc-id')
  if (docId) {
    e.preventDefault()
    emit('drop-doc', props.booking.id, docId)
    return
  }
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    e.preventDefault()
    emit('drop-file', props.booking.id, files)
  }
}

function onDocDragStart(e: DragEvent, docId?: string) {
  if (!docId) return
  e.dataTransfer!.setData('application/x-doc-id', docId)
  e.dataTransfer!.effectAllowed = 'move'
}

const statusClass = computed(() => {
  if (hasDocs.value) return props.booking.verified ? 'bg-emerald-500' : 'bg-emerald-400'
  if (props.booking.noDocRequired) return 'bg-gray-300 dark:bg-gray-600'
  return 'bg-amber-500'
})

const statusLabel = computed(() => {
  if (hasDocs.value) return props.booking.verified ? 'Geprüft' : 'Zugeordnet'
  if (props.booking.noDocRequired) return 'Kein Beleg erforderlich'
  return 'Ohne Beleg'
})

function onTileClick() {
  if (!hasDocs.value || props.isLoading) return
  const doc = primaryDoc.value
  if (!doc) return
  if (doc.locked) {
    emit('unlock-doc', doc.id)
    return
  }
  emit('preview', props.booking.id, doc.id)
}
</script>

<template>
  <!-- Kachelansicht -->
  <div
    v-if="isTile"
    class="border-2 rounded-xl overflow-hidden hover:shadow-lg transition-all group"
    :class="[
      dragOver
        ? 'bg-white dark:bg-gray-800 border-primary-500 shadow-lg shadow-primary-500/20'
        : booking.noDocRequired
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
          : hasDocs
            ? booking.verified
              ? 'bg-white dark:bg-gray-800 border-emerald-400 dark:border-emerald-600'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60',
      hasDocs && !isLoading ? 'cursor-pointer' : '',
    ]"
    @click="onTileClick"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      class="aspect-[3/4] relative overflow-hidden"
      :class="!hasDocs && !booking.noDocRequired
        ? 'bg-amber-50/80 dark:bg-amber-950/30'
        : 'bg-gray-50 dark:bg-gray-900'"
    >
      <!-- Ladeanimation -->
      <div
        v-if="isLoading"
        class="w-full h-full flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80"
      >
        <div class="w-10 h-10 border-3 border-primary-200 dark:border-primary-800 border-t-primary-500 rounded-full animate-spin" />
        <span class="text-xs text-primary-500 mt-3 font-medium">Wird geladen…</span>
      </div>
      <img
        v-else-if="primaryDoc?.thumbnailDataUrl"
        :src="primaryDoc.thumbnailDataUrl"
        :alt="primaryDoc.title"
        class="w-full h-full object-contain"
        draggable="true"
        @dragstart="onDocDragStart($event, primaryDoc?.id)"
      >
      <div
        v-else
        class="w-full h-full flex flex-col items-center justify-center"
        :class="booking.noDocRequired
          ? 'text-gray-300 dark:text-gray-600'
          : 'text-amber-400 dark:text-amber-500'"
      >
        <font-awesome-icon :icon="booking.noDocRequired ? 'check' : 'circle-exclamation'" class="text-4xl mb-2" />
        <span class="text-xs font-medium">{{ statusLabel }}</span>
      </div>

      <!-- Verified-Checkbox (oben links) -->
      <button
        v-if="hasDocs"
        class="absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all border-2 shadow-sm"
        :class="booking.verified
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : 'bg-white/90 dark:bg-gray-800/90 border-gray-300 dark:border-gray-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-emerald-400 hover:text-emerald-400'"
        :title="booking.verified ? 'Zuordnung geprüft – zum Entprüfen klicken' : 'Als geprüft markieren'"
        @click.stop="emit('toggle-verified', booking.id)"
      >
        <font-awesome-icon icon="check" class="w-3.5 h-3.5" />
      </button>

      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          v-if="hasDocs"
          class="w-8 h-8 rounded-lg bg-black/50 text-white/70 hover:text-red-400 flex items-center justify-center transition-colors"
          :title="docs.length > 1 ? 'Alle Belege entfernen' : 'Beleg entfernen'"
          @click.stop="emit('unassign', booking.id)"
        >
          <font-awesome-icon icon="link-slash" class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="!hasDocs"
          class="w-9 h-9 rounded-lg bg-black/50 text-white/70 flex items-center justify-center transition-colors"
          :class="booking.noDocRequired
            ? 'hover:text-amber-300'
            : 'hover:text-gray-200'"
          :title="booking.noDocRequired ? 'Beleg doch erforderlich' : 'Kein Beleg erforderlich'"
          @click.stop="emit('toggle-no-doc', booking.id)"
        >
          <font-awesome-icon :icon="booking.noDocRequired ? 'file-circle-exclamation' : 'ban'" class="w-4 h-4" />
        </button>
      </div>

      <!-- Anzahl weiterer Belege -->
      <div
        v-if="docs.length > 1"
        class="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/55 text-white flex items-center gap-1"
        :title="`${docs.length} Belege zugeordnet`"
      >
        <font-awesome-icon icon="layer-group" class="w-2.5 h-2.5" />
        {{ docs.length }}
      </div>

      <div
        v-if="hasDocs"
        class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors"
        :class="booking.verified
          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          : 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'"
      >
        {{ statusLabel }}
      </div>
    </div>

    <div class="p-3 space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ formattedDate }}</span>
        <span
          class="text-sm font-semibold"
          :class="isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'"
        >
          {{ formattedAmount }}
        </span>
      </div>
      <p v-trunc-title class="text-xs text-gray-600 dark:text-gray-400 truncate">
        {{ booking.description || '—' }}
      </p>
      <p v-if="booking.remarks" v-trunc-title class="text-[10px] text-gray-400 dark:text-gray-500 truncate">
        {{ booking.remarks }}
      </p>
    </div>
  </div>

  <!-- Listenansicht -->
  <div
    v-else
    class="border-2 rounded-lg px-4 py-2.5 flex items-center gap-3 hover:shadow-md transition-all group relative overflow-hidden"
    :class="dragOver
      ? 'bg-white dark:bg-gray-800 border-primary-500 shadow-md shadow-primary-500/20'
      : !hasDocs && !booking.noDocRequired
        ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-400 dark:border-amber-600/70 shadow-sm shadow-amber-500/10'
        : booking.noDocRequired && !hasDocs
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
          : hasDocs && booking.verified
            ? 'bg-white dark:bg-gray-800 border-emerald-400 dark:border-emerald-600'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Linker Akzentbalken bei fehlendem Beleg -->
    <div
      v-if="!hasDocs && !booking.noDocRequired"
      class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 dark:bg-amber-400"
    />

    <!-- Statusspalte (fixe Breite – Checkbox oder Punkt) -->
    <div class="w-6 flex items-center justify-center flex-shrink-0">
      <button
        v-if="hasDocs"
        class="w-6 h-6 rounded-md flex items-center justify-center transition-all border-2"
        :class="booking.verified
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-transparent hover:border-emerald-400 hover:text-emerald-400'"
        :title="booking.verified ? 'Zuordnung geprüft – zum Entprüfen klicken' : 'Als geprüft markieren'"
        @click.stop="emit('toggle-verified', booking.id)"
      >
        <font-awesome-icon icon="check" class="w-3 h-3" />
      </button>

      <div
        v-else
        class="w-2 h-2 rounded-full"
        :class="statusClass"
      />
    </div>

    <div class="flex items-center gap-1.5 flex-shrink-0">
      <span
        class="text-sm w-20 whitespace-nowrap tabular-nums"
        :class="!hasDocs && !booking.noDocRequired ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-gray-500 dark:text-gray-400'"
      >
        {{ formattedDate }}
      </span>

      <span
        class="text-sm font-semibold w-24 text-right tabular-nums"
        :class="isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'"
      >
        {{ formattedAmount }}
      </span>
    </div>

    <div class="flex-1 min-w-0">
      <span
        class="text-sm block line-clamp-2 leading-tight"
        :class="!hasDocs && !booking.noDocRequired ? 'text-amber-900 dark:text-amber-200 font-medium' : 'text-gray-600 dark:text-gray-400'"
      >
        {{ booking.description || '—' }}
      </span>
      <span v-if="booking.remarks" v-trunc-title class="text-[10px] text-gray-400 dark:text-gray-500 block truncate mt-0.5">
        {{ booking.remarks }}
      </span>
    </div>

    <!-- Aktionen der Buchung -->
    <div class="w-8 flex-shrink-0 flex items-center justify-center">
      <button
        v-if="hasDocs"
        class="p-1.5 rounded-md text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
        :title="docs.length > 1 ? 'Alle Zuordnungen dieser Buchung lösen' : 'Zuordnung lösen'"
        @click.stop="emit('unassign', booking.id)"
      >
        <font-awesome-icon icon="link-slash" class="w-3.5 h-3.5" />
      </button>
      <button
        v-else
        class="p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
        :class="booking.noDocRequired
          ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          : 'text-amber-600/70 dark:text-amber-400/70 hover:text-amber-700 hover:bg-amber-200/50 dark:hover:bg-amber-900/40'"
        :title="booking.noDocRequired ? 'Beleg doch erforderlich' : 'Kein Beleg erforderlich'"
        @click.stop="emit('toggle-no-doc', booking.id)"
      >
        <font-awesome-icon :icon="booking.noDocRequired ? 'file-circle-exclamation' : 'ban'" class="w-4 h-4" />
      </button>
    </div>

    <!-- Beleg-Bereich -->
    <div class="w-56 flex-shrink-0">
      <!-- Ladeanimation -->
      <div
        v-if="isLoading"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20"
      >
        <div class="w-5 h-5 border-2 border-primary-200 dark:border-primary-800 border-t-primary-500 rounded-full animate-spin flex-shrink-0" />
        <span class="text-[11px] text-primary-500 font-medium">Wird geladen…</span>
      </div>

      <!-- Zugeordnete Belege -->
      <div v-else-if="hasDocs" class="space-y-1">
        <div
          v-for="doc in visibleDocs"
          :key="doc.id"
          class="flex items-center gap-2 px-2 py-1.5 rounded-lg border group/doc transition-colors"
          :class="doc.locked
            ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-300 dark:border-amber-700 cursor-pointer hover:border-amber-400'
            : booking.verified
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 cursor-grab active:cursor-grabbing'
              : 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 cursor-grab active:cursor-grabbing'"
          :draggable="!doc.locked"
          :title="doc.locked ? 'Passwortgeschützt – zum Entsperren klicken' : doc.name"
          @dragstart="doc.locked ? $event.preventDefault() : onDocDragStart($event, doc.id)"
          @click.stop="doc.locked ? emit('unlock-doc', doc.id) : emit('preview', booking.id, doc.id)"
        >
          <div
            class="w-7 h-9 flex-shrink-0 rounded overflow-hidden flex items-center justify-center"
            :class="doc.locked
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : 'bg-white dark:bg-gray-900'"
          >
            <font-awesome-icon
              v-if="doc.locked"
              icon="lock"
              class="text-amber-500 dark:text-amber-400 text-xs"
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
              class="text-emerald-400 text-[9px]"
            />
          </div>

          <div class="flex-1 min-w-0">
            <span
              class="text-xs block line-clamp-2 leading-tight font-medium"
              :class="doc.locked
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-emerald-800 dark:text-emerald-300'"
            >
              {{ doc.title }}
            </span>
            <span
              v-if="doc.correspondent"
              v-trunc-title
              class="text-[10px] block truncate text-emerald-600/80 dark:text-emerald-400/70"
            >
              {{ doc.correspondent }}
            </span>
          </div>

          <button
            class="w-5 h-5 flex-shrink-0 rounded hover:text-red-500 flex items-center justify-center opacity-0 group-hover/doc:opacity-100 transition-opacity"
            :class="doc.locked ? 'text-amber-500' : 'text-emerald-500/70'"
            title="Diesen Beleg entfernen"
            @click.stop="emit('unassign', booking.id, doc.id)"
          >
            <font-awesome-icon icon="xmark" class="w-3 h-3" />
          </button>
        </div>

        <!-- Weitere Belege ein- und ausklappen -->
        <button
          v-if="hiddenCount > 0"
          class="w-full px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/25 hover:bg-emerald-200/70 dark:hover:bg-emerald-900/40 transition-colors flex items-center justify-center gap-1"
          @click.stop="expanded = !expanded"
        >
          <font-awesome-icon :icon="expanded ? 'chevron-up' : 'layer-group'" class="w-2.5 h-2.5" />
          {{ expanded ? 'Weniger anzeigen' : `+${hiddenCount} weitere` }}
        </button>
      </div>

      <!-- Kein Beleg erforderlich -->
      <div
        v-else-if="booking.noDocRequired"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700"
      >
        <font-awesome-icon icon="check" class="text-gray-400 dark:text-gray-500 w-3.5 h-3.5 flex-shrink-0" />
        <span class="text-[11px] text-gray-400 dark:text-gray-500 italic flex-1">Kein Beleg erforderlich</span>
      </div>

      <!-- Leere Drop-Zone -->
      <div
        v-else
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg border-2 border-dashed transition-colors"
        :class="dragOver
          ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-900/20'
          : 'border-amber-400 dark:border-amber-600/70 bg-amber-100/60 dark:bg-amber-900/20 hover:border-amber-500 dark:hover:border-amber-500'"
      >
        <font-awesome-icon icon="circle-exclamation" class="text-amber-600 dark:text-amber-400 w-4 h-4 flex-shrink-0" />
        <span class="text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex-1">Ohne Beleg</span>
      </div>
    </div>
  </div>
</template>
