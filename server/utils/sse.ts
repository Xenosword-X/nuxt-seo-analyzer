// server/utils/sse.ts
// 使用 h3 官方 createEventStream，跨 runtime 相容（含 Cloudflare Workers）
import type { H3Event } from 'h3'
import { createEventStream } from 'h3'

export function formatSseEvent(event: string, data: unknown): string {
  const payload = JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export interface SseWriter {
  send: (event: string, data: unknown) => void | Promise<void>
  close: () => Promise<void>
  /** 傳給 handler return 的 stream 物件 */
  response: ReturnType<typeof createEventStream>
}

/**
 * 建立 SSE 連線。回傳 { writer, response }；handler 需 return `response`。
 * 呼叫端邏輯：
 *   const { writer, response } = openSse(event)
 *   // 背景寫事件（不 await）
 *   doWork(writer).finally(() => writer.close())
 *   return response
 */
export function openSse(event: H3Event): { writer: SseWriter; response: ReturnType<typeof createEventStream> } {
  const stream = createEventStream(event)
  const writer: SseWriter = {
    send: (name, data) => stream.push({ event: name, data: JSON.stringify(data) }),
    close: () => stream.close(),
    response: stream,
  }
  return { writer, response: stream }
}
