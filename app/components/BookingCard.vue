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
  'preview': [bookingId: string]
  'drop-doc': [bookingId: string, docId: string]
  'drop-file': [bookingId: string, files: FileList]
  'toggle-no-doc': [bookingId: string]
  'unassign': [bookingId: string]
}>()

const { getDocumentForBooking } = useAppState()

const doc = computed(() => getDocumentForBooking(props.booking.id))
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

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

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

function onDocDragStart(e: DragEvent) {
  if (!doc.value) return
  e.dataTransfer!.setData('application/x-doc-id', doc.value.id)
  e.dataTransfer!.effectAllowed = 'move'
}

const statusClass = computed(() => {
  if (doc.value) return 'bg-green-500'
  if (props.booking.noDocRequired) return 'bg-gray-300 dark:bg-gray-600'
  return 'bg-amber-400'
})

const statusLabel = computed(() => {
  if (doc.value) return 'Zugeordnet'
  if (props.booking.noDocRequired) return 'Kein Beleg erforderlich'
  return 'Ohne Beleg'
})
</script>

<template>
  <!-- Kachelansicht -->
  <div
    v-if="isTile"
    class="border-2 rounded-xl overflow-hidden hover:shadow-lg transition-all group"
    :class="dragOver
      ? 'bg-white dark:bg-gray-800 border-primary-500 shadow-lg shadow-primary-500/20'
      : booking.noDocRequired
        ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
        : doc
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      class="aspect-[3/4] relative overflow-hidden"
      :class="!doc && !booking.noDocRequired
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
        v-else-if="doc?.thumbnailDataUrl"
        :src="doc.thumbnailDataUrl"
        :alt="doc.name"
        class="w-full h-full object-contain"
        draggable="true"
        @dragstart="onDocDragStart"
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

      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          v-if="doc"
          class="w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center"
          title="Vorschau"
          @click.stop="emit('preview', booking.id)"
        >
          <font-awesome-icon icon="eye" class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="doc"
          class="w-8 h-8 rounded-lg bg-black/50 text-red-300 hover:text-red-400 flex items-center justify-center"
          title="Beleg entfernen"
          @click.stop="emit('unassign', booking.id)"
        >
          <font-awesome-icon icon="link-slash" class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="!doc"
          class="w-9 h-9 rounded-lg bg-black/50 flex items-center justify-center"
          :class="booking.noDocRequired ? 'text-amber-300 hover:text-amber-200' : 'text-gray-300 hover:text-gray-100'"
          :title="booking.noDocRequired ? 'Beleg doch erforderlich' : 'Kein Beleg erforderlich'"
          @click.stop="emit('toggle-no-doc', booking.id)"
        >
          <font-awesome-icon :icon="booking.noDocRequired ? 'file-circle-exclamation' : 'ban'" class="w-4 h-4" />
        </button>
      </div>

      <div
        v-if="doc"
        class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
      >
        {{ statusLabel }}
      </div>
    </div>

    <div class="p-3 space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ formattedDate }}</span>
        <span
          class="text-sm font-semibold"
          :class="isIncoming ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'"
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
    class="bg-white dark:bg-gray-800 border-2 rounded-lg px-4 py-2.5 flex items-center gap-3 hover:shadow-md transition-all group"
    :class="dragOver
      ? 'border-primary-500 shadow-md shadow-primary-500/20'
      : booking.noDocRequired && !doc
        ? 'border-gray-200 dark:border-gray-700 opacity-60'
        : 'border-gray-200 dark:border-gray-700'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="w-2 h-2 rounded-full flex-shrink-0" :class="statusClass" />

    <span class="text-sm text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">
      {{ formattedDate }}
    </span>

    <span
      class="text-sm font-semibold w-28 flex-shrink-0 text-right"
      :class="isIncoming ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'"
    >
      {{ formattedAmount }}
    </span>

    <div class="flex-1 min-w-0">
      <span class="text-sm text-gray-600 dark:text-gray-400 block line-clamp-2 leading-tight">
        {{ booking.description || '—' }}
      </span>
      <span v-if="booking.remarks" v-trunc-title class="text-[10px] text-gray-400 dark:text-gray-500 block truncate mt-0.5">
        {{ booking.remarks }}
      </span>
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
      <!-- Zugeordneter Beleg (wie Sidebar-Darstellung) -->
      <div
        v-else-if="doc"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 cursor-grab active:cursor-grabbing group/doc"
        draggable="true"
        @dragstart="onDocDragStart"
        @click.stop="emit('preview', booking.id)"
      >
        <div class="w-7 h-9 flex-shrink-0 rounded overflow-hidden bg-white dark:bg-gray-900">
          <img
            v-if="doc.thumbnailDataUrl"
            :src="doc.thumbnailDataUrl"
            :alt="doc.name"
            class="w-full h-full object-cover pointer-events-none"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <font-awesome-icon
              :icon="doc.type === 'pdf' ? 'file-pdf' : 'file-image'"
              class="text-green-400 text-[9px]"
            />
          </div>
        </div>
        <span class="text-xs text-green-700 dark:text-green-400 flex-1 min-w-0 line-clamp-2 break-all leading-tight">
          {{ stripExtension(doc.name) }}
        </span>
        <button
          class="w-5 h-5 flex-shrink-0 rounded text-green-400 hover:text-red-500 flex items-center justify-center opacity-0 group-hover/doc:opacity-100 transition-opacity"
          title="Beleg entfernen"
          @click.stop="emit('unassign', booking.id)"
        >
          <font-awesome-icon icon="xmark" class="w-3 h-3" />
        </button>
      </div>

      <!-- Kein Beleg erforderlich -->
      <div
        v-else-if="booking.noDocRequired"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700"
      >
        <font-awesome-icon icon="check" class="text-gray-400 dark:text-gray-500 w-3.5 h-3.5 flex-shrink-0" />
        <span class="text-[11px] text-gray-400 dark:text-gray-500 italic flex-1">Kein Beleg erforderlich</span>
        <button
          class="p-1.5 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors opacity-0 group-hover:opacity-100"
          title="Beleg doch erforderlich"
          @click.stop="emit('toggle-no-doc', booking.id)"
        >
          <font-awesome-icon icon="file-circle-exclamation" class="w-4 h-4" />
        </button>
      </div>

      <!-- Leere Drop-Zone -->
      <div
        v-else
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg border-2 border-dashed transition-colors"
        :class="dragOver
          ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
          : 'border-amber-200 dark:border-amber-800/40 hover:border-amber-300 dark:hover:border-amber-700'"
      >
        <font-awesome-icon icon="circle-exclamation" class="text-amber-400 dark:text-amber-500 w-3.5 h-3.5 flex-shrink-0" />
        <span class="text-[11px] text-amber-500 dark:text-amber-400 font-medium flex-1">Ohne Beleg</span>
        <button
          class="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
          title="Kein Beleg erforderlich"
          @click.stop="emit('toggle-no-doc', booking.id)"
        >
          <font-awesome-icon icon="ban" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
