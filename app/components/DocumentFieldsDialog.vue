<script setup lang="ts">
import type { DocumentFile, DocumentKind } from '~/types'
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from '~/types'

const props = defineProps<{
  document: DocumentFile
}>()

const emit = defineEmits<{
  'save': [docId: string, patch: Partial<DocumentFile>]
  'close': []
}>()

const title = ref(props.document.title)
const correspondent = ref(props.document.correspondent ?? '')
const documentDate = ref(props.document.documentDate ?? '')
const documentKind = ref<DocumentKind | ''>(props.document.documentKind ?? '')

function formatAmountForInput(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const totalAmount = ref(
  props.document.totalAmount !== null ? formatAmountForInput(props.document.totalAmount) : '',
)

const titleMissing = computed(() => title.value.trim().length === 0)

/** Akzeptiert deutsche und englische Dezimaltrennzeichen. */
function parseAmountInput(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

function normalizeAmountDisplay() {
  const parsed = parseAmountInput(totalAmount.value)
  totalAmount.value = parsed !== null ? formatAmountForInput(parsed) : totalAmount.value.trim()
}

function submit() {
  if (titleMissing.value) return
  emit('save', props.document.id, {
    title: title.value.trim(),
    correspondent: correspondent.value.trim() || null,
    documentDate: documentDate.value || null,
    totalAmount: parseAmountInput(totalAmount.value),
    documentKind: documentKind.value || null,
  })
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
    @click.self="emit('close')"
  >
    <div class="modal-panel bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div class="px-5 pt-5 pb-3">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">Eckdaten des Belegs</h3>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate" :title="document.name">
            {{ document.name }}
          </p>
        </div>

        <div class="px-5 pb-4 space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Titel <span class="text-red-400">*</span>
            </label>
            <input
              v-model="title"
              type="text"
              placeholder="z. B. Wahlkampfflyer"
              class="w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              :class="titleMissing ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'"
              @keydown.enter="submit"
            >
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Korrespondent</label>
            <input
              v-model="correspondent"
              type="text"
              placeholder="Aussteller oder Firma"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              @keydown.enter="submit"
            >
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Belegtyp</label>
            <select
              v-model="documentKind"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">nicht gesetzt</option>
              <option v-for="kind in DOCUMENT_KINDS" :key="kind" :value="kind">
                {{ DOCUMENT_KIND_LABELS[kind] }}
              </option>
            </select>
          </div>

          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Belegdatum</label>
              <input
                v-model="documentDate"
                type="date"
                class="w-full px-2 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
            </div>
            <div class="w-28">
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Betrag (€)</label>
              <input
                v-model="totalAmount"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                class="w-full px-2 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white tabular-nums focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                @keydown.enter="submit"
                @blur="normalizeAmountDisplay"
              >
            </div>
          </div>

          <p class="text-[11px] text-gray-400 dark:text-gray-500">
            Leere Felder bleiben ungesetzt und werden bei der Auto-Zuordnung nicht berücksichtigt.
          </p>
        </div>

        <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="emit('close')"
          >
            Abbrechen
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium disabled:opacity-50"
            :disabled="titleMissing"
            @click="submit"
          >
            Übernehmen
          </button>
        </div>
    </div>
  </div>
</template>
