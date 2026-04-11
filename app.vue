<template>
  <main :class="['app', themeClass]">
    <header class="hero">
      <div class="hero-top">
        <h1><i class="fa-solid fa-file-invoice"></i> Belegstoffpäckchengenerator</h1>
        <button class="icon-button" type="button" @click="cycleThemeMode" :title="`Darstellung: ${themeLabel}`">
          <i :class="themeIconClass"></i>
        </button>
      </div>
      <p>Importiere Buchungen und Belege, prüfe Zuordnungen und exportiere dein BSP als PDF.</p>
    </header>

    <nav class="stepper card">
      <button
        v-for="step in steps"
        :key="step.id"
        type="button"
        class="step-button"
        :class="{ active: currentStep === step.id }"
        @click="currentStep = step.id"
      >
        <i :class="step.icon"></i>
        <span>{{ step.label }}</span>
      </button>
    </nav>

    <article v-if="uploadFeedback" class="card feedback" :class="uploadFeedback.kind">
      <div class="feedback-title">
        <i :class="uploadFeedback.kind === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check'"></i>
        <strong>{{ uploadFeedback.title }}</strong>
      </div>
      <p>{{ uploadFeedback.message }}</p>
      <details v-if="uploadFeedback.details">
        <summary>Technische Details anzeigen</summary>
        <pre>{{ uploadFeedback.details }}</pre>
      </details>
    </article>

    <section v-if="currentStep === 1" class="card step-card">
      <h2><i class="fa-solid fa-upload"></i> 1) Import</h2>
      <div class="grid">
        <div
          class="dropzone"
          :class="{ dragging: isBookingsDragging }"
          @dragover.prevent="onDragOver('bookings')"
          @dragleave.prevent="onDragLeave('bookings')"
          @drop.prevent="onDropBookings"
        >
          <p><strong>Buchungstabelle</strong> (CSV/XLSX/XLS)</p>
          <p class="small">Datei hier ablegen oder auswählen</p>
          <button class="button" type="button" @click="bookingsInputRef?.click()">
            <i class="fa-regular fa-folder-open"></i> Datei wählen
          </button>
          <input ref="bookingsInputRef" type="file" accept=".csv,.xlsx,.xls" class="hidden-input" @change="onBookingsFileChange">
        </div>

        <div
          class="dropzone"
          :class="{ dragging: isReceiptsDragging }"
          @dragover.prevent="onDragOver('receipts')"
          @dragleave.prevent="onDragLeave('receipts')"
          @drop.prevent="onDropReceipts"
        >
          <p><strong>Belege</strong> (PDF/JPG/PNG)</p>
          <p class="small">Mehrere Dateien per Drag-and-Drop möglich</p>
          <button class="button" type="button" @click="receiptsInputRef?.click()">
            <i class="fa-regular fa-images"></i> Dateien wählen
          </button>
          <input
            ref="receiptsInputRef"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            class="hidden-input"
            @change="onReceiptsFileChange"
          >
        </div>
      </div>

      <div class="status-row">
        <span><i class="fa-solid fa-table-list"></i> {{ bookings.length }} Buchungen</span>
        <span><i class="fa-solid fa-file-lines"></i> {{ receipts.length }} Belege</span>
        <span v-if="isProcessingReceipts"><i class="fa-solid fa-spinner fa-spin"></i> Verarbeite Belege und OCR...</span>
      </div>
    </section>

    <section v-if="currentStep === 2" class="card step-card">
      <h2><i class="fa-solid fa-sliders"></i> 2) Ansicht, Filter und Sortierung</h2>
      <div class="top-controls">
        <label>
          Ansicht
          <select v-model="viewMode">
            <option value="list">Liste</option>
            <option value="tiles">Kacheln</option>
          </select>
        </label>
        <div class="icon-actions">
          <button class="icon-button" type="button" @click="showFilters = !showFilters" title="Filter ein-/ausblenden">
            <i class="fa-solid fa-filter"></i>
          </button>
          <button class="icon-button" type="button" @click="showSorting = !showSorting" title="Sortierung ein-/ausblenden">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
          </button>
        </div>
      </div>

      <div v-if="showFilters" class="toolbar">
        <label>
          Richtung
          <select v-model="directionFilter">
            <option value="all">Alle</option>
            <option value="in">Eingehend</option>
            <option value="out">Ausgehend</option>
          </select>
        </label>
        <label>
          Belegstatus
          <select v-model="receiptFilter">
            <option value="all">Alle</option>
            <option value="with">Mit Beleg</option>
            <option value="without">Ohne Beleg</option>
          </select>
        </label>
        <label>
          Min. Betrag
          <input v-model.number="minAmountFilter" type="number" step="0.01" placeholder="z. B. 10">
        </label>
        <label>
          Max. Betrag
          <input v-model.number="maxAmountFilter" type="number" step="0.01" placeholder="z. B. 250">
        </label>
      </div>

      <div v-if="showSorting" class="toolbar">
        <label>
          Sortierung
          <select v-model="sortBy">
            <option value="dateAsc">Datum aufsteigend</option>
            <option value="dateDesc">Datum absteigend</option>
            <option value="amountAsc">Betrag aufsteigend</option>
            <option value="amountDesc">Betrag absteigend</option>
          </select>
        </label>
      </div>

      <p class="small">Gefilterte Buchungen: {{ visibleBookings.length }}</p>
    </section>

    <section v-if="currentStep === 3" class="card step-card">
      <div class="step-header-row">
        <h2><i class="fa-solid fa-link"></i> 3) Zuordnung prüfen und anpassen</h2>
        <button class="button" :disabled="bookings.length === 0 || receipts.length === 0" @click="autoAssignReceipts">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Automatisch zuordnen
        </button>
      </div>

      <div v-if="viewMode === 'list'" class="list-view">
        <article v-for="booking in visibleBookings" :key="booking.id" class="booking-row">
          <div>
            <strong>{{ formatDateForDisplay(booking.date) }}</strong>
            <p>{{ booking.description || "Ohne Beschreibung" }}</p>
            <p class="small">{{ booking.type === "in" ? "Eingehend" : "Ausgehend" }} | {{ formatAmount(booking.amount) }}</p>
          </div>
          <div>
            <label class="small">Beleg</label>
            <select :value="booking.receiptId ?? ''" @change="onManualAssignment(booking.id, ($event.target as HTMLSelectElement).value)">
              <option value="">-- Kein Beleg --</option>
              <option v-for="receipt in receipts" :key="receipt.id" :value="receipt.id">
                {{ receipt.name }}
              </option>
            </select>
          </div>
        </article>
      </div>

      <div v-else class="tile-view">
        <article v-for="booking in visibleBookings" :key="booking.id" class="tile">
          <div class="tile-preview">
            <img v-if="booking.receiptId && receiptById[booking.receiptId]?.previewUrl" :src="receiptById[booking.receiptId]?.previewUrl" alt="Belegvorschau">
            <div v-else class="placeholder">Keine Vorschau</div>
          </div>
          <div>
            <strong>{{ formatDateForDisplay(booking.date) }}</strong>
            <p>{{ booking.description || "Ohne Beschreibung" }}</p>
            <p class="small">{{ formatAmount(booking.amount) }}</p>
            <select :value="booking.receiptId ?? ''" @change="onManualAssignment(booking.id, ($event.target as HTMLSelectElement).value)">
              <option value="">-- Kein Beleg --</option>
              <option v-for="receipt in receipts" :key="receipt.id" :value="receipt.id">
                {{ receipt.name }}
              </option>
            </select>
          </div>
        </article>
      </div>
    </section>

    <section v-if="currentStep === 4" class="card step-card action-row">
      <h2><i class="fa-solid fa-file-export"></i> 4) Export</h2>
      <p class="small">Exportiert werden alle Buchungen mit zugeordnetem Beleg in chronologischer Reihenfolge.</p>
      <button class="button primary" :disabled="isExporting || assignedBookings.length === 0" @click="exportBspPdf">
        <i class="fa-solid fa-download"></i> {{ isExporting ? "Export läuft..." : "BSP als PDF herunterladen" }}
      </button>
    </section>

    <footer class="card footer-nav">
      <button class="button" type="button" :disabled="currentStep === 1" @click="currentStep -= 1">
        <i class="fa-solid fa-chevron-left"></i> Zurück
      </button>
      <button class="button" type="button" :disabled="currentStep === steps.length" @click="currentStep += 1">
        Weiter <i class="fa-solid fa-chevron-right"></i>
      </button>
    </footer>
  </main>
