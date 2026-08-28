<script setup lang="ts">
const { currentBspId, bspList, currentStep, stats } = useAppState()
const { saveBspList } = usePersistence()
const { requestUpload, runAutoMatch, showUnassignAllConfirm } = useDocumentActions()
const { isConfigured } = useLlmSettings()
const { queueReanalyzeAll } = useDocumentExtraction()

const isEditing = ref(false)
const editName = ref('')
const menuOpen = ref(false)
const menuRef = ref<HTMLElement>()

const showActionsMenu = computed(() =>
  stats.value.withDoc > 0 || (isConfigured.value && stats.value.totalDocuments > 0),
)

function onPointerDownOutside(e: PointerEvent) {
  if (!menuOpen.value) return
  if (menuRef.value?.contains(e.target as Node)) return
  menuOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}

function handleReanalyzeAll() {
  menuOpen.value = false
  queueReanalyzeAll()
}

function handleUnassignAll() {
  menuOpen.value = false
  showUnassignAllConfirm.value = true
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDownOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDownOutside)
  document.removeEventListener('keydown', onKeydown)
})

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
        v-if="stats.unassigned > 0"
        class="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center gap-1.5"
        @click="runAutoMatch"
      >
        <font-awesome-icon icon="wand-magic-sparkles" class="w-3 h-3" />
        <span class="hidden sm:inline">Auto-Zuordnung</span>
      </button>
      <div v-if="showActionsMenu" ref="menuRef" class="relative">
        <button
          class="w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
          title="Weitere Aktionen"
          @click="menuOpen = !menuOpen"
        >
          <font-awesome-icon icon="ellipsis-vertical" class="w-3.5 h-3.5" />
        </button>
        <Transition name="popover">
          <div
            v-if="menuOpen"
            class="absolute top-full right-0 mt-1.5 z-30 min-w-[11rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl shadow-gray-900/10 dark:shadow-black/40 p-1.5"
          >
            <button
              v-if="isConfigured && stats.totalDocuments > 0"
              class="w-full px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              @click="handleReanalyzeAll"
            >
              <font-awesome-icon icon="rotate-right" class="w-3 h-3 text-gray-400" />
              Alle neu analysieren
            </button>
            <button
              v-if="stats.withDoc > 0"
              class="w-full px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              @click="handleUnassignAll"
            >
              <font-awesome-icon icon="link-slash" class="w-3 h-3" />
              Alle lösen
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
