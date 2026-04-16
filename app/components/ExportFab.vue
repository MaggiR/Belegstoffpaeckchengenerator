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

const unverifiedCount = computed(() =>
  bookings.value.filter(b => b.documentId !== null && !b.verified).length,
)

const fabStateClass = computed(() => {
  if (stats.value.withDoc === 0) {
    return 'bg-primary-500 hover:bg-primary-600 shadow-primary-500/30 hover:shadow-primary-500/40'
  }
  if (stats.value.missing > 0) {
    return 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/40 hover:shadow-amber-500/50'
  }
  return 'bg-green-500 hover:bg-green-600 shadow-green-500/50 hover:shadow-green-500/60'
})

const fabTitle = computed(() => {
  if (stats.value.missing > 0) return `BSP exportieren (${stats.value.missing} Buchung${stats.value.missing !== 1 ? 'en' : ''} ohne Beleg)`
  if (stats.value.withDoc > 0) return 'BSP exportieren – alle Belege zugeordnet'
  return 'BSP exportieren'
})

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
    <div class="relative">
      <!-- Grüner Schimmer-Hintergrund (wenn alle Belege zugeordnet) -->
      <Transition name="shimmer">
        <div
          v-if="stats.missing === 0 && stats.withDoc > 0"
          class="absolute inset-0 rounded-2xl bg-green-500 blur-xl opacity-50 shimmer-glow pointer-events-none"
        />
      </Transition>

      <button
        class="fab-btn relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl text-white hover:shadow-2xl hover:scale-105 active:scale-95 overflow-hidden"
        :class="fabStateClass"
        :title="fabTitle"
        @click="openModal"
      >
        <!-- Schimmer-Sweep (nur grün) -->
        <span
          v-if="stats.missing === 0 && stats.withDoc > 0"
          class="absolute inset-0 pointer-events-none shimmer-sweep"
        />
        <font-awesome-icon icon="download" class="text-lg relative z-10" />
      </button>
    </div>
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

            <div class="grid grid-cols-5 gap-2 mb-6">
              <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Buchungen</p>
              </div>
              <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ stats.withDoc }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Mit Beleg</p>
              </div>
              <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ stats.verified }}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Geprüft</p>
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
              class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-3 text-left"
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
              v-if="unverifiedCount > 0"
              class="bg-amber-50/70 dark:bg-amber-900/15 border border-amber-200/80 dark:border-amber-800/70 rounded-xl p-3 mb-3 text-left"
            >
              <div class="flex items-start gap-2.5">
                <font-awesome-icon icon="square-check" class="text-amber-500 mt-0.5 text-sm" />
                <div>
                  <p class="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {{ unverifiedCount }} zugeordnete Buchung{{ unverifiedCount !== 1 ? 'en' : '' }} noch nicht geprüft
                  </p>
                  <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Überprüfe die Zuordnungen noch einmal und hake sie dann als geprüft ab.
                  </p>
                </div>
              </div>
            </div>

            <div
              v-else-if="stats.withDoc > 0 && stats.missing === 0"
              class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-3 text-left"
            >
              <div class="flex items-start gap-2.5">
                <font-awesome-icon icon="circle-check" class="text-emerald-500 mt-0.5 text-sm" />
                <div>
                  <p class="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Alle Zuordnungen sind geprüft.
                  </p>
                  <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Das BSP ist bereit zum Export.
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

.fab-btn {
  transition:
    background-color 0.6s ease,
    box-shadow 0.6s ease,
    transform 0.2s ease;
}

/* Schimmer-Glow hinter Button */
.shimmer-glow {
  animation: glowPulse 2.4s ease-in-out infinite;
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.35; transform: scale(0.96); }
  50%      { opacity: 0.6;  transform: scale(1.12); }
}

.shimmer-enter-active,
.shimmer-leave-active {
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.shimmer-enter-from,
.shimmer-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

/* Diagonaler Licht-Sweep über den grünen Button */
.shimmer-sweep {
  background: linear-gradient(
    115deg,
    transparent 0%,
    transparent 35%,
    rgba(255, 255, 255, 0.45) 50%,
    transparent 65%,
    transparent 100%
  );
  background-size: 250% 250%;
  animation: sweep 3.2s ease-in-out infinite;
  mix-blend-mode: overlay;
}
@keyframes sweep {
  0%   { background-position: 200% 50%; }
  100% { background-position: -100% 50%; }
}
</style>