</template>

<script setup lang="ts">
import Papa, { type ParseError } from "papaparse";
import * as XLSX from "xlsx";

type BookingType = "in" | "out";
type ThemeMode = "system" | "light" | "dark";
type DropTarget = "bookings" | "receipts";

interface Booking {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: BookingType;
  receiptId: string | null;
}

interface Receipt {
  id: string;
  name: string;
  file: File;
  kind: "pdf" | "image";
  text: string;
  previewUrl: string;
}

interface UploadFeedback {
  kind: "success" | "error";
  title: string;
  message: string;
  details?: string;
}

interface ParsedBookingsResult {
  bookings: Booking[];
  details: string[];
}

const steps = [
  { id: 1, label: "Import", icon: "fa-solid fa-upload" },
  { id: 2, label: "Ansicht", icon: "fa-solid fa-sliders" },
  { id: 3, label: "Zuordnung", icon: "fa-solid fa-link" },
  { id: 4, label: "Export", icon: "fa-solid fa-file-export" }
] as const;

useHead({
  link: [
    {
      rel: "stylesheet",
      href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
    }
  ]
});

const currentStep = ref<number>(1);
const bookings = ref<Booking[]>([]);
const receipts = ref<Receipt[]>([]);
const isProcessingReceipts = ref(false);
const isExporting = ref(false);
const uploadFeedback = ref<UploadFeedback | null>(null);
const isBookingsDragging = ref(false);
const isReceiptsDragging = ref(false);
const bookingsInputRef = ref<HTMLInputElement | null>(null);
const receiptsInputRef = ref<HTMLInputElement | null>(null);

