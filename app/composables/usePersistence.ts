const DB_NAME = 'bsp-generator'
const DB_VERSION = 1
const FILES_STORE = 'files'
const LS_KEY = 'bsp-state'

let dbInstance: IDBDatabase | null = null
let saveFilesTimeout: ReturnType<typeof setTimeout> | null = null
let isSavingFiles = false

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('state'))
        db.createObjectStore('state')
      if (!db.objectStoreNames.contains(FILES_STORE))
        db.createObjectStore(FILES_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }
    request.onerror = () => reject(request.error)
  })
}

function idbPut(store: string, value: any): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const s = tx.objectStore(store)
    const req = s.put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  }))
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const s = tx.objectStore(store)
    const req = s.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  }))
}

function idbGetAll<T = any>(store: string): Promise<T[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const s = tx.objectStore(store)
    const req = s.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  }))
}

function idbClear(store: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const s = tx.objectStore(store)
    const req = s.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  }))
}

interface StoredFileEntry {
  id: string
  name: string
  type: 'pdf' | 'image'
  mimeType: string
  extractedText: string
  thumbnailDataUrl: string | null
  ocrProcessed: boolean
  data: ArrayBuffer
}

interface SerializedBooking {
  id: string
  date: string | null
  amount: number
  description: string
  remarks: string
  documentId: string | null
  noDocRequired: boolean
}

export function usePersistence() {
  const {
    currentStep,
    bookings,
    documents,
    tableHeaders,
    tablePreviewRows,
    allTableRows,
    columnMapping,
    showColumnMapper,
    tableFileName,
    viewMode,
    filters,
    sort,
  } = useAppState()

  function serializeBookings(): SerializedBooking[] {
    return bookings.value.map(b => ({
      ...b,
      date: b.date ? b.date.toISOString() : null,
    }))
  }

  function deserializeBookings(data: SerializedBooking[]): void {
    bookings.value = data.map(b => ({
      ...b,
      date: b.date ? new Date(b.date) : null,
    }))
  }

  function buildStateSnapshot() {
    return {
      currentStep: currentStep.value,
      bookings: serializeBookings(),
      columnMapping: columnMapping.value,
      tableFileName: tableFileName.value,
      tableHeaders: tableHeaders.value,
      allTableRows: allTableRows.value,
      tablePreviewRows: tablePreviewRows.value,
      viewMode: viewMode.value,
      filters: filters.value,
      sort: sort.value,
      showColumnMapper: showColumnMapper.value,
      documentMeta: documents.value.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        extractedText: d.extractedText,
        thumbnailDataUrl: d.thumbnailDataUrl,
        ocrProcessed: d.ocrProcessed,
      })),
    }
  }

  function saveToLocalStorage(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(buildStateSnapshot()))
    } catch (e) {
      console.warn('localStorage save fehlgeschlagen:', e)
    }
  }

  async function saveFilesToIdb(): Promise<void> {
    if (isSavingFiles) return
    isSavingFiles = true
    try {
      const currentDocIds = new Set(documents.value.map(d => d.id))
      const storedFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
      const storedMap = new Map(storedFiles.map(f => [f.id, f]))

      for (const sf of storedFiles) {
        if (!currentDocIds.has(sf.id)) {
          await idbDelete(FILES_STORE, sf.id)
        }
      }

      for (const doc of documents.value) {
        if (!storedMap.has(doc.id)) {
          const entry: StoredFileEntry = {
            id: doc.id,
            name: doc.name,
            type: doc.type,
            mimeType: doc.file.type,
            extractedText: doc.extractedText,
            thumbnailDataUrl: doc.thumbnailDataUrl,
            ocrProcessed: doc.ocrProcessed,
            data: await doc.file.arrayBuffer(),
          }
          await idbPut(FILES_STORE, entry)
        }
      }
    } catch (e) {
      console.warn('IDB file save fehlgeschlagen:', e)
    } finally {
      isSavingFiles = false
    }
  }

  function debouncedFileSave(): void {
    if (saveFilesTimeout) clearTimeout(saveFilesTimeout)
    saveFilesTimeout = setTimeout(() => saveFilesToIdb(), 1000)
  }

  function saveAll(): void {
    saveToLocalStorage()
    debouncedFileSave()
  }

  async function loadState(): Promise<boolean> {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return false

      const state = JSON.parse(raw)
      if (!state || (!state.bookings?.length && !state.documentMeta?.length)) return false

      currentStep.value = state.currentStep ?? 1
      columnMapping.value = state.columnMapping ?? { date: null, amount: null, description: null, remarks: null }
      tableFileName.value = state.tableFileName ?? ''
      tableHeaders.value = state.tableHeaders ?? []
      allTableRows.value = state.allTableRows ?? []
      tablePreviewRows.value = state.tablePreviewRows ?? []
      viewMode.value = state.viewMode ?? 'list'
      filters.value = state.filters ?? { direction: 'all', docStatus: 'all', amountMin: null, amountMax: null, searchText: '', dateFrom: null, dateTo: null }
      sort.value = state.sort ?? { field: 'date', order: 'asc' }
      showColumnMapper.value = state.showColumnMapper ?? false

      if (state.bookings) {
        deserializeBookings(state.bookings)
      }

      const storedFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
      const fileMap = new Map(storedFiles.map(f => [f.id, f]))

      const docMeta: Array<any> = state.documentMeta ?? []
      documents.value = docMeta
        .map((meta: any) => {
          const stored = fileMap.get(meta.id)
          if (!stored) {
            return {
              id: meta.id,
              file: new File([], meta.name || 'unknown', { type: meta.type === 'pdf' ? 'application/pdf' : 'image/jpeg' }),
              name: meta.name,
              type: meta.type,
              extractedText: meta.extractedText ?? '',
              thumbnailDataUrl: meta.thumbnailDataUrl ?? null,
              ocrProcessed: meta.ocrProcessed ?? false,
            }
          }
          const file = new File([stored.data], stored.name, { type: stored.mimeType })
          return {
            id: meta.id,
            file,
            name: meta.name,
            type: meta.type,
            extractedText: stored.extractedText ?? meta.extractedText ?? '',
            thumbnailDataUrl: stored.thumbnailDataUrl ?? meta.thumbnailDataUrl ?? null,
            ocrProcessed: stored.ocrProcessed ?? meta.ocrProcessed ?? false,
          }
        })

      return true
    } catch (e) {
      console.warn('Laden fehlgeschlagen:', e)
      return false
    }
  }

  async function clearStorage(): Promise<void> {
    try {
      localStorage.removeItem(LS_KEY)
      await idbClear(FILES_STORE)
    } catch (e) {
      console.warn('Löschen fehlgeschlagen:', e)
    }
  }

  function startWatching(): void {
    watch(
      [
        currentStep,
        bookings,
        documents,
        columnMapping,
        tableFileName,
        tableHeaders,
        allTableRows,
        showColumnMapper,
        viewMode,
        filters,
        sort,
      ],
      () => saveAll(),
      { deep: true },
    )

    window.addEventListener('beforeunload', () => saveToLocalStorage())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveToLocalStorage()
    })
  }

  return { saveState: saveAll, loadState, clearStorage, startWatching }
}
