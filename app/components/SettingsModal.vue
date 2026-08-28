<script setup lang="ts">
import type { LlmProvider, OllamaReasoningEffort, ReasoningEffort } from '~/types'
import type { ConnectionTestResult } from '~/composables/useLlmSettings'

const emit = defineEmits<{
  'close': []
}>()

useScrollLock(true)

const { settings, save, testConnection, defaultSettings, listOllamaModels } = useLlmSettings()
const { isDark, setDark } = useDarkMode()

type SettingsTab = 'general' | 'analysis'
const activeTab = ref<SettingsTab>('general')

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'Allgemein' },
  { id: 'analysis', label: 'Beleganalyse' },
]

// Auf einer Kopie arbeiten, damit Abbrechen die bisherige Konfiguration behält.
const draft = ref({ ...defaultSettings(), ...settings.value })

const testing = ref(false)
const testResult = ref<ConnectionTestResult | null>(null)
const showKey = ref(false)
const showOllamaToken = ref(false)

const ollamaModels = ref<string[]>([])
const ollamaModelsLoading = ref(false)
const ollamaModelsError = ref<string | null>(null)
let ollamaFetchSeq = 0
let ollamaFetchTimer: ReturnType<typeof setTimeout> | null = null

async function loadOllamaModels(): Promise<void> {
  if (draft.value.provider !== 'ollama') return
  const seq = ++ollamaFetchSeq
  const url = draft.value.ollamaBaseUrl
  if (!normalizeBaseUrl(url)) {
    ollamaModels.value = []
    ollamaModelsError.value = 'Bitte eine Ollama-URL angeben.'
    ollamaModelsLoading.value = false
    return
  }

  ollamaModelsLoading.value = true
  ollamaModelsError.value = null
  const result = await listOllamaModels(url, draft.value.ollamaBearerToken ?? '')
  if (seq !== ollamaFetchSeq) return

  ollamaModelsLoading.value = false
  if (!result.ok) {
    ollamaModels.value = []
    ollamaModelsError.value = result.message ?? 'Modelle konnten nicht geladen werden.'
    return
  }

  ollamaModels.value = result.models
  if (!result.models.length) {
    ollamaModelsError.value = 'Unter dieser URL sind keine Modelle installiert.'
    draft.value.ollamaModel = ''
    return
  }
  draft.value.ollamaModel = pickOllamaModel(result.models, draft.value.ollamaModel)
}

function scheduleOllamaModelFetch(): void {
  if (ollamaFetchTimer) clearTimeout(ollamaFetchTimer)
  ollamaFetchTimer = setTimeout(() => {
    void loadOllamaModels()
  }, 350)
}

watch(
  () => [draft.value.provider, draft.value.ollamaBaseUrl, draft.value.ollamaBearerToken] as const,
  ([provider]) => {
    if (provider !== 'ollama') {
      if (ollamaFetchTimer) clearTimeout(ollamaFetchTimer)
      return
    }
    scheduleOllamaModelFetch()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (ollamaFetchTimer) clearTimeout(ollamaFetchTimer)
  ollamaFetchSeq += 1
})

const providers: Array<{ value: LlmProvider; label: string; hint: string }> = [
  { value: 'none', label: 'Keine Analyse', hint: 'Belege erhalten den Dateinamen als Titel' },
  { value: 'ollama', label: 'Ollama', hint: 'Lokal oder im eigenen Netz gehostet' },
  { value: 'openai', label: 'OpenAI', hint: 'Cloud-API, benötigt einen API-Key' },
]

const efforts: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high']
const ollamaEfforts: Array<{ value: OllamaReasoningEffort; label: string }> = [
  { value: '', label: 'nicht gesetzt' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
]

function selectProvider(provider: LlmProvider) {
  draft.value.provider = provider
  testResult.value = null
}

async function runTest() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection(draft.value)
  } finally {
    testing.value = false
  }
}

function applyAndClose() {
  save({ ...draft.value, organizationName: draft.value.organizationName.trim() })
  emit('close')
}

function resetDraft() {
  if (activeTab.value === 'general') {
    draft.value.organizationName = ''
    return
  }
  const organizationName = draft.value.organizationName
  draft.value = { ...defaultSettings(), organizationName }
  testResult.value = null
}
</script>

