import type { DocumentExtraction, DocumentFile, LlmProvider, LlmSettings } from '~/types'
import { parseDocumentKind } from '~/types'

/**
 * Vision-Modelle brauchen auf CPU-Hardware leicht mehrere Minuten pro Beleg,
 * und der erste Beleg zahlt zusätzlich die Ladezeit des Modells. Der Wert liegt
 * knapp unter dem `proxy_read_timeout` der nginx.conf (300 s): so bricht der
 * Browser zuerst ab und zeigt seine Meldung statt eines Proxy-504.
 */
const REQUEST_TIMEOUT_MS = 270_000
const MAX_PAGE_IMAGES = 8
/** Zielhöhe für gerenderte PDF-Seiten (Breite proportional). Entspricht Bild-Belegen. */
const PAGE_RENDER_HEIGHT = 1980
/**
 * Alle Felder sind Strings statt Union-Typen wie ["string", "null"]: die
 * Schema-Umsetzung von Ollama unterstützt Typ-Unions nicht zuverlässig, und
 * ein leerer String lässt sich beim Normalisieren genauso als "unbekannt"
 * behandeln.
 */
const SCHEMA_PROPERTIES = {
  title: { type: 'string' },
  correspondent: { type: 'string' },
  documentDate: { type: 'string' },
  totalAmount: { type: 'string' },
  documentKind: { type: 'string' },
}

const SCHEMA_REQUIRED = ['title', 'correspondent', 'documentDate', 'totalAmount', 'documentKind']

/** Ollama wandelt das Schema in eine Grammatik um und verträgt dabei kein `additionalProperties`. */
const OLLAMA_SCHEMA = {
  type: 'object',
  properties: SCHEMA_PROPERTIES,
  required: SCHEMA_REQUIRED,
}

/** Der strikte Modus von OpenAI verlangt umgekehrt genau dieses Feld. */
const OPENAI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: SCHEMA_PROPERTIES,
  required: SCHEMA_REQUIRED,
}

function buildPrompt(organizationName: string): string {
  const org = organizationName.trim()
  const audience = org
    ? `der Parteigliederung „${org}“`
    : 'eines politischen Verbands'
  const audienceHint = org
    ? ` vom ${org}`
    : ' des politischen Verbands'

  return `Du analysierst einen Buchungsbeleg (Rechnung, Quittung, Antrag, Vertrag o. ä.) für die Buchhaltung ${audience}.

Extrahiere genau diese fünf Felder:

1. "documentKind": Der Typ des Belegs. Genau einer dieser Werte: "Rechnung/Quittung", "Kontoauszug", "Rückerstattungsantrag", "Vertrag", "Sonstige". Dieses Feld ist PFLICHT. Bei Unsicherheit "Sonstige".
2. "title": Ein kurzer, sprechender Titel für den INHALT des Belegs, 1 bis 4 Wörter, ohne Firmennamen und ohne Datum. Beispiele: "Wahlkampfflyer", "Rückerstattungsantrag Müller", "Cloud-Hosting", "Raummiete Orangerie", "Kontoauszug Sparkasse". Dieses Feld ist PFLICHT und darf niemals leer sein. Wenn der Inhalt unklar ist, wähle den plausibelsten allgemeinen Begriff.
3. "correspondent": Der Aussteller des Belegs bzw. der Geschäftspartner${audienceHint} (Firma oder Person). Bei einer Rechnung immer der Rechnungssteller, nicht der Empfänger. Handelt es sich um einen Rückerstattungsantrag, dann ist der Geschäftspartner die Person, die den Antrag gestellt hat. Nur setzen, wenn eindeutig erkennbar, sonst leerer String.
4. "documentDate": Das Datum des Belegs (Rechnungsdatum, Belegdatum, Quittungsdatum) im Format YYYY-MM-DD. Nicht das Fälligkeits-, Liefer- oder Zahlungsdatum. Nur setzen, wenn eindeutig erkennbar, sonst leerer String.
5. "totalAmount": Der Gesamtbetrag bzw. Endbetrag des Belegs als positive Zahl mit Punkt als Dezimaltrennzeichen, zum Beispiel "1234.56". Nur setzen, wenn es KEIN Kontoauszug ist und eindeutig EIN Gesamtbetrag erkennbar ist. Bei mehreren möglichen Gesamtbeträgen, unklaren Teilbeträgen oder gar keinem Betrag: leerer String.

Grundregel: Lieber ein leeres Feld als ein geratener Wert. Nur Titel und Belegtyp müssen immer gesetzt werden. Halte dich stets an die Namen, Bezeichnungen und Eigenschreibweisen aus dem Dokument.

Antworte ausschließlich mit einem JSON-Objekt mit genau diesen fünf Schlüsseln.`
}