const viewMode = ref<"list" | "tiles">("list");
const directionFilter = ref<"all" | "in" | "out">("all");
const receiptFilter = ref<"all" | "with" | "without">("all");
const minAmountFilter = ref<number | null>(null);
const maxAmountFilter = ref<number | null>(null);
const sortBy = ref<"dateAsc" | "dateDesc" | "amountAsc" | "amountDesc">("dateAsc");
const showFilters = ref(false);
const showSorting = ref(false);

const themeMode = ref<ThemeMode>("system");
const systemPrefersDark = ref(false);
let themeMedia: MediaQueryList | null = null;
let themeListener: ((event: MediaQueryListEvent) => void) | null = null;

onMounted(() => {
  themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  systemPrefersDark.value = themeMedia.matches;
  themeListener = (event: MediaQueryListEvent) => {
    systemPrefersDark.value = event.matches;
  };
  themeMedia.addEventListener("change", themeListener);
});

onBeforeUnmount(() => {
  if (themeMedia && themeListener) {
    themeMedia.removeEventListener("change", themeListener);
  }
});

const resolvedTheme = computed<"light" | "dark">(() => {
  if (themeMode.value === "system") {
    return systemPrefersDark.value ? "dark" : "light";
  }
  return themeMode.value;
});

const themeClass = computed(() => `theme-${resolvedTheme.value}`);
const themeIconClass = computed(() => {
  if (themeMode.value === "system") {
    return "fa-solid fa-circle-half-stroke";
  }
  return themeMode.value === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
});
const themeLabel = computed(() =>
  themeMode.value === "system" ? "System" : themeMode.value === "dark" ? "Dunkel" : "Hell"
);

const cycleThemeMode = () => {
  if (themeMode.value === "system") {
    themeMode.value = "dark";
    return;
  }
  if (themeMode.value === "dark") {
    themeMode.value = "light";
    return;
  }
  themeMode.value = "system";
};

