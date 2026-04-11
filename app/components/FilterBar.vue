<script setup lang="ts">
const emit = defineEmits<{
  'open-column-mapper': []
}>()

const {
  viewMode,
  filters,
  sort,
  stats,
} = useAppState()

const showFilters = ref(false)
const showSort = ref(false)
</script>

<template>
  <div class="sticky top-0 z-40 py-3 space-y-3 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-950/80 border-b border-gray-200/50 dark:border-gray-800/50">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-2">
        <!-- Ansichtswechsel -->
        <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="viewMode === 'list'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="viewMode = 'list'"
          >
            <font-awesome-icon icon="list" class="mr-1.5" />
            Liste
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="viewMode === 'tile'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="viewMode = 'tile'"
          >
            <font-awesome-icon icon="grip" class="mr-1.5" />
            Kacheln
          </button>
        </div>

        <!-- Filter-Toggle -->
        <button
          class="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          :class="showFilters
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
          @click="showFilters = !showFilters; if (showFilters) showSort = false"
        >
          <font-awesome-icon icon="filter" />
          Filter
          <font-awesome-icon :icon="showFilters ? 'chevron-up' : 'chevron-down'" class="w-2.5 h-2.5" />
        </button>

        <!-- Sortierungs-Toggle -->
        <button
          class="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          :class="showSort
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
          @click="showSort = !showSort; if (showSort) showFilters = false"
        >
          <font-awesome-icon icon="sort" />
          Sortierung
          <font-awesome-icon :icon="showSort ? 'chevron-up' : 'chevron-down'" class="w-2.5 h-2.5" />
        </button>

        <!-- Buchungen anpassen -->
        <button
          class="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="emit('open-column-mapper')"
        >
          <font-awesome-icon icon="table" />
          Buchungen anpassen
        </button>

        <!-- Statistik -->
        <span class="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
          {{ stats.withDoc }} zugeordnet · {{ stats.missing }} fehlend
        </span>
      </div>
    </div>

    <!-- Filteroptionen -->
    <div
      v-if="showFilters"
      class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-wrap items-end gap-4"
    >
      <!-- Suche -->
      <div class="flex-1 min-w-[200px]">
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suche</label>
        <div class="relative">
          <font-awesome-icon icon="magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
          <input
            v-model="filters.searchText"
            type="text"
            placeholder="Buchungstext durchsuchen…"
            class="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
        </div>
      </div>

      <!-- Richtung -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Richtung</label>
        <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
          <button
            v-for="opt in [
              { val: 'all', label: 'Alle' },
              { val: 'incoming', label: 'Eingehend' },
              { val: 'outgoing', label: 'Ausgehend' },
            ]"
            :key="opt.val"
            class="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
            :class="filters.direction === opt.val
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'"
            @click="filters.direction = opt.val as any"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Belegstatus -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Belegstatus</label>
        <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5 flex-wrap">
          <button
            v-for="opt in [
              { val: 'all', label: 'Alle' },
              { val: 'with', label: 'Mit Beleg' },
              { val: 'without', label: 'Fehlend' },
              { val: 'required', label: 'Erforderlich' },
              { val: 'not-required', label: 'Nicht erf.' },
            ]"
            :key="opt.val"
            class="px-2 py-1 rounded-md text-xs font-medium transition-all"
            :class="filters.docStatus === opt.val
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'"
            @click="filters.docStatus = opt.val as any"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Datumsbereich -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Zeitraum</label>
        <div class="flex items-center gap-1.5">
          <input
            :value="filters.dateFrom ?? ''"
            type="date"
            class="px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            @input="filters.dateFrom = ($event.target as HTMLInputElement).value || null"
          >
          <span class="text-gray-400 text-xs">–</span>
          <input
            :value="filters.dateTo ?? ''"
            type="date"
            class="px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            @input="filters.dateTo = ($event.target as HTMLInputElement).value || null"
          >
        </div>
      </div>

      <!-- Betragsbereich -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Betrag (€)</label>
        <div class="flex items-center gap-1.5">
          <input
            :value="filters.amountMin ?? ''"
            type="number"
            placeholder="Min"
            class="w-20 px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            @input="filters.amountMin = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
          >
          <span class="text-gray-400 text-xs">–</span>
          <input
            :value="filters.amountMax ?? ''"
            type="number"
            placeholder="Max"
            class="w-20 px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            @input="filters.amountMax = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
          >
        </div>
      </div>
    </div>

    <!-- Sortieroptionen -->
    <div
      v-if="showSort"
      class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4"
    >
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sortieren nach</label>
        <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
          <button
            v-for="opt in [
              { val: 'date', label: 'Datum' },
              { val: 'amount', label: 'Betrag' },
            ]"
            :key="opt.val"
            class="px-3 py-1 rounded-md text-xs font-medium transition-all"
            :class="sort.field === opt.val
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'"
            @click="sort.field = opt.val as any"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reihenfolge</label>
        <div class="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
          <button
            class="px-3 py-1 rounded-md text-xs font-medium transition-all"
            :class="sort.order === 'asc'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'"
            @click="sort.order = 'asc'"
          >
            <font-awesome-icon icon="sort-up" class="mr-1" />
            Aufsteigend
          </button>
          <button
            class="px-3 py-1 rounded-md text-xs font-medium transition-all"
            :class="sort.order === 'desc'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'"
            @click="sort.order = 'desc'"
          >
            <font-awesome-icon icon="sort-down" class="mr-1" />
            Absteigend
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
