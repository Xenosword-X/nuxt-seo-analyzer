# 部署計畫：Cloudflare Pages

> 建立日期：2026-04-13
> 狀態：待執行（功能修改完畢後執行）

---

## 前置確認清單

在開始部署前，確認以下項目已完成：

- [ ] 所有功能已測試並符合預期
- [ ] `npx vitest run` 全數通過
- [ ] `.env` 所有變數已填入真實值
- [ ] GitHub repo 已建立並 push 最新 code

---

## Step 1：推送至 GitHub

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"

# 確認 remote 是否已設定
git remote -v

# 若尚未設定，在 GitHub 建立新 repo 後：
git remote add origin https://github.com/你的帳號/nuxt-seo-analyzer.git
git branch -M main
git push -u origin main
```

---

## Step 2：確認 .gitignore 不包含敏感檔案

確認 `.gitignore` 包含以下項目（不應推上 GitHub）：

```
.env
node_modules/
.nuxt/
.output/
client_secret_*.json
oauth_tokens/
credentials/
```

特別注意：專案根目錄有一個 `client_secret_849074806944-....json` 檔案，**絕對不能推上 GitHub**。

```bash
# 確認 .gitignore 是否擋住該檔案
git status
# 若出現在 untracked files，代表已被忽略（正常）
# 若已被 tracked，需執行：
git rm --cached "client_secret_*.json"
```

---

## Step 3：Cloudflare Pages 建立專案

1. 開啟 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左側 → **Workers & Pages** → **Create application** → **Pages**
3. 選擇 **Connect to Git** → 連結 GitHub 帳號
4. 選取 `nuxt-seo-analyzer` repo
5. 設定 Build：

| 設定項目 | 值 |
|---------|-----|
| Framework preset | **Nuxt.js** |
| Build command | `npm run build` |
| Build output directory | `.output/public` |
| Root directory | `/`（留空） |
| Node.js version | `20.x` |

6. 點擊 **Save and Deploy**（第一次會失敗，因為環境變數還沒設）

---

## Step 4：設定 Cloudflare Pages 環境變數

進入 Cloudflare Pages 專案 → **Settings** → **Environment variables** → **Production**

新增以下所有變數：

| 變數名稱 | 說明 |
|---------|------|
| `SUPABASE_URL` | `https://ovppylewvgkezwmcsmgn.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NUXT_OPENAI_API_KEY` | OpenAI API key |
| `NUXT_SERP_API_KEYS` | `["key1","key2"]`（JSON 陣列字串） |
| `NUXT_APIFY_KEYS` | `["key1",...]`（JSON 陣列字串） |
| `NUXT_SCRAPER_API_KEYS` | `["key1",...]`（JSON 陣列字串） |
| `NUXT_PAGESPEED_API_KEY` | Google PageSpeed API key |
| `NUXT_APP_DAILY_DOMAIN_LIMIT` | `5` |
| `NUXT_APP_MAX_PAGES_PER_RUN` | `10` |

設定完成後點擊 **Save**。

---

## Step 5：取得正式環境 URL

部署完成後，Cloudflare Pages 會分配一個 URL，格式如：
```
https://nuxt-seo-analyzer.pages.dev
```

或者你可以綁定自己的網域（選填）。

---

## Step 6：更新 Google OAuth2 回呼 URL

1. 開啟 [Google Cloud Console](https://console.cloud.google.com) → SEO-analyzer 專案
2. **API 和服務 → 憑證 → 你的 OAuth 2.0 用戶端**
3. 在「已授權的重新導向 URI」新增：

```
https://ovppylewvgkezwmcsmgn.supabase.co/auth/v1/callback
```

（這個 URI 應該在本機開發時已加入，正式環境用同一個 Supabase callback，不需要另外加）

---

## Step 7：更新 Supabase OAuth 設定（正式環境 URL）

1. 開啟 [Supabase Dashboard](https://app.supabase.com) → seo-analyzer 專案
2. **Authentication → URL Configuration**
3. 將 **Site URL** 改為正式環境 URL：

```
https://nuxt-seo-analyzer.pages.dev
```

4. 在 **Redirect URLs** 新增：

```
https://nuxt-seo-analyzer.pages.dev/confirm
```

---

## Step 8：觸發重新部署

回到 Cloudflare Pages → **Deployments** → 點擊 **Retry deployment**（或 push 任何 commit 觸發自動部署）。

---

## Step 9：驗收測試

部署完成後，用正式環境 URL 執行以下測試：

- [ ] 開啟正式環境 URL，出現登入頁
- [ ] Google OAuth2 登入成功，跳轉到 Dashboard
- [ ] 輸入網域 → 頁面探索正常
- [ ] 選擇頁面 → 分析執行 → 進度條更新
- [ ] 報告頁面正確顯示 7 大指標
- [ ] AI 中文報告有內容
- [ ] 歷史紀錄頁面正常
- [ ] Dashboard 顯示最近分析紀錄

---

## 注意事項

### Cloudflare Workers CPU 限制

Cloudflare Workers 免費方案每個請求有 **10ms CPU 時間**限制，付費方案為 **50ms**。

本專案分析頁面時，各指標是在獨立的 Worker 請求中執行，cheerio HTML 解析通常在 5-15ms 內完成，但若遇到特別大的頁面可能超時。

若發生超時問題，可考慮：
- 升級到 Cloudflare Workers 付費方案（$5/月）
- 或將耗時的分析 API 搬到 Railway/Render（需調整架構）

### 自動部署

設定好 Cloudflare Pages 連結 GitHub 後，每次 push 到 `main` 分支都會自動觸發部署，無需手動操作。

### 環境變數更新

若更新了 `.env` 中的變數，需要同時更新 Cloudflare Pages 的環境變數設定，並重新部署。

---

## 相關連結（部署完成後填入）

| 項目 | URL |
|------|-----|
| 正式環境 | `https://_____.pages.dev` |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Supabase Dashboard | https://app.supabase.com |
| Google Cloud Console | https://console.cloud.google.com |