const queued = ref<string[]>([])
const activeDocIds = ref<string[]>([])
/** Controller der laufenden Anfragen, damit ein Abbruch sie wirklich beendet. */
const activeControllers = new Map<string, AbortController>()
/** Vom Nutzer abgebrochene Belege – ihr AbortError ist kein Fehler. */
const cancelledDocIds = new Set<string>()
const batchTotal = ref(0)
const batchCompleted = ref(0)
/** Noch nicht eingereihte Plätze einer angekündigten Upload-/Analysewelle. */
let batchPrecount = 0
/**
 * Gleichzeitige Beleganalysen je Anbieter.
 *
 * Der Ollama-Wert darf OLLAMA_NUM_PARALLEL des Servers nicht überschreiten
 * (dort: 2). Überzählige Anfragen bringen keinen Durchsatz, sondern warten in
 * der Warteschlange von Ollama. Da wir mit `stream: false` arbeiten, fließt
 * bis zum Ende der Generierung kein einziges Byte – ein Proxy davor sieht
 * also Wartezeit plus Rechenzeit als eine einzige Lesepause und bricht ab.
 * OpenAI verträgt dagegen mehrere Anfragen gleichzeitig.
 */
const MAX_CONCURRENT_EXTRACTIONS: Record<LlmProvider, number> = {
  ollama: 6,
  openai: 4,
}

export function fallbackTitleFromName(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, '')
  return withoutExtension.trim() || name || 'Unbenannter Beleg'
}

/** Entfernt Markdown-Codefences, die manche Modelle trotz Schema-Vorgabe liefern. */
function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
}

function parseAmount(value: unknown): number | null {
  let num: number | null = null

  if (typeof value === 'number') {
    num = value
  } else if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,-]/g, '').trim()
    if (!cleaned) return null
    // Deutsches Format (1.234,56) vom englischen (1,234.56) unterscheiden
    const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
    const parsed = Number.parseFloat(normalized)
    num = Number.isFinite(parsed) ? parsed : null
  }

  if (num === null || !Number.isFinite(num)) return null
  const abs = Math.abs(num)
  if (abs <= 0 || abs >= 10_000_000) return null
  return Math.round(abs * 100) / 100
}

function parseDocumentDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  let year: number
  let month: number
  let day: number

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const german = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)

  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (german) {
    day = Number(german[1]); month = Number(german[2]); year = Number(german[3])
  } else {
    return null
  }

  const date = new Date(year, month - 1, day)
  const roundTrips = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  const plausible = year >= 1990 && year <= new Date().getFullYear() + 1
  if (!roundTrips || !plausible) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed === '-') return null
  return trimmed.slice(0, maxLength)
}

export function normalizeExtraction(raw: any, fallbackTitle: string): DocumentExtraction {
  return {
    title: normalizeText(raw?.title, 80) ?? fallbackTitle,
    correspondent: normalizeText(raw?.correspondent, 120),
    documentDate: parseDocumentDate(raw?.documentDate),
    totalAmount: parseAmount(raw?.totalAmount),
    documentKind: parseDocumentKind(raw?.documentKind) ?? 'other',
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, controller: AbortController): Promise<Response> {
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Übersetzt einen fehlgeschlagenen fetch in eine Meldung, mit der man etwas
 * anfangen kann. `TypeError` ist der einzige Hinweis, den der Browser bei
 * einer blockierten CORS-Anfrage herausgibt – der Grund selbst bleibt
 * absichtlich verborgen.
 */
function describeNetworkFailure(e: any, provider: 'Ollama' | 'OpenAI', target: string): string {
  if (e?.name === 'AbortError') {
    return `${provider} hat nach ${Math.round(REQUEST_TIMEOUT_MS / 1000)} Sekunden nicht geantwortet. Bei großen Modellen auf CPU kann eine Seite länger dauern.`
  }
  if (e instanceof TypeError) {
    if (provider === 'Ollama') {
      return describeOllamaFetchFailure(target, 'post')
    }
    return `${target} war nicht erreichbar. Prüfe die Internetverbindung.`
  }
  return `${provider}-Aufruf fehlgeschlagen: ${e?.message || 'unbekannter Fehler'}`
}

/**
 * Proxys wie nginx/OpenResty antworten mit einer HTML-Fehlerseite. Ungefiltert
 * landet dieses Markup in der Oberfläche, deshalb bleibt nur der Text übrig.
 */
function stripHtml(raw: string): string {
  if (!/<\/?(?:html|head|body|title|center|h1|hr|pre|p)\b/i.test(raw)) return raw
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Holt die Fehlerbeschreibung aus dem Antwortkörper als Rohtext, soweit vorhanden. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text)
      const message = parsed?.error?.message ?? parsed?.error ?? parsed?.message
      if (typeof message === 'string' && message.trim()) return message.trim()
    } catch {}
    return stripHtml(text.trim())
  } catch {
    return ''
  }
}

