# 系統架構 + 關鍵函式說明

## 🗂️ 整體架構(v3_21 起)

```
rex1688.com/rex/A&H/  (GitHub Pages)
├── index.html                 ← 短網址入口,meta refresh 跳轉到最新主檔
├── 保險建議書系統_v3_21.html   ← 主檔(改用 fetch 載入)
├── shared.js                  ← 共用純函式(v3_21 新增)
├── benefitsLib.json           ← 全球商品給付定義(v3_21 從 HTML 抽出)
├── transglobe.json            ← 全球商品費率表
├── hontai.json                ← 宏泰
├── skl.json                   ← 新光
├── fglife.json                ← 富邦人壽
└── fubon.json                 ← 富邦產險
```

未來 `compare.html`(險種比較網站)會放在同一層,共用 `shared.js` + `benefitsLib.json` + 5 個公司 JSON。

---

## 📜 HTML 主檔內部結構

```
保險建議書系統_v3_21.html (7662 行)
├── <head>
│   ├── CSS (line ~50-2900)
│   └── <script src="shared.js"></script>  ← v3_21 新增
├── HTML 頁面結構
│   ├── #personCard (投保人員資料)
│   ├── #productSelect (商品選擇)
│   ├── #resultCard (建議內容彙整表)
│   ├── 走勢圖 + 各年度保費明細表
│   └── #benefitsCard (建議保障內容 — 簡易/詳細模式)
│       ├── 標頭內:簡易/詳細切換 (#benefitsModeSwitch)
│       ├── card-body 頂端:公司篩選器 (#benefitsCompanyFilter)
│       └── #benefitsSection (理賠卡片內容)
└── <script> 區段
    ├── INSURANCE_DB (常數;benefitsLib 改成 null,fetch 後填回)
    ├── loadInsuranceData() — fetch 6 個 JSON
    └── const App = (() => { ... })() — 主應用 IIFE
        ├── state (UI 狀態)
        ├── 4 個純函式 alias 到 window.AHShared
        ├── 主要計算函式(本檔獨有)
        └── 渲染函式
```

---

## 🔑 關鍵全域物件

| 物件 | 內容 |
|------|------|
| `INSURANCE_DB` | 全域資料庫(companies / scenarios / benefitsLib) |
| `INSURANCE_DB.benefitsLib` | v3_21 改成 `null`,`loadInsuranceData` fetch 後填回 |
| `window.AHShared` | shared.js 匯出的純函式集(`v3_21` 新增) |
| `state` | 當前 UI 狀態(被保人/要保人、benefitsMode、benefitsCompanyFilter、selections) |
| `state.benefitsMode` | `'simple'` \| `'detail'` — 簡易/詳細模式 |
| `state.benefitsCompanyFilter` | `'all'` \| `companyId` — 公司篩選器選中的公司 |
| `state.db` | 等於 `INSURANCE_DB`(別名,等 fetch 完才設定) |
| `state.selections` | `{ companyId: { main, riders[] } }` 已勾選商品 |

---

## 📚 shared.js (v3_21 新增)

### `window.AHShared.convertProductClaims(product)`
把 product.claims 結構轉成 benefitsLib 期待的格式。**核心邏輯**:處理 amountUnit 差異
- `'萬元' / '萬' / '10萬'` → ratioWan
- `'百元'` → ratio × 100
- `'元'` → ratio 保持

如果 product.code 在 `INSURANCE_DB.benefitsLib` 沒對應(非全球商品),就會走這條兜底邏輯。

### `window.AHShared.calcBenefitValue(item, product, amount)`
計算單項理賠金額。**輸入**:item.calc + 商品保額。**輸出**:
- `{ type: 'num', val: 數字 }` 或
- `{ type: 'text', text: 字串 }` 或
- `null`(calc 不存在)

支援 calc.type:`ratio` / `ratioWan` / `plan` / `unit` / `note`

