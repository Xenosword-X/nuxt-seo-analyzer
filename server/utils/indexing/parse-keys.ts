// server/utils/indexing/parse-keys.ts
// Nuxt runtimeConfig 會自動用 destr 解析 env 值：
// NUXT_SERP_API_KEYS=["a","b"] → config.serpApiKeys 已是 ['a','b']（陣列）
// 若 env 缺漏 → 會是空字串 ''。此 helper 統一處理各種情況。

export function parseKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((s) => s.trim().length > 0)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    // 相容舊行為：若仍是 JSON 陣列字串，解析之
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed)
        return Array.isArray(arr) ? arr.map(String).filter(Boolean) : []
      } catch {
        return []
      }
    }
    // 單一值
    return [trimmed]
  }
  return []
}
