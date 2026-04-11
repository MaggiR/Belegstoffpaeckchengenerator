# Belegstoffpäckchengenerator
**Einfache Web-App zur Vereinfachung der Arbeit von FDP-Schatzmeistern**
Verfügbar unter [bsp-generator.fdp-darmstadt.de](https://bsp-generator.fdp-darmstadt.de)

Dies ist die Codebase für eine Online-Anwendung, die dabei helfen soll, möglichst einfach und schnell sogenannte **"Belegstoffpäckchen" (BSPs)** zu generieren.

BSPs sind Sammlungen von Buchhaltungsbelegen in chronologischer Reihenfolge zur digitalen Einreichung beim Liberalen Parteiservice (LiPS). Genauer ist ein BSP ein PDF, das die zu den Buchungen gehörigen Belege in Reihenfolge des Buchungsdatums enthält.

## Funktionsweise
1. **Import**: Der BSP-Generator akzeptiert eine Tabelle der Buchungen (bspw. als CSV oder Excel), zum Beispiel eine heruntergeladene Umsatzübersicht aus dem Online-Banking. Bei Bedarf kann der User bei der Erkennung der richtigen Spalten nachhelfen.
2. **Zuordnung**: Der User lädt die digitalen Belegdateien (PDFs, JPEGs, PNGs) hoch. Die Anwendung ordnet die Belege automatisch den Buchungen zu. Zuordnungsfehler oder fehlgeschlagene Zuordnungen können manuell angepasst werden. Fehlen zu manchen Buchungen die zugehörigen Belege, können diese nachträglich hochgeladen werden.
3. **Export**: Das fertige Belegstoffpäckchen kann anschießend per Knopfdruck als PDF heruntergeladen werden.

## Features
- Kann die Buchungstabelle nicht automatisch ausgelesen werden, kann der User manuell die Spalten für Buchungsdatum, -wert, und -text auswählen, optional auch eine Spalte mit weiteren Informationen (Buchungstext oder Bemerkungen).
- Es kann zwischen zwei Ansichten gewechselt werden: Die Listenansicht, bei der alle Buchungen kompakt dargestellt werden können, und die Kachelansicht, bei der für jedes PDF eine grafische Vorschau der ersten Seite angezeigt wird.
- Die Buchungsansicht kann gefiltert werden, u.a. nach ausgehenden bzw. eingehenden Buchungen, nach Buchungen mit bzw. ohne Beleg und nach Buchungen bestimmter Beträge.
- Die Buchungsansicht kann auch sortiert werden, u.a. nach Buchungsdatum und nach Betragshöhe.
- Bei Bilddateien und rein grafischen PDFs wird OCR angewendet, um Text automatisch auszulesen, damit die Belege automatisch zugeordnet werden können.
- Dark Mode: Es kann per Knopf zwischen heller und dunkler Ansicht hin und her geswitcht werden, wobei Standardmäßig die Systemeinstellung übernommen wird.

## Implementierung
Der BSP-Generator nutzt einen modernen Software-Stack aus **Nuxt 4** fürs Frontend, welches benutzerfreundlich, minimalistisch, selbsterklärend und modern gestaltet ist. Die GUI ist minimalistisch und ästhetisch designt. Es werden Icons von FontAwesome genutzt. Da die Ausführung *vollständig lokal* im Browser erfolgt, braucht die Anwendung kein Backend. Außerdem ist der BSP-Generator via **Docker** containerisiert, sodass es sehr einfach via `docker compose` deployed werden kann.