> **註**:交接包舊版 ARCHITECTURE.md 寫「evalCalc」實際上指的就是這個函式,沒有 evalCalc 這個名字。v3_21 已修正命名。

### `window.AHShared.classifyItem(item)`
把單個 item 分類成 cls.key。**輸出**:`{ key, icon, title }`

cls.key 列表:
- `waiver` 豁免、`burn` 燒燙傷、`dislocation` 脫臼骨折、`transplant` 移植
- `critical` 重大傷病/癌症一次金、`death` 身故、`disability` 失能
- `daily` 住院日額、`reimburse` 實支實付、`surgery` 住院手術、`opsurg` 門診手術
- `icu_daily` 加護病房、`chemo` 化放療、`targeting` 標靶、`reconstruct` 義乳重建
- `maturity` 滿期祝壽、`elderly` 老年提前、`opd` 門診、`special` 特定處置、`other` 其他

**優先順序很重要**:先判斷 burn/transplant/critical 等特殊類,再判斷 death/disability,最後到 daily/reimburse/surgery。

癌症特殊處理:含「癌症」字眼但**同時含手術/日額/化學/標靶**等的 item,**不歸 critical**,改細分。

### `window.AHShared.categorize5(product)`
把商品歸到 4+1 大類(life/medical/critical/cancer/accident/other)。**輸出**:`{ mainKey, mainTitle, subTitle }`

**順序很重要**:
1. 豁免類 → other(隱藏)
2. 意外/傷害(name 字眼 + code 白名單)→ accident
3. 壽險/身故 → life
4. 重大傷病 → critical
5. 癌症療程/一次金 → cancer
6. 實支實付/自負額 → medical 實支實付型
7. 定額醫療/住院日額/手術(+ HSV/YHA/H2D code)→ medical 定額型
8. 兜底 → other

---

## 📐 主檔內專屬函式(不在 shared.js)

### `aggregateUnderwriteCheck(selections, db, age)` (~3820)
**功能**:跨商品累計核保檢查
1. 醫療附約日額累計上限
2. 重大傷病保額累計需體檢
3. **未滿 15 歲身故金額累計**(《保險法》107 條)

### `hasBlockingIssue(product, age, jobLevel, period, amount)` (~4040)
單一商品核保檢查 — 是否有 block 等級的違規。如果有,該商品保費計算回傳 0。

### XAB 法令過濾(~6200 附近,在 renderBenefits 內)
被保人未滿 16 歲且 product.code === 'XAB' 且 cls.key === 'death',直接跳過該 item(不顯示卡片)。

### `renderBenefits(rows)` (~6035)
**入口**:渲染整個「建議保障內容」區塊。執行順序:
1. 早退:`rows.length === 0` → 隱藏 card 並清空篩選器
2. 呼叫 `renderBenefitsCompanyFilter(rows)` — 渲染篩選器 UI
3. 套用篩選:`state.benefitsCompanyFilter !== 'all'` 時,`rows = rows.filter(...)`
4. 簡易模式:呼叫 `renderCardsForMain` 對每個大類渲染 → masonry 堆疊
5. 詳細模式:渲染 type-grouped 卡片(每個 cls.key 一張)+ 各公司分組

### `renderBenefitsCompanyFilter(rows)` (~5982)
**功能**:依「使用者實際選擇的公司」動態產生 pill 按鈕。詳見 v3_19 變更紀錄。

### `renderSubCard(cls, items, mainKey, subKey, titleOverride)` (~6260)
**功能**:渲染單一給付類型的小卡。**核心邏輯**:
1. 對每個 row 建立 bucket: `{ limit, deduct, unit }`
2. 同 row 同 cls 的多個 item — limit 取最大、deduct 取最大
3. 淨給付 = limit − deduct(自負額型扣除)
4. 對所有 row 的淨給付加總(若 unit 同 + `[次日年天]` regex 通過)
5. 拼 tooltip: 各 row 的「限額 − 自負額 = 淨給付」明細

