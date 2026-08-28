<script setup lang="ts">
const { init } = useDarkMode()
const { currentStep, activeView, currentBspId, showSettings } = useAppState()
const { loadInitial, startWatching, switchToBsp } = usePersistence()
const { load: loadLlmSettings } = useLlmSettings()

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
  loadLlmSettings()
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

    <Teleport to="body">
      <Transition name="modal">
        <SettingsModal v-if="showSettings" @close="showSettings = false" />
      </Transition>
    </Teleport>
  </div>
</template>

<style>
html {
  color-scheme: light;
}

html.dark {
  color-scheme: dark;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Scrollbars folgen Hell/Dunkel – inklusive Hover (Windows/Chromium). */
* {
  scrollbar-width: thin;
  scrollbar-color: rgb(203 213 225) transparent;
}

html.dark * {
  scrollbar-color: rgb(75 85 99) transparent;
}

*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background-color: rgb(203 213 225);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

*::-webkit-scrollbar-thumb:hover {
  background-color: rgb(148 163 184);
}

html.dark *::-webkit-scrollbar-thumb {
  background-color: rgb(75 85 99);
}

html.dark *::-webkit-scrollbar-thumb:hover {
  background-color: rgb(107 114 128);
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

/* Modals: der abgedunkelte Hintergrund blendet auf, das Panel fährt leicht hoch. */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.22s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

/* Aufklappende Menüs, etwa Filter und Sortierung in der Belege-Spalte. */
.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
  transform-origin: top right;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

/* Vollbild-Vorschau für Belege: sanftes Ein- und Ausblenden. */
.preview-enter-active,
.preview-leave-active {
  transition: opacity 0.28s ease;
}

.preview-enter-active .preview-backdrop,
.preview-leave-active .preview-backdrop {
  transition: opacity 0.28s ease, backdrop-filter 0.28s ease;
}

.preview-enter-active .preview-surface,
.preview-leave-active .preview-surface,
.preview-enter-active .preview-chrome,
.preview-leave-active .preview-chrome {
  transition: opacity 0.28s ease;
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

.preview-enter-from .preview-backdrop,
.preview-leave-to .preview-backdrop {
  opacity: 0;
  backdrop-filter: blur(0);
}

.preview-enter-from .preview-surface,
.preview-leave-to .preview-surface,
.preview-enter-from .preview-chrome,
.preview-leave-to .preview-chrome {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .modal-panel,
  .modal-leave-active .modal-panel,
  .popover-enter-active,
  .popover-leave-active,
  .preview-enter-active,
  .preview-leave-active,
  .preview-enter-active .preview-backdrop,
  .preview-leave-active .preview-backdrop,
  .preview-enter-active .preview-surface,
  .preview-leave-active .preview-surface,
  .preview-enter-active .preview-chrome,
  .preview-leave-active .preview-chrome {
    transition-duration: 0.01ms;
  }
}
</style>