function detailSuffix(raw: string): string {
  return raw ? ` – ${raw.slice(0, 300)}` : ''
}

const MEMORY_ERROR_PATTERNS = [
  /out of memory/i,
  /\boom\b/i,
  /cuda[_ ]?malloc/i,
  /hip[_ ]?malloc/i,
  /failed to allocate/i,
  /cannot allocate/i,
  /ggml_gallocr/i,
  /ggml_backend_buffer/i,
  /not enough (?:free )?(?:memory|space)/i,
  /requires more system memory/i,
  /insufficient memory/i,
  /no memory/i,
]

/**
 * Speichermangel im Model-Runner ist der häufigste 500er bei Vision-Modellen:
 * mehrere hochauflösende Seitenbilder lassen den Grafikspeicher überlaufen.
 * Der rohe GGML-/CUDA-Text ist für Nutzer unbrauchbar, daher eine eigene Meldung.
 */
function describeModelMemoryFailure(raw: string, model: string, pageCount: number): string | null {
  if (!raw || !MEMORY_ERROR_PATTERNS.some(pattern => pattern.test(raw))) return null

  const pages = pageCount === 1
    ? 'ein Seitenbild'
    : `${pageCount} Seitenbilder`
  return `Dem Ollama-Server ist der Grafikspeicher ausgegangen, während "${model}" den Beleg mit ${pages} verarbeitet hat. `
    + 'Abhilfe auf dem Server: andere Modelle entladen, ein kleineres bzw. stärker quantisiertes Vision-Modell verwenden '
    + 'oder das Kontextfenster verkleinern. Danach lässt sich der Beleg erneut analysieren.'
}

function buildUserText(fileName: string, organizationName: string): string {
  const org = organizationName.trim()
  const orgBlock = org ? `Parteigliederung: ${org}\n\n` : ''
  return `${buildPrompt(org)}\n\n${orgBlock}Dateiname: ${fileName}\n\nBeurteile den Beleg anhand der mitgelieferten Seitenbilder.`
}

