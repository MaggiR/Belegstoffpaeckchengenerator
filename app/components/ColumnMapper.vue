<script setup lang="ts">
import type { ColumnMapping } from '~/types'

export interface ImportFilter {
  dateFrom: string | null
  dateTo: string | null
  direction: 'all' | 'incoming' | 'outgoing'
}

const props = defineProps<{
  headers: string[]
  previewRows: Record<string, string>[]
  allRows: Record<string, string>[]
  mapping: ColumnMapping
}>()

const emit = defineEmits<{
  'update:mapping': [mapping: ColumnMapping]
  'apply': [filters: ImportFilter]
  'close': []
}>()

const { parseDate, parseAmount } = useTableParser()

const localMapping = ref<ColumnMapping>({ ...props.mapping })
const filterDateFrom = ref<string | null>(null)
const filterDateTo = ref<string | null>(null)
const filterDirection = ref<'all' | 'incoming' | 'outgoing'>('all')
const showFilters = ref(false)

watch(() => props.mapping, (val) => {
  localMapping.value = { ...val }
}, { deep: true })

const isValid = computed(() => localMapping.value.date && localMapping.value.amount)

const matchStats = computed(() => {
  if (!localMapping.value.date || !localMapping.value.amount) return null

  const rows = props.allRows
  let total = 0
  let matched = 0

  for (const row of rows) {
    const dateVal = row[localMapping.value.date]?.trim()
    const amountVal = row[localMapping.value.amount]?.trim()
    if (!dateVal && !amountVal) continue
    total++

    const date = dateVal ? parseDate(dateVal) : null
    const amount = amountVal ? parseAmount(amountVal) : 0

    if (filterDirection.value === 'incoming' && amount <= 0) continue
    if (filterDirection.value === 'outgoing' && amount >= 0) continue

    if (filterDateFrom.value && date) {
      const from = new Date(filterDateFrom.value)
      from.setHours(0, 0, 0, 0)
      if (date < from) continue
    }
    if (filterDateTo.value && date) {
      const to = new Date(filterDateTo.value)
      to.setHours(23, 59, 59, 999)
      if (date > to) continue
    }

    matched++
  }

  return { total, matched }
})

const hasActiveFilter = computed(() =>
  filterDateFrom.value || filterDateTo.value || filterDirection.value !== 'all',
)

function apply() {
  emit('update:mapping', { ...localMapping.value })
  emit('apply', {
    dateFrom: filterDateFrom.value,
    dateTo: filterDateTo.value,
    direction: filterDirection.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      @click.self="emit('close')"
    >
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Spalten zuordnen
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Ordnen Sie die Tabellenspalten den Buchungsfeldern zu.
          </p>
        </div>

        <div class="p-6 overflow-auto flex-1 space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Buchungsdatum *
              </label>
              <select
                v-model="localMapping.date"
                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option :value="null">— Auswählen —</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Betrag *
              </label>
              <select
                v-model="localMapping.amount"
                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option :value="null">— Auswählen —</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Buchungstext
              </label>
              <select
                v-model="localMapping.description"
                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option :value="null">— Keine —</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Bemerkung
              </label>
              <select
                v-model="localMapping.remarks"
                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option :value="null">— Keine —</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <!-- Buchungen filtern -->
          <div v-if="isValid">
            <button
              class="flex items-center gap-2 text-sm font-medium transition-colors"
              :class="hasActiveFilter
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-300'"
              @click="showFilters = !showFilters"
            >
              <font-awesome-icon icon="filter" class="w-3 h-3" />
              Buchungen filtern
              <span
                v-if="hasActiveFilter && matchStats"
                class="ml-1 text-xs font-normal text-primary-500"
              >
                ({{ matchStats.matched }} von {{ matchStats.total }})
              </span>
              <font-awesome-icon
                :icon="showFilters ? 'chevron-up' : 'chevron-down'"
                class="w-2.5 h-2.5 text-gray-400"
              />
            </button>

            <Transition
              enter-active-class="transition-all duration-200"
              enter-from-class="opacity-0 max-h-0"
              enter-to-class="opacity-100 max-h-60"
              leave-active-class="transition-all duration-200"
              leave-from-class="opacity-100 max-h-60"
              leave-to-class="opacity-0 max-h-0"
            >
              <div v-if="showFilters" class="mt-3 overflow-hidden">
                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl space-y-4">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Richtung</label>
                      <select
                        v-model="filterDirection"
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="all">Alle</option>
                        <option value="outgoing">Nur Ausgaben</option>
                        <option value="incoming">Nur Einnahmen</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Von</label>
                      <input
                        v-model="filterDateFrom"
                        type="date"
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bis</label>
                      <input
                        v-model="filterDateTo"
                        type="date"
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                    </div>
                  </div>

                  <div v-if="matchStats" class="flex items-center justify-between text-xs">
                    <span class="text-gray-500 dark:text-gray-400">
                      {{ matchStats.matched }} von {{ matchStats.total }} Buchungen werden übernommen
                    </span>
                    <button
                      v-if="hasActiveFilter"
                      class="text-primary-500 hover:text-primary-600 font-medium"
                      @click="filterDateFrom = null; filterDateTo = null; filterDirection = 'all'"
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Tabellenvorschau -->
          <div v-if="previewRows.length > 0">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vorschau</p>
            <div class="overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table class="min-w-full text-xs">
                <thead>
                  <tr class="bg-gray-50 dark:bg-gray-900/50">
                    <th
                      v-for="h in headers"
                      :key="h"
                      class="px-3 py-2 text-left font-medium whitespace-nowrap"
                      :class="{
                        'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30':
                          h === localMapping.date || h === localMapping.amount || h === localMapping.description || h === localMapping.remarks,
                        'text-gray-500 dark:text-gray-400': h !== localMapping.date && h !== localMapping.amount && h !== localMapping.description && h !== localMapping.remarks,
                      }"
                    >
                      {{ h }}
                      <span v-if="h === localMapping.date" class="ml-1 text-[10px] text-primary-500">(Datum)</span>
                      <span v-if="h === localMapping.amount" class="ml-1 text-[10px] text-primary-500">(Betrag)</span>
                      <span v-if="h === localMapping.description" class="ml-1 text-[10px] text-primary-500">(Text)</span>
                      <span v-if="h === localMapping.remarks" class="ml-1 text-[10px] text-primary-500">(Bemerkung)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in previewRows"
                    :key="i"
                    class="border-t border-gray-100 dark:border-gray-700/50"
                  >
                    <td
                      v-for="h in headers"
                      :key="h"
                      class="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {{ row[h] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            class="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="emit('close')"
          >
            Abbrechen
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg font-medium transition-all"
            :class="isValid
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'"
            :disabled="!isValid"
            @click="apply"
          >
            Übernehmen
            <span v-if="hasActiveFilter && matchStats" class="ml-1 font-normal opacity-80">
              ({{ matchStats.matched }})
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