const receiptById = computed<Record<string, Receipt>>(() => {
  const map: Record<string, Receipt> = {};
  for (const receipt of receipts.value) {
    map[receipt.id] = receipt;
  }
  return map;
});

const visibleBookings = computed<Booking[]>(() => {
  const filtered = bookings.value.filter((booking) => {
    if (directionFilter.value !== "all" && booking.type !== directionFilter.value) {
      return false;
    }
    const hasReceipt = Boolean(booking.receiptId);
    if (receiptFilter.value === "with" && !hasReceipt) {
      return false;
    }
    if (receiptFilter.value === "without" && hasReceipt) {
      return false;
    }

    const absoluteAmount = Math.abs(booking.amount);
    if (minAmountFilter.value !== null && Number.isFinite(minAmountFilter.value) && absoluteAmount < minAmountFilter.value) {
      return false;
    }
    if (maxAmountFilter.value !== null && Number.isFinite(maxAmountFilter.value) && absoluteAmount > maxAmountFilter.value) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy.value === "dateAsc") {
      return toTimestamp(a.date) - toTimestamp(b.date);
    }
    if (sortBy.value === "dateDesc") {
      return toTimestamp(b.date) - toTimestamp(a.date);
    }
    if (sortBy.value === "amountAsc") {
      return Math.abs(a.amount) - Math.abs(b.amount);
    }
    return Math.abs(b.amount) - Math.abs(a.amount);
  });

  return sorted;
});

const assignedBookings = computed(() => bookings.value.filter((booking) => booking.receiptId));

const onDragOver = (target: DropTarget) => {
  if (target === "bookings") {
    isBookingsDragging.value = true;
  } else {
    isReceiptsDragging.value = true;
  }
};

const onDragLeave = (target: DropTarget) => {
  if (target === "bookings") {
    isBookingsDragging.value = false;
  } else {
    isReceiptsDragging.value = false;
  }
};

const onDropBookings = (event: DragEvent) => {
  isBookingsDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  void importBookingsFromFile(file);
};

const onDropReceipts = (event: DragEvent) => {
  isReceiptsDragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) {
    return;
  }
  void importReceiptsFromFiles(files);
};

const onBookingsFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await importBookingsFromFile(file);
  }
  input.value = "";
};

const onReceiptsFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length > 0) {
    await importReceiptsFromFiles(files);
  }
  input.value = "";
};

const importBookingsFromFile = async (file: File) => {
  uploadFeedback.value = null;
  try {
    const parsed = await parseBookingsFile(file);
    bookings.value = parsed.bookings.sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));
    uploadFeedback.value = {
      kind: "success",
      title: "Buchungstabelle erfolgreich importiert",
      message: `${parsed.bookings.length} Buchungen wurden eingelesen.`,
      details: parsed.details.length > 0 ? parsed.details.join("\n") : undefined
    };
  } catch (error) {
    const details = formatErrorDetails(error);
    uploadFeedback.value = {
      kind: "error",
      title: "Buchungstabelle konnte nicht verarbeitet werden",
      message: "Bitte prüfe Dateiformat, Spaltennamen und Datums-/Betragswerte.",
      details
    };
  }
};

const importReceiptsFromFiles = async (files: File[]) => {
  isProcessingReceipts.value = true;
  uploadFeedback.value = null;
  try {
    const importedReceipts: Receipt[] = [];
    for (const file of files) {
      const kind = file.type === "application/pdf" ? "pdf" : "image";
      const id = crypto.randomUUID();
      const text = await extractTextFromReceipt(file, kind);
      const previewUrl = await createPreviewUrl(file, kind);
      importedReceipts.push({
        id,
        name: file.name,
        file,
        kind,
        text: normalizeText(text),
        previewUrl
      });
    }
    receipts.value = [...receipts.value, ...importedReceipts];
    uploadFeedback.value = {
      kind: "success",
      title: "Belege erfolgreich importiert",
      message: `${importedReceipts.length} Dateien wurden verarbeitet.`
    };
  } catch (error) {
    uploadFeedback.value = {
      kind: "error",
      title: "Belegimport fehlgeschlagen",
      message: "Mindestens ein Beleg konnte nicht verarbeitet werden.",
      details: formatErrorDetails(error)
    };
  } finally {
    isProcessingReceipts.value = false;
  }
};

