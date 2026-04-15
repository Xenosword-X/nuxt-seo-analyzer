# 部署除錯報告：nuxt-seo-analyzer

> **部署時間軸：** 2026-04-14 下午 ~ 2026-04-15 中午（約 1 日）
> **平台：** Cloudflare Pages（免費版）
> **主要根因：** 3 個類別、10 個具體問題

---

## 問題總覽

| # | 症狀 | 根因類別 | 嚴重度 |
|---|------|---------|-------|
| 1 | `client_secret_*.json` 可能被推上 GitHub | 安全性 | 🔴 |
| 2 | Google 登入後回到 localhost | OAuth 設定 | 🟡 |
| 3 | 登入後被強制跳到 production | Supabase URL 白名單格式錯 | 🟡 |
| 4 | 所有 API 回 500 "Server Error" | runtimeConfig event 未傳 | 🔴 |
| 5 | `supabaseKey is required` | runtimeConfig event 未傳 | 🔴 |
| 6 | 整站收錄查詢永遠 disabled | Nuxt destr 型別自動轉換 | 🟡 |
| 7 | 10 頁分析 Worker 被砍、只剩 4 頁完成 | CF Workers 30s 限制 | 🟡 |
| 8 | PageSpeed 429 rate limit | runtimeConfig event 未傳（衍生）| 🟡 |
| 9 | 每頁 Google 索引全 failed | runtimeConfig event 未傳（衍生）| 🟡 |
| 10 | AI 整站報告永遠空白 | runtimeConfig event 未傳（衍生）| 🟡 |

---

## 根因分類與詳細分析

### 類別 A：`useRuntimeConfig()` 沒傳 `event`（問題 4、5、8、9、10）

**影響範圍：** 7 個檔案、所有 server API 與 analyzer utility

**技術原因：**
- 本機 Node.js：`useRuntimeConfig()` 可從 `process.env` 自動載入，正常工作
- Cloudflare Workers：**環境變數從 `event.context.cloudflare.env` 而非 `process.env`**。沒有 event 就拿不到

**錯誤症狀：**
```ts
// Worker 上 config.supabaseServiceRoleKey 是空字串
const supabase = useServerSupabase()  // → "supabaseKey is required"

// config.pagespeedApiKey 空 → 匿名呼叫 PageSpeed API → 每天配額低 → 429
const apiKey = config.pagespeedApiKey as string

// config.openaiApiKey 空 → OpenAI 拒絕請求
const client = new OpenAI({ apiKey: config.openaiApiKey })
```

**修正（2 個 commits）：** `87c0514`、`a6bb2e1`
```ts
// 所有 server 端 config 讀取都改為：
const config = useRuntimeConfig(event)
const supabase = useServerSupabase(event)

// Utility function 接受 optional event：
export async function analyzeCWV(url: string, event?: H3Event) { ... }
export async function analyzeIndexing(url: string, event?: H3Event) { ... }
export async function generateSiteReport(input, event?: H3Event) { ... }
```

**教訓：** CF Workers 相容性不是本機跑得動就沒問題。本地 dev 與 CF runtime 的環境變數注入機制不同，**每個 `useRuntimeConfig()` 呼叫都要傳 event**。

---

### 類別 B：Nuxt `destr` 自動型別轉換（問題 6，以及更早的同類）

**影響範圍：** 所有字串型態的環境變數

**技術原因：**
Nuxt runtimeConfig 預設用 `destr` 函式把 env 字串轉型：
- `NUXT_FOO=true` → `true`（boolean，非字串）
- `NUXT_FOO=["a","b"]` → `['a', 'b']`（陣列，非 JSON 字串）
- `NUXT_FOO=42` → `42`（number）

**本次部署的錯誤：**
```ts
// 預期 config.siteIndexingEnabled 是 'true'，但實際是 boolean true
if (config.siteIndexingEnabled !== 'true') {  // 永遠成立 → 永遠 disabled
  return { error: 'disabled' }
}
```

**修正（commit `a54449a`）：**
```ts
if (String(config.siteIndexingEnabled) !== 'true') { ... }
```

**相關前例（在 Phase B 修過）：**
- `JSON.parse(config.serpApiKeys)` 爆錯 → 改用 `parseKeys()` helper 吸收陣列/JSON 字串/單一字串三種形態

**教訓：** 環境變數過了 `destr` 之後型別可能變了，**所有 `config.X === 'literal'` 的比對都要防禦**。

---

### 類別 C：Cloudflare Workers 免費版時間限制（問題 7）

**影響：** 功能規模必須縮減

**技術原因：**
- Workers Free：**wall-clock 上限 30 秒**（包含等待 fetch 的時間）
- 原本分析 10 頁需要 ~40–60 秒 → 超時被砍 → 只有先完成的 4 頁存進 DB

