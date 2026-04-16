import { PDFDocument } from 'pdf-lib'
import type { DocumentFile, Booking } from '~/types'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

/** Fehler, den Aufrufer fangen können, um einen Passwort-Dialog zu öffnen. */
export class PdfPasswordRequiredError extends Error {
  constructor(public wrongPassword = false) {
    super(wrongPassword ? 'Falsches Passwort' : 'Passwort erforderlich')
    this.name = 'PdfPasswordRequiredError'
  }
}

/**
 * Erkennt, ob ein PDF mit /Encrypt versehen ist. Wir scannen dafür das Trailer-Segment
 * direkt in den Bytes – zuverlässig unabhängig davon, ob pdf.js es öffnen kann.
 */
export async function isPdfEncrypted(file: File): Promise<boolean> {
  if (file.type !== 'application/pdf') return false
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Trailer liegt am Ende – letzte 4 KB reichen verlässlich.
  const tailStart = Math.max(0, bytes.length - 4096)
  let ascii = ''
  for (let i = tailStart; i < bytes.length; i++) {
    ascii += String.fromCharCode(bytes[i])
  }
  // \b verhindert Treffer auf /EncryptMetadata (dort endet das Wort nach "Metadata")
  return /\/Encrypt\b/.test(ascii)
}

export function usePdfUtils() {
  async function openPdfDocument(file: File, password?: string) {
    const pdfjs = await getPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    try {
      return await pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        password: password || '',
      }).promise
    } catch (e: any) {
      if (e?.name === 'PasswordException') {
        // pdfjs setzt code=1 (NEED_PASSWORD) bzw. code=2 (INCORRECT_PASSWORD)
        throw new PdfPasswordRequiredError(e.code === 2)
      }
      throw e
    }
  }

  async function extractTextFromPdf(file: File, password?: string): Promise<string> {
    const pdf = await openPdfDocument(file, password)
    const texts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ')
      texts.push(pageText)
    }

    return texts.join('\n')
  }

  async function generateThumbnail(
    file: File,
    maxWidth = 400,
    maxHeight = 560,
    password?: string,
  ): Promise<string> {
    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1)
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.7))
          URL.revokeObjectURL(img.src)
        }
        img.src = URL.createObjectURL(file)
      })
    }

    const pdf = await openPdfDocument(file, password)
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / viewport.width, maxHeight / viewport.height, 1)
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  async function renderPdfPage(file: File, pageNum: number, scale = 1.5, password?: string): Promise<string> {
    const pdf = await openPdfDocument(file, password)
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/png')
  }

  async function getPdfPageCount(file: File, password?: string): Promise<number> {
    const pdf = await openPdfDocument(file, password)
    return pdf.numPages
  }

  // Load a PDF once and return a handle that can render individual pages without re-parsing.
  async function loadPdf(file: File, password?: string) {
    const pdf = await openPdfDocument(file, password)

    async function pageDimensions(pageNum: number, scale = 1) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      return { width: viewport.width, height: viewport.height }
    }

    async function renderPage(pageNum: number, scale = 2): Promise<string> {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      return canvas.toDataURL('image/jpeg', 0.85)
    }

    return {
      numPages: pdf.numPages,
      pageDimensions,
      renderPage,
      destroy: () => pdf.destroy(),
    }
  }

  /**
   * Rastert alle Seiten des Quell-PDFs via pdf.js in den mergedPdf. Fallback für PDFs,
   * deren Inhalt (z. B. wegen /Encrypt) von pdf-lib nicht korrekt per copyPages
   * übernommen werden kann.
   */
  async function rasterizeIntoMergedPdf(
    file: File,
    mergedPdf: PDFDocument,
    password?: string,
  ) {
    const RENDER_SCALE = 2.5 // ~180 DPI
    const JPEG_QUALITY = 0.9

    const pdf = await openPdfDocument(file, password)
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: RENDER_SCALE })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport }).promise

        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')),
            'image/jpeg',
            JPEG_QUALITY,
          )
        })
        const jpegBytes = await blob.arrayBuffer()
        const image = await mergedPdf.embedJpg(jpegBytes)

        const pageWidth = viewport.width / RENDER_SCALE
        const pageHeight = viewport.height / RENDER_SCALE
        const newPage = mergedPdf.addPage([pageWidth, pageHeight])
        newPage.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight })

        page.cleanup()
      }
    } finally {
      await pdf.destroy()
    }
  }

  async function exportBsp(
    sortedBookings: Booking[],
    getDocumentFile: (id: string) => DocumentFile | undefined,
  ): Promise<Blob> {
    const mergedPdf = await PDFDocument.create()

    for (const booking of sortedBookings) {
      if (!booking.documentId) continue
      const doc = getDocumentFile(booking.documentId)
      if (!doc) continue

      const fileBytes = await doc.file.arrayBuffer()

      if (doc.type === 'pdf') {
        if (doc.locked) {
          // Noch nicht entsperrt – nicht exportierbar. Überspringen statt Crash.
          console.warn(`Dokument "${doc.name}" ist noch passwortgeschützt und wird übersprungen.`)
          continue
        }
        if (doc.encrypted) {
          // Verschlüsselte PDFs (z. B. STRATO-Rechnungen) kann pdf-lib nicht entschlüsselt
          // weitergeben – copyPages würde die chiffrierten Streams 1:1 in das unverschlüsselte
          // Ziel-PDF kopieren, was Acrobat mit "Eingebettete Schrift konnte nicht entnommen
          // werden" quittiert und Seiten leer lässt. Wir rastern diese PDFs stattdessen über
          // pdf.js, das die Entschlüsselung beherrscht.
          await rasterizeIntoMergedPdf(doc.file, mergedPdf, doc.password)
        } else {
          const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true })
          const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
          pages.forEach(page => mergedPdf.addPage(page))
        }
      } else {
        let image
        if (doc.file.type === 'image/jpeg' || doc.file.type === 'image/jpg') {
          image = await mergedPdf.embedJpg(fileBytes)
        } else if (doc.file.type === 'image/png') {
          image = await mergedPdf.embedPng(fileBytes)
        } else {
          continue
        }

        const maxWidth = 595.28
        const maxHeight = 841.89
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
        const width = image.width * scale
        const height = image.height * scale

        const page = mergedPdf.addPage([maxWidth, maxHeight])
        page.drawImage(image, {
          x: (maxWidth - width) / 2,
          y: (maxHeight - height) / 2,
          width,
          height,
        })
      }
    }

    const pdfBytes = await mergedPdf.save({ useObjectStreams: false })
    return new Blob([pdfBytes], { type: 'application/pdf' })
  }

  return {
    extractTextFromPdf,
    generateThumbnail,
    renderPdfPage,
    getPdfPageCount,
    loadPdf,
    exportBsp,
    isPdfEncrypted,
  }
}
