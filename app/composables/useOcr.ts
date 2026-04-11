export function useOcr() {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null

  async function createWorker() {
    const Tesseract = await import('tesseract.js')
    const w = await Tesseract.createWorker('deu+eng')
    return w
  }

  async function getWorker() {
    if (!worker) {
      worker = await createWorker()
    }
    return worker
  }

  async function recognizeText(imageSource: File | string): Promise<string> {
    const w = await getWorker()
    let source: File | string = imageSource

    if (imageSource instanceof File && imageSource.type === 'application/pdf') {
      source = imageSource
    }

    const { data } = await w.recognize(source)
    return data.text
  }

  async function terminate() {
    if (worker) {
      await worker.terminate()
      worker = null
    }
  }

  return { recognizeText, terminate }
}
