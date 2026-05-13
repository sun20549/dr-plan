# Cowork 對標分析 — drew.leishan.app vs 本機 index.html

**對標日期**:2026-05-13
**測試輸入**:測試客戶 / 男 / 1990-01-01(36歲) / 美元利變非還本 / 6年期 / USD 200,000
**線上版**:https://drew.leishan.app/info → /product → /comparison
**本機版**:`compare/index.html`(7,302 行,236KB)

---

## 一、流程對照(三步驟一致)

| 步驟 | drew.leishan.app | 本機 index.html |
|---|---|---|
| Step 1 輸入 | `/info` — 姓名、性別、生日、類型、年期、預算 | `#step-1` — 同樣 6 欄,**多了** 直接輸入年齡的替代欄位 + 匯率欄 |
| Step 2 選商品 | `/product?...` — 53 商品(46 可試算)清單 | `#step-2` — 商品表格 + 試算選擇/試算全部 |
| Step 3 比較 | `/comparison` — 解約金+增額 / 身故保險金 兩 tab | `#step-3` — 同 2 tab,多 USD/TWD 切換、Y 跳轉、列印 |

URL 設計差異很關鍵:**Drew 把所有參數放 query string**(`?name=...&gender=...&birthday=...&type=...&period=...&budget=...`),整個 URL 可分享/可書籤;本機是純 SPA,刷新就丟參數。

---

## 二、欄位 / 選項細節

### Step 1 表單

| 項目 | drew | 本機 |
|---|---|---|
| 姓名 | 文字 | 文字 |
| 性別 | radio:男/女 | radio:男/女 |
| 生日 | YYYY/MM/DD,旁邊顯示「保險年齡:XX歲」 | 拆 年/月/日 三欄,或可改用「直接輸入年齡」 |
| 類型 | **6 種**(無分紅) | **7 種**(多「美元分紅終身壽險」)✅ |
| 年期 | 躉繳~30年 共 14 種 | 1/2/3/5/6/8/10/12/20 共 9 種 ⚠️ |
| 預算 | 自動切幣別(類型選美元就變美元),自動千分位 | 同樣有自動切幣別 |
| 匯率 | ❌ 無 | ✅ 有(只在類型涉及外幣時顯示) |

> 🔴 **本機年期選項缺很多**(沒有 4/7/9/15/25/30 年期、躉繳),Drew 14 種比較完整。

### Step 2 商品列表欄位

| drew 欄位 | 本機 欄位 |
|---|---|
| ☑ 公司、商品、代號、年期、保額、首年原始保費、首年實繳保費(已扣高保額+轉帳) | ☑ 公司、商品、**精算狀態**、代號、年期、保額、首年原始保費、首年實繳保費(已扣折扣) |
| 保額右側 ↗ 箭頭 + ⚙️ 設定齒輪(可調整保額) | ❌ 無 |
| 不可試算列顯示「⚠️ 投保年齡超過 14 歲」 | ❌ 無 |
| 標題:「共 53 種商品符合年期條件」+ 試算全部商品(46) | ✅ 類似 |

> 🟡 **本機獨有「精算狀態」欄**很好(可標 verified / estimated),Drew 沒有。但 Drew 的「保額調整 ⚙️」是業務員很需要的功能。

### Step 3 比較表

