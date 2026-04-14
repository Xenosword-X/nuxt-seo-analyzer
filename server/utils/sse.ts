export function formatSseEvent(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? JSON.stringify(data) : JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export interface SseWriter {
  send: (event: string, data: unknown) => void
  close: () => void
}

export function createSseStream(): { stream: ReadableStream<Uint8Array>; writer: SseWriter } {
  const encoder = new TextEncoder()
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
    },
  })
  const writer: SseWriter = {
    send: (event, data) => {
      controllerRef?.enqueue(encoder.encode(formatSseEvent(event, data)))
    },
    close: () => {
      try {
        controllerRef?.close()
      } catch {
        /* noop */
      }
    },
  }
  return { stream, writer }
}
