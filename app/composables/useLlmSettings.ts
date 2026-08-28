import type { LlmSettings } from '~/types'

const STORAGE_KEY = 'bsp-llm-settings'

type OllamaRoute = 'direct' | 'proxy'

function defaultSettings(): LlmSettings {
  return {
    provider: 'none',
    organizationName: '',
    ollamaBaseUrl: 'http://192.168.178.187:11434',
    ollamaModel: 'gemma-4-E4B',
    ollamaBearerToken: '',
    ollamaReasoningEffort: '',
    openaiApiKey: '',
    openaiModel: 'gpt-5-luna',
    openaiReasoningEffort: 'medium',
  }
}

const settings = ref<LlmSettings>(defaultSettings())
let hydrated = false
/** Welche Route zuletzt funktioniert hat – Direct zuerst, Proxy nur als Fallback. */
const ollamaRoute = ref<OllamaRoute | null>(null)

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

export interface OllamaModelListResult {
  ok: boolean
  models: string[]
  message?: string
}

function parseOllamaModelNames(data: unknown): string[] {
  const models = (data as { models?: Array<{ name?: string }> })?.models ?? []
  const names = models.map(m => String(m?.name ?? '').trim()).filter(Boolean)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'de'))
}

export function ollamaModelIsListed(models: string[], model: string): boolean {
  const wanted = model.trim().toLowerCase()
  if (!wanted) return false
  return models.some((name) => {
    const n = name.toLowerCase()
    return n === wanted || n.split(':')[0] === wanted.split(':')[0]
  })
}

export function pickOllamaModel(models: string[], current: string): string {
  if (!models.length) return ''
  const wanted = current.trim().toLowerCase()
  const exact = models.find(name => name.toLowerCase() === wanted)
  if (exact) return exact
  const byPrefix = models.find(name => name.toLowerCase().split(':')[0] === wanted.split(':')[0])
  if (byPrefix) return byPrefix
  return models[0]
}

export async function listOllamaModels(base: string, token = ''): Promise<OllamaModelListResult> {
  const configured = normalizeBaseUrl(base)
  if (!configured) return { ok: false, models: [], message: 'Bitte eine Ollama-URL angeben.' }

  try {
    const res = await fetchOllama(configured, '/api/tags', {}, token)
    if (res.status === 401 || res.status === 403) {
      return { ok: false, models: [], message: `Ollama hat den Bearer-Token abgelehnt (HTTP ${res.status}).` }
    }
    if (!res.ok) {
      if (res.status === 502 || res.status === 504) {
        return { ok: false, models: [], message: describeOllamaFetchFailure(configured, 'get') }
      }
      return { ok: false, models: [], message: `Ollama antwortete mit HTTP ${res.status}.` }
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
      return { ok: false, models: [], message: 'Unerwartete Antwort von Ollama (kein JSON).' }
    }
    return { ok: true, models: parseOllamaModelNames(await res.json()) }
  } catch {
    return { ok: false, models: [], message: describeOllamaFetchFailure(configured, 'get') }
  }
}

/** Entfernt einen abschließenden Slash, damit Pfade eindeutig zusammengesetzt werden. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function isHttpsPage(): boolean {
  return typeof location !== 'undefined' && location.protocol === 'https:'
}

function isHttpUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'http:'
  } catch {
    return url.trim().toLowerCase().startsWith('http://')
  }
}

function parseHttpOrigin(url: string): URL | null {
  const normalized = normalizeBaseUrl(url)
  if (!normalized || normalized.startsWith('/')) return null
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

function withPath(base: string, path: string): string {
  return `${normalizeBaseUrl(base)}${path.startsWith('/') ? path : `/${path}`}`
}

function isUsableOllamaResponse(res: Response): boolean {
  if (!res.ok) return false
  const contentType = res.headers.get('content-type') ?? ''
  return contentType.includes('json')
}

function bearerValue(token?: string): string {
  const trimmed = (token ?? '').trim()
  if (!trimmed) return ''
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : trimmed
}

export function ollamaAuthHeaders(token: string, extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra)
  const value = bearerValue(token)
  if (value) headers.set('Authorization', `Bearer ${value}`)
  return headers
}

function rememberOllamaRoute(route: OllamaRoute) {
  ollamaRoute.value = route
}

/**
 * Mit Bearer zuerst über den App-Proxy: Auth-Proxies (z. B. OpenResty) lehnen
 * die CORS-Vorabanfrage ohne Token ab, curl funktioniert trotzdem.
 * Ohne Bearer zuerst Direktzugriff, Proxy nur als Fallback.
 */
