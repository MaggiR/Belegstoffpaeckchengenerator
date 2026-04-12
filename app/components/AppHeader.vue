<script setup lang="ts">
const { isDark, toggle } = useDarkMode()
const { activeView } = useAppState()
const { saveState } = usePersistence()

function goToOverview() {
  saveState()
  activeView.value = 'overview'
}
</script>

<template>
  <header
    v-if="activeView === 'editor'"
    class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <font-awesome-icon icon="gift" class="text-primary-500 text-sm" />
          <span class="text-sm font-semibold text-gray-900 dark:text-white">BSP-Generator</span>
        </div>
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-1.5"
          title="Meine BSPs"
          @click="goToOverview"
        >
          <font-awesome-icon icon="folder-open" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Meine BSPs</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          :title="isDark ? 'Helles Design' : 'Dunkles Design'"
          @click="toggle"
        >
          <font-awesome-icon :icon="isDark ? 'sun' : 'moon'" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>
</template>