const onManualAssignment = (bookingId: string, value: string) => {
  const booking = bookings.value.find((entry) => entry.id === bookingId);
  if (!booking) {
    return;
  }
  booking.receiptId = value || null;
};

const autoAssignReceipts = () => {
  const unusedReceiptIds = new Set(receipts.value.map((receipt) => receipt.id));
  for (const booking of bookings.value) {
    let winner: { receiptId: string; score: number } | null = null;
    for (const receipt of receipts.value) {
      if (!unusedReceiptIds.has(receipt.id)) {
        continue;
      }
      const score = getMatchScore(booking, receipt);
      if (!winner || score > winner.score) {
        winner = { receiptId: receipt.id, score };
      }
    }
    if (winner && winner.score >= 2) {
      booking.receiptId = winner.receiptId;
      unusedReceiptIds.delete(winner.receiptId);
    }
  }
};

const exportBspPdf = async () => {
  if (assignedBookings.value.length === 0) {
    return;
  }
  isExporting.value = true;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const exportDoc = await PDFDocument.create();
    const ordered = [...bookings.value]
      .filter((booking) => booking.receiptId)
      .sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));

    for (const booking of ordered) {
      const receipt = booking.receiptId ? receiptById.value[booking.receiptId] : null;
      if (!receipt) {
        continue;
      }
      const buffer = await receipt.file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (receipt.kind === "pdf") {
        const sourcePdf = await PDFDocument.load(bytes);
        const pageIndices = sourcePdf.getPageIndices();
        const copiedPages = await exportDoc.copyPages(sourcePdf, pageIndices);
        copiedPages.forEach((page) => exportDoc.addPage(page));
      } else {
        const image = receipt.file.type.includes("png") ? await exportDoc.embedPng(bytes) : await exportDoc.embedJpg(bytes);
        const page = exportDoc.addPage([595.28, 841.89]);
        const margin = 24;
        const maxWidth = page.getWidth() - margin * 2;
        const maxHeight = page.getHeight() - margin * 2;
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * ratio;
        const height = image.height * ratio;
        page.drawImage(image, {
          x: (page.getWidth() - width) / 2,
          y: (page.getHeight() - height) / 2,
          width,
          height
        });
      }
    }

    const mergedBytes = await exportDoc.save();
    const blob = new Blob([mergedBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "belegstoffpaeckchen.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    uploadFeedback.value = {
      kind: "error",
      title: "PDF-Export fehlgeschlagen",
      message: "Der Export konnte nicht abgeschlossen werden.",
      details: formatErrorDetails(error)
    };
  } finally {
    isExporting.value = false;
  }
};

const parseBookingsFile = async (file: File): Promise<ParsedBookingsResult> => {
  const lowerName = file.name.toLowerCase();
  let rows: Record<string, unknown>[] = [];
  const details: string[] = [];

  if (lowerName.endsWith(".csv")) {
    const parsedCsv = await parseCsv(file);
    rows = parsedCsv.rows;
    if (parsedCsv.parseErrors.length > 0) {
      details.push("CSV-Parser-Meldungen:");
      details.push(...parsedCsv.parseErrors.map((entry) => `- ${entry}`));
    }
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    rows = await parseExcel(file);
  } else {
    throw new Error(`Nicht unterstütztes Dateiformat: ${file.name}`);
  }

  if (rows.length === 0) {
    throw new Error("Die Datei enthält keine auswertbaren Zeilen.");
  }

  const issues: string[] = [];
  const parsedBookings: Booking[] = [];
  rows.forEach((row, index) => {
    const mapped = mapRowToBooking(row);
    if (mapped) {
      parsedBookings.push(mapped);
    } else {
      issues.push(`Zeile ${index + 2}: Datum oder Betrag fehlen/ungültig.`);
    }
  });

  if (parsedBookings.length === 0) {
    const columnPreview = Object.keys(rows[0] ?? {}).join(", ");
    throw new Error(
      [
        "Keine gültigen Buchungen erkannt.",
        `Gefundene Spalten: ${columnPreview || "(keine)"}`,
        "Erwartete Spaltennamen (mindestens Datum + Betrag): datum/buchungsdatum/date und betrag/amount/wert.",
        ...issues.slice(0, 20)
      ].join("\n")
    );
  }

  if (issues.length > 0) {
    details.push(`Teilweise ungültige Zeilen: ${issues.length}`);
    details.push(...issues.slice(0, 20));
  }

  return { bookings: parsedBookings, details };
};

