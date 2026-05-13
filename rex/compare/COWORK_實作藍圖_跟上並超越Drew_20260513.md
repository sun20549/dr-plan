# Cowork 實作藍圖 — 跟上並超越 Drew

**藍圖日期**:2026-05-13
**對標來源**:drew.leishan.app(磊山內部 Drew 系統)
**目標**:`compare/index.html` → 功能對齊 Drew + 加上 5 項 Drew 沒有的強化
**測試已驗證的兩個關鍵互動**:點年度排序 ✅ / 下載按鈕(KM 靜態檔)✅

---

## 一、Drew 兩個關鍵互動的實測結論

### A. 點年度 row 排序(本機沒有,要補)

**驗證方式**:在 /comparison 頁點 Y5 / 40 歲那一列。

**Drew 行為**:
- 點任何一個「保單年度 / 保險年齡」cell(例如 Y5 40 歲)
- 整個比較表的商品欄會以**那一年的數值**由強到弱重排
- 排序後粉紅高亮範圍會跟著變(從原本的局部最高,擴大成新排序的視覺指引)
- 原本順序:友邦 / 台灣 / 全球 / 安達 → 點 Y5 後:**台灣 NUPW0601(667.3%) / 台新 UPD061(640.4%) / 第一金 FVY1(542.9%) / 台灣 NUPW0102(526.6%)**

**DOM 線索**:點擊 cell class 是 `age-data-style-pc`、`year-data-style-pc`,父容器 `year-age-data-pc`。本機可以仿造同樣的事件委派模式。

**本機現況**:已經有 Y6/Y10/Y20/Y30/Y65/Y80 跳轉鈕(這 Drew 沒有,你贏了),但**沒有「點哪年就用那年排序」**的功能。

### B. 下載按鈕實作方式(本機沒有,要補)

**驗證方式**:點某商品的「下載試算表」按鈕。

**Drew 行為**:
- 點下去 → 觸發 spinning loader → 跳「✓ 試算表下載完成囉」成功 modal
- modal 裡有一個 anchor:**`<a href="https://km.leishan.app/files/42245/...xlsm" target="_blank" download="...">`**
- 真實檔案存在 `https://km.leishan.app/files/<id>/<filename>` — **磊山 KM 知識庫的靜態檔**
- 檔名格式:`<公司><商品名>(<KEY>)-試算表<YYYYMMDD>.xlsm`(例:`台灣人壽臻威豐美元分紅終身壽險(NUPW0601)-試算表20260509.xlsm`)
- `20260509` 是 KM 上傳日期,**不是用戶試算當下時間**;Drew **沒有把用戶輸入帶進 Excel**,只是給空白範本給使用者回去自己填
- modal 還有「直接點擊下方連結取得試算表檔案」備援文字

**這比想像中簡單**:不是 server 端產 Excel,是純前端 anchor + 帶 KM 公開 URL。可以在 manifest 補 `xlsm_url` / `pdf_url` 欄位,UI 直接渲染兩個 anchor。

---

## 二、實作藍圖(三層:跟上 → 對齊 → 超越)

### 🔵 Layer 1 — 跟上(Drew 有的,本機要補)

按工作量由小到大排:

| # | 項目 | 改動位置 | 預估 | 對應 Drew |
|---|---|---|---|---|
| L1-1 | 補齊 4/7/9/15/25/30 年期 + 躉繳 | `index.html:1118-1130` `<select id="period">` | 5 min | 表單欄位完整 |
| L1-2 | Step 1 預算欄自動千分位逗號 | `<input id="budget">` 加 `oninput` formatter | 10 min | 已實作 |
| L1-3 | Step 2 不可試算商品標警告(投保年齡超限),不過濾 | step 2 渲染邏輯 | 15 min | ⚠️ 投保年齡超過 14 歲 |
| L1-4 | Step 3 頂部 persistent banner(性別 \| 年期 \| 預算) | step 3 開頭加固定列 | 10 min | 藍色 banner |
| L1-5 | 比較表 5 列分組條紋(Y1-5、Y6-10...) | compare-table CSS `tr:nth-child(5n+1)` | 10 min | 視覺分組 |
| L1-6 | **點年度 row 強→弱排序**(關鍵互動 A) | compare table 加 click handler | 30 min | 點 Y5 排序 |
| L1-7 | 商品欄水平 carousel(左右箭頭切商品) | 包 wrapper + 兩個方向鍵 | 45 min | slick arrows |
| L1-8 | 完整 7 條註腳(增額繳清抵繳保費、紅色標記公式、未滿 15 歲喪葬險上限等) | step 3 footer-note 擴寫 | 20 min | 註1~註7 |
| L1-9 | **每商品「下載試算表 / 下載 PDF」按鈕**(關鍵互動 B) | manifest 補 `xlsm_url` `pdf_url`、表頭加「檔案下載」列、anchor 渲染 | 1 h | KM anchor |
| L1-10 | 下載成功 modal(✓ 大綠色勾 + 連結備援) | 加 modal component | 30 min | success-modal |
| L1-11 | URL 參數可分享(`?name=&gender=&birthday=&type=&period=&budget=`) | `history.pushState` + `URLSearchParams` 還原 | 1 h | bookmark URL |
| L1-12 | 「製作分享連結」按鈕 | 比較頁右上加按鈕,複製當前 URL | 20 min | check-btn |
| L1-13 | 浮水印「僅作教育訓練 嚴禁銷售」鋪滿背景 + 列印帶出 | `position:fixed` div + `print-color-adjust:exact` | 20 min | 整頁浮水印 |
| L1-14 | Step 1 開場 modal「⚠️ 提醒您 系統僅供教育訓練...」 | 加首次進入 modal | 20 min | 開場 modal |

**Layer 1 總計**:約 5.5 小時

---

### 🟢 Layer 2 — 對齊(Drew 有但需要決策)

| # | 項目 | 預估 | 為什麼要決策 |
|---|---|---|---|
| L2-1 | 保額調整 ⚙️ 齒輪(每商品列右側,點開 modal 改保額即時重算) | 3 h | 需要設計交互(modal vs inline) |
| L2-2 | 商品列保額右側 ↗ 箭頭(快速 +/- 一單位) | 1.5 h | 跟 L2-1 取捨 |
| L2-3 | 頂部 navbar(連磊山其他內部系統)| 1 h | 你需不需要做成磊山 portal 一部分? |
| L2-4 | 排序動畫(切換時平滑過渡) | 2 h | 依 L1-6 完成度決定 |

---

### 🟡 Layer 3 — 超越(Drew 沒有的,你可以反殺)

這些是 Drew **沒做** 但你可以加上去拉開差距的:

| # | 項目 | 預估 | 為什麼比 Drew 強 |
|---|---|---|---|
| **S-1** | **比較頁加「分紅型」商品支援** | 半天 | Drew 類型只有 6 種利變,沒分紅;你已有第 7 種「美元分紅終身壽險」+ taishin_v1 引擎,把 PFA(美富紅運)等分紅商品放進來,Drew 客戶找不到的你能找 |
| **S-2** | **USD ↔ TWD 即時匯率切換**(已有,可串台銀牌告 API) | 1 h | Drew 完全沒有,業務員談本國/海外客戶要切 |
| **S-3** | **Y6/10/20/30/Y@65/Y@80 跳轉鈕**(已有) | 0 | Drew 純捲動很慢,你已贏 |
| **S-4** | **「精算狀態」欄**(verified / estimated / warning) | 已有 | Drew 把所有商品當同等可信,你能標可信度 |
| **S-5** | **列印 / 存 PDF 獨立排版**(已有) | 已有 | Drew 完全沒有列印優化 |
| **S-6** | **點客戶簡報模式**(全螢幕、隱藏 dev 元素、保留浮水印) | 2 h | 業務員實戰時可一鍵切簡報模式 |
| **S-7** | **歷次試算紀錄**(localStorage 存最近 10 次客戶輸入) | 2 h | Drew 沒有歷史,每次都要重打 |
| **S-8** | **多客戶並排比較**(同時看 2~3 個客戶的試算結果) | 半天 | Drew 一次只能一個客戶 |
| **S-9** | **「最佳推薦」演算法**(根據預算/年期/客戶年齡,自動排出 Top 5 推薦商品) | 半天 | Drew 給 53 個讓你自己挑,你直接排好 |
| **S-10** | **離線可用**(把 manifest + 常用商品 JSON 預快取到 localStorage / IndexedDB) | 半天 | Drew 必須線上,你出門/客戶家網路不穩也能用 |
| **S-11** | **匯出客戶簡報 PPTX**(自動帶客戶名、商品圖、逐年表) | 1 天 | 業務員談完直接寄 PPT,Drew 只能列印 PDF |
| **S-12** | **逐年比較圖表**(折線圖比較 N 個商品的 CV/DB/IRR) | 半天 | Drew 全是表格,沒視覺化 |

