<script setup lang="ts">
const { currentBspId, bspList, currentStep, stats, unassignedDocuments } = useAppState()
const { saveBspList } = usePersistence()
const { requestUpload, runAutoMatch, showUnassignAllConfirm } = useDocumentActions()

const isEditing = ref(false)
const editName = ref('')

const currentBspName = computed(() => {
  const meta = bspList.value.find(b => b.id === currentBspId.value)
  return meta?.name ?? 'Unbenanntes BSP'
})

const displayText = computed(() => isEditing.value ? editName.value || '\u00A0' : currentBspName.value)

function startEdit() {
  editName.value = currentBspName.value
  isEditing.value = true
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('[data-bsp-title-input]')
    input?.focus()
    input?.select()
  })
}

function commitEdit() {
  const trimmed = editName.value.trim()
  if (trimmed) {
    const meta = bspList.value.find(b => b.id === currentBspId.value)
    if (meta && meta.name !== trimmed) {
      meta.name = trimmed
      saveBspList()
    }
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-4">
    <div class="group/title inline-flex items-center gap-2.5 cursor-text min-w-0" @click="startEdit">
      <font-awesome-icon icon="gift" class="text-primary-500 text-xl flex-shrink-0" />
      <div class="relative min-h-[2rem] flex items-center">
        <!-- Invisible sizer that tracks the current text (editName while editing, currentBspName otherwise) -->
        <span class="text-xl font-bold whitespace-pre invisible" aria-hidden="true">{{ displayText }}</span>
        <h2
          v-if="!isEditing"
          class="absolute inset-0 text-xl font-bold whitespace-nowrap text-gray-900 dark:text-white group-hover/title:text-primary-600 dark:group-hover/title:text-primary-400 transition-colors flex items-center"
        >
          {{ currentBspName }}
        </h2>
        <input
          v-else
          v-model="editName"
          data-bsp-title-input
          class="absolute inset-0 text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-primary-400 outline-none w-full"
          @click.stop
          @keydown.enter="commitEdit"
          @keydown.escape="cancelEdit"
          @blur="commitEdit"
        >
      </div>
      <font-awesome-icon
        v-if="!isEditing"
        icon="pen"
        class="w-3 h-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
      />
    </div>

    <!-- Belegaktionen, nur im Zuordnungsschritt -->
    <div v-if="currentStep === 2" class="flex items-center gap-1.5 flex-shrink-0">
      <button
        class="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
        title="Weitere Belegdateien hochladen"
        @click="requestUpload"
      >
        <font-awesome-icon icon="plus" class="w-3 h-3" />
        <span class="hidden sm:inline">Belege nachladen</span>
      </button>
      <button
        v-if="unassignedDocuments.length > 0"
        class="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center gap-1.5"
        @click="runAutoMatch"
      >
        <font-awesome-icon icon="wand-magic-sparkles" class="w-3 h-3" />
        <span class="hidden sm:inline">Auto-Zuordnung</span>
      </button>
      <button
        v-if="stats.withDoc > 0"
        class="px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1.5"
        title="Alle Zuordnungen aufheben"
        @click="showUnassignAllConfirm = true"
      >
        <font-awesome-icon icon="link-slash" class="w-3 h-3" />
        <span class="hidden sm:inline">Alle lösen</span>
      </button>
    </div>
  </div>
</template>