const parseCsv = async (
  file: File
): Promise<{ rows: Record<string, unknown>[]; parseErrors: string[] }> =>
  await new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parseErrors = result.errors.map((error: ParseError) => {
          return `${error.type} (Zeile ${error.row ?? "?"}): ${error.message}`;
        });
        resolve({ rows: result.data, parseErrors });
      },
      error: reject
    });
  });

const parseExcel = async (file: File): Promise<Record<string, unknown>[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
};

const mapRowToBooking = (row: Record<string, unknown>): Booking | null => {
  const dateValue = getField(row, ["buchungsdatum", "datum", "date"]);
  const amountValue = getField(row, ["betrag", "amount", "wert"]);
  const descriptionValue = getField(row, ["verwendungszweck", "buchungstext", "beschreibung", "description"]);
  const typeValue = getField(row, ["richtung", "typ", "art", "type"]);

  const date = parseDate(dateValue);
  const amount = parseAmount(amountValue);
  if (!date || amount === null) {
    return null;
  }

  const inferredType: BookingType = amount >= 0 ? "in" : "out";
  const normalizedType = normalizeType(typeValue) ?? inferredType;
  return {
    id: crypto.randomUUID(),
    date,
    amount,
    type: normalizedType,
    description: String(descriptionValue ?? "").trim(),
    receiptId: null
  };
};

const getField = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const entry = Object.entries(row).find(([key]) => aliases.includes(key.trim().toLowerCase()));
  return entry?.[1];
};

const parseDate = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) {
      return null;
    }
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const text = String(raw).trim();
  const normalized = text.replace(/\./g, "-").replace(/\//g, "-");
  const parts = normalized.split("-").map((part) => part.trim());
  if (parts.length === 3 && parts[0].length <= 2) {
    const [day, month, year] = parts;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const timestamp = Date.parse(text);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return null;
};

const parseAmount = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const cleaned = String(raw).replace(/\s/g, "").replace("EUR", "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeType = (raw: unknown): BookingType | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw).toLowerCase();
  if (text.includes("eingang") || text.includes("eingeh") || text.includes("in")) {
    return "in";
  }
  if (text.includes("ausgang") || text.includes("ausgeh") || text.includes("out")) {
    return "out";
  }
  return null;
};

const extractTextFromReceipt = async (file: File, kind: "pdf" | "image"): Promise<string> => {
  if (kind === "pdf") {
    const text = await extractTextFromPdf(file);
    if (text.trim().length > 20) {
      return text;
    }
  }
  return await extractTextWithOcr(file);
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pagesToRead = Math.min(doc.numPages, 3);
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
    chunks.push(text);
  }
  return chunks.join(" ");
};

const extractTextWithOcr = async (file: File): Promise<string> => {
  const tesseract = await import("tesseract.js");
  const result = await tesseract.recognize(file, "deu+eng");
  return result.data.text ?? "";
};