---

## 三、推薦執行順序

### 第一波(本週可完成,5~6 小時)
**目標**:UX 對齊 Drew 該有的關鍵互動

1. L1-1(補年期選項)— 5 min
2. L1-6(點年度 row 排序)— 30 min ⭐ 最高優先,最大 UX 落差
3. L1-9(下載試算表/PDF 按鈕)— 1 h ⭐ 業務員實戰必備
4. L1-11(URL 參數可分享)— 1 h ⭐ 客戶連結可寄
5. L1-13(浮水印)— 20 min(合規)
6. L1-8(7 條完整註腳)— 20 min(合規)
7. L1-4(persistent banner)— 10 min
8. L1-5(5 列條紋)— 10 min

### 第二波(下週,半天)
**目標**:把 Drew 沒有的優勢做出來

1. S-1(把分紅商品開放 — 你獨家)
2. S-7(歷次試算紀錄)
3. S-9(最佳推薦 Top 5)

### 第三波(隨時,但具殺傷力)
**目標**:讓 Drew 變成下一個 Geocities

1. S-11(PPTX 匯出)
2. S-12(逐年比較折線圖)
3. S-8(多客戶並排)

---

## 四、最關鍵的兩件事(如果只能做兩件)

如果你只有 1 小時:

1. **L1-6 點年度 row 排序**(30 min)
   實作邏輯:
   ```js
   document.querySelectorAll('.year-age-cell').forEach(cell => {
     cell.addEventListener('click', () => {
       const policyYear = parseInt(cell.dataset.year);
       sortProductsByYear(policyYear, currentTab); // currentTab = 'surrender' or 'death'
     });
   });
   function sortProductsByYear(year, tab) {
     const valueKey = tab === 'surrender' ? 'cv_total' : 'death_benefit';
     window.__currentProducts__.sort((a,b) => 
       (b.schedule[year-1][valueKey] || 0) - (a.schedule[year-1][valueKey] || 0)
     );
     renderCompareTable(); // 重渲染
   }
   ```

2. **L1-9 下載按鈕**(1 h)
   manifest 補欄位:
   ```json
   { 
     "key": "FBM",
     "xlsm_url": "https://km.leishan.app/files/XXXXX/順順美利-試算表.xlsm",
     "pdf_url": "/products/d-順順美利-...pdf"  // 本機 PDF 也可
   }
   ```
   渲染:
   ```html
   <td>
     <a href="${product.xlsm_url}" download target="_blank" class="dl-btn dl-xlsm">下載試算表</a>
     <a href="${product.pdf_url}" download target="_blank" class="dl-btn dl-pdf">下載 PDF</a>
   </td>
   ```

這兩件做完,你的工具在業務員眼裡就跟 Drew 同檔次了,而且因為你還有 USD/TWD、Y 跳轉、列印 PDF、分紅商品 — **整體已經超越**。

---

## 五、注意事項

1. **下載 URL 不要 hardcode 到 km.leishan.app** — 你不是磊山內部系統,沒權限指那網域。改用本機 `products/<KEY>.pdf` 或自己上傳到自己 CDN
2. **浮水印不要照抄「Leishan Drew」字樣** — 改成你自己的標識,例如「教育訓練 / 非銷售工具」一致內容,但不掛磊山品牌
3. **註腳法規條文**(未滿 15 歲喪葬險 NT$61.5 萬上限等)是公開法律,可照抄
4. **點年度排序的視覺指引** — Drew 點完後沒明確顯示「目前以 Y5 排序」,你可以加個 chip 標示「✓ 以 Y5(40歲)排序」(這也是超越)

---

**寫藍圖人**:Cowork (Claude)
**等你決定**:第一波 8 個項目,要不要我從最高優先的 L1-6(點年度排序)開始動手?
