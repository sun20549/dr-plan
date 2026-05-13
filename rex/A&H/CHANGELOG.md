# 變更紀錄(累計)

## 📅 v3_22(2026/05/13 — Phase 2 業務功能加值)

### 新增 — 不動主檔內部邏輯,用 sidecar 模組擴充

**動機**:備忘錄列出 7 項 pending 業務功能(責任缺口、保費佔比、稅務、理賠合計、年齡提醒等),都是「告訴客戶為什麼這份建議書是適合他的」必備工具。一次補齊。

**策略**:Sidecar 設計
- 主檔 v3_21 → v3_22:只加 4 行 `<link>` + `<script>` 載入新模組,內部邏輯零修改
- 新增 `enhancements.js`(563 行)+ `enhancements.css`(247 行)
- 用 `MutationObserver` 監聽 `#totalAnnual` 文字變更 → 自動觸發新功能渲染
- 用 `localStorage` 持久化客戶資料輸入

**新功能清單**:

| # | 功能 | 位置 |
|---|------|------|
| 1 | **需求分析輸入面板**(年收入/家庭/房貸/退休年齡) | 投保人員資料 ↓ 之下 |
| 2 | **責任缺口分析**(壽險、意外、重大傷病、醫療日額/實支)| 試算結果 ↓ 之下 |
| 3 | **保費佔收入比警示**(< 5% 可加保;5~10% 健康;> 15% 過重)| 同上 |
| 4 | **理賠合計**(跨公司彙整 8 種主要給付類型)| 同上 |
| 5 | **24,000 元稅務扣除額提醒** | 同上 |
| 6 | **未滿 15 歲文件提醒**(《保險法》107 條 + 法代簽名)| 同上 |
| 7 | **保證/非保證續保標示** + **自然/平準費率標籤**(注入到 #resultTbody 列)| 試算結果表格 |
| 8 | **險種比較連結**(toolbar 加 `📊 險種比較` 按鈕)| 主系統 toolbar |

**檔案異動**:
- 新增:`enhancements.js`(20KB)
- 新增:`enhancements.css`(7KB)
- 新增:`保險建議書系統_v3_22.html`(305.9KB,= v3_21 + 4 行 head 注入 + 1 行 toolbar 連結)
- 覆蓋:`index.html` 指向 v3_22 內容(原 index.html 備份為 `index.html.bak_v3_23`)

**沒動的東西**(回歸風險為零):
- ❌ 主檔 INSURANCE_DB / state / App IIFE 內部
- ❌ shared.js / 所有 JSON
- ❌ recompute / renderBenefits / 任何核保邏輯

**驗證**:
- 0F 1 歲 + 全球全勾 = **22,815 元**(基準仍正確 ✓ — 因為核保邏輯未動)
- 0 歲女嬰金標準 = **24,056 元**(同上)
- JS 語法檢查:`node -c enhancements.js` 通過 ✓
- CSS 大括號平衡:90 opens / 90 closes ✓

**Rollback 方案**:
- 出問題改 `index.html` 把 4 行 enhancements 注入刪掉即可(主檔邏輯本來就沒變)
- 或直接 `cp 保險建議書系統_v3_21.html index.html` 還原到 Phase 1 狀態

---

## 📅 v3_21(2026/05/11 — A&H-9 資料層重構)

### Phase 1:抽出共用純函式 + benefitsLib 改 fetch 載入

**動機**:即將開發「險種比較網站」(`compare.html`),需要與建議書系統共用商品條款邏輯。若不重構,兩邊各維護一份 `classifyItem` / `categorize5` / `calcBenefitValue` / `convertProductClaims`,以後改條款必雙地同步,風險高。

**重構範圍(僅資料層,不改任何使用者可見行為)**:

1. **`benefitsLib` 從內嵌 HTML 改 fetch 載入**
   - 原本 INSURANCE_DB.benefitsLib 內嵌 125 行 JS 物件字面量
   - 抽出成 `benefitsLib.json`(14KB,10 個全球商品的給付定義)
   - `loadInsuranceData()` 多 fetch 一個檔,結果指派回 `INSURANCE_DB.benefitsLib`

2. **4 個純函式抽到 `shared.js`**:
   - `convertProductClaims(product)` — JSON.claims.items → benefitsLib 格式
   - `calcBenefitValue(item, product, amount)` — 計算單項給付金額
   - `classifyItem(item)` — item 歸到 cls.key
   - `categorize5(product)` — 商品歸到 4+1 大類
   - 全部 export 在 `window.AHShared.*`
   - HTML 內所有呼叫點不變,用 alias 對接(`const classifyItem = window.AHShared.classifyItem`)

3. **`index.html` 自動跳轉**(新增)
   - 解決「網址必含中文長檔名」的痛點
   - meta refresh 0 秒指向 `保險建議書系統_v3_21.html`
   - 業務員短網址:`rex1688.com/rex/A&H/`

**檔案異動**:
- 主檔:`保險建議書系統_v3_20.html`(7893 行)→ `保險建議書系統_v3_21.html`(7662 行,瘦 231 行)
- 新增:`shared.js`(11.6KB,4 個純函式)
- 新增:`benefitsLib.json`(14KB,10 商品)
- 新增:`index.html`(自動跳轉用,0.8KB)

**測試**:shared.js 通過 33/33 單元測試(含 classifyItem 全分類、categorize5 全公司、calcBenefitValue 五種 calc.type、convertProductClaims 四種 amountUnit)。

**未驗證項目**:**實機部署測試** — 0F 1 歲 + 全球全勾 = 22,815 元的真實瀏覽器流程,需 A&H-9 接手者於本機跑過。詳見 `驗證checklist.md`。

**保留事項**:
- 法令過濾(XAB 未滿 16 歲)、核保檢查(`aggregateUnderwriteCheck` / `hasBlockingIssue`)、所有渲染函式(`renderBenefits` / `renderSubCard` / ...)**都留在主檔**,不抽出。這些跟建議書流程綁定,比較網站用不到。

**Rollback 方案**:出問題改 `index.html` 把 url 指回 `保險建議書系統_v3_20.html` 即可。

---

## 📅 v3_20(2026/05/11 — A&H-9 起始)

### Phase H:簡易模式 ✓ 改成「依條款」+ 白名單放寬

**問題**(使用者回報):啟用公司篩選器後,單獨看新光/富邦/宏泰時,很多卡片只顯示 `✓` 看不出來是什麼;宏泰加護病房不見;富邦住院醫療大類整個消失。

**根因**:這些都是「簡易模式原本就存在的盲點」,只是混在「全部」視角時被全球的完整數字蓋過去,一旦單獨看某家就暴露。

**解法**:
1. **`✓` 改「依條款」**:在 `renderSubCard` 內,當 `numVals.length === 0` 時:
   - 若 items 內有 `result.type === 'text'`(已算出的文字規則)或 `item.note`(條款描述)→ 顯示「依條款」(灰色小字 `.bsc-rule-text`),並把前 3 筆規則彙總成 tooltip
   - 真的什麼都沒有才顯示 `✓`
2. **`ALLOWED_CARDS` 白名單放寬**:
   - `medical_實支實付型`:+ `surgery`、`icu_daily`(原為 daily/reimburse/opsurg)
   - `medical_定額型`:+ `reimburse`、`opsurg`、`icu_daily`(原為 daily/surgery)
   - `cancer`:+ `chemo`、`targeting`、`reconstruct`、`transplant`(原為 critical/daily/surgery)
   - `accident`:+ `surgery`、`dislocation`(原為 death/disability/reimburse/daily)
3. **`TITLE_OVERRIDE` 對應補齊**:新加入的 cls.key 都補上中文標題

**檔案**:`保險建議書系統_v3_19.html` → `保險建議書系統_v3_20.html`(本次升小版號)

**影響行**:
- CSS `.bsc-rule-text`(line ~1400 附近)
- JS `ALLOWED_CARDS`(line ~6388)
- JS `TITLE_OVERRIDE`(line ~6405)
- JS `renderSubCard` 內 displayText fallback(line ~6493)

---

## 📅 v3_19 之前(A&H-8 累積)

### Phase G(2026/05/09):理賠卡片公司篩選器
**問題**:詳細模式下,每個給付類型把所有公司的項目堆在一張大卡裡,選 5 家公司、商品又多時長到看不下去。

**解法**:在 `#benefitsCard` 的 `card-body` 頂端加一條公司篩選列(pill-button row)。
- 動態渲染 — 只列「使用者實際勾選且非 waiver」的公司,沒選就不顯示
- 預設「全部」(維持原跨公司整合呈現),點擊單一公司 → 該模式下只顯示該家
- 簡易/詳細兩種模式皆支援
- 1 家以下時不顯示(沒篩選意義)
- 列印 (`@media print`) 時隱藏(`no-print` class)
- 行動版自動調小

**新增 / 修改**:
- HTML: `#benefitsCompanyFilter` div(`card-body` 第一個子元素)
- CSS: `.benefits-company-filter` + `.bcf-btn` + `.bcf-dot` + `.bcf-label` + `.bcf-count`(line ~138)
- State: `state.benefitsCompanyFilter = 'all'`(預設)
- JS: `renderBenefitsCompanyFilter(rows)` 新函式 — 收集 cid 後渲染按鈕
- JS: `renderBenefits()` 開頭加 `rows = rows.filter(r => r.companyId === filterCid)`(filter ≠ 'all' 時)
- JS: `bindBenefitsModeEvents()` 加上 event delegation 處理 `.bcf-btn` 點擊

**保險措施**:
- Stale state:當前選中公司被取消勾選 → 自動 reset 為 'all'
- Empty state:當前公司被篩掉所有 row(理論上不會發生)→ 顯示「所選公司沒有理賠資料」
- HTML escape:`escapeHtml()` 包公司名/cid,避免 XSS
- 不影響 `waiverRows` 累積邏輯(豁免卡片仍依篩選結果)

### Phase A:列印 PDF 優化(承接自 A&H-7)
- ✅ 投保人員資料改三欄 grid(被保險人 / 關係方塊 / 要保人)
- ✅ 沒勾選要保人時,被保險人占滿一行,粉紅圓圈隱藏
- ✅ 建議內容彙整 `overflow-x:auto` 包覆容器改 `overflow:visible`,確保完整顯示
- ✅ tfoot「應繳合計」`page-break-inside: avoid`,不被切斷
- ✅ 列印隱藏:複製按鈕、分期係數註解、走勢圖「依公司分/依商品分」
- ✅ summary-bar 半年/季/月繳直向堆疊靠右,字體從 16pt → 9pt
- ✅ #benefitsCard 強制 `page-break-before: always`(從新頁開始)

### Phase B:卡片視覺改造(降躁化)
- ✅ 5 大類左色條從多色 → 統一淡灰品牌色 `#B8C5D1`
- ✅ 大類框背景 `#F7F9FB`,移除虛線分隔
- ✅ 卡片去 1px 邊框,改 `box-shadow: 0 1px 3px rgba(20,40,60,0.04)`
- ✅ icon 透明度降至 0.7
- ✅ 數字字體從 Bebas Neue → Inter/Roboto + tabular-nums
- ✅ 數字色從鮮紅 → 深藍 navy,只「主要保障」用品牌橘
- ✅ 公司標籤從深底白字 → 淡灰底深灰字 + 左側偽元素小色點(`--company-color`)
- ✅ 詳細模式總額條從黑底黃字 → 淡橘底深橘字
- ✅ 詳細模式項目列表行距從 7px → 9px

### Phase C:分類重構(5 大類 → 4+1)
- ✅ 「壽險」→「人身/失能保障」(含 XTK 一般身故/失能)
- ✅ 「住院醫療」拆「實支實付型」「定額型」子組
- ✅ 「重大傷病」「癌症險」拆兩個獨立大類
- ✅ 「意外醫療」失能項目歸進來,設為主要保障
- ✅ 拿掉「其他保障」「重大燒燙傷」「滿期/祝壽」(白名單刪)

### Phase D:跨公司給付加總 bug 修正
- ✅ regex `/^元(\/[次日年])?$/` 漏寫「天」字 → 補成 `[次日年天]`
- ✅ 影響:住院日額/意外日額/癌症日額多筆累計時取 max → 改成 sum

### Phase E:自負額型實支實付計算
- ✅ XHO「住院日額(限額)」與「住院日額(自負額)」配對
- ✅ 淨給付 = 限額 − 自負額(被保人實際拿到)
- ✅ XHD 1000 + (XHO 4000 − 1000) = 4000 元/天

### Phase F:多公司分類修正
- ✅ 38 個商品(新光/宏泰/富邦/富邦人壽)全部能正確分類到 4 大類
- ✅ 修正 `categorize5` 順序:先看意外/豁免,再判斷醫療型態
- ✅ `convertProductClaims` 完整支援 amountUnit:`萬元/萬/10萬/百元/元`

### Phase F+:資料層修正
- ✅ XHO 從 6 項擴充到 12 項(每項拆「限額/自負額」配對)
- ✅ XCF 從 3 項擴充到 5 項(補首年減半金額)
- ✅ NIR 住院日額改成「住院日額+雜費補助合計」(計4 = 6000 元/天)
- ✅ NIR 外科手術定額改 `90,000`(條款「同次最高 3 倍」)
- ✅ XHD/XHO item name 改名觸發正確 classifyItem cls.key

### Phase F++:法令限制檢查
- ✅ 未滿 16 歲被保人:XAB 意外身故金不顯示(條款限制)
- ✅ 未滿 15 歲身故金額累計檢查:超過 690,000 元(《保險法》107 條)觸發 block 警告

### Phase F+++:走勢圖
- ✅ 預設改 20 年,新增按鈕「20/30/60 年」三選一切換
- ✅ 連動下方各年度保費明細表

---

## 🧯 過去除錯紀錄(經驗值)

1. **JS regex 補錯字邊界很重要**
   - `/^元(\/[次日年])?$/` 看起來合理,但漏「天」→ 元/天 通通不匹配
   - 解法:看實際出問題的 unit 字串,逐一確認

2. **categorize5 規則順序敏感**
   - 原本「壽險」優先於「意外」,FUBON ADG 意外險 category 寫「終身壽險」 → 被歸 life
   - 解法:先檢查意外/傷害字眼 + code 白名單,再判斷其他類別

3. **XAB 未滿 16 歲法令**
   - 條款明訂 16 歲前不給付意外身故,但系統照算 200 萬
   - 解法:在 item 分發階段過濾,不顯示卡片

4. **XHO「每日病房費」name 不命中 daily 規則**
   - classifyItem 的 daily 規則需含「保險金」或「住院.*日額」
   - 「每日病房費」沒含這兩者 → 跑到 reimburse 規則 → 進錯卡
   - 解法:item name 改為「住院日額(限額)」「住院日額(自負額)」

5. **簡易模式白名單窄 → 單一公司視角下會「藏掉」項目**
   - A&H-9 起放寬,但仍然要注意:加新 cls.key 到白名單時,TITLE_OVERRIDE 也要同步補

---

## 📋 從 A&H-7 帶過來的歷史

A&H-7 transcript 摘要:
- 保險建議書系統 HTML 客製化任務
- 從原本 XWA 豁免保費精算整合 → 移除 XWA 功能
- 清理 JSON 檔(transglobe 從 548KB → 145KB,XW費率 從 548KB → 263KB)
- 修改建議保障內容版面為 5 大類分組
- 列印 PDF 樣式優化
- UI 視覺重構(初版)
- 4 大類版面合併與 Masonry 堆疊(部分完成,A&H-8 完成剩下)

完整 transcript:`/mnt/transcripts/2026-05-08-09-03-59-insurance-html-customization.txt`
