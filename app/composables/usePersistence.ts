import type { BspMeta, DocumentKind, ExtractionStatus } from '~/types'
import { parseDocumentKind } from '~/types'
import { fallbackTitleFromName } from '~/composables/useDocumentExtraction'

const DB_NAME = 'bsp-generator'
const DB_VERSION = 2
const FILES_STORE = 'files'
const STATE_STORE = 'state'
const BSP_LIST_KEY = 'bsp-list'

let dbInstance: IDBDatabase | null = null
let saveFilesTimeout: ReturnType<typeof setTimeout> | null = null
let saveStateTimeout: ReturnType<typeof setTimeout> | null = null
let isSavingFiles = false
let pendingFileSave = false

/** Während ein Stand geladen wird, dürfen Auto-Saves nicht den leeren Zwischenzustand wegschreiben. */
let isRestoring = false

/**
 * Nach einem fehlgeschlagenen Ladevorgang bleiben Auto-Saves gesperrt, damit
 * der (noch intakte) gespeicherte Stand nicht mit einem leeren überschrieben
 * wird. Ein erfolgreicher Ladevorgang hebt die Sperre wieder auf.
 */
let savesBlocked = false

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

function idbGet<T = any>(store: string, key: string): Promise<T | undefined> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  }))
}

/** Für Stores ohne keyPath (z. B. den State-Store) mit explizitem Schlüssel schreiben. */
function idbPutKeyed(store: string, key: string, value: any): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  }))
}

/**
 * Bittet den Browser, den Speicher des Origins als persistent zu markieren.
 * Ohne dies darf der Browser IndexedDB und localStorage bei Speicherdruck
 * automatisch räumen – genau das soll nie passieren.
 */
function requestPersistentStorage(): void {
  try {
    if (!navigator.storage?.persist) return
    navigator.storage.persisted().then((already) => {
      if (already) return
      navigator.storage.persist().then((granted) => {
        if (!granted) {
          console.warn('Browser hat persistenten Speicher nicht gewährt – Daten könnten bei Speicherdruck geräumt werden.')
        }
      })
    }).catch(() => {})
  } catch {}
}

interface StoredFileEntry {
  id: string
  bspId: string
  name: string
  type: 'pdf' | 'image'
  mimeType: string
  thumbnailDataUrl: string | null
  encrypted?: boolean
  locked?: boolean
  password?: string
  title?: string
  correspondent?: string | null
  documentDate?: string | null
  totalAmount?: number | null
  documentKind?: DocumentKind | null
  extractionStatus?: ExtractionStatus
  extractionError?: string
  analyzed?: boolean
  data: ArrayBuffer
}

interface SerializedBooking {
  id: string
  date: string | null
  amount: number
  description: string
  remarks: string
  documentIds: string[]
  /** Nur in Zuständen vor der Mehrfachzuordnung vorhanden. */
  documentId?: string | null
  noDocRequired: boolean
  verified?: boolean
}