<template>
  <div
    class="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
    @click.self="emit('close')"
  >
    <div class="modal-panel bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <!-- Kopf -->
        <div class="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <font-awesome-icon icon="gear" class="text-primary-500 w-4 h-4" />
              Einstellungen
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ activeTab === 'general'
                ? 'Parteigliederung und Darstellung.'
                : 'Legt fest, welches Sprachmodell Titel, Belegtyp, Korrespondent, Datum und Betrag aus Belegen ausliest.' }}
            </p>
          </div>
          <button
            class="p-2 -mt-1 -mr-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Schließen"
            @click="emit('close')"
          >
            <font-awesome-icon icon="xmark" class="w-4 h-4" />
          </button>
        </div>

        <div class="px-6 pt-4">
          <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              :class="activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="px-6 py-5 overflow-auto space-y-5">
          <template v-if="activeTab === 'general'">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name der Parteigliederung</label>
              <input
                v-model="draft.organizationName"
                type="text"
                placeholder="FDP Kreisverband Darmstadt"
                class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
              <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Wird der Beleganalyse als Kontext mitgegeben, etwa um Aussteller und Empfänger besser zu unterscheiden.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Darstellung</label>
              <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
                <button
                  class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                  :class="!isDark
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'"
                  @click="setDark(false)"
                >
                  <font-awesome-icon icon="sun" class="w-3.5 h-3.5" />
                  Hell
                </button>
                <button
                  class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                  :class="isDark
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'"
                  @click="setDark(true)"
                >
                  <font-awesome-icon icon="moon" class="w-3.5 h-3.5" />
                  Dunkel
                </button>
              </div>
            </div>
          </template>

          <template v-else>
          <!-- Providerauswahl -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Anbieter
            </label>
            <div class="grid gap-2">
              <button
                v-for="option in providers"
                :key="option.value"
                class="text-left px-3 py-2.5 rounded-xl border-2 transition-colors"
                :class="draft.provider === option.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'"
                @click="selectProvider(option.value)"
              >
                <span
                  class="text-sm font-medium"
                  :class="draft.provider === option.value
                    ? 'text-primary-700 dark:text-primary-300'
                    : 'text-gray-900 dark:text-white'"
                >
                  {{ option.label }}
                </span>
                <span class="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ option.hint }}
                </span>
              </button>
            </div>
          </div>

          <!-- Ollama -->
          <div v-if="draft.provider === 'ollama'" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ollama-URL</label>
              <input
                v-model="draft.ollamaBaseUrl"
                type="text"
                placeholder="http://192.168.178.187:11434"
                class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Authorization Bearer</label>
              <div class="relative">
                <input
                  v-model="draft.ollamaBearerToken"
                  :type="showOllamaToken ? 'text' : 'password'"
                  placeholder="optional"
                  autocomplete="off"
                  class="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                >
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  :title="showOllamaToken ? 'Token verbergen' : 'Token anzeigen'"
                  @click="showOllamaToken = !showOllamaToken"
                >
                  <font-awesome-icon icon="eye" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Modell</label>
              <div class="flex items-center gap-2">
                <select
                  v-model="draft.ollamaModel"
                  :disabled="ollamaModelsLoading || !ollamaModels.length"
                  class="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60"
                >
                  <option v-if="!ollamaModels.length" value="">
                    {{ ollamaModelsLoading ? 'Modelle werden geladen…' : 'Keine Modelle verfügbar' }}
                  </option>
                  <option v-for="name in ollamaModels" :key="name" :value="name">{{ name }}</option>
                </select>
                <button
                  class="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex-shrink-0"
                  title="Modellliste aktualisieren"
                  :disabled="ollamaModelsLoading"
                  @click="loadOllamaModels"
                >
                  <font-awesome-icon
                    :icon="ollamaModelsLoading ? 'spinner' : 'rotate-right'"
                    :class="ollamaModelsLoading ? 'animate-spin' : ''"
                    class="w-3.5 h-3.5"
                  />
                </button>
              </div>
              <p v-if="ollamaModelsError" class="text-[11px] text-red-600 dark:text-red-400 mt-1">
                {{ ollamaModelsError }}
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reasoning-Aufwand</label>
              <select
                v-model="draft.ollamaReasoningEffort"
                class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option v-for="option in ollamaEfforts" :key="option.value || 'unset'" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Wird als <code class="font-mono">think</code> an Ollama geschickt. „nicht gesetzt“ lässt das Feld weg.
              </p>
            </div>
          </div>

          <!-- OpenAI -->
          <div v-else-if="draft.provider === 'openai'" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">API-Key</label>
              <div class="relative">
                <input
                  v-model="draft.openaiApiKey"
                  :type="showKey ? 'text' : 'password'"
                  placeholder="sk-…"
                  autocomplete="off"
                  class="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                >
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  :title="showKey ? 'Key verbergen' : 'Key anzeigen'"
                  @click="showKey = !showKey"
                >
                  <font-awesome-icon icon="eye" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Modell</label>
              <input
                v-model="draft.openaiModel"
                type="text"
                placeholder="gpt-5-luna"
                class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reasoning-Aufwand</label>
              <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
                <button
                  v-for="effort in efforts"
                  :key="effort"
                  class="flex-1 px-2 py-1 rounded-md text-xs font-medium transition-all capitalize"
                  :class="draft.openaiReasoningEffort === effort
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'"
                  @click="draft.openaiReasoningEffort = effort"
                >
                  {{ effort }}
                </button>
              </div>
            </div>
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
              <font-awesome-icon icon="circle-info" class="text-amber-500 w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p class="text-[11px] text-amber-700 dark:text-amber-300">
                Der Key wird nur in diesem Browser gespeichert. Da die App ohne Server läuft, ist er im
                Browser-Speicher einsehbar.
              </p>
            </div>
          </div>

          <p v-else class="text-xs text-gray-500 dark:text-gray-400">
            Ohne Anbieter erhalten neue Belege den Dateinamen als Titel. Die Analyse lässt sich später
            jederzeit nachholen.
          </p>

          <!-- Verbindungstest -->
          <div v-if="draft.provider !== 'none'" class="space-y-2">
            <button
              class="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 disabled:opacity-60"
              :disabled="testing"
              @click="runTest"
            >
              <font-awesome-icon :icon="testing ? 'spinner' : 'brain'" :class="testing ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
              {{ testing ? 'Wird geprüft…' : 'Verbindung testen' }}
            </button>
            <div
              v-if="testResult"
              class="rounded-lg px-3 py-2 text-[11px] flex items-start gap-2"
              :class="testResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'"
            >
              <font-awesome-icon
                :icon="testResult.ok ? 'circle-check' : 'triangle-exclamation'"
                class="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
              />
              <span>{{ testResult.message }}</span>
            </div>
          </div>
          </template>
        </div>

        <!-- Fuß -->
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <button
            class="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            @click="resetDraft"
          >
            Auf Standard zurücksetzen
          </button>
          <div class="flex items-center gap-2">
            <button
              class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="emit('close')"
            >
              Abbrechen
            </button>
            <button
              class="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium"
              @click="applyAndClose"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
  </div>
</template>
