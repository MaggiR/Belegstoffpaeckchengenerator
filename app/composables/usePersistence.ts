import type { BspMeta } from '~/types'

const DB_NAME = 'bsp-generator'
const DB_VERSION = 2
const FILES_STORE = 'files'
const BSP_LIST_KEY = 'bsp-list'

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

interface StoredFileEntry {
  id: string
  bspId: string
  name: string
  type: 'pdf' | 'image'
  mimeType: string
  extractedText: string
  thumbnailDataUrl: string | null
  ocrProcessed: boolean
  encrypted?: boolean
  locked?: boolean
  password?: string
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
  verified?: boolean
}

function lsKey(bspId: string): string {
  return `bsp-state-${bspId}`
}

export function usePersistence() {
  const {
    activeView,
    currentBspId,
    bspList,
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
    clearEditorState,
    updateCurrentBspMeta,
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
      verified: b.verified ?? false,
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
        encrypted: d.encrypted,
        locked: d.locked,
        password: d.password,
      })),
    }
  }

  function saveBspList(): void {
    try {
      localStorage.setItem(BSP_LIST_KEY, JSON.stringify(bspList.value))
    } catch {}
  }

  function saveToLocalStorage(): void {
    const bspId = currentBspId.value
    if (!bspId) return
    try {
      localStorage.setItem(lsKey(bspId), JSON.stringify(buildStateSnapshot()))
      updateCurrentBspMeta()
      saveBspList()
    } catch (e) {
      console.warn('localStorage save fehlgeschlagen:', e)
    }
  }

  async function saveFilesToIdb(): Promise<void> {
    const bspId = currentBspId.value
    if (!bspId || isSavingFiles) return
    isSavingFiles = true
    try {
      const allFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
      const bspFiles = allFiles.filter(f => f.bspId === bspId)
      const currentDocIds = new Set(documents.value.map(d => d.id))
      const storedMap = new Map(bspFiles.map(f => [f.id, f]))

      for (const sf of bspFiles) {
        if (!currentDocIds.has(sf.id)) {
          await idbDelete(FILES_STORE, sf.id)
        }
      }

      for (const doc of documents.value) {
        const stored = storedMap.get(doc.id)
        if (!stored) {
          const entry: StoredFileEntry = {
            id: doc.id,
            bspId,
            name: doc.name,
            type: doc.type,
            mimeType: doc.file.type,
            extractedText: doc.extractedText,
            thumbnailDataUrl: doc.thumbnailDataUrl,
            ocrProcessed: doc.ocrProcessed,
            encrypted: doc.encrypted,
            locked: doc.locked,
            password: doc.password,
            data: await doc.file.arrayBuffer(),
          }
          await idbPut(FILES_STORE, entry)
        } else if (
          stored.extractedText !== doc.extractedText
          || stored.thumbnailDataUrl !== doc.thumbnailDataUrl
          || stored.ocrProcessed !== doc.ocrProcessed
          || stored.encrypted !== doc.encrypted
          || stored.locked !== doc.locked
          || stored.password !== doc.password
        ) {
          // Metadaten aktualisieren (z. B. nach Entschlüsselung – Thumbnail/Text/Passwort).
          await idbPut(FILES_STORE, {
            ...stored,
            extractedText: doc.extractedText,
            thumbnailDataUrl: doc.thumbnailDataUrl,
            ocrProcessed: doc.ocrProcessed,
            encrypted: doc.encrypted,
            locked: doc.locked,
            password: doc.password,
          })
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

  async function loadBspState(bspId: string): Promise<boolean> {
    try {
      const raw = localStorage.getItem(lsKey(bspId))
      if (!raw) return false

      const state = JSON.parse(raw)
      if (!state) return false

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

      const allFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
      const fileMap = new Map(allFiles.filter(f => f.bspId === bspId).map(f => [f.id, f]))

      const docMeta: Array<any> = state.documentMeta ?? []
      documents.value = docMeta.map((meta: any) => {
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
            encrypted: meta.encrypted ?? false,
            locked: meta.locked ?? false,
            password: meta.password,
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
          encrypted: stored.encrypted ?? meta.encrypted ?? false,
          locked: stored.locked ?? meta.locked ?? false,
          password: stored.password ?? meta.password,
        }
      })

      return true
    } catch (e) {
      console.warn('Laden fehlgeschlagen:', e)
      return false
    }
  }

  async function loadInitial(): Promise<boolean> {
    try {
      const raw = localStorage.getItem(BSP_LIST_KEY)
      if (raw) {
        bspList.value = JSON.parse(raw) as BspMeta[]
      }

      // Einmalig missingCount für alte BSPs ohne gespeicherten Wert nachberechnen
      let listChanged = false
      for (const meta of bspList.value) {
        if (meta.missingCount === undefined) {
          try {
            const stateRaw = localStorage.getItem(lsKey(meta.id))
            if (stateRaw) {
              const parsed = JSON.parse(stateRaw)
              const bookings = parsed?.bookings ?? []
              meta.missingCount = bookings.filter((b: any) => !b.documentId && !b.noDocRequired).length
            } else {
              meta.missingCount = 0
            }
            listChanged = true
          } catch {
            meta.missingCount = 0
          }
        }
      }
      if (listChanged) saveBspList()

      // Migration: old single-BSP state
      const oldState = localStorage.getItem('bsp-state')
      if (oldState && bspList.value.length === 0) {
        const migrationId = `bsp-${Date.now()}`
        localStorage.setItem(lsKey(migrationId), oldState)
        localStorage.removeItem('bsp-state')

        const parsed = JSON.parse(oldState)
        bspList.value.push({
          id: migrationId,
          name: parsed.tableFileName || 'Mein BSP',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          bookingCount: parsed.bookings?.length ?? 0,
          documentCount: parsed.documentMeta?.length ?? 0,
          assignedCount: parsed.bookings?.filter((b: any) => b.documentId)?.length ?? 0,
          missingCount: parsed.bookings?.filter((b: any) => !b.documentId && !b.noDocRequired)?.length ?? 0,
        })

        // Migrate files: add bspId to existing entries
        const allFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
        for (const f of allFiles) {
          if (!f.bspId) {
            f.bspId = migrationId
            await idbPut(FILES_STORE, f)
          }
        }

        saveBspList()
        currentBspId.value = migrationId
        await loadBspState(migrationId)
        activeView.value = 'editor'
        return true
      }

      if (bspList.value.length === 0) {
        activeView.value = 'overview'
        return false
      }

      // Load last active BSP from localStorage
      const lastActiveId = localStorage.getItem('bsp-active-id')
      const targetId = lastActiveId && bspList.value.some(b => b.id === lastActiveId)
        ? lastActiveId
        : bspList.value[0].id

      currentBspId.value = targetId
      await loadBspState(targetId)
      activeView.value = 'editor'
      return true
    } catch (e) {
      console.warn('Initial load fehlgeschlagen:', e)
      activeView.value = 'overview'
      return false
    }
  }

  async function switchToBsp(bspId: string): Promise<void> {
    if (currentBspId.value) {
      saveToLocalStorage()
      await saveFilesToIdb()
    }

    clearEditorState()
    currentBspId.value = bspId
    localStorage.setItem('bsp-active-id', bspId)
    await loadBspState(bspId)
    activeView.value = 'editor'
  }

  function createNewBsp(name?: string): string {
    if (currentBspId.value) {
      saveToLocalStorage()
    }

    const id = `bsp-${Date.now()}`
    const meta: BspMeta = {
      id,
      name: name || `BSP ${new Date().toLocaleDateString('de-DE')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bookingCount: 0,
      documentCount: 0,
      assignedCount: 0,
      missingCount: 0,
    }
    bspList.value.push(meta)
    saveBspList()

    clearEditorState()
    currentBspId.value = id
    localStorage.setItem('bsp-active-id', id)
    activeView.value = 'editor'
    return id
  }

  async function deleteBsp(bspId: string): Promise<void> {
    localStorage.removeItem(lsKey(bspId))

    const allFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
    for (const f of allFiles) {
      if (f.bspId === bspId) {
        await idbDelete(FILES_STORE, f.id)
      }
    }

    bspList.value = bspList.value.filter(b => b.id !== bspId)
    saveBspList()

    if (currentBspId.value === bspId) {
      clearEditorState()
      currentBspId.value = null
      activeView.value = 'overview'
    }
  }

  async function clearBspStorage(bspId: string | null): Promise<void> {
    if (!bspId) return
    try {
      localStorage.removeItem(lsKey(bspId))
      const allFiles = await idbGetAll<StoredFileEntry>(FILES_STORE)
      for (const f of allFiles) {
        if (f.bspId === bspId) {
          await idbDelete(FILES_STORE, f.id)
        }
      }
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
      () => {
        if (currentBspId.value && activeView.value === 'editor') {
          saveAll()
        }
      },
      { deep: true },
    )

    window.addEventListener('beforeunload', () => {
      if (currentBspId.value) saveToLocalStorage()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && currentBspId.value) saveToLocalStorage()
    })
  }

  return {
    saveState: saveAll,
    loadInitial,
    switchToBsp,
    createNewBsp,
    deleteBsp,
    clearBspStorage,
    startWatching,
    saveBspList,
  }
}
