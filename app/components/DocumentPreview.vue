<script setup lang="ts">
import type { DocumentFile } from '~/types'

const props = defineProps<{
  document: DocumentFile
}>()

const emit = defineEmits<{
  'close': []
}>()

interface PageState {
  pageNum: number
  baseWidth: number
  baseHeight: number
  dataUrl: string | null
  rendering: boolean
  rendered: boolean
}

const { loadPdf } = usePdfUtils()

const pages = ref<PageState[]>([])
const isImage = computed(() => props.document.type === 'image')
const imageUrl = ref<string | null>(null)
const imageNaturalSize = ref<{ w: number; h: number } | null>(null)
const loadingInitial = ref(true)
const loadError = ref(false)

const PAGE_GAP = 24
const RENDER_SCALE = 2
const MIN_ZOOM = 0.2
const MAX_ZOOM = 6

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)

const viewportRef = ref<HTMLElement>()
const layerRef = ref<HTMLElement>()

let pdfHandle: Awaited<ReturnType<typeof loadPdf>> | null = null

const layerDimensions = computed(() => {
  if (isImage.value) {
    if (!imageNaturalSize.value) return { width: 0, height: 0 }
    return { width: imageNaturalSize.value.w, height: imageNaturalSize.value.h }
  }
  let maxW = 0
  let totalH = 0
  for (let i = 0; i < pages.value.length; i++) {
    const p = pages.value[i]
    if (p.baseWidth > maxW) maxW = p.baseWidth
    totalH += p.baseHeight
    if (i < pages.value.length - 1) totalH += PAGE_GAP
  }
  return { width: maxW, height: totalH }
})

function pageTopInLayer(idx: number): number {
  let y = 0
  for (let i = 0; i < idx; i++) {
    y += pages.value[i].baseHeight + PAGE_GAP
  }
  return y
}

function pageLeftInLayer(p: PageState): number {
  return (layerDimensions.value.width - p.baseWidth) / 2
}

function resetView() {
  zoom.value = 1
  const dims = layerDimensions.value
  const viewport = viewportRef.value
  if (!viewport || dims.width === 0) {
    panX.value = 0
    panY.value = 0
    return
  }
  const vw = viewport.clientWidth
  const vh = viewport.clientHeight
  // An Breite anpassen falls Seite sehr breit
  const fitScale = Math.min(1, (vw - 40) / dims.width)
  zoom.value = fitScale
  panX.value = (vw - dims.width * fitScale) / 2
  panY.value = 20
}

async function initialize() {
  loadingInitial.value = true
  loadError.value = false
  try {
    if (isImage.value) {
      imageUrl.value = URL.createObjectURL(props.document.file)
      // Natürliche Größe ermitteln
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          imageNaturalSize.value = { w: img.width, h: img.height }
          resolve()
        }
        img.onerror = () => {
          loadError.value = true
          resolve()
        }
        img.src = imageUrl.value!
      })
    } else {
      pdfHandle = await loadPdf(props.document.file, props.document.password)
      const dims: PageState[] = []
      for (let i = 1; i <= pdfHandle.numPages; i++) {
        const d = await pdfHandle.pageDimensions(i, 1)
        dims.push({
          pageNum: i,
          baseWidth: d.width,
          baseHeight: d.height,
          dataUrl: null,
          rendering: false,
          rendered: false,
        })
      }
      pages.value = dims
    }
  } catch (err) {
    console.error(err)
    loadError.value = true
  } finally {
    loadingInitial.value = false
  }
  await nextTick()
  resetView()
  scheduleVisibilityCheck()
}

function scheduleVisibilityCheck() {
  if (!pdfHandle) return
  requestAnimationFrame(checkVisibility)
}