async function callOllama(
  settings: LlmSettings,
  text: string,
  dataUrls: string[],
  controller: AbortController,
): Promise<string> {
  const configured = settings.ollamaBaseUrl
  const model = settings.ollamaModel.trim()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()

  let res: Response
  let errorMessage: string | null = null
  try {
    const body: Record<string, unknown> = {
      model,
      stream: false,
      format: OLLAMA_SCHEMA,
      options: { temperature: 0 },
      messages: [{
        role: 'user',
        content: text,
        // Ollama erwartet reines Base64 ohne data:-Präfix
        images: dataUrls.map(url => url.replace(/^data:[^;]+;base64,/, '')),
      }],
    }
    const effort = settings.ollamaReasoningEffort
    if (effort) body.think = effort

    const send = (payload: Record<string, unknown>) => fetchOllama(configured, '/api/chat', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, settings.ollamaBearerToken ?? '')

    res = await send(body)
    if (!res.ok && effort && (res.status === 400 || res.status === 422 || res.status === 500)) {
      // Body nur hier lesen, damit der zweite Versuch die Seitenbilder nicht
      // umsonst erneut hochlädt, wenn "think" gar nicht das Problem war.
      errorMessage = await readErrorMessage(res)
      if (/think/i.test(errorMessage)) {
        const { think: _ignored, ...withoutThink } = body
        res = await send(withoutThink)
        errorMessage = null
      }
    }
  } catch (e) {
    throw new Error(describeNetworkFailure(e, 'Ollama', configured))
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const raw = errorMessage ?? await readErrorMessage(res)
    const detail = detailSuffix(raw)
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Ollama hat den Bearer-Token abgelehnt (HTTP ${res.status}).${detail}`)
    }
    if (res.status === 404) {
      throw new Error(`Ollama kennt das Modell "${model}" nicht (HTTP 404). Mit "ollama pull ${model}" laden oder den Namen in den Einstellungen anpassen.${detail}`)
    }
    if (res.status === 504 || res.status === 408 || res.status === 524) {
      // Unser eigener Proxy markiert seine Antworten, sonst kommt der Abbruch
      // von einem Auth-Proxy vor Ollama – die Stellschraube liegt jeweils anders.
      const fromAppProxy = res.headers.get('X-App-Proxy') === '1'
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      const culprit = fromAppProxy
        ? 'Abgebrochen hat der App-Proxy dieser Anwendung (nginx.conf)'
        : 'Abgebrochen hat ein Auth-Proxy vor Ollama (dessen eigene Konfiguration)'
      // Eine Abbruchzeit im Sekundenbereich stammt aus proxy_connect_timeout,
      // nicht aus proxy_read_timeout – dann ist das Ziel gar nicht erreichbar.
      const hint = seconds <= 30
        ? 'So früh greift kein Lese-Timeout: hier scheitert bereits der Verbindungsaufbau zum Ziel ("proxy_connect_timeout"). '
          + 'Prüfe, ob der Proxy-Container die Ollama-Adresse überhaupt auflösen und erreichen kann – ein Direktzugriff aus dem Browser sagt darüber nichts aus.'
        : 'Das Modell rechnet länger als der Proxy wartet ("proxy_read_timeout"). Da die Antwort unstreamed übertragen wird, '
          + 'muss dieser Wert die komplette Rechenzeit abdecken – inklusive Modell-Ladezeit beim ersten Beleg.'
      throw new Error(
        `Zeitüberschreitung nach ${seconds} s (HTTP ${res.status}), bevor "${model}" fertig war. ${culprit}. ${hint}`,
      )
    }
    const memoryFailure = describeModelMemoryFailure(raw, model, dataUrls.length)
    if (memoryFailure) throw new Error(memoryFailure)
    throw new Error(`Ollama antwortete mit HTTP ${res.status}${detail}`)
  }

  const data = await res.json()
  if (typeof data?.error === 'string' && data.error.trim()) {
    const raw = data.error.trim()
    const memoryFailure = describeModelMemoryFailure(raw, model, dataUrls.length)
    throw new Error(memoryFailure ?? `Ollama meldet: ${raw.slice(0, 300)}`)
  }
  const content = data?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama lieferte eine leere Antwort. Unterstützt das gewählte Modell Bildeingaben?')
  }
  return content
}

async function callOpenAi(
  settings: LlmSettings,
  text: string,
  dataUrls: string[],
  controller: AbortController,
): Promise<string> {
  const body: Record<string, any> = {
    model: settings.openaiModel.trim(),
    reasoning_effort: settings.openaiReasoningEffort,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'beleg_extraktion', strict: true, schema: OPENAI_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text },
        ...dataUrls.map(url => ({ type: 'image_url', image_url: { url } })),
      ],
    }],
  }

  const send = async (payload: Record<string, any>) => fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
    },
    body: JSON.stringify(payload),
  }, controller)

  let res: Response
  try {
    res = await send(body)
    if (res.status === 400) {
      // Nicht jedes Modell akzeptiert reasoning_effort – ohne den Parameter erneut versuchen.
      const { reasoning_effort: _ignored, ...withoutEffort } = body
      res = await send(withoutEffort)
    }
  } catch (e) {
    throw new Error(describeNetworkFailure(e, 'OpenAI', 'api.openai.com'))
  }

  if (!res.ok) {
    const detail = detailSuffix(await readErrorMessage(res))
    if (res.status === 401) {
      throw new Error(`OpenAI hat den API-Key abgelehnt (HTTP 401).${detail}`)
    }
    if (res.status === 429) {
      throw new Error(`OpenAI hat die Anfrage wegen Ratenbegrenzung oder fehlendem Guthaben abgewiesen (HTTP 429).${detail}`)
    }
    throw new Error(`OpenAI antwortete mit HTTP ${res.status}${detail}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI lieferte eine leere Antwort.')
  }
  return content
}