**修正（commit `8aec0d1`）：**
- `APP_MAX_PAGES_PER_RUN=30` → **4**（環境變數）
- `PAGE_BATCH_CONCURRENCY=5` → **3**（程式碼常數，避免 PageSpeed 429）

**實測上限表：**

| 設定 | 成功率 | 說明 |
|------|-------|------|
| 4 頁 | ~95% | 穩定 |
| 5 頁 | ~70% | 慢站會超時 |
| 6+ 頁 | < 50% | 經常超時 |

**教訓：** spec 中已警告此風險（見 `2026-04-14-full-site-analysis-design.md` 第十七節）。實際測試證實免費版只能跑 **4 頁**穩定。若要支援更多頁，升級 Workers Paid（$5/月，上限 15 分鐘）或改架構。

---

### 類別 D：OAuth / Supabase 設定（問題 1、2、3）

#### 問題 1：`client_secret_*.json` 未列入 `.gitignore`

專案根目錄有 Google OAuth Client Secret JSON 檔，Phase 1 的 `.gitignore` 沒有擋，**差一點被 `git add .` 推上 GitHub**。

**修正（commit `d0740f5`）：** `.gitignore` 加入
```
client_secret_*.json
credentials/
oauth_tokens/
*.pem
*.key
```

#### 問題 2 & 3：Supabase Redirect URLs 設定錯誤

第一版在 Supabase Dashboard 填：
```
https://localhost:3000/dashboard   ← 錯：https 應為 http，路徑寫死非通配
https://nuxt-seo-analyzer.pages.dev/dashboard
```

Supabase 檢查 redirectTo 不在允許清單 → fallback 到 Site URL（production）→ localhost 登入跳到 production 畫面。

**修正（手動）：**
```
http://localhost:3000/**
https://nuxt-seo-analyzer.pages.dev/**
```

**教訓：** Supabase 比對 URL 很嚴格，**建議用 `/**` 通配符**省去一個路徑一條的維護成本。

---

## 時間軸與 Commit 對應

| 時間 | 問題 | Commit | 說明 |
|------|------|--------|------|
| 04-14 17:xx | `.gitignore` 漏掉憑證 | `d0740f5` | 部署前補上安全防護 |
| 04-14 18:xx | API 500 全掛 | `87c0514` | 第一輪 CF 相容性修正（supabase.ts event） |
| 04-15 10:xx | siteIndexingEnabled 型別 | `a54449a` | 破除 destr 字串比對 |
| 04-15 10:xx | 免費版 30s 限制 | `8aec0d1` | 併發降 5→3 |
| 04-15 11:xx | PageSpeed 429、AI 空白 | `a6bb2e1` | 第二輪 event 補完（analyzer / report） |

---

## 如果從頭再來一次，應該注意的事

### 1. 開發階段就加入 CF 相容性測試
用 `npx wrangler pages dev` 本機跑 CF runtime，而不是只用 `npm run dev`（Node）。這樣開發當下就會暴露 runtimeConfig / process.env 差異。

### 2. env 比對用 `String()` 包裝
```ts
// Bad
if (config.X === 'true') { ... }
// Good
if (String(config.X) === 'true') { ... }
```

### 3. 統一 env 讀取層
把 `useRuntimeConfig(event)` 封裝成專案內部 helper，強制傳 event。例如：
```ts
// server/utils/config.ts
export function useAppConfig(event: H3Event) {
  return useRuntimeConfig(event)
}
```
Lint 規則禁止直接呼叫 `useRuntimeConfig()`。

### 4. 部署前安全檢查清單
- `.gitignore` 涵蓋：`.env*`、`*.json`（憑證）、`*.pem`、`*.key`、`credentials/`、`oauth_tokens/`
- `git check-ignore -v <檔名>` 驗證
- 首次 push 前 `git ls-files` 掃一遍

### 5. Supabase URL 一開始就用通配符
`http://localhost:3000/**` + `https://domain.pages.dev/**`，不要逐路徑列。

### 6. 對外部 API 做配額預估
PageSpeed 免費 25,000/天、SerpApi 免費 250/月。部署前算清楚：
- 5 網域/天 × 4 頁 × 每頁 1 次 SerpApi = 20 次/天 → 月 600 次 → 超過 SerpApi 250
- 需要多把金鑰輪轉或付費方案

---

## 最終狀態

- ✅ Cloudflare Pages 部署成功
- ✅ 4 頁分析穩定、PageSpeed / OpenAI / SerpApi 全部正常
- ✅ GitHub repo 無敏感檔案洩露
- ⚠️ 受限於免費版，功能縮減（原規劃 30 頁 → 實際 4 頁）

---

## 參考連結

- Cloudflare Workers 免費限制：https://developers.cloudflare.com/workers/platform/limits/
- Nuxt runtimeConfig 與 env：https://nuxt.com/docs/guide/going-further/runtime-config
- Supabase Auth Redirect URLs：https://supabase.com/docs/guides/auth/concepts/redirect-urls
