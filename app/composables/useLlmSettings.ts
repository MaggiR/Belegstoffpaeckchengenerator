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
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
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
        const base = normalizeBaseUrl(candidate.ollamaBaseUrl)
        if (!base) return { ok: false, message: 'Bitte eine Ollama-URL angeben.' }

        const res = await fetch(`${base}/api/tags`)
        if (!res.ok) {
          return { ok: false, message: `Ollama antwortete mit HTTP ${res.status}.` }
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
            message: `Das Modell ist installiert, aber Ollama blockiert Schreibanfragen aus dem Browser. Setze auf dem Ollama-Host OLLAMA_ORIGINS, etwa OLLAMA_ORIGINS=*, und starte den Dienst neu.`,
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
      return {
        ok: false,
        message: `Verbindung fehlgeschlagen: ${e?.message || 'unbekannter Fehler'}. Bei Ollama muss OLLAMA_ORIGINS den Browser-Zugriff erlauben.`,
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
