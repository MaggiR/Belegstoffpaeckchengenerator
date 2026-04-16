<script setup lang="ts">
const props = defineProps<{
  documentName: string
  wrongPassword: boolean
}>()

const emit = defineEmits<{
  submit: [password: string]
  close: []
}>()

const password = ref('')
const submitting = ref(false)
const inputRef = ref<HTMLInputElement>()

watch(
  () => props.wrongPassword,
  () => {
    submitting.value = false
    nextTick(() => inputRef.value?.focus())
  },
)

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})

async function onSubmit() {
  if (!password.value || submitting.value) return
  submitting.value = true
  emit('submit', password.value)
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      @click.self="emit('close')"
    >
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <font-awesome-icon icon="lock" class="text-amber-500 dark:text-amber-400" />
          </div>
          <div class="min-w-0">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white leading-tight">
              Passwortgeschütztes PDF
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate" :title="documentName">
              {{ stripExtension(documentName) }}
            </p>
          </div>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Dieses PDF ist mit einem Passwort verschlüsselt. Bitte gib das Passwort ein,
          um es zu öffnen und weiterzuverarbeiten.
        </p>

        <form @submit.prevent="onSubmit">
          <div class="relative">
            <font-awesome-icon
              icon="key"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-3.5 h-3.5"
            />
            <input
              ref="inputRef"
              v-model="password"
              type="password"
              :disabled="submitting"
              autocomplete="current-password"
              placeholder="Passwort"
              class="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-colors"
              :class="wrongPassword
                ? 'border-red-300 dark:border-red-700 focus:ring-red-400'
                : 'border-gray-300 dark:border-gray-600 focus:ring-primary-400 focus:border-primary-400'"
            >
          </div>

          <p
            v-if="wrongPassword"
            class="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"
          >
            <font-awesome-icon icon="circle-exclamation" class="w-3 h-3" />
            Falsches Passwort – bitte erneut versuchen.
          </p>

          <div class="flex justify-end gap-2 mt-5">
            <button
              type="button"
              class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              :disabled="submitting"
              @click="emit('close')"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              :disabled="!password || submitting"
            >
              <font-awesome-icon
                v-if="submitting"
                icon="spinner"
                class="w-3.5 h-3.5 animate-spin"
              />
              <font-awesome-icon
                v-else
                icon="lock-open"
                class="w-3.5 h-3.5"
              />
              Entsperren
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
