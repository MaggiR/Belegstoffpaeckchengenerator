<script setup lang="ts">
import type { BspMeta } from '~/types'

const { bspList } = useAppState()
const { isDark, toggle } = useDarkMode()
const { switchToBsp, createNewBsp, deleteBsp } = usePersistence()

const deleteTarget = ref<BspMeta | null>(null)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleCreate() {
  createNewBsp()
}

async function handleOpen(bsp: BspMeta) {
  await switchToBsp(bsp.id)
}

async function confirmDelete() {
  if (deleteTarget.value) {
    await deleteBsp(deleteTarget.value.id)
    deleteTarget.value = null
  }
}

const sortedBsps = computed(() =>
  [...bspList.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
)
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10">
    <div class="text-center mb-10 relative">
      <button
        class="absolute right-0 top-0 p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        :title="isDark ? 'Helles Design' : 'Dunkles Design'"
        @click="toggle"
      >
        <font-awesome-icon :icon="isDark ? 'sun' : 'moon'" class="w-4 h-4" />
      </button>
      <div class="flex items-center justify-center gap-3 mb-2">
        <font-awesome-icon icon="gift" class="text-primary-500 text-3xl" />
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          BSP-Generator
        </h1>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ bspList.length === 0 ? 'Erstellen Sie Ihr erstes Belegstoffpäckchen.' : `${bspList.length} Belegstoffpäckchen vorhanden` }}
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        class="group border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all min-h-[200px]"
        @click="handleCreate"
      >
        <div class="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 flex items-center justify-center transition-colors">
          <font-awesome-icon icon="plus" class="text-xl text-gray-400 dark:text-gray-500 group-hover:text-primary-500 transition-colors" />
        </div>
        <span class="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          Neues BSP erstellen
        </span>
      </button>

      <div
        v-for="bsp in sortedBsps"
        :key="bsp.id"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-600 transition-all group cursor-pointer min-h-[200px] flex flex-col"
        @click="handleOpen(bsp)"
      >
        <div class="p-5 flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2 flex-1 mr-2 min-w-0">
              <font-awesome-icon icon="gift" class="text-primary-400 dark:text-primary-500 text-sm flex-shrink-0" />
              <h3 class="text-base font-semibold text-gray-900 dark:text-white line-clamp-2">
                {{ bsp.name }}
              </h3>
            </div>
            <button
              class="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
              title="BSP löschen"
              @click.stop="deleteTarget = bsp"
            >
              <font-awesome-icon icon="trash" class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="flex-1" />

          <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="text-center px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/50">
              <div class="text-lg font-bold text-gray-900 dark:text-white">{{ bsp.bookingCount }}</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400">Buchungen</div>
            </div>
            <div class="text-center px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/50">
              <div class="text-lg font-bold text-gray-900 dark:text-white">{{ bsp.documentCount }}</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400">Belege</div>
            </div>
            <div
              class="text-center px-2 py-1.5 rounded-lg transition-colors"
              :class="(bsp.missingCount ?? 0) > 0
                ? 'bg-amber-50 dark:bg-amber-900/20'
                : 'bg-green-50 dark:bg-green-900/20'"
            >
              <div
                class="text-lg font-bold flex items-center justify-center h-7"
                :class="(bsp.missingCount ?? 0) > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400'"
              >
                <template v-if="(bsp.missingCount ?? 0) > 0">
                  {{ bsp.missingCount }}
                </template>
                <font-awesome-icon
                  v-else
                  icon="check"
                  class="w-4 h-4"
                />
              </div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400">
                {{ (bsp.missingCount ?? 0) > 0 ? 'Ohne Beleg' : 'Vollständig' }}
              </div>
            </div>
          </div>
        </div>

        <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/30">
          <div class="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
            <span>Erstellt: {{ formatDate(bsp.createdAt) }}</span>
            <span>Bearbeitet: {{ formatDate(bsp.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="deleteTarget"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      @click.self="deleteTarget = null"
    >
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          BSP löschen?
        </h3>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-1">
          <span class="font-medium text-gray-900 dark:text-white">{{ deleteTarget.name }}</span>
        </p>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Alle Buchungen, Belege und Zuordnungen dieses BSPs werden unwiderruflich gelöscht.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="deleteTarget = null"
          >
            Abbrechen
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="confirmDelete"
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
