import type { LlmSettings } from '~/types'

const STORAGE_KEY = 'bsp-llm-settings'

function defaultSettings(): LlmSettings {
  return {
    provider: 'none',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'gemma-4-E4B',
    openaiApiKey: '',
    openaiModel: 'gpt-5-luna',
    openaiReasoningEffort: 'medium',
  }
}

const settings = ref<LlmSettings>(defaultSettings())
let hydrated = false

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

/** Entfernt einen abschließenden Slash, damit Pfade eindeutig zusammengesetzt werden. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Relative Pfade (/ollama) bleiben same-origin; absolute URLs unverändert. */
export function resolveOllamaBaseUrl(base: string): string {
  return normalizeBaseUrl(base)
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

function isPrivateNetworkHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  return false
}

function ollamaUrlHostname(url: string): string | null {
  if (url.startsWith('/')) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * Browser-Netzwerkfehler (TypeError/NetworkError) einordnen. Der Browser gibt
 * Mixed Content, Private Network Access und CORS oft nur als NetworkError preis.
 */
export function describeOllamaFetchFailure(target: string, phase: 'get' | 'post' = 'get'): string {
  const pageOrigin = typeof location !== 'undefined' ? location.origin : ''
  const pageHost = typeof location !== 'undefined' ? location.hostname : ''

  if (target.startsWith('/')) {
    return `${target} antwortet nicht korrekt. Ist OLLAMA_UPSTREAM gesetzt und der Container neu gestartet? Ohne Proxy liefert nginx die App-Seite statt Ollama-JSON.`
  }

  if (isHttpsPage() && isHttpUrl(target)) {
    return `${target} ist per HTTP erreichbar, diese Seite läuft aber über HTTPS. Der Browser blockiert das als unsicheren Inhalt (Mixed Content). Ollama hinter HTTPS bereitstellen oder in den Einstellungen die Proxy-URL /ollama nutzen.`
  }

  const ollamaHost = ollamaUrlHostname(target)
  if (ollamaHost && isPrivateNetworkHost(ollamaHost) && pageHost && !isPrivateNetworkHost(pageHost)) {
    return `Der Browser blockiert direkte Aufrufe von „${pageOrigin}“ zu privaten Adressen wie ${target} (Private Network Access). Statt der LAN-IP /ollama eintragen und auf dem Server OLLAMA_UPSTREAM setzen – oder OpenAI nutzen.`
  }

  if (phase === 'post') {
    return `Ollama blockiert Schreibanfragen aus dem Browser. Auf dem Ollama-Host OLLAMA_ORIGINS setzen, etwa OLLAMA_ORIGINS=*, und den Dienst neu starten.`
  }

  return `${target} war nicht erreichbar. Prüfe Host, Port, Firewall und ob Ollama lauscht (OLLAMA_HOST=0.0.0.0:11434).`
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
    if (next) settings.value = { ...next }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('LLM-Einstellungen konnten nicht gespeichert werden:', e)
    }
  }

  const isConfigured = computed(() => {
    const s = settings.value
    if (s.provider === 'ollama') return resolveOllamaBaseUrl(s.ollamaBaseUrl).length > 0 && s.ollamaModel.trim().length > 0
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
        const base = resolveOllamaBaseUrl(candidate.ollamaBaseUrl)
        if (!base) return { ok: false, message: 'Bitte eine Ollama-URL angeben.' }

        const res = await fetch(`${base}/api/tags`)
        if (!res.ok) {
          if (base.startsWith('/') && (res.status === 502 || res.status === 504)) {
            return {
              ok: false,
              message: `Ollama-Proxy unter ${base} erreicht kein Ollama (${res.status}). Prüfe: (1) Ollama läuft auf dem in .env gesetzten OLLAMA_UPSTREAM, (2) dort OLLAMA_HOST=0.0.0.0:11434, (3) nach .env-Änderung „docker compose up -d“ ausführen.`,
            }
          }
          return { ok: false, message: `Ollama antwortete mit HTTP ${res.status}.` }
        }
        const contentType = res.headers.get('content-type') ?? ''
        if (!contentType.includes('json')) {
          return {
            ok: false,
            message: base.startsWith('/')
              ? `Unter ${base} kam keine Ollama-Antwort (kein JSON). OLLAMA_UPSTREAM setzen, Container neu starten und URL „/ollama“ verwenden.`
              : `Unerwartete Antwort von ${base} (kein JSON).`,
          }
        }
        const data = await res.json()
        const models: string[] = (data?.models ?? []).map((m: any) => String(m?.name ?? ''))
        const model = candidate.ollamaModel.trim()
        const wanted = model.toLowerCase()
        const found = models.some((m) => {
          const name = m.toLowerCase()
          return name === wanted || name.split(':')[0] === wanted.split(':')[0]
        })
        if (!found) {
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
          showRes = await fetch(`${base}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
          })
        } catch {
          return {
            ok: false,
            message: describeOllamaFetchFailure(base, 'post'),
          }
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

        return { ok: true, message: `Verbindung steht, Modell "${model}" ist einsatzbereit.` }
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
        const base = resolveOllamaBaseUrl(candidate.ollamaBaseUrl)
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
  }
}
