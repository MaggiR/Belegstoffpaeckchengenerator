<script setup lang="ts">
const { currentBspId, bspList } = useAppState()
const { saveBspList } = usePersistence()

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
  <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-3">
    <div class="group/title inline-flex items-center gap-2.5 cursor-text" @click="startEdit">
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
  </div>
</template>
