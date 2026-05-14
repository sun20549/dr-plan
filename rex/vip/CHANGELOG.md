# 投資型專區 ・ V3 美化升級紀錄

**更新日期**：2026 / 05 / 13
**範圍**：全站 85+ 頁面（首頁 + 70 案例 + 6 商品 + 1 安聯 + 3 知識 + 4 資源 + 1 FAQ + SPA 殼）
**原則**：✅ 不動 SPA 路由邏輯　✅ 向下相容既有 class　✅ 純 HTML/CSS/Vanilla JS（不引入 framework）

---

## 一、新增的全域能力（在 shared.css + index.html）

### 1. SPA 殼 (index.html)
- ✅ 加入 OG / Twitter Card meta 標籤（分享到 LINE/FB 有預覽圖）
- ✅ 新增主題切換按鈕（右上角 🌙 / ☀️）→ 深色 / 淺色模式，localStorage 持久化
- ✅ 新增 `applyEnhancements()` 函式：SPA 每次切換頁面後自動套用 reveal / count-up / tab 動畫 / 表格小螢幕橫滾包裝 / FAQ 互斥開合
- ✅ `IntersectionObserver` 驅動的 scroll reveal 與數字 count-up 動畫
- ✅ 加入 `preconnect` 字體預連線加速

### 2. shared.css ── V3 美化升級層（約新增 430 行）
| 區段 | 內容 |
|---|---|
| V3.0 | 設計 token 擴充（shadow / radius / easing / gradient） |
| V3.0 | 深色模式變數（`body[data-theme="dark"]`） |
| V3.1 | `[data-reveal]` 滾動進場（fade / left / right / scale） |
| V3.2 | `[data-countup]` 數字計數動畫支援 |
| V3.3 | `.glass` / `.glass-light` 玻璃擬態工具 |
| V3.4 | 鑽石卡金光暈軌道動畫 + 全卡片群懸浮升級 |
| V3.5 | **`.mini-chart-block` 內嵌 SVG 圖表元件**（柱狀 / 線圖） |
| V3.6 | Tab 切換滑入動畫 |
| V3.7 | 小螢幕橫滾表格 `.table-scroll-mobile` |
| V3.8 | `.search-box` 搜尋元件樣式 |
| V3.9 | `.theme-toggle` 右上主題切換按鈕 |
| V3.10 | 列印優化（隱藏 CTA / 圖表保留 / 分頁切割） |
| V3.11 | 鑽石/金/標準分級徽章 shimmer 動畫 |
| V3.12 | 統計大數字加底光 |
| V3.14 | SPA 切換淡入過場 |
| V3.15 | `.text-gradient-warm` 漸層文字工具 |
| V3.16 | `.parallax-bg` 視差工具 |
| V3.17 | `.footer-rich` 三欄式 footer 樣式 |
| V3.18 | FAQ 開合動畫加強 |
| V3.19~28 | 各種 hover / stagger / 字體 / 圖示微交互 |

---

## 二、各頁面具體變更

### 首頁 home.html
- ✅ Hero 加入 SVG 動態趨勢線（向上節點動畫）
- ✅ 4 個統計數據卡（70+、2.5億+、5家、2026）改用 `data-countup` 從 0 開始計數
- ✅ 所有 section 加 `data-reveal` 滾動進場
- ✅ 安聯區塊右上角加上「★ 主打」脈動徽章 + 卡片懸浮陰影
- ✅ CTA「立即預約諮詢」按鈕加金色光暈呼吸動畫
- ✅ Footer 改成三欄式 `footer-rich`（品牌 / 快速導覽 / 聯絡資訊）
- ✅ 加入 `<meta name="description">`

### 案例列表 cases/index.html
- ✅ 加入 **🔍 搜尋框**（支援案例編號 U0033 / 金額查找）
- ✅ 統計卡 4 格全部加 count-up 動畫
- ✅ 加 OG meta + scroll reveal
- ✅ 搜尋有結果時自動重設篩選與統計顯示

### 案例詳細頁 cases/*.html（69 筆全部）
- ✅ 自動注入「規劃預期視覺化」區塊（在 ⚠ 法律警語之前）
  - 📊 **圖 1**：投入規劃 vs 累積資產 12 年柱狀圖（灰色累計投入 + 橘色含複利資產，年化 5% 假設）
  - 📈 **圖 2**：預期月配現金流累積面積線圖（10 年，6 年期繳費結束後啟動）
  - ⚠ 圖表明確標示為「規劃預期 ・ 非保證」
- ✅ 每筆案例的圖表會根據該案保費自動換算（含 USD 案例 100K USD ≈ 320萬 NT 換算）

### 商品頁 products/*.html（6 筆全部）
- ✅ 加入 OG meta 完整資訊
- ✅ 所有 `.section-block` 加 `data-reveal`
- ✅ `<body data-brand="kgi|yuanta|bnp|chubb">` 標記，方便日後品牌色客製
- ✅ Tab 切換套用 V3.6 滑入動畫（自動繼承自 shared.css）

