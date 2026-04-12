<script setup lang="ts">
const { bookings, stats, getDocument } = useAppState()
const { exportBsp } = usePdfUtils()
const { createNewBsp, saveState } = usePersistence()

const showModal = ref(false)
const isExporting = ref(false)
const exportDone = ref(false)
const error = ref('')

const sortedBookingsWithDocs = computed(() =>
  [...bookings.value]
    .filter(b => b.documentId)
    .sort((a, b) => {
      const da = a.date?.getTime() ?? 0
      const db = b.date?.getTime() ?? 0
      return da - db
    }),
)

function openModal() {
  if (bookings.value.length === 0) return
  exportDone.value = false
  error.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function startNew() {
  showModal.value = false
  saveState()
  createNewBsp()
}

async function download() {
  if (isExporting.value || stats.value.withDoc === 0) return
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
  <!-- FAB -->
  <div v-if="bookings.length > 0" class="fixed bottom-6 right-6 z-50">
    <button
      class="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-200 bg-primary-500 hover:bg-primary-600 text-white hover:shadow-2xl hover:shadow-primary-500/40 hover:scale-105 active:scale-95"
      title="BSP exportieren"
      @click="openModal"
    >
      <font-awesome-icon icon="download" class="text-lg" />
    </button>
  </div>

  <!-- Export-Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
        @click.self="closeModal"
      >
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          <div class="p-8 text-center">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center justify-center gap-3">
              <font-awesome-icon icon="gift" class="text-primary-500" />
              BSP exportieren
            </h2>

            <div class="grid grid-cols-4 gap-3 mb-6">
              <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Buchungen</p>
              </div>
              <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ stats.withDoc }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Mit Beleg</p>
              </div>
              <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                <p class="text-2xl font-bold text-gray-400 dark:text-gray-500">{{ stats.noDocRequired }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Nicht erf.</p>
              </div>
              <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                <p class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ stats.missing }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Fehlend</p>
              </div>
            </div>

            <div
              v-if="stats.missing > 0"
              class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-5 text-left"
            >
              <div class="flex items-start gap-2.5">
                <font-awesome-icon icon="triangle-exclamation" class="text-amber-500 mt-0.5 text-sm" />
                <div>
                  <p class="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {{ stats.missing }} Buchung{{ stats.missing !== 1 ? 'en' : '' }} ohne Beleg
                  </p>
                  <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Diese werden im PDF übersprungen.
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="exportDone"
              class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-5"
            >
              <div class="flex items-center justify-center gap-2">
                <font-awesome-icon icon="circle-check" class="text-green-500" />
                <span class="text-sm font-medium text-green-800 dark:text-green-300">
                  PDF wurde erfolgreich heruntergeladen!
                </span>
              </div>
            </div>

            <div
              v-if="error"
              class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5"
            >
              <div class="flex items-center justify-center gap-2">
                <font-awesome-icon icon="triangle-exclamation" class="text-red-500" />
                <span class="text-sm font-medium text-red-800 dark:text-red-300">{{ error }}</span>
              </div>
            </div>

            <div class="flex items-center justify-center gap-3">
              <button
                class="px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2.5 transition-all"
                :class="isExporting || stats.withDoc === 0
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/30 hover:shadow-xl'"
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
                class="px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
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

          <div class="border-t border-gray-100 dark:border-gray-700 px-6 py-3 flex justify-end">
            <button
              class="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="closeModal"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > div {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}
.modal-leave-to > div {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}
</style>
