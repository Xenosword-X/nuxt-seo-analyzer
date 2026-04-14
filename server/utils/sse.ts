// server/utils/sse.ts
import type { H3Event } from 'h3'

export function formatSseEvent(event: string, data: unknown): string {
  const payload = JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export interface SseWriter {
  send: (event: string, data: unknown) => void
  close: () => void
}

/**
 * 直接寫入 Node response，避免 Nitro dev 對 ReadableStream 的 buffering。
 * 呼叫端需 await 整個 SSE 流程完成，不要直接 return stream。
 */
export function startSse(event: H3Event): SseWriter {
  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // 告知反向代理不要 buffer（Nginx / Cloudflare 都吃這個 header）
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  // 先送一行 comment 立即觸發 client 收到 200 回應
  res.write(': stream-open\n\n')

  return {
    send: (name, data) => {
      if (res.writableEnded) return
      res.write(formatSseEvent(name, data))
    },
    close: () => {
      if (!res.writableEnded) res.end()
    },
  }
}

/**
 * Legacy helper — 保留給需要 ReadableStream 的場景。
 */
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