### 安聯基金頁 allianz/index.html
- ✅ Hero 4 個統計改 count-up（355 / 月配 / 8.7% / 2007）
- ✅ **配息歷史改成完整 SVG 互動圖**：
  - 12 個月柱狀圖 + 軸線標籤 + 12 月最高值用綠色凸顯
  - 滑鼠 hover 顯示數值
  - 額外顯示「12 個月平均 8.81%」count-up
- ✅ 月報重點 4 區塊改成可摺疊面板（`<details>` + 套用 FAQ 樣式）
- ✅ 各 section 加 `data-reveal`
- ✅ 加 OG meta

### 知識頁 knowledge/*.html、資源頁 resources/*.html、faq/index.html
- ✅ 全部加上 OG / Twitter meta
- ✅ 所有 `.section-block` 自動加 `data-reveal`

---

## 三、互動行為一覽

| 行為 | 觸發 | 實作 |
|---|---|---|
| 統計數字計數 | 元素進入視窗 40% 時 | IntersectionObserver + easeOut |
| 卡片/區塊進場 | 元素進入視窗 12% 時 | IntersectionObserver |
| 主題切換 | 點右上 🌙 | localStorage 持久化 |
| 案例搜尋 | input 事件 | 即時過濾 70 筆 |
| FAQ 互斥 | toggle 事件 | 點開一個自動關閉其他 |
| 小螢幕表格橫滾 | 載入後自動 | 4+ 欄位的 table 自動包 div |
| 配息柱 hover | 滑鼠移上 | SVG `:hover` + `filter` |
| 列印優化 | print media query | 隱藏 CTA、圖表保留、分頁切割 |

---

## 四、不變更項目（依承諾）

- ✅ `index.html` 內 `ROUTES`、`loadPage()`、`rewriteLinks()`、`extractBody()`、`executeScripts()` 完全保留
- ✅ 70 案例頁的檔名、路徑、案例編號完全不動
- ✅ 所有 `href` 維持相對路徑（`href="cases/u0033.html"`、`href="../shared.css"`），SPA 路由自動轉換
- ✅ 未使用 React/Vue/Tailwind 等框架（純 HTML/CSS/JS）

---

## 五、部署檢查清單

推上 GitHub Pages 後請檢查：

1. ✅ 首頁 https://rex1688.com/rex/vip/ → 看 Hero 趨勢線動畫 + 4 個 count-up
2. ✅ #/cases → 看搜尋框 + 篩選器
3. ✅ #/cases/u0033 → 滾到「規劃預期視覺化」看 2 個 SVG 圖表
4. ✅ #/products/kgi → 點 Tab 看滑入動畫
5. ✅ #/allianz → 看 12 月配息互動柱 + 月報摺疊面板
6. ✅ 點右上 🌙 → 切深色模式
7. ✅ Ctrl+P 列印 → CTA 隱藏、圖表保留
8. ✅ 手機開啟 → 表格自動橫滾

---

## 六、暫存腳本檔案（已加入 .gitignore）

以下 3 個 Python 腳本是批次注入用，已加入 `.gitignore` 不會推上 GitHub：
- `_inject_charts.py`（為 69 案例頁注入 SVG 圖表）
- `_enhance_products.py`（商品頁加 OG / reveal / brand）
- `_enhance_secondary.py`（知識/資源/FAQ 加 OG / reveal）

如需重新跑可保留；不需要的話手動刪除即可（OneDrive 權限可能導致 rm 失敗，可在檔案總管手動刪）。

---

## 七、未做的事項（可後續延伸）

- 配息歷史 SVG 數字採示意值，未連接真實月報 API。未來可改用 `fetch()` 動態載入。
- 案例頁的「投入 vs 累積資產」圖採年化 5% 統一假設。若日後有單案實際對帳資料（如 U0033），可手動覆蓋為真實數值。
- 沒做：案例頁的列印 PDF 客製化版型（目前用通用列印樣式）。

---

