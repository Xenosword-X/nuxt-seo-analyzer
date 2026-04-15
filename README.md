<div align="center">

# 🔍 Nuxt SEO Analyzer

繁體中文 SEO 深度分析工具 — 以繁體中文為核心、由 AI 自動產生健診報告的 SEO 分析平台。

[![Nuxt](https://img.shields.io/badge/Nuxt-3-00DC82?style=for-the-badge&logo=nuxt.js&logoColor=white)](https://nuxt.com/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Cloudflare](https://img.shields.io/badge/Deployed_on-Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![License](https://img.shields.io/github/license/Xenosword-X/nuxt-seo-analyzer?style=flat-square)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/Xenosword-X/nuxt-seo-analyzer?style=flat-square)](https://github.com/Xenosword-X/nuxt-seo-analyzer/commits/main)

</div>

---

## 📖 專案簡介

市面上主流 SEO 工具（Ahrefs、SEMrush、Screaming Frog）均為英文介面，台灣與華語圈的 SEO 從業者需要額外花時間理解英文報告。本工具以**繁體中文**為核心，提供中文 UI 與 GPT-4o-mini 自動產生的中文 SEO 健診報告，針對熟悉 SEO 的專業用戶設計。

### 核心特色

- 🌐 全繁體中文 UI 與分析報告
- - 🤖 輸入網域自動**全站分析**（最多 30 頁），無需手動選頁
  - - ⚡ **SSE 即時串流**：每完成一頁立即推送，不必等全部跑完
    - - 📊 **整站 Google 收錄量**：整站網頁 / 圖片收錄統計（24 小時快取）
      - - 🧠 GPT-4o-mini **整站一份**個人化中文 SEO 健診報告
        - - 🔄 三引擎降級索引檢查（SerpApi → ScraperAPI → Apify），多組金鑰輪轉
          - - 🔎 7 大 SEO 指標一次完整掃描（每頁）
            - - 📥 結果匯出 CSV / Markdown
              - - 🕓 歷史紀錄追蹤，含每筆收錄量摘要
               
                - ---

                ## ✨ 功能概覽

                <table>
                  <tr>
                    <td width="50%">
             
                      ### 🔍 分析功能
             
                - **頁面探索**：自動掃描 `sitemap.xml` + 首頁連結，合併去重
                - - **7 大 SEO 指標**：Meta 標籤、Core Web Vitals、Google 索引、標題結構、圖片 Alt、Schema、Robots/Sitemap
                  - - **SSE 即時串流**：每頁分析完成立即推送，進度條即時更新
                    - - **整站收錄量**：Google 網頁數 / 圖片數查詢，24 小時快取
                     
                      - </td>
                      <td width="50%">
               
                      ### 🧠 AI 與匯出
               
                      - **整站中文健診報告**：所有頁面完成後，GPT-4o-mini 彙整產出一份 Markdown 格式的繁體中文 SEO 報告
                      - - **CSV 匯出**：UTF-8 with BOM，每頁一列含 12 欄位，Excel 開啟無亂碼
                        - - **Markdown 匯出**：整站報告 + AI 摘要 + 各頁問題清單，適合貼入 Notion / 客戶提案
                          - - **歷史紀錄**：所有分析儲存於 Supabase，可回顧完整報告
                           
                            - </td>
                            </tr>
                            </tr>table>
               
                            ---
               
                            ## 🏗️ 技術架構
               
                            ### 前端
               
                            | 技術 | 說明 |
                            |------|------|
                            | [![Nuxt](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat-square&logo=nuxt.js)](https://nuxt.com) | 全端框架，使用 Nuxt 4 的 `app/` 目錄慣例 |
                            | [![Vue](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org) | Composition API + `<script setup>` |
                            | [![Nuxt UI](https://img.shields.io/badge/nuxt/ui-latest-00DC82?style=flat-square)](https://ui.nuxt.com) | UI 元件庫（UButton、UCard、UInput 等） |
                            | [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com) | Utility-first CSS 框架 |
                            | marked | Markdown 渲染（AI 報告內容） |
               
                            ### 後端
               
                            | 技術 | 說明 |
                            |------|------|
                            | Nitro | Nuxt Nitro Server routes，部署為 Cloudflare Workers |
                            | cheerio | 伺服器端 HTML 解析（meta tags、headings、images、schema） |
                            | fast-xml-parser | `sitemap.xml` 解析 |
                            | p-limit | 平行批次控制（每次 5 頁） |
                            | openai | GPT-4o-mini API 呼叫（中文報告產生） |
                            | SSE (`text/event-stream`) | 串流推送分析進度 |
               
                            ### 外部 API
               
                            | API | 用途 |
                            |-----|------|
                            | Google PageSpeed Insights | Core Web Vitals 分數（免費） |
                            | SerpApi | Google 索引狀態檢查（主引擎） |
                            | Apify | 索引狀態檢查（備援引擎一） |
                            | ScraperAPI | 索引狀態檢查（備援引擎二） |
                            | OpenAI GPT-4o-mini | 中文 SEO 健診報告產生 |
               
                            ### 資料庫與認證
               
                            | 技術 | 說明 |
                            |------|------|
                            | [![Supabase](https://img.shields.io/badge/Supabase-latest-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com) | PostgreSQL 資料庫 + Google OAuth2 認證 |
                            | Row Level Security（RLS） | 確保使用者只能存取自己的資料 |
               
                            ### 部署與測試
               
                            | 技術 | 說明 |
                            |------|------|
                            | [![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com) | 前端靜態資源 + Nitro server routes（Workers） |
                            | [![Vitest](https://img.shields.io/badge/Vitest-latest-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev) | 單元測試框架（69 tests，全數通過） |
               
                            ---
               
                            ## 🗄️ 資料庫結構
               
                            ```sql
                            -- 每日用量追蹤
                            daily_usage (
                              id uuid PK, user_id uuid FK, date date,
                              domain_count int, UNIQUE(user_id, date)
                            )

                            -- 分析工作階段（含整站收錄量快照與整站 AI 報告）
                            analysis_sessions (
                              id uuid PK, user_id uuid FK, domain text,
                              status text, page_count int, created_at timestamptz,
                              site_pages_indexed int,   -- 整站網頁收錄數
                              site_images_indexed int,  -- 整站圖片收錄數
                              site_indexing_engine text, -- 哪一個引擎成功回傳
                              site_indexing_cached boolean, -- 是否命中快取
                              ai_report text            -- 整站 AI 報告（Markdown）
                            )

                            -- 每頁分析結果
                            page_analyses (
                              id uuid PK, session_id uuid FK, url text,
                              meta_tags jsonb, core_web_vitals jsonb,
                              robots_sitemap jsonb, schema_data jsonb,
                              headings jsonb, images jsonb, indexing jsonb,
                              ai_report text, analyzed_at timestamptz
                            )

                            -- 整站收錄量快取（全域共享、跨用戶，TTL 24 小時）
                            domain_indexing_cache (
                              id uuid PK, domain text UNIQUE,
                              pages_indexed int, images_indexed int,
                              engine_used text, checked_at timestamptz, expires_at timestamptz
                            )
                            ```
               
                            ---
               
                            ## 📁 專案結構
               
                            ```
                            nuxt-seo-analyzer/
                            ├── app/
                            │   ├── assets/css/main.css        # Tailwind + NuxtUI 入口
                            │   ├── components/
                            │   │   ├── ScoreBar.vue           # 分數進度條元件
                            │   │   ├── IssueList.vue          # 問題清單元件
                            │   │   ├── MetaRow.vue            # Meta 欄位列元件
                            │   │   └── CWVItem.vue            # CWV 單項指標元件
                            │   ├── middleware/
                            │   │   └── auth.global.ts         # 全域 Auth 保護
                            │   └── pages/
                            │       ├── index.vue              # 登入頁
                            │       ├── confirm.vue            # OAuth 回呼頁
                            │       ├── dashboard.vue          # 主頁（輸入網域 + 歷史）
                            │       ├── analyze/
                            │       │   ├── running.vue        # 分析進度（SSE 即時串流）
                            │       │   └── result/
                            │       │       └── [sessionId].vue # 完整報告 + 整站收錄卡 + 匯出
                            │       └── history/
                            │           └── index.vue          # 歷史紀錄列表（含收錄摘要）
                            ├── server/
                            │   ├── api/
                            │   │   ├── analyze/
                            │   │   │   ├── discover.post.ts   # 掃描 sitemap + 建 session
                            │   │   │   ├── run.post.ts        # SSE 串流：分析 + 整站收錄
                            │   │   │   └── status/[sessionId].get.ts
                            │   │   ├── domain/
                            │   │   │   └── indexing.post.ts   # 整站收錄查詢（含快取）
                            │   │   ├── export/
                            │   │   │   └── [sessionId].get.ts # CSV / Markdown 匯出
                            │   │   ├── usage/
                            │   │   │   ├── check.get.ts       # 查詢今日用量
                            │   │   │   └── increment.post.ts  # 消耗一次用量
                            │   │   └── history/
                            │   │       └── index.get.ts       # 歷史 session 列表
                            │   └── utils/
                            │       ├── supabase.ts, usage.ts, domain.ts, sse.ts, report.ts
                            │       ├── discovery/             # sitemap.ts, homepage.ts
                            │       ├── analyzers/             # 七大指標（types, meta, cwv, robots, schema, headings, images, indexing）
                            │       ├── indexing/              # 三引擎降級（types, parse-keys, serpapi, scraperapi, apify, engine, cache）
                            │       └── export/                # csv.ts, markdown.ts
                            ├── supabase/
                            │   └── schema.sql                 # 資料庫 DDL + RLS 政策
                            ├── tests/                         # Vitest 單元測試（69 tests）
                            ├── docs/superpowers/              # 設計文件與實作計畫
                            ├── nuxt.config.ts
                            └── vitest.config.ts
                            ```
               
                            ---
               
                            ## ⚙️ 環境設定
               
                            複製 `.env.example` 為 `.env` 並填入以下變數：
               
                            ```env
                            # Supabase（由 @nuxtjs/supabase 直接讀取，不需 NUXT_ 前綴）
                            SUPABASE_URL=https://your-project.supabase.co
                            SUPABASE_KEY=your-anon-key
                            NUXT_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

                            # OpenAI
                            NUXT_OPENAI_API_KEY=sk-...

                            # 索引檢查 API（JSON 陣列格式，支援多組金鑰輪轉）
                            NUXT_SERP_API_KEYS=["key1","key2"]
                            NUXT_APIFY_KEYS=["key1","key2"]
                            NUXT_SCRAPER_API_KEYS=["key1","key2"]

                            # Google PageSpeed Insights（免費 API）
                            NUXT_PAGESPEED_API_KEY=AIza...

                            # 使用限制
                            NUXT_APP_DAILY_DOMAIN_LIMIT=5
                            NUXT_APP_MAX_PAGES_PER_RUN=30

                            # 全站分析設定
                            NUXT_DOMAIN_CACHE_TTL_HOURS=24     # 整站收錄快取時效（小時）
                            NUXT_SITE_INDEXING_ENABLED=true    # 是否啟用整站收錄查詢
                            ```
               
                            ---
               
                            ## 🛠️ 本機開發
               
                            ### 環境需求
               
                            - Node.js 22+
                            - - npm
                             
                              - ### 安裝與啟動
                             
                              - ```bash
                                # 安裝依賴
                                npm install

                                # 啟動開發伺服器
                                npm run dev
                                # 開啟 http://localhost:3000
                                ```
               
                                ### 執行測試
               
                                ```bash
                                # 執行單元測試
                                npx vitest run

                                # 執行測試（監看模式）
                                npx vitest
                                ```
               
                                ### Supabase 初始化
               
                                1. 在 [Supabase Dashboard](https://app.supabase.com) 建立新專案
                                2. 2. 至 SQL Editor 執行 `supabase/schema.sql`
                                   3. 3. 至 Authentication → Providers → Google，啟用並填入 Google OAuth2 Client ID / Secret
                                     
                                      4. ---
                                     
                                      5. ## 🚀 部署至 Cloudflare Pages
                                     
                                      6. ```bash
                                         npm run build
                                         ```
               
                                         透過 Cloudflare Pages 連接 GitHub repo 自動部署（Nitro preset 已設定為 `cloudflare-pages`）。在 Cloudflare Pages 的環境變數設定中填入所有 `NUXT_` 前綴的環境變數。
               
                                         ---
               
                                         ## 📋 使用流程
               
                                         ```
                                         1. 以 Google 帳號登入
                                         2. 在 Dashboard 輸入網域（例：example.com）→ 開始分析
                                         3. 系統掃描 sitemap.xml + 首頁，自動分析前 N 頁（預設 30 頁）
                                            同時平行查詢整站 Google 收錄量（網頁數 / 圖片數）
                                         4. 進度頁面透過 SSE 即時串流顯示進度，每完成一頁立即更新
                                         5. 全部頁面完成 → 產生整站 AI 中文健診報告 → 自動跳轉結果頁
                                         6. 結果頁查看完整報告
                                            ├── 頂部：整站 Google 收錄概況卡
                                            ├── 左側：頁面清單（✅ ⚠️ ❌ 標示問題數量）
                                            ├── 右側：7 大指標詳情 + AI 整站健診報告
                                            └── 右上角：匯出 CSV / Markdown
                                         7. 歷史紀錄頁面可回顧所有過去的分析（含收錄量摘要）
                                         ```
               
                                         ---
               
                                         ## 🧪 測試覆蓋範圍
               
                                         ```
                                         tests/server/utils/
                                         ├── usage.test.ts          # 用量追蹤邏輯
                                         ├── sitemap.test.ts        # Sitemap 解析
                                         ├── homepage.test.ts       # 首頁連結抽取
                                         ├── domain.test.ts         # 網域正規化
                                         ├── sse.test.ts            # SSE 事件格式
                                         ├── analyzers/
                                         │   ├── meta.test.ts, cwv.test.ts, robots.test.ts,
                                         │   ├── schema.test.ts, headings.test.ts,
                                         │   ├── images.test.ts, indexing.test.ts
                                         ├── indexing/
                                         │   ├── parse-keys.test.ts # env 變數解析（含 Nuxt destr 相容）
                                         │   ├── serpapi.test.ts    # SerpApi client
                                         │   ├── engine.test.ts     # 三引擎降級流程
                                         │   └── cache.test.ts      # 整站收錄快取
                                         └── export/
                                             ├── csv.test.ts        # CSV 匯出
                                             └── markdown.test.ts   # Markdown 匯出

                                         總計：69 tests（17 個檔案），全數通過
                                         ```
               
                                         ---
               
                                         ## 💡 技術決策說明
               
                                         **為什麼選 Nuxt 3 + Cloudflare Pages？**
                                         Nuxt Nitro 的 server routes 可以直接部署為 Cloudflare Workers，實現前後端同一個 repo、同一個部署流程，對 side project 而言維護成本最低。
               
                                         **為什麼選 Supabase 而非 Cloudflare D1？**
                                         Supabase 提供完整的 Auth（Google OAuth2）、Row Level Security、PostgreSQL，且開發者對其較熟悉，適合需要認證系統的應用。
               
                                         **為什麼用三引擎降級而非單一 API？**
                                         索引檢查涉及爬取 Google 搜尋結果，任何單一 API 都有配額限制與封鎖風險。三引擎降級加上多組金鑰輪轉，大幅提升可用性。
               
                                         **為什麼用 GPT-4o-mini 而非更強的模型？**
                                         SEO 報告生成是結構化任務，輸入資料明確（7 大指標 JSON），GPT-4o-mini 的輸出品質已足夠專業，且成本極低，適合 side project 規模。
               
                                         **為什麼從「每頁一份」改為「整站一份」AI 報告？**
                                         每頁一份 AI 報告對全站 30 頁的成本是 30 次 OpenAI 呼叫；整站彙整一次只呼叫一次，token 成本下降 80%，且報告更具整體觀點，更符合 SEO 顧問實務的呈現方式。
               
                                         **為什麼 SSE 而非輪詢？**
                                         30 頁分析需要 15–25 秒，輪詢每 2 秒一次會浪費頻寬與 DB 查詢；SSE 在分析事件發生當下即時推送，前端體驗更流暢。輪詢仍保留為斷線/重新整理的 fallback。
               
                                         ---
               
                                         ## 📄 License
               
                                         MIT
               
                                         ---
               
                                         <div align="center">
               
                                         Made with ❤️ by [Xenosword-X](https://github.com/Xenosword-X)
               
                                         </div>
                  </tr>
                </table>