**v3_20 fallback 邏輯**:
- `numVals.length === 0` 時不再直接顯示 `✓`
- 改成檢查 items 內是否有 `result.type === 'text'`(文字規則)或 `item.note`
- 有的話顯示「依條款」(`.bsc-rule-text` 灰色小字)+ tooltip
- 真的什麼都沒有才 fallback 為 `✓`

### `renderCardsForMain(mainKey, mainConf)` (~6350)
**功能**:渲染單一大類框 + 內含所有子組。**對 medical 大類特殊處理**:按 row.subTitle 分「實支實付型/定額型」兩個子組。

### `bindBenefitsModeEvents()` (~7500)
**功能**:綁定簡易/詳細切換 + 公司篩選器點擊。

---

## 🎛️ 設定常數(在 renderBenefits 內)

### `ALLOWED_CARDS` (~6220,v3_20 放寬)
各大類及子組的「白名單」cls.key。本次放寬:

| key | v3_19 之前 | v3_20+ |
|-----|-----------|-------|
| `life` | death, disability | (無變動) |
| `medical_實支實付型` | daily, reimburse, opsurg | + surgery, icu_daily |
| `medical_定額型` | daily, surgery | + reimburse, opsurg, icu_daily |
| `critical` | critical | (無變動) |
| `cancer` | critical, daily, surgery | + chemo, targeting, reconstruct, transplant |
| `accident` | death, disability, reimburse, daily | + surgery, dislocation |

### `TITLE_OVERRIDE` (~6235,v3_20 補齊)
針對特定大類/子組,覆寫 cls 的預設標題。新加入的 cls.key 都已補上中文標題。

### `PRIMARY_CLS` (~6245)
各大類的「主要保障」cls.key,該卡片用品牌橘色強調。

### `MAIN_CATEGORIES` (~6140)
4+1 個顯示的大類(順序 + icon + color)。`other` 已排除不顯示。

---

## 🔁 資料流

```
[頁面載入]
    ↓
shared.js 載入(<script src="shared.js">)  ← v3_21
    ↓
loadInsuranceData() — fetch 6 個 JSON 並指派到 INSURANCE_DB
    ↓
App IIFE 內 alias: const classifyItem = window.AHShared.classifyItem 等
    ↓
[使用者勾選商品]
    ↓
state.selections 更新
    ↓
calculateAll() — 算保費 + 累計檢查
    ↓
renderResultTable() — 渲染建議內容彙整大表
    ↓
renderBenefits() — 渲染建議保障內容
    ↓
    renderBenefitsCompanyFilter(rows)  ← 先用未篩選 rows 渲染篩選 UI
    ↓
    rows = rows.filter(...)  ← 套用篩選器
    ↓
    對每個 row,呼叫 classifyItem 分類 items     ← shared.js
    ↓
    對每個 item,呼叫 calcBenefitValue 算金額    ← shared.js
    ↓
    按 categorize5 把 row 歸大類                ← shared.js
    ↓
    convertProductClaims 兜底非全球商品          ← shared.js
    ↓
    按白名單過濾 + 標題覆寫
    ↓
    renderSubCard 算淨給付 + tooltip(或 fallback 為「依條款」)
    ↓
    masonry column-count: 2 堆疊輸出
```

---

## 🧪 Debug 技巧

需要排查邏輯時,在 `renderSubCard` 內加 console.log 印 buckets 跟 perRowMax,從 F12 console 看實際數值。

**常見 debug 點**:
- `numVals.length` — 為 0 表示沒任何 item 算出數字
- `rowItemBuckets` — 看每個 row 的 limit/deduct 是否正確配對
- `state.benefitsCompanyFilter` — 確認當前是「全部」還是某家公司
- `window.AHShared` — 確認 shared.js 載入成功
- `INSURANCE_DB.benefitsLib` — 確認 fetch benefitsLib.json 載入成功(非 null,有 10 個 keys)
- F12 Network — 確認 6 個 JSON + 1 個 JS 全部 200 OK
