<script setup lang="ts">
const { currentStep, bookings, documents, reset } = useAppState()

const steps = [
  { num: 1, label: 'Import' },
  { num: 2, label: 'Zuordnung' },
  { num: 3, label: 'Export' },
]

const pendingStep = ref<number | null>(null)

function handleStepClick(targetNum: number) {
  if (targetNum >= currentStep.value) return

  if (targetNum === 1 && currentStep.value >= 2) {
    const hasData = bookings.value.length > 0 || documents.value.length > 0
    if (hasData) {
      pendingStep.value = targetNum
      return
    }
    currentStep.value = 1
    return
  }

  if (targetNum === 2 && currentStep.value === 3) {
    currentStep.value = 2
    return
  }

  currentStep.value = targetNum
}

async function confirmNavigation() {
  if (pendingStep.value === 1) {
    await reset()
  }
  pendingStep.value = null
}
</script>

<template>
  <div class="flex items-center justify-center py-6 px-4">
    <div class="flex items-center gap-0">
      <template v-for="(step, idx) in steps" :key="step.num">
        <div
          class="flex items-center gap-2"
          :class="step.num < currentStep ? 'cursor-pointer' : ''"
          @click="handleStepClick(step.num)"
        >
          <div
            class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300"
            :class="{
              'bg-primary-500 text-white shadow-md shadow-primary-500/30': currentStep === step.num,
              'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/60': currentStep > step.num,
              'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500': currentStep < step.num,
            }"
          >
            <font-awesome-icon v-if="currentStep > step.num" icon="check" class="w-3.5 h-3.5" />
            <span v-else>{{ step.num }}</span>
          </div>
          <span
            class="text-sm font-medium transition-colors duration-300 hidden sm:inline"
            :class="{
              'text-primary-600 dark:text-primary-400': currentStep === step.num,
              'text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400': currentStep > step.num,
              'text-gray-400 dark:text-gray-500': currentStep < step.num,
            }"
          >
            {{ step.label }}
          </span>
        </div>
        <div
          v-if="idx < steps.length - 1"
          class="w-12 sm:w-20 h-0.5 mx-2 transition-colors duration-300"
          :class="currentStep > step.num ? 'bg-primary-400 dark:bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'"
        />
      </template>
    </div>
  </div>

  <!-- Bestätigungsdialog -->
  <Teleport to="body">
    <div
      v-if="pendingStep !== null"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      @click.self="pendingStep = null"
    >
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Neuen Import starten?
        </h3>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Alle bisherigen Buchungen, Belege und Zuordnungen werden gelöscht.
          Sie können anschließend eine neue Buchungstabelle importieren.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="pendingStep = null"
          >
            Abbrechen
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="confirmNavigation"
          >
            Zurücksetzen & neu importieren
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