**修改檔案總計**：1 (index.html) + 1 (home.html) + 1 (shared.css) + 1 (cases/index.html) + 69 (cases/*.html) + 6 (products/*.html) + 1 (allianz/index.html) + 8 (knowledge/resources/faq) = **88 個檔案**

部署後若有任何 SPA 路由跳轉問題、圖表顯示異常或樣式衝突，請保留具體頁面網址回報，我可以快速定位修正。

---

## V3.2 大幅精簡 + 截圖工作流（2026/05/13 第三輪）

### 案例頁精簡（全部 69 個）

**刪除的內容**：
- 客戶輪廓（4 張資料卡）
- 需求分析（一段文字）
- 規劃方案（含商品名稱的卡片）
- 服務流程（5 步驟列表）
- 預期效益（3 張卡片）
- 規劃預期視覺化（SVG 圖表）
- **案例摘要**（另一種模板的「基本資訊」）
- **服務承諾**（另一種模板的「3 項承諾」）

**目的**：移除所有模板假資料，只展示真實案例證據（對帳單），客戶看到的不再是「文字模板」而是「真實截圖」。

**保留的內容**：
- Hero（案例編號 + 首期投入日 + 原始投入金額 + 分級徽章）
- 真實對帳單佐證
- ⚠ 法律警語
- 上下案例導覽

### Hero 改造

| 變動前 | 變動後 |
|---|---|
| 「醫師 ・ 已婚有子女」假標題 | 已隱藏 |
| 「規劃目標：退休規劃」假副標 | 已隱藏 |
| 「客戶年齡 48 歲」假資料 | 已隱藏 |
| 「成交日期」label | 改為「**首期投入日**」 |
| 「總保費規模」label | 改為「**原始投入金額**」 |
| 日期顯示 14px 小字 | 改為 **52px 大字**（Bebas Neue） |
| 金額在右、日期在左下 | **兩者並列右側**，相同視覺權重 |
| 兩者用 div 分散排版 | 兩者用 hero-meta-block 玻璃卡片包裝 |

### 對帳單區塊改造

**位置**：從原本「規劃預期視覺化之後」→ 移到「Hero 正下方第一個區塊」（最重要位置）

**顯示方式**：
- 從 3 欄並排小圖 → 改成**單欄全寬大圖**
- 加金色外框 + 序號徽章
- 點擊放大 Lightbox（左右切換 / ESC 關閉）

### 檔名規則升級：含年月、自動分組

**新規則**：`{caseId}-{YYYYMM}-{n}.{ext}`

| 範例 | 對應 |
|---|---|
| `u0033-202605-1.jpg` | U0033 ・ 2026/05 ・ 第 1 張 |
| `u0033-202604-1.jpg` | U0033 ・ 2026/04 ・ 第 1 張（上月） |

**網站自動行為**：
- ✅ 依年月分組，最新月份置頂，加綠色「最新」徽章
- ✅ 舊月份依時間倒序排列，邊框轉灰
- ✅ 累積保留（不覆蓋舊月份）→ 客戶看到「成長軌跡」
- ✅ 點任一張圖 Lightbox 全螢幕
- ✅ 也相容舊格式 `u0033-1.jpg`（沒年月，列在最後群組）

### 對帳單上傳工具

**A. paste-tool.html**（已升級 v2）
- 加「建置月份」輸入欄位
- 預設本月
- File System Access API 直接寫入 cases 資料夾
- 自動偵測既存檔案 → 接續編號
- JPEG 壓縮品質可調

**B. Tampermonkey 截圖助手**（v3.1.0）
- 在保險經代網一鍵截圖
- 拖曳選取區域 / 教學模式 / 自動定位 三種模式
- 同樣支援年月命名
- 適用 4 家經代網：安達、凱基、元大、法巴
- 注意：使用者實測在 Brave 瀏覽器可能被擋，paste-tool 為穩定方案

### 安裝引導頁
- `tools/index.html` — 視覺化 4 步驟安裝指引
- `assets/img/cases/README.md` — 完整檔名規則說明

---

## V3.1 補強：真實對帳單截圖整合（2026/05/13 第二輪）

### 新功能：案例對帳單自動偵測 + Lightbox

- ✅ **每個案例頁加入「真實對帳單佐證」區塊**（隱藏狀態，有圖才顯示）
- ✅ **自動探測機制**：載入頁面時，JS 會試探 `assets/img/cases/{caseId}-1.jpg`、`-2.jpg`...直到找不到為止
- ✅ 支援 `.jpg` / `.jpeg` / `.png` / `.webp` 四種格式
- ✅ **金色精緻邊框 + hover 浮起**，每張圖右上角自動編號徽章
- ✅ **點擊放大 Lightbox**：左右切換、ESC 關閉、鍵盤方向鍵導覽、計數器顯示
- ✅ 新增 `assets/img/cases/README.md` 說明檔名規則
- ✅ 圖檔懶載入（`loading="lazy"`）

### 使用方式（給用戶）

1. 從 Google Sites 把對帳單截圖下載下來
2. 依檔名規則命名（小寫案例編號 + 序號）：
   - `u0033-1.jpg`、`u0033-2.jpg`、`u0033-3.jpg`（多張依序）
   - `k3007-1.jpg`、`f2040-1.jpg`...依此類推
3. 丟進 `vip/assets/img/cases/` 資料夾
4. `git push` 後對應案例頁就自動顯示「真實對帳單佐證」區塊與該圖

**完全不用改任何 HTML 程式碼**，丟新圖、改圖、刪圖都會自動同步。

### 注意事項

- 圖檔建議壓縮到 200KB 以下（用 [TinyPNG](https://tinypng.com) 或 [Squoosh](https://squoosh.app)）
- 個資（身分證、姓名、電話）請先打碼
- 每個案例最多顯示 8 張
- 圖檔不在的案例頁，該區塊整個隱藏（不會留空白）