export async function fetchOllama(
  base: string,
  path: string,
  init: RequestInit = {},
  token = '',
): Promise<Response> {
  const normalized = normalizeBaseUrl(base)
  if (!normalized) throw new TypeError('Keine Ollama-URL angegeben')

  const { headers: extraHeaders, ...rest } = init
  const authHeaders = ollamaAuthHeaders(token, extraHeaders)

  if (normalized.startsWith('/')) {
    return fetch(withPath(normalized, path), { ...rest, headers: authHeaders })
  }

  const origin = parseHttpOrigin(normalized)
  if (!origin) {
    return fetch(withPath(normalized, path), { ...rest, headers: authHeaders })
  }

  const directUrl = withPath(origin.origin, path)
  const proxyUrl = withPath('/ollama', path)
  const hasToken = !!bearerValue(token)
  const preferProxy = ollamaRoute.value === 'proxy' || (ollamaRoute.value === null && hasToken)

  async function viaProxy(): Promise<Response> {
    const headers = new Headers(authHeaders)
    headers.set('X-Ollama-Upstream', origin.origin)
    const res = await fetch(proxyUrl, { ...rest, headers })
    if (isUsableOllamaResponse(res) || (res.ok && res.status < 500)) rememberOllamaRoute('proxy')
    return res
  }

  async function viaDirect(): Promise<Response> {
    const res = await fetch(directUrl, { ...rest, headers: authHeaders })
    if (isUsableOllamaResponse(res) || (res.ok && res.status < 500)) rememberOllamaRoute('direct')
    return res
  }

  if (preferProxy) {
    try {
      const proxied = await viaProxy()
      if (isUsableOllamaResponse(proxied) || proxied.status < 500) return proxied
    } catch {
      ollamaRoute.value = null
    }
    return viaDirect()
  }

  try {
    const direct = await viaDirect()
    if (direct.status < 500) return direct
  } catch {
    // Direktzugriff blockiert (CORS, Mixed Content, PNA) → Proxy.
  }

  return viaProxy()
}

/**
 * Browser-Netzwerkfehler (TypeError/NetworkError) einordnen. Der Browser gibt
 * Mixed Content, Private Network Access und CORS oft nur als NetworkError preis.
 */
export function describeOllamaFetchFailure(configuredUrl: string, phase: 'get' | 'post' = 'get'): string {
  const target = normalizeBaseUrl(configuredUrl)

  if (isHttpsPage() && isHttpUrl(target)) {
    return `${target} ist per HTTP erreichbar, diese Seite läuft aber über HTTPS. Der Browser blockiert den Direktzugriff; der App-Proxy konnte Ollama ebenfalls nicht erreichen.`
  }

  if (phase === 'post') {
    return `Weder Direktzugriff noch App-Proxy erreichen Ollama unter ${target} für Schreibanfragen.`
  }

  return `Weder Direktzugriff noch App-Proxy erreichen Ollama unter ${target}. Liegt ein Auth-Proxy davor, muss OPTIONS ohne Token erlaubt sein – oder der App-Proxy muss die Ziel-URL erreichen können.`
}

