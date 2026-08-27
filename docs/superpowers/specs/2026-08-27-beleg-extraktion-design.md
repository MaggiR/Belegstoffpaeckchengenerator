# Beleg-Extraktion und Überarbeitung der Belege-Einbindung

Datum: 2026-08-27

## Ziel

Belege werden beim Hochladen nicht nur per OCR gelesen, sondern über ein LLM
strukturiert ausgewertet. Die Belege-Seitenleiste wird auf diese Felder
umgestellt, mehrere Belege pro Buchung werden möglich, und die Auto-Zuordnung
wird auf Basis der neuen Felder neu gebaut.

## 1. LLM-Provider und Einstellungen

Die Konfiguration erfolgt zur Laufzeit über ein Einstellungs-Modal (Zahnrad im
`AppHeader`), nicht über `.env`. Persistenz in `localStorage` unter
`bsp-llm-settings`, global statt pro BSP.

| Feld | Bedeutung |
| --- | --- |
| `provider` | `none` \| `ollama` \| `openai` |
| `ollamaBaseUrl` | z. B. `http://localhost:11434` |
| `ollamaModel` | Default `gemma-4-E4B` |
| `openaiApiKey` | Bearer-Token |
| `openaiModel` | Default `gpt-5-luna` |
| `openaiReasoningEffort` | `minimal` \| `low` \| `medium` \| `high` |

Ein „Verbindung testen"-Knopf prüft die Erreichbarkeit und meldet bei Ollama,
ob das gewählte Modell vorhanden ist.

Bekannte Einschränkungen, die aus dem serverlosen Aufbau folgen:

- Ollama muss `OLLAMA_ORIGINS` gesetzt haben, sonst blockiert der Browser den
  Aufruf per CORS.
- Der OpenAI-Key liegt im Browser-Storage, da kein Server existiert, der ihn
  verbergen könnte.

## 2. Extraktion

`useDocumentExtraction()` erhält pro Beleg den OCR-Text sowie die ersten zwei
Seiten als JPEG (bei Bildern das Bild selbst) und fordert ein festes
JSON-Schema an — bei Ollama über `format`, bei OpenAI über `response_format`
mit `json_schema`.

Extrahierte Felder:

- `title` — Pflichtfeld, kurzes Schlagwort (z. B. „Wahlkampfflyer")
- `correspondent` — Aussteller/Empfänger, sonst `null`
- `documentDate` — ISO-Datum `YYYY-MM-DD`, sonst `null`
- `totalAmount` — positive Zahl, sonst `null`

Der Prompt weist an, Felder bei Unsicherheit leer zu lassen. Die Antwort wird
validiert, bevor sie ins Modell übernommen wird: Datum muss parsebar und
plausibel sein, Betrag eine positive Zahl. Fehlt der Titel, greift der
Dateiname ohne Endung als Fallback.

`DocumentFile` wächst um `title`, `correspondent`, `documentDate`,
`totalAmount`, `extractionStatus` (`pending` \| `running` \| `done` \|
`failed` \| `skipped`) und `extractionError`. Alle vier Datenfelder sind
manuell editierbar.

Die Extraktion läuft in einer sequenziellen Warteschlange nach dem
OCR-Schritt, damit der Provider nicht parallel überfahren wird. Belege
erscheinen sofort in der Liste und füllen sich nach. Ohne konfigurierten
Provider bleibt der Status `skipped`; fehlgeschlagene und übersprungene Belege
lassen sich per Klick nachträglich analysieren.

## 3. Mehrere Belege pro Buchung

`Booking.documentId: string | null` wird zu `documentIds: string[]`. Beim Laden
alter Zustände wandelt `deserializeBookings` ein vorhandenes `documentId` in ein
einelementiges Array, sodass bestehende BSPs nutzbar bleiben.

Ein Beleg gehört zu höchstens einer Buchung: beim Zuordnen wird er aus allen
anderen Buchungen entfernt.

In der Buchungszeile wird der erste Beleg voll dargestellt, weitere über einen
aufklappbaren „+N weitere"-Chip.

## 4. Belege-Seitenleiste

Die globalen Aktionen (`Nachladen`, `Auto-Zuordnung`, `Alle lösen`) wandern in
die Toolbar der Buchungsspalte. Die Seitenleiste erhält stattdessen:

- Freitext-Suche über Titel, Korrespondent, Dateiname und OCR-Text
- Sortierung nach Belegdatum, Titel, Korrespondent, Betrag oder Dateiname mit
  Richtungsumschalter
- Karten mit Thumbnail, Titel, Korrespondent sowie Datum und Betrag
- Löschen nur als Hover-Icon, damit kein dauerhafter Platz belegt wird

## 5. Auto-Zuordnung

Der bisherige Algorithmus wird ersetzt. Grundlage sind die LLM-Felder, die
Regex-Extraktion aus dem OCR-Text dient als Fallback für leere Felder.

- Harte Bedingung: ein Belegdatum darf nicht nach dem Buchungsdatum liegen.
- Voraussetzung: Betragsübereinstimmung auf den Cent.
- Entscheidend bei mehreren Kandidaten: zeitliche Nähe zur Buchung.
- Boni: Korrespondent-Treffer im Buchungstext, geteilte Referenznummern,
  Werte aus dem LLM statt aus Regex.

Die Zuweisung erfolgt global über alle Paare nach Punktzahl absteigend, jeder
Beleg und jede Buchung höchstens einmal. Das löst die Verwechslung monatlich
wiederkehrender Belege mit identischem Betrag.

## 6. Farben und Export

Alle `green-*`-Töne werden auf `emerald-*` vereinheitlicht, also auf das Grün
der geprüften Buchungen.

Der Export-Dateiname nach BSP-Namen ist bereits implementiert und wird nur
gegengeprüft. Der Export selbst berücksichtigt künftig alle Belege einer
Buchung in Reihenfolge.

## Umsetzungsreihenfolge

1. Datenmodell und Migration
2. Einstellungen und Extraktion
3. Seitenleiste und Buchungszeile
4. Auto-Zuordnung
5. Farben und Export
