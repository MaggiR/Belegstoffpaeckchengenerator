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

export function usePdfUtils() {
  async function extractTextFromPdf(file: File): Promise<string> {
    const pdfjs = await getPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
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

  async function generateThumbnail(file: File, maxWidth = 400, maxHeight = 560): Promise<string> {
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

    const pdfjs = await getPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
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

  async function renderPdfPage(file: File, pageNum: number, scale = 1.5): Promise<string> {
    const pdfjs = await getPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/png')
  }

  async function getPdfPageCount(file: File): Promise<number> {
    const pdfjs = await getPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    return pdf.numPages
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
        const sourcePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true })
        const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
        pages.forEach(page => mergedPdf.addPage(page))
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

    const pdfBytes = await mergedPdf.save()
    return new Blob([pdfBytes], { type: 'application/pdf' })
  }

  return {
    extractTextFromPdf,
    generateThumbnail,
    renderPdfPage,
    getPdfPageCount,
    exportBsp,
  }
}