export function useLlmSettings() {
  function load(): void {
    if (hydrated || typeof localStorage === 'undefined') return
    hydrated = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      settings.value = { ...defaultSettings(), ...parsed }
    } catch {
      settings.value = defaultSettings()
    }
  }

  function save(next?: LlmSettings): void {
    if (next) {
      if (normalizeBaseUrl(next.ollamaBaseUrl) !== normalizeBaseUrl(settings.value.ollamaBaseUrl)) {
        ollamaRoute.value = null
      }
      settings.value = { ...next }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('LLM-Einstellungen konnten nicht gespeichert werden:', e)
    }
  }

  const isConfigured = computed(() => {
    const s = settings.value
    if (s.provider === 'ollama') return normalizeBaseUrl(s.ollamaBaseUrl).length > 0 && s.ollamaModel.trim().length > 0
    if (s.provider === 'openai') return s.openaiApiKey.trim().length > 0 && s.openaiModel.trim().length > 0
    return false
  })

  const providerLabel = computed(() => {
    const s = settings.value
    if (s.provider === 'ollama') return `Ollama · ${s.ollamaModel}`
    if (s.provider === 'openai') return `OpenAI · ${s.openaiModel}`
    return 'Kein Provider'
  })

  async function testConnection(candidate: LlmSettings): Promise<ConnectionTestResult> {
    if (candidate.provider === 'none') {
      return { ok: false, message: 'Kein Provider ausgewählt.' }
    }

    try {
      if (candidate.provider === 'ollama') {
        const configured = normalizeBaseUrl(candidate.ollamaBaseUrl)
        if (!configured) return { ok: false, message: 'Bitte eine Ollama-URL angeben.' }
        const token = candidate.ollamaBearerToken ?? ''
        ollamaRoute.value = null

        const listed = await listOllamaModels(configured, token)
        if (!listed.ok) {
          return { ok: false, message: listed.message ?? 'Ollama war nicht erreichbar.' }
        }
        const models = listed.models
        const model = candidate.ollamaModel.trim()
        if (!ollamaModelIsListed(models, model)) {
          return {
            ok: false,
            message: `Verbindung steht, aber das Modell "${model}" ist nicht installiert. Verfügbar: ${models.join(', ') || 'keine Modelle'}`,
          }
        }

        // Ein POST mit JSON-Inhalt löst – anders als die Modellabfrage oben –
        // eine CORS-Vorabanfrage aus. Genau daran scheitert später sonst die
        // Analyse, obwohl der Test grün aussieht.
        let showRes: Response
        try {
          showRes = await fetchOllama(configured, '/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
          }, token)
        } catch {
          return {
            ok: false,
            message: describeOllamaFetchFailure(configured, 'post'),
          }
        }
        if (showRes.status === 401 || showRes.status === 403) {
          return { ok: false, message: 'Ollama hat den Bearer-Token abgelehnt (HTTP ' + showRes.status + ').' }
        }
        if (!showRes.ok) {
          return { ok: false, message: `Abfrage der Modelldetails schlug fehl (HTTP ${showRes.status}).` }
        }

        const details = await showRes.json()
        const capabilities: string[] = Array.isArray(details?.capabilities) ? details.capabilities : []
        if (capabilities.length > 0 && !capabilities.includes('vision')) {
          return {
            ok: false,
            message: `Verbindung steht, aber "${model}" verarbeitet keine Bilder. Für die Belegauswertung werden die ersten zwei Seiten als Bild mitgesendet – bitte ein Modell mit Vision-Unterstützung wählen.`,
          }
        }

        const via = ollamaRoute.value === 'proxy' ? 'über den App-Proxy' : 'direkt aus dem Browser'
        return { ok: true, message: `Verbindung steht ${via}, Modell "${model}" ist einsatzbereit.` }
      }

      const key = candidate.openaiApiKey.trim()
      if (!key) return { ok: false, message: 'Bitte einen API-Key angeben.' }

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.status === 401) {
        return { ok: false, message: 'Der API-Key wurde abgelehnt.' }
      }
      if (!res.ok) {
        return { ok: false, message: `OpenAI antwortete mit HTTP ${res.status}.` }
      }
      return { ok: true, message: 'Verbindung zu OpenAI steht.' }
    } catch (e: any) {
      if (candidate.provider === 'ollama') {
        const base = normalizeBaseUrl(candidate.ollamaBaseUrl)
        return { ok: false, message: describeOllamaFetchFailure(base, 'get') }
      }
      return {
        ok: false,
        message: `Verbindung fehlgeschlagen: ${e?.message || 'unbekannter Fehler'}.`,
      }
    }
  }

  return {
    settings,
    load,
    save,
    isConfigured,
    providerLabel,
    testConnection,
    normalizeBaseUrl,
    defaultSettings,
    fetchOllama,
    listOllamaModels,
  }
}
