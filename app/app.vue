<script setup lang="ts">
const { init } = useDarkMode()
const { currentStep } = useAppState()
const { loadState, startWatching } = usePersistence()

const restored = ref(false)

onMounted(async () => {
  init()
  await loadState()
  restored.value = true
  await nextTick()
  startWatching()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
    <AppHeader />
    <StepIndicator />

    <main v-if="restored" class="px-4 sm:px-6 pb-12">
      <Transition name="fade" mode="out-in">
        <ImportStep v-if="currentStep === 1" key="import" />
        <AssignmentStep v-else-if="currentStep === 2" key="assignment" />
        <ExportStep v-else-if="currentStep === 3" key="export" />
      </Transition>
    </main>
    <div v-else class="flex items-center justify-center py-24">
      <font-awesome-icon icon="spinner" class="text-primary-500 text-2xl animate-spin" />
    </div>

    <footer class="border-t border-gray-200 dark:border-gray-800 py-4 mt-8 text-center">
      <p class="text-xs text-gray-400 dark:text-gray-600">
        © 2026 Mark Rothermel, Kreisschatzmeister der
        <a
          href="https://www.fdp-darmstadt.de/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
        >FDP Darmstadt</a>
      </p>
    </footer>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.dark ::-webkit-scrollbar-thumb {
  background: #374151;
}
</style>