// Lazy-Laden: Seiten rendern, die ins vergrößerte Sichtfeld hineinragen
function checkVisibility() {
  if (!pdfHandle || !viewportRef.value) return
  const vw = viewportRef.value.clientWidth
  const vh = viewportRef.value.clientHeight
  const margin = vh * 0.75
  const z = zoom.value

  for (let i = 0; i < pages.value.length; i++) {
    const p = pages.value[i]
    if (p.rendered || p.rendering) continue
    const pageTop = panY.value + pageTopInLayer(i) * z
    const pageBottom = pageTop + p.baseHeight * z
    if (pageBottom < -margin || pageTop > vh + margin) continue
    // in Nähe sichtbar → rendern
    renderPage(i)
  }
}

async function renderPage(idx: number) {
  if (!pdfHandle) return
  const p = pages.value[idx]
  if (p.rendered || p.rendering) return
  p.rendering = true
  try {
    const url = await pdfHandle.renderPage(p.pageNum, RENDER_SCALE)
    p.dataUrl = url
    p.rendered = true
  } catch (err) {
    console.warn('Seite konnte nicht gerendert werden', err)
  } finally {
    p.rendering = false
  }
}

// Wheel-Zoom mit Cursor als Fixpunkt
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const cursorX = e.clientX - rect.left
  const cursorY = e.clientY - rect.top

  // Zoomfaktor
  const zoomFactor = Math.exp(-e.deltaY * 0.0015)
  let newZoom = zoom.value * zoomFactor
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
  if (newZoom === zoom.value) return

  // Punkt unter Cursor bleibt fix
  const ratio = newZoom / zoom.value
  panX.value = cursorX - (cursorX - panX.value) * ratio
  panY.value = cursorY - (cursorY - panY.value) * ratio
  zoom.value = newZoom

  scheduleVisibilityCheck()
}

// Panning per Pointer-Drag
const isPanning = ref(false)
let panStart = { x: 0, y: 0, panX: 0, panY: 0 }

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  isPanning.value = true
  panStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isPanning.value) return
  panX.value = panStart.panX + (e.clientX - panStart.x)
  panY.value = panStart.panY + (e.clientY - panStart.y)
  scheduleVisibilityCheck()
}

function onPointerUp(e: PointerEvent) {
  if (!isPanning.value) return
  isPanning.value = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {}
}

function zoomIn() {
  zoomAt(1.25)
}
function zoomOut() {
  zoomAt(1 / 1.25)
}

function zoomAt(factor: number) {
  const viewport = viewportRef.value
  if (!viewport) return
  const cx = viewport.clientWidth / 2
  const cy = viewport.clientHeight / 2
  let newZoom = zoom.value * factor
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
  const ratio = newZoom / zoom.value
  panX.value = cx - (cx - panX.value) * ratio
  panY.value = cy - (cy - panY.value) * ratio
  zoom.value = newZoom
  scheduleVisibilityCheck()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  } else if (e.key === '+' || (e.key === '=' && e.shiftKey) || e.key === '=') {
    e.preventDefault()
    zoomIn()
  } else if (e.key === '-') {
    e.preventDefault()
    zoomOut()
  } else if (e.key === '0') {
    e.preventDefault()
    resetView()
    scheduleVisibilityCheck()
  }
}

onMounted(() => {
  initialize()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (imageUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl.value)
  }
  if (pdfHandle) {
    try { pdfHandle.destroy() } catch {}
  }
})