| 項目 | drew | 本機 |
|---|---|---|
| 頂部 banner | 藍色:「男性 \| 繳費年期:6 \| 每年預算:USD$ 200,000」persistent | summary-bar 用 info-tag 呈現 |
| Tab | 解約金+增額 / 身故 | 解約金+增額 / 身故 ✅ |
| 列固定欄(sticky 左) | 公司、商品、代號、年期、保額(美元)、首期/滿期實繳保費、宣告利率、檔案下載、保單年度+保險年齡 | 接近(本機有 thead 9 列全黏設計) |
| 內容欄 | 兩列:解約金+增額(A) / (A)/累積實繳保費 % | 同樣兩列 |
| 商品橫排切換 | 左右箭頭(slick carousel) | ⚠️ 本機策略待確認 |
| **粉紅高亮**(最高值) | ✅ 每行的最高百分比那格標粉紅 | ⚠️ 本機有「★ 最強值高亮」描述,要驗證實際 |
| **5 列分組條紋** | ✅ Y1-5、Y6-10、Y11-15... 視覺分組 | ⚠️ 待確認 |
| 列印 / 存 PDF | ❌ 無 | ✅ 有 |
| USD ↔ TWD 切換 | ❌ 無 | ✅ 有 |
| Y6/10/20/30 + Y@65/80 跳轉 | ❌ 無 | ✅ 有 |
| 每商品「下載試算表」「下載 PDF」按鈕 | ✅ 有(連到原始 Excel/PDF) | ❌ 無 |
| 「製作分享連結」按鈕 | ✅ 有 | ❌ 無 |
| 註腳(註1~註7,完整 7 條法規/計算規則) | ✅ 完整 | ⚠️ 只有兩行「內部教育訓練、依精算結果」 |
| 浮水印 | ✅ 大字「Leishan Drew 僅作內部教育訓練使用 嚴禁作為銷售工具使用」鋪滿背景(印 PDF 也帶) | ❌ 無 |
| 頂部 navbar(連磊山其他系統) | ✅ BMS/KM/PKS/線上繳費/考照/報聘/獎項/Drew/磊山e學院/Finfo | ❌ 無(本機是獨立工具) |

---

## 三、技術觀察

### Drew(線上版)
- 用 React-like SPA(從 class name `slick-arrow`、`ant-tabs-tab` 推測 React + Ant Design + react-slick)
- Sentry 接 development 環境(release `981175b...`)
- CSRF token + Rails(meta 有 `csrf-param=authenticity_token`)
- 商品 type 用 MongoDB ObjectId(`609e05c1d978f9254836b8eb`)— 後端是 Mongo 或類似
- Modal 系統完整(取消/確定、製作 PDF、下載成功、警告等共 5+ 種 modal class)

### 本機 index.html
- 純 vanilla HTML/JS,單檔 7,302 行
- Lazy-load:`loadProductDB(key)` 從 manifest 找 path 後 fetch JSON
- Manifest fallback 機制:有 manifest 用子目錄 path,沒有就 fall 到 `data/<key>.json` 平鋪
- 配色變數:`--navy:#0D2A3A`、`--teal:#1A6B72`、`--orange:#F05A28`(navy + teal + orange,專業派)
- 列印用獨立 `print-pages` 容器(螢幕隱藏,點列印才生)

---

## 四、可學的 5 個 Drew 設計(本機應該抄)

按優先順序排:

### 1. ⭐⭐⭐ URL 參數可分享/可書籤
Drew 把 `name/gender/birthday/type/period/budget` 全塞 URL query string。本機是 SPA,失去 URL 狀態。
**改法**:用 `history.pushState` 在進入 step 2/3 時更新 URL,讀取時從 `URLSearchParams` 還原表單。

### 2. ⭐⭐⭐ 補齊年期選項 + 「躉繳」
本機只有 9 個年期,Drew 14 個。實務上業務員會用到的 4/7/9/15/25/30 年期沒有。
**改法**:把 `<select id="period">` 加完整 14 個 option,跟 Drew 對齊。

### 3. ⭐⭐⭐ 完整 7 條註腳 + 法規警語
Drew 比較頁底有 7 條詳細註腳(增額繳清抵繳保費的 16 歲分界、紅色標記計算公式、首期繳費方式、被保人 15 歲以下喪葬險限制 NT$61.5 萬等)。本機只有兩行通用文字。
**改法**:把 Drew 那 7 條原文照搬到本機 footer-note(無版權問題,都是法規衍生規則)。

### 4. ⭐⭐ 浮水印「僅作教育訓練 / 嚴禁銷售」
Drew 用大字浮水印鋪滿背景,印出來 PDF 也會帶,合規性十足。
**改法**:加一個 `position: fixed; z-index: -1; opacity: 0.05` 的浮水印 div,列印 CSS 設 `print-color-adjust: exact` 讓它顯示在 PDF。

