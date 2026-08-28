<script setup lang="ts">
import type { DocumentKind } from '~/types'
import { documentKindLabel } from '~/types'

const props = withDefaults(defineProps<{
  kind?: DocumentKind | null
  overlay?: boolean
}>(), {
  overlay: false,
})

const resolved = computed(() => props.kind ?? null)

const toneClass = computed(() => {
  if (!resolved.value) return ''
  if (props.overlay) {
    return {
      invoice: 'bg-sky-400/25 text-sky-50 ring-sky-200/40',
      bank_statement: 'bg-white/15 text-gray-100 ring-white/25',
      reimbursement: 'bg-amber-400/30 text-amber-50 ring-amber-200/40',
      contract: 'bg-violet-400/30 text-violet-50 ring-violet-200/40',
      other: 'bg-white/15 text-gray-100 ring-white/25',
    }[resolved.value]
  }
  return {
    invoice: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-800',
    bank_statement: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
    reimbursement: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800',
    contract: 'bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:ring-violet-800',
    other: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600',
  }[resolved.value]
})
</script>

<template>
  <span
    v-if="resolved"
    class="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium leading-4 ring-1 ring-inset whitespace-nowrap"
    :class="toneClass"
  >
    {{ documentKindLabel(resolved) }}
  </span>
</template>