watch([zoom, panX, panY], () => {
  scheduleVisibilityCheck()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/85 z-[100]"
      @click.self="emit('close')"
    >
      <!-- Viewport (volle Höhe) -->
      <div
        ref="viewportRef"
        class="absolute inset-0 overflow-hidden select-none"
        :class="isPanning ? 'cursor-grabbing' : 'cursor-grab'"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <!-- Lade-Indikator -->
        <div
          v-if="loadingInitial"
          class="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3"
        >
          <font-awesome-icon icon="spinner" class="text-3xl animate-spin text-primary-400" />
          <span class="text-sm">Wird geladen…</span>
        </div>

        <!-- Fehler -->
        <div
          v-else-if="loadError"
          class="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3"
        >
          <font-awesome-icon icon="triangle-exclamation" class="text-3xl text-amber-400" />
          <span class="text-sm">Vorschau konnte nicht geladen werden</span>
        </div>

        <!-- Transformierter Layer mit allen Seiten -->
        <div
          v-else
          ref="layerRef"
          class="absolute top-0 left-0 origin-top-left will-change-transform"
          :style="{
            width: layerDimensions.width + 'px',
            height: layerDimensions.height + 'px',
            transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
            transition: isPanning ? 'none' : 'transform 0.08s linear',
          }"
        >
          <!-- Bild -->
          <div
            v-if="isImage && imageUrl"
            class="absolute inset-0 bg-white shadow-xl"
          >
            <img
              :src="imageUrl"
              :alt="document.name"
              class="w-full h-full object-contain pointer-events-none"
              draggable="false"
            >
          </div>

          <!-- PDF-Seiten -->
          <template v-else>
            <div
              v-for="(p, idx) in pages"
              :key="p.pageNum"
              class="absolute bg-white shadow-2xl"
              :style="{
                width: p.baseWidth + 'px',
                height: p.baseHeight + 'px',
                left: pageLeftInLayer(p) + 'px',
                top: pageTopInLayer(idx) + 'px',
              }"
            >
              <img
                v-if="p.dataUrl"
                :src="p.dataUrl"
                :alt="`Seite ${p.pageNum}`"
                class="w-full h-full object-contain pointer-events-none"
                draggable="false"
              >
              <div
                v-else
                class="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2"
              >
                <font-awesome-icon
                  :icon="p.rendering ? 'spinner' : 'file-pdf'"
                  :class="p.rendering ? 'animate-spin text-primary-400' : ''"
                  class="text-3xl"
                />
                <span class="text-xs font-medium">Seite {{ p.pageNum }}</span>
              </div>
            </div>
          </template>
        </div>

      </div>

      <!-- Titel-Badge (links oben) -->
      <div
        class="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-xs max-w-[calc(50%-4rem)] pointer-events-none"
      >
        <font-awesome-icon
          :icon="document.type === 'pdf' ? 'file-pdf' : 'file-image'"
          class="text-gray-300 flex-shrink-0 w-3 h-3"
        />
        <span class="font-medium truncate">{{ document.name }}</span>
        <span
          v-if="!isImage && pages.length > 0"
          class="text-[10px] text-gray-400 flex-shrink-0"
        >
          · {{ pages.length }} Seite{{ pages.length !== 1 ? 'n' : '' }}
        </span>
      </div>

      <!-- Bedienelemente (rechts oben) -->
      <div
        class="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white"
      >
        <button
          class="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          title="Herauszoomen"
          @click="zoomOut"
        >
          <font-awesome-icon icon="magnifying-glass-minus" class="w-3.5 h-3.5" />
        </button>
        <span class="text-[11px] tabular-nums w-11 text-center">
          {{ Math.round(zoom * 100) }}%
        </span>
        <button
          class="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          title="Hereinzoomen"
          @click="zoomIn"
        >
          <font-awesome-icon icon="magnifying-glass-plus" class="w-3.5 h-3.5" />
        </button>
        <button
          class="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          title="Ansicht zurücksetzen (0)"
          @click="resetView(); scheduleVisibilityCheck()"
        >
          <font-awesome-icon icon="rotate" class="w-3.5 h-3.5" />
        </button>
        <div class="w-px h-4 bg-white/20 mx-1" />
        <button
          class="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          title="Schließen (Esc)"
          @click="emit('close')"
        >
          <font-awesome-icon icon="xmark" class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Hinweis (unten mittig) -->
      <div
        v-if="!loadingInitial && !loadError"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white/80 text-[11px] flex items-center gap-2 pointer-events-none"
      >
        <font-awesome-icon icon="hand" class="w-3 h-3" />
        Ziehen zum Verschieben · Mausrad zum Zoomen
      </div>
    </div>
  </Teleport>
</template>