### 5. ⭐⭐ 每商品「下載試算表 / 下載 PDF」連結
Drew 連到原始建議書(就是用戶資料夾根目錄那 5 份 PDF 來源)。
**改法**:在 manifest 增 `pdf_path` / `xls_path` 欄位,UI 渲染兩個下載連結;若無檔案則隱藏。

---

## 五、本機可保留 / 強化的 4 個獨家功能

### 1. ✅ USD ↔ TWD 即時匯率切換
業務員談本國客戶要看台幣,談海外客戶看美元 — 這個切換很實用,Drew 沒有。
**強化**:讓匯率輸入支援即時 API(例如台銀牌告)而非寫死 32。

### 2. ✅ Y6/Y10/Y20/Y30 + Y@65歲/Y@80歲 跳轉鈕
比 Drew 純捲動快很多,業務員介紹商品時最常跳這幾個年。
**強化**:加 Y@退休年齡(讓使用者自訂)、Y@繳費期滿。

### 3. ✅ 「精算狀態」欄
標 verified(基準參數對帳 100%)、estimated(估算)、warning(誤差 > 2%)— 這對信任度很重要。
**強化**:把每個 JSON 的 `meta.notes` 也吐出來(例如「順順美利 sa_ramp_up [10%,20%...]」),讓業務員當下知道計算細節。

### 4. ✅ 列印 / 存 PDF 獨立排版
本機已用 `print-pages` 隔離螢幕版跟列印版,屬於進階做法。
**強化**:列印標題加客戶姓名、日期、業務員姓名;每頁加浮水印。

---

## 六、立即可改的 7 個小項(< 1 小時)

| # | 項目 | 改動位置 | 預估 |
|---|---|---|---|
| 1 | 補齊 4/7/9/15/25/30 年期 + 躉繳 | `index.html:1118-1130` `<select id="period">` | 5 min |
| 2 | 「下一步」改文字「試算商品」更明確 | step 1 button | 1 min |
| 3 | Step 2 商品數標題加「符合年期條件 / 可試算」分母 | step 2 subtitle | 5 min |
| 4 | 不可試算商品(投保年齡超過)用警告紅標,不直接過濾掉 | step 2 渲染 | 15 min |
| 5 | 比較頁頂加 persistent banner(性別 \| 年期 \| 預算) | step 3 開頭 | 10 min |
| 6 | 比較表 5 列分組條紋(Y1-5、Y6-10...) | compare-table CSS | 10 min |
| 7 | 比較頁底擴充 7 條完整註腳 | step 3 footer-note | 15 min |

---

## 七、長期工程(> 1 天)

1. **URL 狀態管理**:用 `history.pushState` 讓 step 2/3 可書籤、可分享
2. **保額自訂(⚙️ 齒輪)**:每商品列右側加齒輪,點開 modal 改保額,即時重算
3. **製作分享連結 modal**:複製含參數的 URL,做圖文 preview(類似 Drew 的)
4. **每商品下載原始檔**:manifest 補 `pdf_path` / `xls_path`,UI 渲染按鈕
5. **保額橫向調整(↗ 箭頭)**:點箭頭調整保額單位(例如 +1 萬 USD)
6. **列印水印**:固定 div + `print-color-adjust: exact`
7. **頂部 navbar / footer 公司識別**:如果你也想做成磊山內部 portal 的一部分

---

## 八、截圖記錄

對標過程的截圖(都是 1218×1009 jpeg,在瀏覽器自動存到 Cowork 截圖夾):
1. Drew Step 1 modal — 提醒視窗
2. Drew Step 1 表單 — 6 欄全空
3. Drew Step 1 表單 — 填好測試資料(36 歲)
4. Drew Step 2 商品列表(46 + 7 不可試算)
5. Drew Step 2 商品列表(滾動下半)
6. Drew Step 3 解約金+增額比較
7. Drew Step 3 身故保險金比較

---

**對標人**:Cowork (Claude)
**下一步建議**:從第六節「7 個小項」開始,我可以幫你逐項改 `index.html`,要做哪幾項你挑就好。
