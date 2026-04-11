<script setup lang="ts">
import type { DocumentFile } from '~/types'

const props = defineProps<{
  document: DocumentFile
}>()

const emit = defineEmits<{
  'close': []
}>()

const previewUrl = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)
const loading = ref(true)

const { renderPdfPage, getPdfPageCount } = usePdfUtils()

onMounted(async () => {
  await loadPreview()
})

async function loadPreview() {
  loading.value = true
  try {
    if (props.document.type === 'image') {
      previewUrl.value = URL.createObjectURL(props.document.file)
      totalPages.value = 1
    } else {
      totalPages.value = await getPdfPageCount(props.document.file)
      previewUrl.value = await renderPdfPage(props.document.file, currentPage.value)
    }
  } catch {
    previewUrl.value = null
  }
  loading.value = false
}

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  loading.value = true
  try {
    previewUrl.value = await renderPdfPage(props.document.file, page)
  } catch {
    // Ignore
  }
  loading.value = false
}

onUnmounted(() => {
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      @click.self="emit('close')"
    >
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <font-awesome-icon
              :icon="document.type === 'pdf' ? 'file-pdf' : 'file-image'"
              class="text-gray-400"
            />
            <span class="font-medium text-gray-900 dark:text-white text-sm truncate max-w-md">
              {{ document.name }}
            </span>
          </div>
          <button
            class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            @click="emit('close')"
          >
            <font-awesome-icon icon="xmark" class="w-4 h-4" />
          </button>
        </div>

        <!-- Preview -->
        <div class="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] bg-gray-50 dark:bg-gray-900">
          <font-awesome-icon
            v-if="loading"
            icon="spinner"
            class="text-3xl text-primary-500 animate-spin"
          />
          <img
            v-else-if="previewUrl"
            :src="previewUrl"
            :alt="document.name"
            class="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
          >
          <div v-else class="text-gray-400 dark:text-gray-500 text-center">
            <font-awesome-icon icon="triangle-exclamation" class="text-3xl mb-2" />
            <p class="text-sm">Vorschau konnte nicht geladen werden</p>
          </div>
        </div>

        <!-- Seitennavigation (nur bei PDFs) -->
        <div
          v-if="document.type === 'pdf' && totalPages > 1"
          class="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-4"
        >
          <button
            class="px-3 py-1 text-sm rounded-lg transition-colors"
            :class="currentPage > 1
              ? 'text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'"
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            <font-awesome-icon icon="arrow-left" class="mr-1" />
            Zurück
          </button>
          <span class="text-sm text-gray-500 dark:text-gray-400">
            Seite {{ currentPage }} von {{ totalPages }}
          </span>
          <button
            class="px-3 py-1 text-sm rounded-lg transition-colors"
            :class="currentPage < totalPages
              ? 'text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            Weiter
            <font-awesome-icon icon="arrow-right" class="ml-1" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