/** Zählt zugeordnete Belege in gespeicherten Buchungen beider Formate. */
function serializedDocCount(booking: any): number {
  if (Array.isArray(booking?.documentIds)) return booking.documentIds.length
  return booking?.documentId ? 1 : 0
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
    bookings.value = data.map((b) => {
      const { documentId, ...rest } = b
      // Zustände vor der Mehrfachzuordnung kannten nur einen Beleg pro Buchung.
      const documentIds = Array.isArray(b.documentIds)
        ? b.documentIds
        : documentId ? [documentId] : []
      return {
        ...rest,
        documentIds,
        date: b.date ? new Date(b.date) : null,
        verified: b.verified ?? false,
      }
    })
  }

  function buildStateSnapshot() {
    return {
      savedAt: Date.now(),
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
        thumbnailDataUrl: d.thumbnailDataUrl,
        encrypted: d.encrypted,
        locked: d.locked,
        password: d.password,
        title: d.title,
        correspondent: d.correspondent,
        documentDate: d.documentDate,
        totalAmount: d.totalAmount,
        documentKind: d.documentKind,
        extractionStatus: d.extractionStatus,
        extractionError: d.extractionError,
        analyzed: d.analyzed,
      })),
    }
  }

  function saveBspList(): void {
    try {
      localStorage.setItem(BSP_LIST_KEY, JSON.stringify(bspList.value))
    } catch {}
  }

  /**
   * Zustand nach IndexedDB schreiben. IndexedDB statt localStorage, weil der
   * Snapshot (Thumbnails, Tabellenzeilen) das localStorage-Limit
   * von ~5 MB leicht sprengt – fehlgeschlagene Saves waren still und führten
   * beim nächsten Laden zu scheinbar "verschwundenen" Daten.
   */
  async function saveStateNow(): Promise<void> {
    const bspId = currentBspId.value
    if (!bspId || isRestoring || savesBlocked) return
    try {
      // JSON-Runde entfernt Vue-Reaktivitätsproxies, die IndexedDB nicht klonen kann.
      const snapshot = JSON.parse(JSON.stringify(buildStateSnapshot()))
      await idbPutKeyed(STATE_STORE, bspId, snapshot)
      updateCurrentBspMeta()
      saveBspList()
    } catch (e) {
      console.warn('Speichern des Zustands fehlgeschlagen:', e)
    }
  }

  function debouncedStateSave(): void {
    if (saveStateTimeout) clearTimeout(saveStateTimeout)
    saveStateTimeout = setTimeout(() => {
      saveStateTimeout = null
      void saveStateNow()
    }, 300)
  }

  /** Ausstehende (debouncte) Speichervorgänge sofort anstoßen. */
  function flushPendingSaves(): void {
    if (saveStateTimeout) {
      clearTimeout(saveStateTimeout)
      saveStateTimeout = null
    }
    void saveStateNow()
    if (saveFilesTimeout) {
      clearTimeout(saveFilesTimeout)
      saveFilesTimeout = null
      void saveFilesToIdb()
    }
  }

  async function saveFilesToIdb(): Promise<void> {
    const bspId = currentBspId.value
    // Während des Ladens ist documents leer – ein Lauf in dem Moment würde
    // alle gespeicherten Dateien dieses BSPs löschen.
    if (!bspId || isRestoring || savesBlocked) return
    if (isSavingFiles) {
      pendingFileSave = true
      return
    }
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
            thumbnailDataUrl: doc.thumbnailDataUrl,
            encrypted: doc.encrypted,
            locked: doc.locked,
            password: doc.password,
            title: doc.title,
            correspondent: doc.correspondent,
            documentDate: doc.documentDate,
            totalAmount: doc.totalAmount,
            documentKind: doc.documentKind,
            extractionStatus: doc.extractionStatus,
            extractionError: doc.extractionError,
            analyzed: doc.analyzed,
            data: await doc.file.arrayBuffer(),
          }
          await idbPut(FILES_STORE, entry)
        } else if (
          stored.thumbnailDataUrl !== doc.thumbnailDataUrl
          || stored.encrypted !== doc.encrypted
          || stored.locked !== doc.locked
          || stored.password !== doc.password
          || stored.title !== doc.title
          || stored.correspondent !== doc.correspondent
          || stored.documentDate !== doc.documentDate
          || stored.totalAmount !== doc.totalAmount
          || stored.documentKind !== doc.documentKind
          || stored.extractionStatus !== doc.extractionStatus
          || stored.extractionError !== doc.extractionError
          || stored.analyzed !== doc.analyzed
        ) {
          // Metadaten aktualisieren (z. B. nach Entschlüsselung oder LLM-Analyse).
          await idbPut(FILES_STORE, {
            ...stored,
            thumbnailDataUrl: doc.thumbnailDataUrl,
            encrypted: doc.encrypted,
            locked: doc.locked,
            password: doc.password,
            title: doc.title,
            correspondent: doc.correspondent,
            documentDate: doc.documentDate,
            totalAmount: doc.totalAmount,
            documentKind: doc.documentKind,
            extractionStatus: doc.extractionStatus,
            extractionError: doc.extractionError,
            analyzed: doc.analyzed,
          })
        }
      }
    } catch (e) {
      console.warn('IDB file save fehlgeschlagen:', e)
    } finally {
      isSavingFiles = false
      // Änderungen, die während des Laufs eintrafen, nicht verwerfen.
      if (pendingFileSave) {
        pendingFileSave = false
        void saveFilesToIdb()
      }
    }
  }

  function debouncedFileSave(): void {
    if (saveFilesTimeout) clearTimeout(saveFilesTimeout)
    saveFilesTimeout = setTimeout(() => saveFilesToIdb(), 1000)
  }

  function saveAll(): void {
    debouncedStateSave()
    debouncedFileSave()
  }

  /**
   * `loaded`: Stand wiederhergestellt · `empty`: kein Stand vorhanden (z. B.
   * neues BSP) · `error`: Laden gescheitert – Auto-Saves bleiben gesperrt,
   * damit der gespeicherte Stand nicht überschrieben wird.
   */
  async function loadBspState(bspId: string): Promise<'loaded' | 'empty' | 'error'> {
    isRestoring = true
    try {
      // Primärquelle IndexedDB; localStorage nur noch als Alt-Format bzw.
      // als Notfall-Sicherung vom Entladen der Seite.
      let idbState: any
      try {
        idbState = await idbGet(STATE_STORE, bspId)
      } catch {
        idbState = undefined
      }

      let lsState: any
      try {
        const raw = localStorage.getItem(lsKey(bspId))
        if (raw) lsState = JSON.parse(raw)
      } catch {}

      // Bei zwei Ständen gewinnt der neuere (Alt-Format ohne savedAt gilt als 0).
      let state = idbState
      if (lsState && (!idbState || (lsState.savedAt ?? 0) > (idbState.savedAt ?? 0))) {
        state = lsState
      }

      if (!state) {
        savesBlocked = false
        return 'empty'
      }

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
        const file = stored
          ? new File([stored.data], stored.name, { type: stored.mimeType })
          : new File([], meta.name || 'unknown', { type: meta.type === 'pdf' ? 'application/pdf' : 'image/jpeg' })

        // Belege aus Zuständen vor der LLM-Auswertung gelten als "nicht analysiert",
        // damit sie in der Oberfläche nachgeholt werden können.
        const extractionStatus = stored?.extractionStatus ?? meta.extractionStatus ?? 'skipped'
        const analyzed = Boolean(
          stored?.analyzed ?? meta.analyzed ?? extractionStatus === 'done',
        )
        let documentKind = parseDocumentKind(stored?.documentKind ?? meta.documentKind)
        // Alter Default "Sonstige" bei nicht analysierten Belegen nicht als Typ anzeigen.
        if (extractionStatus !== 'done' && documentKind === 'other') documentKind = null
        return {
          id: meta.id,
          file,
          name: meta.name,
          type: meta.type,
          thumbnailDataUrl: stored?.thumbnailDataUrl ?? meta.thumbnailDataUrl ?? null,
          encrypted: stored?.encrypted ?? meta.encrypted ?? false,
          locked: stored?.locked ?? meta.locked ?? false,
          password: stored?.password ?? meta.password,
          title: stored?.title ?? meta.title ?? fallbackTitleFromName(meta.name ?? ''),
          correspondent: stored?.correspondent ?? meta.correspondent ?? null,
          documentDate: stored?.documentDate ?? meta.documentDate ?? null,
          totalAmount: stored?.totalAmount ?? meta.totalAmount ?? null,
          documentKind,
          extractionStatus,
          extractionError: stored?.extractionError ?? meta.extractionError,
          analyzed,
        }
      })

      // Migration: Stand künftig in IndexedDB halten, localStorage-Kopie erst
      // nach erfolgreichem Schreiben entfernen (Quota-Entlastung).
      if (state !== idbState) {
        try {
          await idbPutKeyed(STATE_STORE, bspId, state)
          localStorage.removeItem(lsKey(bspId))
        } catch {}
      } else if (lsState) {
        try {
          localStorage.removeItem(lsKey(bspId))
        } catch {}
      }

      savesBlocked = false
      return 'loaded'
    } catch (e) {
      savesBlocked = true
      console.error('Laden des gespeicherten Stands fehlgeschlagen – automatisches Speichern ist pausiert, damit der Stand nicht überschrieben wird:', e)
      return 'error'
    } finally {
      isRestoring = false
    }
  }

  async function loadInitial(): Promise<boolean> {
    requestPersistentStorage()
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
            const parsed = stateRaw ? JSON.parse(stateRaw) : await idbGet(STATE_STORE, meta.id)
            if (parsed) {
              const bookings = parsed?.bookings ?? []
              meta.missingCount = bookings.filter((b: any) => serializedDocCount(b) === 0 && !b.noDocRequired).length
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
          assignedCount: parsed.bookings?.filter((b: any) => serializedDocCount(b) > 0)?.length ?? 0,
          missingCount: parsed.bookings?.filter((b: any) => serializedDocCount(b) === 0 && !b.noDocRequired)?.length ?? 0,
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
      if (saveStateTimeout) {
        clearTimeout(saveStateTimeout)
        saveStateTimeout = null
      }
      if (saveFilesTimeout) {
        clearTimeout(saveFilesTimeout)
        saveFilesTimeout = null
      }
      await saveStateNow()
      await saveFilesToIdb()
    }

    // Ab hier ist der Editor vorübergehend leer – Auto-Saves müssen warten,
    // bis der neue Stand vollständig geladen ist.
    isRestoring = true
    clearEditorState()
    currentBspId.value = bspId
    localStorage.setItem('bsp-active-id', bspId)
    await loadBspState(bspId)
    activeView.value = 'editor'
  }

  function createNewBsp(name?: string): string {
    if (currentBspId.value) {
      flushPendingSaves()
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
    // Ein frisch angelegtes BSP startet bewusst leer – eine evtl. bestehende
    // Sperre aus einem früheren Ladefehler betrifft es nicht.
    savesBlocked = false
    activeView.value = 'editor'
    return id
  }

  async function deleteBsp(bspId: string): Promise<void> {
    localStorage.removeItem(lsKey(bspId))
    try {
      await idbDelete(STATE_STORE, bspId)
    } catch {}

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
      await idbDelete(STATE_STORE, bspId)
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
        if (currentBspId.value && activeView.value === 'editor' && !isRestoring && !savesBlocked) {
          saveAll()
        }
      },
      { deep: true },
    )

    window.addEventListener('beforeunload', () => {
      const bspId = currentBspId.value
      if (!bspId || isRestoring || savesBlocked) return
      flushPendingSaves()
      // IndexedDB-Schreibvorgänge beim Entladen können abgebrochen werden.
      // Deshalb zusätzlich synchron nach localStorage – beim nächsten Laden
      // gewinnt der neuere Stand und wird zurück nach IndexedDB migriert.
      try {
        localStorage.setItem(lsKey(bspId), JSON.stringify(buildStateSnapshot()))
      } catch {}
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && currentBspId.value) flushPendingSaves()
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