export function useDocumentExtraction() {
  const { documents, updateDocument } = useAppState()
  const { settings, isConfigured } = useLlmSettings()
  const { loadPdf, generateThumbnail } = usePdfUtils()

  /** Bis zu acht Seiten als JPEG-DataURLs. Bei Bildern das Bild selbst, verkleinert. */
  async function collectPageImages(doc: DocumentFile): Promise<string[]> {
    if (doc.type === 'image') {
      try {
        return [await generateThumbnail(doc.file, 1400, PAGE_RENDER_HEIGHT)]
      } catch {
        return []
      }
    }

    let handle: Awaited<ReturnType<typeof loadPdf>> | null = null
    try {
      handle = await loadPdf(doc.file, doc.password)
      const pageCount = Math.min(handle.numPages, MAX_PAGE_IMAGES)
      const images: string[] = []
      for (let page = 1; page <= pageCount; page++) {
        const { height } = await handle.pageDimensions(page, 1)
        const scale = PAGE_RENDER_HEIGHT / height
        images.push(await handle.renderPage(page, scale))
      }
      return images
    } catch {
      return doc.thumbnailDataUrl ? [doc.thumbnailDataUrl] : []
    } finally {
      if (handle) {
        try { handle.destroy() } catch {}
      }
    }
  }

  async function extractFromDocument(doc: DocumentFile, controller: AbortController): Promise<DocumentExtraction> {
    const images = await collectPageImages(doc)
    // Das Rendern der Seiten lässt sich nicht unterbrechen; danach aber schon.
    if (controller.signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
    if (images.length === 0) {
      throw new Error('Der Beleg ließ sich nicht als Seitenbild lesen.')
    }

    const text = buildUserText(doc.name, settings.value.organizationName ?? '')

    const content = settings.value.provider === 'openai'
      ? await callOpenAi(settings.value, text, images, controller)
      : await callOllama(settings.value, text, images, controller)

    let parsed: any
    try {
      parsed = JSON.parse(stripCodeFences(content))
    } catch {
      throw new Error(`Antwort des Modells war kein gültiges JSON: ${content.trim().slice(0, 200)}`)
    }
    return normalizeExtraction(parsed, fallbackTitleFromName(doc.name))
  }

  async function runFor(docId: string): Promise<void> {
    const doc = documents.value.find(d => d.id === docId)
    if (!doc) return

    if (!isConfigured.value) {
      updateDocument(docId, { extractionStatus: 'skipped', extractionError: undefined })
      return
    }
    if (doc.locked) {
      updateDocument(docId, {
        extractionStatus: 'skipped',
        extractionError: 'Beleg ist passwortgeschützt und wurde nicht analysiert.',
      })
      return
    }

    updateDocument(docId, { extractionStatus: 'running', extractionError: undefined })
    const controller = new AbortController()
    activeControllers.set(docId, controller)
    try {
      const result = await extractFromDocument(doc, controller)
      updateDocument(docId, {
        title: result.title,
        correspondent: result.correspondent,
        documentDate: result.documentDate,
        totalAmount: result.totalAmount,
        documentKind: result.documentKind,
        extractionStatus: 'done',
        extractionError: undefined,
      })
    } catch (e: any) {
      // Abbruch durch den Nutzer: einmal erfolgreich ausgewertete Belege behalten
      // ihren Stand, alle anderen gelten wieder als nicht analysiert.
      if (cancelledDocIds.has(docId)) {
        const current = documents.value.find(d => d.id === docId)
        updateDocument(docId, {
          extractionStatus: current?.analyzed ? 'done' : 'pending',
          extractionError: undefined,
        })
      } else {
        console.warn(`Beleganalyse fehlgeschlagen für "${doc.name}":`, e)
        updateDocument(docId, {
          extractionStatus: 'failed',
          extractionError: e?.message || 'Analyse fehlgeschlagen',
        })
      }
    } finally {
      activeControllers.delete(docId)
      cancelledDocIds.delete(docId)
    }
  }

  async function pump(): Promise<void> {
    const limit = MAX_CONCURRENT_EXTRACTIONS[settings.value.provider] ?? 1
    while (queued.value.length > 0 && activeDocIds.value.length < limit) {
      const next = queued.value.shift()!
      activeDocIds.value = [...activeDocIds.value, next]
      void runWorker(next)
    }
  }

  async function runWorker(docId: string): Promise<void> {
    try {
      await runFor(docId)
    } finally {
      batchCompleted.value++
      activeDocIds.value = activeDocIds.value.filter(id => id !== docId)
      if (queued.value.length === 0 && activeDocIds.value.length === 0 && batchPrecount === 0) {
        batchTotal.value = 0
        batchCompleted.value = 0
      } else {
        void pump()
      }
    }
  }

  /**
   * Kündigt an, dass als Nächstes `count` Belege eingereiht werden.
   * Hält den Fortschrittsbalken offen, bis alle Belege der Welle eingereiht sind.
   */
  function beginExtractionBatch(count: number): void {
    if (count <= 0) return
    const idle = queued.value.length === 0 && activeDocIds.value.length === 0 && batchPrecount === 0
    if (idle) {
      batchTotal.value = 0
      batchCompleted.value = 0
    }
    batchPrecount += count
    batchTotal.value += count
  }

  function endExtractionBatch(): void {
    if (batchPrecount <= 0) {
      batchPrecount = 0
      return
    }
    batchTotal.value = Math.max(
      batchCompleted.value + queued.value.length + activeDocIds.value.length,
      batchTotal.value - batchPrecount,
    )
    batchPrecount = 0
    if (queued.value.length === 0 && activeDocIds.value.length === 0) {
      batchTotal.value = 0
      batchCompleted.value = 0
    }
  }

  /** Reiht einen Beleg zur Analyse ein. Mehrfachaufrufe für denselben Beleg sind unschädlich. */
  function queueExtraction(docId: string): void {
    if (activeDocIds.value.includes(docId) || queued.value.includes(docId)) return
    queued.value.push(docId)
    if (batchPrecount > 0) batchPrecount--
    else batchTotal.value++
    void pump()
  }

  /**
   * Bricht die laufende Analyse ab: die Warteschlange wird geleert und die
   * offenen Anfragen werden abgebrochen. Einmal ausgewertete Belege behalten
   * ihren Stand; nur noch nie ausgewertete gelten danach als nicht analysiert.
   */
  function cancelExtractions(): void {
    for (const docId of queued.value) {
      const doc = documents.value.find(d => d.id === docId)
      updateDocument(docId, {
        extractionStatus: doc?.analyzed ? 'done' : 'pending',
        extractionError: undefined,
      })
    }
    queued.value = []
    batchPrecount = 0

    for (const [docId, controller] of activeControllers) {
      cancelledDocIds.add(docId)
      controller.abort()
    }

    batchTotal.value = 0
    batchCompleted.value = 0
  }

  function queueMissing(): void {
    for (const doc of documents.value) {
      if (doc.extractionStatus === 'done' || doc.extractionStatus === 'running') continue
      queueExtraction(doc.id)
    }
  }

  /** Stellt alle Belege erneut in die Analyse-Warteschlange (außer laufende und gesperrte). */
  function queueReanalyzeAll(): void {
    if (!isConfigured.value) return
    for (const doc of documents.value) {
      if (doc.extractionStatus === 'running' || doc.locked) continue
      queueExtraction(doc.id)
    }
  }

  const isExtracting = computed(() => activeDocIds.value.length > 0)
  const pendingExtractions = computed(() => queued.value.length + activeDocIds.value.length)
  const extractionProgressPercent = computed(() =>
    batchTotal.value > 0 ? Math.round((batchCompleted.value / batchTotal.value) * 100) : 0,
  )

  return {
    queueExtraction,
    queueMissing,
    queueReanalyzeAll,
    cancelExtractions,
    beginExtractionBatch,
    endExtractionBatch,
    activeDocId: computed(() => activeDocIds.value[0] ?? null),
    isExtracting,
    pendingExtractions,
    queued,
    batchTotal,
    batchCompleted,
    extractionProgressPercent,
  }
}
