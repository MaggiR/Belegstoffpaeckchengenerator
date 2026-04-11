<script setup lang="ts">
const { isDark, toggle } = useDarkMode()
const { reset } = useAppState()

const showResetConfirm = ref(false)

async function confirmReset() {
  await reset()
  showResetConfirm.value = false
}
</script>

<template>
  <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
        BSP-Generator
      </h1>
      <span class="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
        Belegstoffpäckchengenerator
      </span>
    </div>

    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Zurücksetzen"
        @click="showResetConfirm = true"
      >
        <font-awesome-icon icon="trash" class="w-4 h-4" />
      </button>
      <button
        class="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        :title="isDark ? 'Helles Design' : 'Dunkles Design'"
        @click="toggle"
      >
        <font-awesome-icon :icon="isDark ? 'sun' : 'moon'" class="w-4 h-4" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="showResetConfirm"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
        @click.self="showResetConfirm = false"
      >
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Zurücksetzen?
          </h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
            Alle importierten Daten und Zuordnungen gehen verloren.
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="showResetConfirm = false"
            >
              Abbrechen
            </button>
            <button
              class="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              @click="confirmReset"
            >
              Zurücksetzen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </header>
</template>
