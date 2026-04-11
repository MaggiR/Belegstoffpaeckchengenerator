<script setup lang="ts">
const {
  currentStep,
  bookings,
  stats,
  getDocument,
  reset,
} = useAppState()

const { exportBsp } = usePdfUtils()

const isExporting = ref(false)
const exportDone = ref(false)
const error = ref('')

async function startNew() {
  await reset()
}

const sortedBookingsWithDocs = computed(() =>
  [...bookings.value]
    .filter(b => b.documentId)
    .sort((a, b) => {
      const da = a.date?.getTime() ?? 0
      const db = b.date?.getTime() ?? 0
      return da - db
    }),
)

async function download() {
  isExporting.value = true
  error.value = ''
  exportDone.value = false

  try {
    const blob = await exportBsp(sortedBookingsWithDocs.value, (id) => getDocument(id))
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Belegstoffpaeckchen_${new Date().toISOString().split('T')[0]}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    exportDone.value = true
  } catch (e: any) {
    error.value = e.message || 'Export fehlgeschlagen'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <!-- Zusammenfassung -->
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Belegstoffpäckchen exportieren
      </h2>

      <div class="grid grid-cols-4 gap-3 mb-8">
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
          <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Buchungen</p>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
          <p class="text-3xl font-bold text-green-600 dark:text-green-400">{{ stats.withDoc }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Mit Beleg</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
          <p class="text-3xl font-bold text-gray-400 dark:text-gray-500">{{ stats.noDocRequired }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Nicht erforderlich</p>
        </div>
        <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
          <p class="text-3xl font-bold text-amber-600 dark:text-amber-400">{{ stats.missing }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Fehlend</p>
        </div>
      </div>

      <!-- Warnung -->
      <div
        v-if="stats.missing > 0"
        class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-left"
      >
        <div class="flex items-start gap-3">
          <font-awesome-icon icon="triangle-exclamation" class="text-amber-500 mt-0.5" />
          <div>
            <p class="text-sm font-medium text-amber-800 dark:text-amber-300">
              {{ stats.missing }} Buchung{{ stats.missing !== 1 ? 'en' : '' }} ohne Beleg
            </p>
            <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Diese Buchungen werden im PDF übersprungen. Sie können zurückgehen und fehlende Belege nachladen.
            </p>
          </div>
        </div>
      </div>

      <!-- Erfolg -->
      <div
        v-if="exportDone"
        class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6"
      >
        <div class="flex items-center justify-center gap-2">
          <font-awesome-icon icon="circle-check" class="text-green-500" />
          <span class="text-sm font-medium text-green-800 dark:text-green-300">
            PDF wurde erfolgreich heruntergeladen!
          </span>
        </div>
      </div>

      <!-- Fehler -->
      <div
        v-if="error"
        class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6"
      >
        <div class="flex items-center justify-center gap-2">
          <font-awesome-icon icon="triangle-exclamation" class="text-red-500" />
          <span class="text-sm font-medium text-red-800 dark:text-red-300">{{ error }}</span>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex items-center justify-center gap-3">
        <button
          class="px-8 py-3 rounded-xl font-semibold text-base flex items-center gap-3 transition-all"
          :class="isExporting || stats.withDoc === 0
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40'"
          :disabled="isExporting || stats.withDoc === 0"
          @click="download"
        >
          <font-awesome-icon
            :icon="isExporting ? 'spinner' : 'download'"
            :class="isExporting ? 'animate-spin' : ''"
          />
          {{ isExporting ? 'Wird erstellt…' : 'PDF herunterladen' }}
        </button>
        <button
          class="px-8 py-3 rounded-xl font-semibold text-base flex items-center gap-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          @click="startNew"
        >
          <font-awesome-icon icon="plus" />
          Neues BSP
        </button>
      </div>

      <p class="text-xs text-gray-400 dark:text-gray-500 mt-4">
        {{ sortedBookingsWithDocs.length }} Belege in chronologischer Reihenfolge
      </p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between">
      <button
        class="px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        @click="currentStep = 2"
      >
        <font-awesome-icon icon="arrow-left" class="w-3.5 h-3.5" />
        Zurück
      </button>
    </div>
  </div>
</template>