const createPreviewUrl = async (file: File, kind: "pdf" | "image"): Promise<string> => {
  if (kind === "image") {
    return URL.createObjectURL(file);
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 0.6 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
};

const normalizeText = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

const getMatchScore = (booking: Booking, receipt: Receipt): number => {
  const text = receipt.text;
  let score = 0;
  const amountCandidates = getAmountCandidates(booking.amount);
  if (amountCandidates.some((candidate) => text.includes(candidate))) {
    score += 2;
  }
  const dateCandidates = getDateCandidates(booking.date);
  if (dateCandidates.some((candidate) => text.includes(candidate))) {
    score += 2;
  }
  const keywords = booking.description.toLowerCase().split(/\s+/).filter((part) => part.length >= 4);
  const matchedKeywords = keywords.filter((keyword) => text.includes(keyword));
  score += Math.min(3, matchedKeywords.length);
  return score;
};

const getAmountCandidates = (amount: number): string[] => {
  const absolute = Math.abs(amount);
  const fixed = absolute.toFixed(2);
  const de = fixed.replace(".", ",");
  return [fixed, de, String(Math.round(absolute))];
};

const getDateCandidates = (date: string): string[] => {
  const [year, month, day] = date.split("-");
  return [`${day}.${month}.${year}`, `${day}-${month}-${year}`, `${year}-${month}-${day}`];
};

const formatErrorDetails = (error: unknown): string => {
  if (error instanceof Error) {
    return [error.message, error.stack ?? ""].filter(Boolean).join("\n\n");
  }
  return JSON.stringify(error, null, 2);
};

const toTimestamp = (isoDate: string): number => Date.parse(isoDate);
const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
const formatDateForDisplay = (isoDate: string): string => new Intl.DateTimeFormat("de-DE").format(new Date(isoDate));
</script>

<style scoped>
.app {
  --bg: #f5f7fb;
  --card: #ffffff;
  --border: #d4dae8;
  --text: #1a2436;
  --muted: #5d6780;
  --button: #edf1f8;
  --primary: #2c5ec7;
  --success-bg: #edf8f0;
  --success-border: #75be85;
  --error-bg: #fff1f0;
  --error-border: #e17070;
  max-width: 1050px;
  margin: 0 auto;
  padding: 1.2rem;
  display: grid;
  gap: 1rem;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  font-family: Inter, system-ui, sans-serif;
}

.theme-dark {
  --bg: #0f141d;
  --card: #182131;
  --border: #2d3d59;
  --text: #e7ecf8;
  --muted: #b6c2dc;
  --button: #243149;
  --primary: #4f83ee;
  --success-bg: #1d3126;
  --success-border: #4da060;
  --error-bg: #382124;
  --error-border: #d77979;
}

.card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1rem;
  background: var(--card);
}

.hero {
  display: grid;
  gap: 0.5rem;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero h1 {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.stepper {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}

.step-button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  min-height: 48px;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.step-button.active {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-color: var(--primary);
}

.step-card h2 {
  margin-top: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.dropzone {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: grid;
  gap: 0.5rem;
}

.dropzone.dragging {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

.hidden-input {
  display: none;
}

.status-row {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.top-controls {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
  align-items: end;
}

.toolbar {
  margin-top: 0.9rem;
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.92rem;
}

input,
select,
.button {
  font-size: 0.95rem;
  padding: 0.48rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  color: var(--text);
  background: var(--button);
}

.button {
  cursor: pointer;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.button.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.icon-button {
  border: 1px solid var(--border);
  background: var(--button);
  color: var(--text);
  border-radius: 999px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.icon-actions {
  display: flex;
  gap: 0.5rem;
}

.feedback.success {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.feedback.error {
  background: var(--error-bg);
  border-color: var(--error-border);
}

.feedback-title {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.feedback p {
  margin-bottom: 0.5rem;
}

pre {
  margin-top: 0.4rem;
  white-space: pre-wrap;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.5rem;
  border-radius: 8px;
}

.step-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.list-view,
.tile-view {
  display: grid;
  gap: 0.8rem;
}

.booking-row,
.tile {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.8rem;
}

.booking-row {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: 1fr minmax(220px, 280px);
}

.tile-view {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.tile {
  display: grid;
  gap: 0.6rem;
}

.tile-preview {
  height: 170px;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--button) 70%, transparent);
}

.tile-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder,
.small {
  color: var(--muted);
  font-size: 0.86rem;
}

.action-row {
  display: grid;
  gap: 0.6rem;
}

.footer-nav {
  display: flex;
  justify-content: space-between;
}

@media (max-width: 860px) {
  .stepper {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .booking-row {
    grid-template-columns: 1fr;
  }
}
</style>
