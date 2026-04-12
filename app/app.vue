<script setup lang="ts">
const { init } = useDarkMode()
const { currentStep, activeView, currentBspId } = useAppState()
const { loadInitial, startWatching, switchToBsp } = usePersistence()

const restored = ref(false)
let suppressHistory = false

function pushState() {
  if (suppressHistory) return
  const state: Record<string, any> = { view: activeView.value }
  if (activeView.value === 'editor') {
    state.bspId = currentBspId.value
    state.step = currentStep.value
  }
  const url = activeView.value === 'overview' ? '#overview' : `#bsp/${currentBspId.value}/step/${currentStep.value}`
  history.pushState(state, '', url)
}

function replaceState() {
  const state: Record<string, any> = { view: activeView.value }
  if (activeView.value === 'editor') {
    state.bspId = currentBspId.value
    state.step = currentStep.value
  }
  const url = activeView.value === 'overview' ? '#overview' : `#bsp/${currentBspId.value}/step/${currentStep.value}`
  history.replaceState(state, '', url)
}

async function handlePopState(event: PopStateEvent) {
  const state = event.state
  if (!state) return

  suppressHistory = true
  try {
    if (state.view === 'overview') {
      activeView.value = 'overview'
    } else if (state.view === 'editor' && state.bspId) {
      if (state.bspId !== currentBspId.value) {
        await switchToBsp(state.bspId)
      } else {
        activeView.value = 'editor'
      }
      if (state.step) {
        currentStep.value = state.step
      }
    }
  } finally {
    suppressHistory = false
  }
}

onMounted(async () => {
  init()
  await loadInitial()
  restored.value = true
  replaceState()
  await nextTick()
  startWatching()

  window.addEventListener('popstate', handlePopState)

  watch([activeView, currentStep, currentBspId], () => {
    if (restored.value) pushState()
  })
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
    <AppHeader />

    <template v-if="restored">
      <template v-if="activeView === 'overview'">
        <main class="pb-12">
          <BspOverview />
        </main>
      </template>

      <template v-else>
        <StepIndicator />
        <main class="pb-12">
          <Transition name="fade" mode="out-in">
            <ImportStep v-if="currentStep === 1" key="import" />
            <AssignmentStep v-else key="assignment" />
          </Transition>
        </main>
        <ExportFab />
      </template>
    </template>
    <div v-else class="flex flex-col items-center justify-center py-24 gap-3">
      <font-awesome-icon icon="gift" class="text-primary-500 text-3xl" />
      <font-awesome-icon icon="spinner" class="text-primary-400 text-lg animate-spin" />
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
