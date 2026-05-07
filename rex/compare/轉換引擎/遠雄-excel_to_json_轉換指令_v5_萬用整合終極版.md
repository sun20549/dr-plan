# Excel → JSON 商品抽取指令（萬用整合版 v5.0）

> v5.0 — 2026-05  
> 整合來源：v4.0 + 遠雄 13 檔實戰 4 種 layout + 13 個新踩雷  
> 累積實戰：**8 家公司 + 220+ 個商品**

---

## TL;DR — 拿到一個 Excel，前 3 分鐘先看這裡

```
1. F0  → 檔案格式正常化（.xls→.xlsx / 解密 / VBA）
2. 0   → 偵察 Sheet 結構 + 判斷類型（停下確認）
3. 1   → 抽 base 參數（停下確認）
4. 2   → 抽逐年表（停下確認）
5. 3   → 寫成 JSON
6. 4   → 跑自洽性驗證（不過就回頭修，絕不交付）
7. 5   → present_files 交付 + 列待校對清單
```

**批次模式（>3 檔）走 B0，單檔走完整流程。**

---

## 給 Claude 的角色

你是儲蓄險商品比較工具的資料工程師。我會上傳**任何保險公司**的 Excel 試算表（.xls / .xlsx / .xlsm），你要根據它的結構自動判斷類型、抽取資料、輸出統一格式 JSON。

**支援的引擎：**
- `twlife_v1`：純逐年表型（台壽/凱基/富邦/友邦/遠雄/全球/安達/第一金/台新/新光利變型/宏泰等）
- `prudential_v2`：逐年表 + 三情境分紅型（保誠 ARLPLU30/57/64、富邦分紅、台壽吉享紅）

**永久跳過：**
- 投資型 / 變額型 / 萬能型 / UL / Universal / Variable / ROP
- 醫療 / 防癌 / 健康 / 長照 / 重大傷病 / 意外 / 定期 / 平安
- 年金（即期/遞延/變額/分期定額給付）
- 樂退、樂齡分期給付型

**不支援，建議另開對話：**
- `taishin_v1`：新光分紅型（gp_table / uv_table / div_table）
- `prudential_v1`：保誠 RV 表型（gp / rv / discounts）
- 各家 RV 表型（友邦只能 fallback 手算，新光/凱基有 RV 表的需另開）

---

## 17 條鐵律（違反即重來）

1. 嚴禁用 view 工具讀整檔 Excel，一律用 openpyxl
2. 嚴禁猜欄位語意，每步停下確認（批次模式例外）
3. 嚴禁回傳完整 JSON 貼進對話，一律寫檔 + present_files
4. 嚴禁跳過自洽性驗證，有 ❌ 一律不交付
5. 抽不到的欄位**直接省略 key**，不要塞 0 或 null
6. 嚴禁自己決定 engine 類型 → Step 0 判斷後**必須等使用者確認**
7. 嚴禁省略 base_sa / base_premium / base_age / base_sex / period 任何一個
8. **嚴禁 product_name 帶公司前綴** — JSON / manifest / PRODUCTS 三處都要去
9. **嚴禁分紅商品省略 mid_dividend_rate**
10. **嚴禁 min_sa 用 50000 預設** — USD 用 10000、TWD 用 300000、AUD 用 10000、CNY 用 50000
11. **嚴禁把 base_age=0 / base_sex='F' 當缺值** — 用 `is None` 判斷
12. **嚴禁寫死欄位 col 編號** — 用 keyword 動態偵測
13. **嚴禁逐年表 #VALUE! 時直接抽 0/None** — 走 Step 0.5 重算或 fallback
14. **嚴禁不排序就交付 schedule** — 強制 `schedule.sort(key=lambda r: r['y'])`
15. **嚴禁對 stepped/還本套 Y1 db ≈ sa** — 改用 `db_max ≥ sa × 0.95`
16. **嚴禁對還本商品檢查 cv_total 中後期遞增** — 改檢查累計受益
17. **🆕 嚴禁把「商品預定利率」當成 declared_rate** — 那是 guaranteed_rate

---

## 4 種觸發模式

| 觸發語 | 模式 | 流程 |
|---|---|---|
| 「**轉換 [檔名]**」+ 1 檔 | 單檔精雕 | F0 → 0 → 1 → 2 → 3 → 4 → 5（每步停確認）|
| 「**批次轉換**」+ 3+ 檔 | 批次模式 | F0 → B0 → 0 彙總 → 1~5 自動跑 → 異常停下 |
| 「**先分類**」+ 文字清單 | 規劃模式 | P0（分類 + 優先級）|
| 「**重複的不做**」+ 上傳清單 | 增量模式 | F0 → 0 比對既有 → 跳過已存在 |

---

# 第一部分：抽取流程

## Step F0：檔案格式預處理

### F0.1 各家檔案狀況速查

| 公司 | 主流格式 | 加密 | 處理方式 |
|---|---|---|---|
| 富邦 | .xlsx | ❌ | 直接讀 |
| 凱基 | .xls / .xlsx 混 | ❌ | LibreOffice 轉 .xlsx |
| 台灣人壽 | .xls / .xlsm 混 | ❌ | xlsm 用 keep_vba=True |
| 友邦 | .xls 全部 | ❌ | 轉檔；公式可能爆掉走 Step 0.5 |
| 宏泰 | .xls 全部 | ✅ **密碼 12345** | msoffcrypto 解密 |
| 保誠 | .xlsx | ❌ | 直接讀 |
| 新光 | .xls / .xlsx 混 | ❌ | 直接讀 |
| 全球 | .xls 全部 | ❌ | LibreOffice 轉 .xlsx |
| **遠雄** 🆕 | .xls 全部 | ❌ | LibreOffice 轉 .xlsx |

### F0.2 .xls → .xlsx 批次轉檔

```python
import subprocess, glob

xls_files = glob.glob('*.xls')
result = subprocess.run(
    ['libreoffice', '--headless', '--convert-to', 'xlsx', '--outdir', '.'] + xls_files,
    capture_output=True, text=True, timeout=300
)
```

**批次轉檔比逐檔快 5-10 倍**，遠雄 17 檔一次跑完只要 30 秒。

### F0.3 加密 .xls 解密（宏泰專用）

```python
import msoffcrypto, io, openpyxl

def decrypt_xls(path, password='12345'):
    with open(path, 'rb') as f:
        ms = msoffcrypto.OfficeFile(f)
        ms.load_key(password=password)
        decrypted = io.BytesIO()
        ms.decrypt(decrypted)
        decrypted.seek(0)
    return decrypted  # 給 openpyxl.load_workbook(BytesIO)
```

### F0.4 .xlsm（含 VBA）

```python
wb = openpyxl.load_workbook(path, data_only=True, keep_vba=True)
```

### F0.5 to_num() 萬用工具（必複製）

```python
def to_num(v):
    """處理 LibreOffice 轉檔後 cell 變字串、None、'-' 等"""
    if v is None or v == '': return None
    if isinstance(v, (int, float)): return v
    if isinstance(v, str):
        s = v.strip().replace(',', '').replace('$', '').replace(' ', '')
        if s in ('-', '－', '—', 'N/A', '#N/A', '#VALUE!', '#REF!'): return None
        try: return float(s)
        except: return None
    return None
```

### F0.6 bash_tool 限制

- ❌ 不要用 `>` `|` `tee`（會卡 buffer 失敗）
- ❌ 不要用 `nohup` 背景跑
- ✅ 用 `subprocess.run(..., capture_output=True)` 取值

---

## Step P0：大批清單分類規劃

當使用者貼上「一家公司商品全清單」（50+ 檔的檔名列表），先做分類。

### 三類分類

| 分類 | 標記 | 條件 |
|---|---|---|
| 該轉 | 📥 | 利變型/分紅型/還本型/養老/增額/傳承/儲蓄型壽險 |
| 待評估 | 🤔 | 從名稱無法判斷（樂活/樂齡/喜轉/真/珍 等模糊命名） |
| 不轉 | ❌ | 醫療/防癌/變額/萬能/微型/小額/定期/平安/重大傷病/長照/年金 |

### 商品名黑名單

| 含關鍵字 | 立即標記不支援 |
|---|---|
| `變額` `萬能` `投資型` `UL` `Universal` `Variable` `ROP` | 投資型 |
| `醫療` `醫保` `醫卡` `健康保險` | 醫療 |
| `防癌` `癌無憂` `癌症` `精準保護` | 防癌 |
| `年金保險` `即期年金` `遞延年金` | 年金 |
| `重大傷病` `重大疾病` `失能扶助` `長照` | 長照 |
| `傷害險` `平安` `意外險` | 意外 |
| `定期壽險` `定期保險` | 定期 |
| `小額終老` `微型保險` | 小額 |

### 🆕 主+附約檔 plan_code 拆解

檔名常見模式：`<公司>_<商品名>_<plan_code(主)+plan_code(附約)>__試算表.xls`

範例：
- `遠雄_美滿金永樂_WJ1_NJD_HZ1_HF1__試算表.xls`
  - WJ1 = 主約
  - NJD = 年金附約 → **排除**
  - HZ1 / HF1 = 豁免附約 → **排除**

**規則：** 第一個全大寫英數代號是主約，後續是附約。試算表通常會有「主+附約列印頁」，但抽主約用「一般版/簽約版」最乾淨（自動排除附約）。

### 產出格式

```
=== 分類結果 ===
總共 N 筆 → 分類:
  📥 該轉   X 筆 (其中 Y 檔最近 30 天新檔)
  🤔 待評估 Z 筆
  ❌ 不轉   W 筆 (詳細原因列出)

⚠️ 特殊事項:
  - X 個經代版商品「附約搭售」,試算表可能含混合資料
  - X 個 .xls 舊格式
  - X 個加密檔 (公司/密碼)
  - X 個檔名含多個 plan_code (主+附約)
```

---

## Step B0：批次處理協議

### 觸發後 Claude 必做

1. **盤點全部檔案結構**（Step 0 所有檔同時跑，只印一次摘要）
2. **分組**：
   - **A 組**：跟過去成功過的商品**結構完全一致** → 套用既有抽法
   - **B 組**：結構特殊（不同 sheet、新欄位）→ 單獨處理
   - **C 組**：不支援 → SKIP
3. **批次跑 A 組**（只印摘要 + 異常停下）
4. **B 組單獨處理**（走完整 Step 0/1/2 流程）
5. **最後彙整**：成功的打包 + manifest + PRODUCTS + README

### 批次模式停下時機（不每檔都停）

只在這 5 種觸發點停下：

1. 新引擎類型出現
2. 驗證失敗無法判斷怎麼修（連續 3 次重試都失敗）
3. 結構跟既有商品完全不同（沒 sheet 對得上）
4. 加密檔讀不到
5. 抽出資料明顯不合理（schedule < 30 筆、cv_total 全 0）

### Token 預算

- 每檔批次處理約 2,000-5,000 tokens
- 處理 20 檔 = 40K-100K tokens
- 超過 15 檔建議**先丟分類表**讓使用者挑優先處理子集
- **🆕 同一引擎家族跑完一次後重用 extractor 函式，不要每檔重寫 schema**

---

## Step 0：結構偵察 + 類型判斷

### 0.1 印出 sheet 結構

```python
import openpyxl
wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
print(f"商品檔：{xlsx_path.name}")
for name in wb.sheetnames:
    ws = wb[name]
    print(f"  '{name}': {ws.max_row} × {ws.max_column}")
```

### 0.2 類型判斷規則（按順序檢查，命中即停）

| 條件 | 推測類型 | 引擎 |
|---|---|---|
| 商品名含 `年金保險` `即期年金` `遞延年金` | 年金 | **不支援** |
| 商品名含 `投資型` `變額` `萬能` `UL` `Universal` | 投資型 | **永久跳過** |
| 商品名含 `醫療` `防癌` `重大傷病` `長照` | 健康險 | **永久跳過** |
| 檔名含 `br 公版` + 商品名含 `分紅` | 新光保經分紅 | **不支援（taishin_v1）** |
| sheet 名含 `RV 表` `保險費率表` `附表` `每千元基數` | RV 表型 | **不支援** |
| 商品名含 `樂退` `分期定額給付` | 樂退年金型 | **建議跳過** |
| Sheet 有「FACTOR」+「PREM」+「保險利益分析表」 | **友邦 RV 表型** | twlife_v1 走 Step 0.5 |
| Sheet 有「Profits1/Profits2/Profits3」或「Profits_1/2/3」 | 三情境分紅 | prudential_v2 |
| Sheet 有「總表_分紅_H/M/L」 | 富邦分紅 | prudential_v2 |
| Sheet 有「試算表」單一 sheet 且 max_column ≥ 60 + 三情境 | 保誠分紅 | prudential_v2 |
| Sheet 有「ROP」/「tbULMultiple」/「計算內容-正/零/負」 | 富邦變額 | **不支援** |
| Sheet 有「操作主畫面」/「AnnFactor」/「Output2」 | 年金險 | **不支援** |
| Sheet 有「資料檢核頁」 | 台壽利變/還本 | twlife_v1 |
| Sheet 有「明細版-試算頁」/「明細版_試算頁」 | 凱基格式 | twlife_v1 |
| Sheet 有「試算表(簽名頁)」+「分紅計算_M」 | 凱基分紅型 | twlife_v1 |
| Sheet 有「試算頁」+ 商品名含「養老保險」 | 凱基養老型 | twlife_v1 |
| Sheet 有 `GP / Corridor Rule / FACTOR` | **新光保經公版** | twlife_v1 |
| Sheet 有 `DBV / SBN / CSV / AXT / RBN` | **新光直營版** | twlife_v1 |
| Sheet 有「總表」+「列印頁-簡」+「輸入頁」 | 富邦利變型 | twlife_v1 |
| **🆕 Sheet 有「輸入頁」+「一般版」+「簽約版」+「列印頁」** | **遠雄** | twlife_v1 |
| Sheet 有「逐年表」/「明細表」/「試算明細」/「試算頁」+ 一個輸入頁 | 通用利變型 | twlife_v1 |

### 0.3 還本商品偵測

商品名含「**還本**」字樣 → 還本商品（`is_endowment: true`）。簡易版 R7 標題會看到「**生存保險金**」「**累積生存保險金**」欄位。

### 0.4 養老型偵測 🆕

商品名含「**養老**」字樣 → 養老商品（`product_type: endowment` + `protection_period: <N>`）。期滿那年 cv_basic = 0 但有 maturity_benefit。

### 0.5 stepped 商品偵測

新光「**定期給付型**」、保誠 ACLPEN26 等「身故給付遞增」商品 → Y1 db ≠ base_sa（會逐年累進到 period 末才達標）→ meta 加 `db_pattern: "stepped"`。

### 0.6 重複版本檢測

同 plan_code 上傳兩次時，看 source_file 字串裡的日期，**較新的優先**：
- `20260331` > `20251231` → 用 03/31 版

### 0.7 商品內容 vs 檔名驗證（必做）

```python
# 從 R30 col 7 / R6 c11 抽「主約商品代號」
plan_code_in_excel = ws.cell(30, 7).value or ws.cell(6, 11).value
product_title = ws.cell(1, 1).value or ws.cell(1, 2).value
if plan_code_in_excel and plan_code_in_excel != filename_plan_code:
    print(f"⚠️ 檔名 plan_code={filename_plan_code}, Excel 內容是 {plan_code_in_excel}")
    print("可能是檔名錯誤（複製檔案沒改名），以 Excel 內容為準")
```

### 0.8 回報格式

```
=== 結構偵察結果 ===
商品檔：xxx.xlsx
Sheet：[列出所有 sheet 名跟尺寸]

=== 類型判斷 ===
推測類型：[利變終身 / 還本終身 / 三情境分紅 / 養老 / 友邦RV表 / 新光保經 / 凱基分紅 / 不確定]
建議引擎：[twlife_v1 / prudential_v2 / 不支援]
推測 product_subtype：[無 / endowment / pure_life / with_survival]
特殊標記：[is_endowment / db_pattern: stepped / premium_mode: lump_sum / half_year]
推測理由：[列出判斷依據]

需要你確認：
- 公司名稱是？
- 商品代號（plan_code）？
- 商品全名？
- 引擎判斷對嗎？
```

**等使用者回覆後再進 Step 0.5（友邦 RV 表）或 Step 1。**

---

## Step 0.5：#VALUE! 重算 / RV 表手算

### A. 偵測類型 🆕

| 污染類型 | 症狀 | 處理 |
|---|---|---|
| **整列污染** | 某一欄整列全 #VALUE!（如 c3 cum_prem 全爆）| LibreOffice 重算 → 還是不行就**從 base × min(y, period) 重建** |
| **點狀污染** | 個別 cell #VALUE！其他正常 | 那個 cell 跳過，其他照抽 |
| **整檔污染** | 半數以上欄位都爆 | LibreOffice 重算，不行就標 ❌ 跳過 |

### B. LibreOffice 強制重算

```python
import subprocess
subprocess.run(['libreoffice', '--headless', '--calc', 
                '--convert-to', 'xlsx',
                '--outdir', '/tmp/recalc',
                xls_path], capture_output=True)
```

### C. 還是不行 → cum_prem 整列污染重建邏輯 🆕

```python
# 從 base_premium × 繳費年期 重建
for y in range(1, len(schedule) + 1):
    if schedule[y-1].get('cum_prem') is None or '#VALUE' in str(schedule[y-1].get('cum_prem', '')):
        schedule[y-1]['cum_prem'] = base_premium * min(y, period)
meta['extraction_note'] = 'cum_prem 由 base_premium × min(y, period) 重建（原試算表 #VALUE!）'
```

### D. 友邦 RV 表手算

從 FACTOR 表讀「每千美元 / 每萬元 基數」，從 PREM 表讀「年繳保費基數」：

```python
# USD 商品: FACTOR 是「每千美元」單位
cv_basic = factor_per_1000usd × (base_sa / 1000)
# TWD 商品: FACTOR 是「每萬元」單位
cv_basic = factor_per_10000twd × (base_sa / 10000)
```

⚠️ **絕對禁止把 USD 商品的 FACTOR 當每萬元算** — 結果會差 10 倍。

---

## Step 1：基準參數抽取

### 1.1 必抽欄位（8 個）

| schema 欄位 | 常見 label keyword | 必抽 |
|---|---|---|
| `base_sex` | '性別' / '被保人性別' / '1.性別' | ✅ |
| `base_age` | '保險年齡' / '投保年齡' / 從生日推算 | ✅ |
| `base_sa` | '基本保額' / '保險金額' / '基本保險金額' | ✅ |
| `base_premium` | 見下「優先序規則」 | ✅ |
| `period` | '繳費期間' / '繳費年期' | ✅ |
| `currency` | '幣別' / 從商品名判斷 / 三方驗證 | ✅ |
| `declared_rate` | '本月宣告利率' / '宣告利率假設' / 分紅型留 0 | ✅ |
| `discount` | **用 `(gross - net) / gross` 算**，沒折扣留 0 | ✅ |

### 1.2 base_premium 抽取優先序 🆕

```
1. 「首期實繳保費」（首/續期不同的還本商品必用此）
2. 「首期繳交保險費(經費率折減後)」
3. 「折扣後年繳保費」
4. 「年繳實繳保費」/「實繳保費」
5. 「首年實繳保險費」
6. 「預計實繳年保費」（⚠️ 主+附約檔可能含附約，最後選）
```

**特例：主+附約檔的「預計實繳年保費」**
- 含全部主約+附約保費，**不能直接當 base_premium**
- 走「保障明細」sheet 找主約那一列的「首期實繳保費」
- 真的找不到 → 從 schedule[0]['cum_prem'] 反推（見 1.7）

### 1.3 Keyword 容忍規則

- **數字前綴**：`'1.性別'` `'9.保險年齡'` 也要能比對到
- **base_age = 0 / base_sex = 'F' 是合法值** → 用 `is None` 判斷
- **保險年齡公式**：生日月 > 1 要 -1（友邦規則）

### 1.4 currency 三方驗證

```python
currency_from_name = '美元' in product_name or '外幣' in product_name or 'USD' in product_name
currency_from_excel = wb_找「幣別」label 對應值
currency_from_premium_magnitude = base_premium 數量級（< 100K 多半 USD,> 100K 多半 TWD）

if 三者衝突: 印警告,以 Excel 內幣別為準（保誠特殊：以 product_name 推測為準）
```

### 1.5 多幣別對應表

| 幣別 | 代碼 | 商品名關鍵字 | min_sa | max_sa | unit_size | mid_div 預設 |
|---|---|---|---|---|---|---|
| 美元 | USD | 美元 / 外幣 / USD / Final ver | 10000 | 5000000 | 10000 | 0.055 |
| 新台幣 | TWD | 台幣 / 臺幣 / 新台幣 / NT$ | 300000 | 100000000 | 1000 | 0.045 |
| 澳幣 | AUD | 澳幣 / 澳元 / AUD | 10000 | 3000000 | 10000 | 0.050 |
| 人民幣 | CNY | 人民幣 / RMB / CNY | 50000 | 30000000 | 1000 | 0.040 |

### 1.6 萬元單位偵測（三重保險）🆕

某些 TWD 商品 base_sa 顯示為「75」「130」「528」等小數字 → 單位是萬元，要 × 10000：

```python
# 第 1 重：輸入頁有「萬元」字樣
unit_wan = False
for r in range(1, 30):
    for c in range(1, 30):
        v = ws.cell(r, c).value
        if isinstance(v, str) and v.strip() == '基本保險金額':
            for dc in range(7, 15):
                nv = ws.cell(r, c+dc).value
                if isinstance(nv, str) and '萬元' in nv:
                    unit_wan = True

# 第 2 重：輸入頁有「保險金額範圍：20~6,000萬元」
for r in range(1, 30):
    for c in range(1, 30):
        v = ws.cell(r, c).value
        if isinstance(v, str) and '萬元' in v and ('範圍' in v or '單位' in v):
            unit_wan = True

# 第 3 重 fallback：sa < schedule[0].death_benefit / 0.95 → 推測萬元
if base_sa and not unit_wan and schedule[0].get('death_benefit'):
    if base_sa < schedule[0]['death_benefit'] / 100:
        unit_wan = True
        print("⚠️ fallback 推測 base_sa 單位是萬元（sa 數量級遠小於 db）")

if unit_wan:
    base_sa = base_sa * 10000
    meta['unit_萬元'] = True
```

### 1.7 base_premium 反推（cum_prem 是 #VALUE! 時）🆕

```python
# 優先序: 從 schedule[0]['cum_prem'] 抓（如果 schedule 第一筆是好的）
if base_premium is None and schedule[0].get('cum_prem'):
    base_premium = schedule[0]['cum_prem']

# 否則 gross × (1-discount)
elif base_premium is None and base_premium_gross and discount:
    base_premium = base_premium_gross * (1 - discount)
    extraction_note = "base_premium 反推自 gross × (1-discount)"
```

### 1.8 declared_rate vs guaranteed_rate 不要搞混 🆕

**最常見錯誤：** 一般版/列印頁的 R6 c29 寫「商品預定利率」，這是 **guaranteed_rate**，不是 declared！

```
| label              | 對應欄位          | 來源優先 |
|--------------------|-------------------|---------|
| 宣告利率假設       | declared_rate     | 1. 輸入頁 |
| 本月宣告利率       | declared_rate     | 1. 輸入頁 |
| 商品預定利率       | guaranteed_rate   | 1. 輸入頁，2. 列印頁 R6 |
| 預定利率           | guaranteed_rate   | 1. 輸入頁，2. 註腳 regex |
```

### 1.9 月繳/季繳/半年繳/躉繳的 base_premium

⭐ **優先抽「首年實繳保險費」（年化值）**，不要抽「首期月繳/季繳/半年繳」。

| premium_mode | 說明 |
|---|---|
| `annual` | 年繳（預設，可省略 key） |
| `half_year` | 半年繳，base_premium 已換算 = 半年繳金額 × 2 |
| `quarterly` | 季繳，× 4 |
| `monthly` | 月繳，× 12 |
| `lump_sum` | 躉繳（period=1）|

### 1.10 🆕 躉繳 demo vs 商品本質躉繳

**遠雄/某些公司的試算表「預設用躉繳跑出範例值」，但商品本身可能支援多年期。**

判斷：
- 輸入頁「繳費年期 = 躉」+ 商品名沒「躉繳」字樣 → **躉繳 demo**
- 商品名含「躉繳」字樣 → **商品本質躉繳**

處理（躉繳 demo）：

```python
meta['period'] = 1
meta['premium_mode'] = 'lump_sum'
meta['is_lump_sum_demo'] = True  # 🆕 v5 新欄位
meta['extraction_note'] = '試算表為躉繳設定，商品本身可能支援多年期。需另外索取多年期試算表才能完整呈現。'
```

前端要根據 `is_lump_sum_demo: true` 顯示警示「**此商品可能支援其他年期，本資料只反映躉繳情境**」。

### 1.11 選抽欄位

| schema 欄位 | 說明 | 觸發條件 |
|---|---|---|
| `base_premium_gross` | 折扣前原始保費 | 保誠分紅必抽 |
| `guaranteed_rate` | 預定利率 | 凱基/新光/遠雄常有 |
| `dividend_option` | 增值回饋分享金給付方式 | 有則抽 |
| `discount_label` | Excel 上明列的高保費折扣 % 描述 | 有則抽 |
| `payout_period` | 給付期間 | 分期定期型 |
| `mid_dividend_rate` | **分紅商品必抽** | engine 為分紅型 |
| `is_endowment` | 還本商品標記 | 商品名含「還本」|
| `survival_benefit_age` | 生存金開始年齡 | is_endowment 時必抽 |
| `survival_payout_type` | `yearly` / `monthly` | is_endowment 時必抽 |
| `db_pattern` | `stepped`（Y1 db ≠ sa）| 新光定期給付型必抽 |
| `premium_mode` | `annual`/`half_year`/`monthly`/`lump_sum` | 非年繳必抽 |
| `is_lump_sum_demo` 🆕 | 躉繳是試算 demo 設定 | 試算表預設躉繳但商品支援多年期 |
| `unit_萬元` | 保額單位是「萬元」| TWD 商品輸入頁有萬元字樣 |
| `extraction_note` | 額外說明 | 有則抽 |
| `product_type` | `endowment`/`pure_life`/`with_survival` | 凱基/友邦/遠雄特有 |
| `protection_period` | 保障期間 | 養老型 |
| `step_up_year` | 階梯保額提升的年度 | stepped 商品 |

### 1.12 mid_dividend_rate 抽取規則（分紅商品專屬）

如果 Step 0 判斷是分紅型 → **必抽**。

**抽取優先順序：**
1. **Excel 內明列** — 'mid 紅利情境' / '中分紅率' / '中分紅假設' / '中等分紅率'
2. **DM 上的中分紅情境假設投資報酬率** — 通常在第一頁或備註欄
3. **找不到時用業界預設值**（並標 ⚠️）：
   - USD → 0.0550
   - TWD → 0.0450
   - 凱基紅利系列 → 預定利率 + 2.85%
4. **真的找不到** → 「⚠️ Excel 與 DM 都未列中分紅率，使用業界預設 X.XX%，請務必校對 DM」

### 1.13 印出來等確認

```
=== Step 1：基準參數 ===
base_sex: M
base_age: 40
base_sa: 100000
base_premium: 4040
period: 6
currency: USD
declared_rate: 0.042
discount: 0.0297  (從 (gross - net) / gross 算)

(若有抓到的選抽欄位)
base_premium_gross: 4159
guaranteed_rate: 0.0225 ⭐ 來源：列印頁 R81 註腳「預定利率為年利率 2.25%」
db_pattern: stepped
premium_mode: lump_sum
is_lump_sum_demo: true 🆕 (試算表躉繳設定,商品本質可能多年期)
is_endowment: true
unit_萬元: true (base_sa 已從萬元×10000)
survival_benefit_age: 65
survival_payout_type: yearly

(若是分紅型)
mid_dividend_rate: 0.055  ⭐ 來源：[Excel 第幾頁第幾列 / DM 備註 / 業界預設]

✅ 確認無誤後我進 Step 2 抽逐年表
```

---

## Step 2：逐年表欄位偵察

### 2.1 找標題列

```python
def find_print_header(ws, keyword='保單'):
    for r in range(1, 30):
        for c in range(1, 100):
            v = ws.cell(r, c).value
            if isinstance(v, str) and keyword in v and '年度' in v:
                return r, c
    return None, None
```

### 2.2 🆕 Layout 識別（用「公式列」判斷，不是欄位文字）

很多公司一個 Excel 內有多個逐年表 sheet，欄位位置不同。**必看 header 下面的「公式列」記號**：

```python
def detect_layout(ws, hdr_r):
    """掃 header 下 6 列找公式記號"""
    for rr in range(hdr_r, hdr_r + 6):
        for c in range(1, 50):
            v = ws.cell(rr, c).value
            if isinstance(v, str):
                if 'A=' in v and '(6)' in v and '(7)' in v:
                    return 'L1', {'cv_total_col': c}  # 一般利變/增額
                if 'A=' in v and '(2)' in v and '(4)' in v and '(6)' in v:
                    return 'L1B', {'cv_total_col': c}  # 還本型
                if v.strip() == 'D+K' or 'D+K' in v:
                    return 'L2', {'cv_total_col': c}  # 養老完整版
    if '檢核頁' in ws.title:
        return 'L3', {}  # 養老檢核頁 fallback
    return None, {}
```

### 2.3 遠雄 4 種 Layout 對照表 🆕

| Layout | 標誌 | sheet 名 | 適用 | 欄位映射 |
|---|---|---|---|---|
| **L1** | A=(6)+(7) | 一般版/簽約版/列印頁 | 利變/增額 | y=1, age=2, cum_prem=3, **cv_basic=18, cv_total=24, db=30** |
| **L1B** | A=(2)+(4)+(6) | 一般版 | 還本 | y=1, age=2, cum_prem=3, **db=6, surv_year=12, surv_cum=15, cv_basic=36, cv_total=42** |
| **L2** | D+K | 完整版(保單內頁ver.) | 養老 | y=1, age=2, cum_prem=3, **db=6, surv=9, cv_basic=12, cv_total=36** |
| **L3** | (sheet 名 = 檢核頁) | 檢核頁 | 養老 fallback | y=1, age=2, cum_prem=3, **db=9, maturity=12, cv=24** |

### 2.4 sheet 優先順序 🆕

對於遠雄這類「同檔多 sheet 都有逐年表」的情境，按以下順序選：

1. **養老型 (`product_type: endowment`)：** `完整版 (保單內頁ver.)` → `檢核頁` → `列印頁`
2. **還本型 (`is_endowment: true`)：** `一般版` → `簽約版`
3. **一般利變/增額：** `一般版` → `簽約版` → `列印頁`
4. **主+附約檔：** 永遠選**單一商品的 sheet**（一般版/簽約版），避開「主+附約列印頁」

### 2.5 twlife_v1 schedule 欄位需求

| schema 欄位 | 必抽 | 來源 keyword |
|---|---|---|
| `y` | ✅ | 保單年度 |
| `age` | ✅ | 保險年齡 |
| `cum_prem` | ✅ | 累積實繳保費 / 折扣後累積總繳 |
| `cv_basic` | ✅ | 基本保額對應的解約金 |
| `cv_total` | ✅ | 年度末總解約金 / 含累計增額之現金價值 |
| `death_benefit` | ✅ | 動態偵測：搜「身故/完全失能保險金(年度末)」標題 |
| `cv_increment` | ⚠️ | 累計增額對應之現金價值 |
| `dividend_year` | ⚠️ | 當年度增值回饋分享金 |
| `dividend_cum` | ⚠️ | 累計增值回饋分享金 |
| `survival_benefit_year` | ⚠️ | 還本商品當年生存金 |
| `survival_benefit_cum` | ⚠️ | 還本商品累計生存金 |
| `min_guaranteed_db` | ⚠️ | stepped 商品最低保證身故金（全球 col 13）|
| `maturity_benefit` 🆕 | ⚠️ | 養老型滿期金 |

### 2.6 動態欄位偵測

```python
def find_col_by_keyword(ws, header_row, keyword_filter):
    """在 header_row+1 列搜符合 keyword_filter 條件的欄位"""
    for c in range(1, 60):
        v = ws.cell(header_row + 1, c).value
        if isinstance(v, str) and keyword_filter(v):
            return c
    return None

# 範例: 找 death_benefit
db_col = find_col_by_keyword(ws, hr,
    lambda v: '身故' in v and '年度末' in v and '對應' not in v)
```

實測新光保經公版 11 商品：10 個 db 在 col 27、MJZ col 25、TYL col 31。

### 2.7 cum_prem 動態欄位選擇（新光商品）

新光列印頁有兩個 cum_prem 欄位，比對「簡易版 R(Y2) col 3/4」與「列印頁 R32 col 20 / col 35」哪個一致：

| 商品 | cum_prem 來源 |
|---|---|
| TBA / P2A / JZA / SMD（有抵繳機制） | col 35 |
| WZA / P3A / YK / MLXT / SX / XH / XT / XN / ZM / FLW（無抵繳） | col 20 |

### 2.8 還本商品 schema 擴充

```python
# 條件: 用累計判斷,避免末筆當年=0 但累計仍有的情況遺漏
if surv_cum > 0:
    sched_row["survival_benefit_year"] = round(surv_year, 2)
    sched_row["survival_benefit_cum"] = round(surv_cum, 2)
```

### 2.9 surv_cum 直接讀 vs 累加 🆕

| Layout | surv_cum 處理 |
|---|---|
| L1B（還本一般版）| **直接讀 c15**（試算表已算好）|
| L2（養老完整版）| 沒有 surv_cum 欄 → **從 surv_year 累加計算** |
| 其他公司 | 看 sheet 有沒有「累計生存保險金」欄 → 有則直接讀，沒有則累加 |

### 2.10 還本商品簡易版多區塊處理

還本商品（MLXT 等）的簡易版有「情境 1 / 情境 2」**兩個 Y1 起算的表格**：

```python
def find_first_block_end(ws_simple):
    last_y = 0
    for r in range(9, ws_simple.max_row + 1):
        y_val = ws_simple.cell(r, 2).value
        if isinstance(y_val, (int, float)) and y_val >= 1:
            y = int(y_val)
            if y < last_y: return r - 1  # Y 倒退 = 第二區塊開始
            last_y = y
    return ws_simple.max_row
```

### 2.11 還本商品 3 種子模板（看 R7 col 9 標題）

| 模板 | R7 col 9 標題 | cv_basic 在 | cv_total 在 |
|---|---|---|---|
| MLXT 模板 | 「累計實繳保費(情境2)」 | col 10 | col 12 |
| XN 模板 | 「累計增加回饋金利益分析」 | col 10 | col 12 |
| ZM/FLW 模板 | 「解約金」 | col 9 | col 11 |

```python
col9_r7 = str(ws_simple.cell(7, 9).value or '')
if '解約金' in col9_r7:
    cols = {'cv_basic': 9, 'cv_total': 11}  # ZM/FLW
else:
    cols = {'cv_basic': 10, 'cv_total': 12}  # MLXT/XN
```

### 2.12 養老型 schedule 末筆滿期金處理 🆕

養老型最後一筆 cv_basic = 0 但有滿期金，**不能直接 break**，要保留並塞 maturity_benefit：

```python
is_endow_layout = (layout in ('L2', 'L3'))
for r in range(start_r, ws.max_row + 1):
    cv_basic = to_num(ws.cell(r, cv_basic_col).value)
    surv_year = to_num(ws.cell(r, surv_col).value)
    
    if is_endow_layout:
        if cv_basic is None or cv_basic == 0:
            if surv_year and surv_year > 0:
                # 滿期金那一筆: 保留並退出
                row['maturity_benefit'] = round(surv_year, 2)
                row['cv_basic'] = 0
                row['cv_total'] = 0
                sched.append(row)
                break  # 合約結束
            else:
                break  # 真的結束
    else:
        # 一般 layout: cv_basic ≤ 0 且 y > 1 → break
        if cv_basic is None: continue
        if cv_basic <= 0 and y > 1: break
```

### 2.13 多情境表頭過濾（凱基）

凱基「明細版-試算頁」內部可能有「以繳清」+「現金給付」兩段：

```python
# y 嚴格遞增防止誤抽
prev_y = 0
for r in range(start, end):
    y = ws.cell(r, y_col).value
    if isinstance(y, (int, float)) and y < prev_y:
        break  # 新區塊開始,停止抽取
    prev_y = y
```

### 2.14 prudential_v2 schedule 額外需求

每筆 schedule 還要有 `scenarios.{none|mid|low}` 子物件：

```json
"scenarios": {
  "none": { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
  "mid":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
  "low":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 }
}
```

**關鍵驗證點：** Y1-Y5 三情境通常數字相同（分紅未生效），Y6+ 開始有差異。

### 2.15 壞資料識別

| 標記 | 處理方式 |
|---|---|
| `#N/A` | 視為缺值，跳過該 cell |
| `-----` `------` | 視為缺值（凱基常用） |
| `#REF!` | 試算表結構壞了，整張表標 ⚠️ 異常 |
| `#VALUE!` | 公式爆掉，走 Step 0.5 |

### 2.16 schedule 強制排序

```python
schedule.sort(key=lambda r: r['y'])
```

### 2.17 印出對照表給確認

```
=== Step 2：逐年表欄位對照 ===
Sheet：<逐年試算頁名稱>  (透過 layout 偵測選的)
Layout：L1 / L1B / L2 / L3 (新光直營/保經、遠雄 layout 等)
標題列：R<X>+R<Y>
資料起始 row：R<Z>，結束 row：R<W>（共 N 筆）

欄位對照（動態偵測結果）：
  col 2 → y (保單年度)
  col 3 → age
  col 12 → cum_prem (簡易版 col 3 對齊判斷後選的)
  col 8 → cv_basic
  col 27 → death_benefit (動態偵測「身故/完全失能保險金(年度末)」)
  ...

(若是還本商品)
  col 12 → survival_benefit_year (直接讀,L1B 模式)
  col 15 → survival_benefit_cum (直接讀,L1B 模式)

(若是養老商品)
  Y10 (期滿年): cv_basic=0, maturity_benefit=70446 ✅ 已正確保留

(若是 prudential_v2)
  col 17 → scenarios.mid.dividend_year
  col 19 → scenarios.mid.db_with_dividend
  col 20 → scenarios.mid.cv_total

✅ 確認對應無誤後我進 Step 3 抽 JSON
```

---

## Step 3：JSON Schema

### 3.1 twlife_v1 標準 schema

```json
{
  "meta": {
    "product_id": "<plan_code>",
    "company": "<公司名>",
    "product_name": "<去前綴後的全名>",
    "currency": "USD",
    "period": 6,
    "engine": "twlife_v1",
    "base_sex": "M",
    "base_age": 40,
    "base_sa": 100000,
    "base_premium": 4040,
    "discount": 0.0297,
    "declared_rate": 0.042,
    "guaranteed_rate": 0.025,
    
    "db_pattern": "stepped",
    "is_endowment": true,
    "survival_benefit_age": 65,
    "survival_payout_type": "yearly",
    "premium_mode": "annual",
    "is_lump_sum_demo": true,
    "unit_萬元": true,
    "product_type": "endowment",
    "step_up_year": 6,
    "protection_period": 99,
    
    "sa_ramp_up": [0.10, 0.20, 0.30, 0.40, 0.50, 1.00],
    "sa_growth_curve": "increment_terminal",
    "sa_decay": false,
    "income_phase_start": null,
    "premium_offset_by_dividend": false,
    
    "extraction_note": "...",
    "source_file": "原始 Excel 檔名",
    "extracted_at": "YYYY-MM-DD"
  },
  "schedule": [
    {
      "y": 1,
      "age": 40,
      "cum_prem": 4040,
      "cv_basic": 1820,
      "cv_total": 1820,
      "death_benefit": 100000,
      "dividend_cum": 0,
      "survival_benefit_year": 6025,
      "survival_benefit_cum": 6025,
      "maturity_benefit": 0
    }
  ]
}
```

### 3.2 prudential_v2 標準 schema

```json
{
  "meta": {
    "product_id": "ARLPLU30",
    "company": "保誠人壽",
    "product_name": "...",
    "currency": "USD",
    "period": 6,
    "engine": "prudential_v2",
    "base_sex": "M",
    "base_age": 40,
    "base_sa": 100000,
    "base_premium": 42994.71,
    "base_premium_gross": 44090,
    "discount": 0.0248,
    "declared_rate": 0,
    "mid_dividend_rate": 0.055,
    "source_file": "...",
    "extracted_at": "YYYY-MM-DD"
  },
  "schedule": [
    {
      "y": 1, "age": 40, "cum_prem": 42995,
      "cv_basic": 14600, "cv_total": 14600, "death_benefit": 100000,
      "scenarios": {
        "none": { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
        "mid":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
        "low":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 }
      }
    }
  ]
}
```

### 3.3 關鍵設計原則

1. `engine` 字串必須是 `"twlife_v1"` 或 `"prudential_v2"`，大小寫一字不差
2. schedule 每筆 `y` 是整數，不是字串
3. `cv_basic` 一定要 ≤ `cv_total`
4. **嚴格切到保險年齡 110 歲**：`age + y - 1 > 110` 直接不抽
5. **末筆 cv_basic = 0 且 y > 1 → 合約結束 break**（養老型例外，見 2.12）

---

## Step 4：自洽性驗證

```python
def verify(data, gross=None):
    sched = data['schedule']
    base = data['meta']
    errors, warnings = [], []
    p = base['period']
    is_endow = base.get('is_endowment', False)
    is_stepped = base.get('db_pattern') == 'stepped'
    is_endowment_type = base.get('product_type') == 'endowment'
    is_lump_sum_demo = base.get('is_lump_sum_demo', False)
    
    if not sched:
        errors.append("schedule 為空")
        return errors, warnings
    
    # 1. Y1 cum_prem ≈ base_premium
    if abs(sched[0]['cum_prem'] - base['base_premium']) > max(1, base['base_premium'] * 0.005):
        errors.append("Y1 cum_prem fail")
    
    # 2 + 3. 躉繳 vs 多年期分流
    if p == 1:
        # 躉繳: Y2 cum_prem = Y1
        if len(sched) > 1 and abs(sched[1]['cum_prem'] - sched[0]['cum_prem']) > 1:
            errors.append("Y2 應 = Y1 (躉繳)")
    else:
        # 多年期: Y(p) ≈ base × p (容差 ±5% 涵蓋分紅抵繳保費型)
        y_p = sched[p-1]['cum_prem']
        exp_p = base['base_premium'] * p
        tol = max(p, exp_p * 0.05)
        if abs(y_p - exp_p) > tol:
            warnings.append(f"Y{p} cum_prem 抵繳差異 (預期內)")
        # Y(p+1) 應停
        if len(sched) > p and abs(sched[p]['cum_prem'] - sched[p-1]['cum_prem']) > 1:
            errors.append(f"Y{p+1} cum_prem 應停")
    
    # 4. cv_total >= cv_basic 每年成立
    for r in sched:
        if r.get('cv_total', 0) < r.get('cv_basic', 0) - 1:
            errors.append(f"Y{r['y']} cv_total < cv_basic"); break
    
    # 5. 中後期遞增（還本/養老/衰減商品改規則）
    if is_endow:
        # 還本: 累計總受益遞增 (容差 ±0.1%)
        prev = 0
        for r in sched:
            total = r.get('cv_total', 0) + r.get('survival_benefit_cum', 0) + r.get('dividend_cum', 0)
            if total < prev * 0.999:
                errors.append(f"Y{r['y']} 累計受益下降"); break
            prev = total
    elif is_endowment_type:
        # 養老型: 不嚴格檢查 (期滿前遞增、期滿用 maturity_benefit)
        pass
    elif base.get('sa_decay'):
        pass  # 衰減型
    else:
        # 一般: 繳費期內遞增 (容差 ±0.1%)
        for i in range(min(10, len(sched)), len(sched)):
            if sched[i].get('cv_total', 0) < sched[i-1].get('cv_total', 0) * 0.999:
                warnings.append(f"Y{sched[i]['y']} cv_total 微下降")
                break
    
    # 6. db ≈ base_sa（stepped/還本/分紅放寬）
    db_max = max(r.get('death_benefit', 0) for r in sched)
    if is_stepped or is_endow:
        if db_max < base['base_sa'] * 0.95:
            errors.append(f"db_max ({db_max}) 從未達 base_sa")
    elif is_endowment_type:
        # 養老型: db_max 應接近 base_sa
        if db_max < base['base_sa'] * 0.95:
            errors.append(f"db_max ({db_max}) < base_sa × 0.95 (養老型應達)")
    elif base['engine'] == 'prudential_v2':
        # 分紅商品身故倍率高: 末 5 年平均 ratio 在 [0.5, 25]
        last5 = sched[-5:]
        avg_ratio = sum(r.get('death_benefit', 0) for r in last5) / len(last5) / base['base_sa']
        if not 0.5 <= avg_ratio <= 25:
            errors.append(f"末 5 年平均 db/sa = {avg_ratio:.2f} 超出 [0.5, 25]")
    else:
        # 一般: 任一年 db 在 [0.95, 1.05] sa
        any_in_range = any(0.95 <= r.get('death_benefit', 0)/base['base_sa'] <= 1.05 for r in sched)
        if not any_in_range:
            warnings.append("無年度 db 在 [0.95-1.05] sa（可能是衰減/階梯型）")
    
    # 7. age <= 110
    last_age = sched[-1].get('age', base['base_age'] + sched[-1]['y'] - 1)
    if last_age > 110:
        errors.append(f"age {last_age} > 110")
    
    # 8. 筆數 >= 50 (養老/高齡投保放寬)
    if len(sched) < 50:
        if is_endowment_type or base['base_age'] >= 50:
            pass  # 養老型/高齡 OK
        else:
            warnings.append(f"筆數 {len(sched)} < 50")
    
    # 9. discount 自洽（容差放寬）
    if gross and base.get('discount', 0) > 0:
        net = base['base_premium']
        discount = base['discount']
        expected_net = gross * (1 - discount)
        tol = max(2, gross * 0.001)
        if abs(expected_net - net) > tol:
            errors.append(f"discount 不自洽")
    
    # 🆕 10. is_lump_sum_demo 商品要求 extraction_note 存在
    if is_lump_sum_demo and not base.get('extraction_note'):
        warnings.append("is_lump_sum_demo 商品建議加 extraction_note 說明")
    
    # === prudential_v2 額外檢查 ===
    if base['engine'] == 'prudential_v2':
        # 11. 三情境結構完整
        for r in sched:
            sc = r.get('scenarios', {})
            for name in ['none', 'mid', 'low']:
                if name not in sc:
                    errors.append(f"Y{r['y']} 缺 scenarios.{name}"); break
        
        # 12. mid Y(period+1)+ 應 > 0
        if len(sched) > p:
            mid_y = sched[p].get('scenarios', {}).get('mid', {}).get('dividend_year', 0)
            if mid_y == 0:
                errors.append(f"Y{p+1} mid.dividend_year = 0 (可能抽到無紅利欄位)")
    
    return errors, warnings
```

### 印出驗證結果

```
=== Step 4：自洽性驗證 ===
通用檢查 10 項：
  1. Y1 cum_prem ≈ base_premium: ✅
  2/3. (躉繳/多年期分流): ✅
  4. cv_total >= cv_basic: ✅
  5. (還本: 累計受益遞增 / 一般: 繳費期內遞增 / 養老: 跳過): ✅
  6. (stepped/還本/養老: db_max ≥ sa × 0.95): ✅
  7. age <= 110: ✅
  8. 筆數 >= 50: ✅ / ⚠️
  9. discount 自洽: ✅
  10. 🆕 is_lump_sum_demo 含 extraction_note: ✅

警告：[列出 warnings]

[若有 ❌ 一律回頭修 Step 1-3，不交付]
```

---

## Step 5：交付

- 寫到 `/mnt/user-data/outputs/<company_dir>/<plan_code>.json`
- 寫 `_manifest_additions.json`、`_PRODUCTS_additions.json`、`README.md`
- 用 `present_files` 交付（**所有 JSON + 3 個工具檔一起呈現**）
- 印交付總結

```
=== 交付總結 ===
商品：<plan_code>
公司：<公司名>
引擎：<twlife_v1 / prudential_v2>
schedule 筆數：N
base_sa: ...
base_premium: ...
declared_rate: ... (宣告利率假設)
guaranteed_rate: ... (商品預定利率, 若有)
discount: ...
db_pattern: stepped (若有)
is_endowment: true (若還本)
product_type: endowment (若養老)
premium_mode: lump_sum (若躉繳)
is_lump_sum_demo: true (若試算 demo 躉繳)
unit_萬元: true (若萬元單位)

📋 PRODUCTS 註冊建議值（複製貼上到 index_slim.html）：
[完整物件]

📋 _manifest.json entry：
[完整物件]

自洽性：N/N 通過
原始檔：xxx.xls
輸出檔：<plan_code>.json

⚠️ 待校對清單：
- (列出所有用了業界預設值的欄位)
- (列出 Excel 找不到的關鍵資訊)
- 🆕 (對 is_lump_sum_demo 商品提醒索取多年期試算表)
- (對 stepped 商品提醒)
- (對還本商品提醒)
- (對躉繳商品提醒)
- (對主+附約檔提醒主約已抽乾淨)
```

---

# 第二部分：部署規則 A~Q（思維分組重整）🆕

## 命名與正規化（A、F）

### ⭐ 規則 A：product_name 必須去除公司前綴

| ❌ 錯誤 | ✅ 正確 |
|---|---|
| `'台灣人壽美鑫美利美元利率變動型終身壽險'` | `'美鑫美利美元利率變動型終身壽險'` |
| `'凱基人壽紅利幸福美元分紅終身壽險-定期給付型'` | `'紅利幸福美元分紅終身壽險-定期給付型'` |
| `'保誠人壽美滿傳家外幣終身壽險(定期給付型)'` | `'美滿傳家外幣終身壽險(定期給付型)'` |
| `'富邦人壽美富紅運外幣分紅終身壽險'` | `'美富紅運外幣分紅終身壽險'` |
| `'遠雄人壽美滿美利旺美元利率變動型終身壽險'` 🆕 | `'美滿美利旺美元利率變動型終身壽險'` |

**判斷邏輯：** 若 `product_name.startswith(company)` → 移除前綴。三處（JSON / manifest / PRODUCTS）保持一致。

### ⭐ 規則 F：product_name 統一半形括號 + 破折號

```python
name = name.replace('\uff08', '(').replace('\uff09', ')')
name = name.replace('－', '-').replace('—', '-')
name = name.replace('２', '2').replace('１', '1')  # 全形數字
```

判斷時機：規則 A 去前綴之後馬上做。

## 商品分類與類型（B、J、K）

### ⭐ 規則 B：type 欄位完整對應表（16 種組合）

| 商品特性 | type 字串 |
|---|---|
| 美元利變、無分紅、無還本 | `'美元利率變動型終身壽險'` |
| 美元利變、有定期還本 | `'美元利率變動型還本終身壽險'` |
| 美元利變、養老型 | `'美元利率變動型養老保險'` |
| 美元分紅、無還本 | `'美元分紅終身壽險'` |
| 美元分紅、有定期還本 | `'美元分紅還本終身壽險'` |
| 美元純預定利率終身壽（無「利變」二字）| `'美元終身壽險'` |
| 美元年金 | **不支援** |
| 新台幣利變 | `'新台幣利率變動型終身壽險'` |
| 新台幣利變還本 | `'新台幣利率變動型還本終身壽險'` |
| 新台幣分紅 | `'新台幣分紅終身壽險'` |
| 新台幣分紅還本 | `'新台幣分紅還本終身壽險'` |
| 新台幣養老 | `'新台幣利率變動型養老保險'` |
| 澳幣利變 | `'澳幣利率變動型終身壽險'` |
| 人民幣利變 | `'人民幣利率變動型終身壽險'` |

**判斷邏輯：**
1. 看商品名：含「分紅」→ 分紅型；否則 → 利變型
2. 看 schedule：每年都有領回 → 還本型；否則 → 終身型
3. 看 product_type：endowment → 養老
4. 看幣別

### ⭐ 規則 J：多幣別處理

見 Step 1.5「多幣別對應表」。

**強驗證：** 商品名關鍵字、計價幣別欄位、保費數量級三者不一致 → 印警告，以「計價幣別欄位」為準（保誠例外，以 product_name 為準）。

### ⭐ 規則 K：商品設計特殊型態

當商品有以下特殊設計時，在 meta 加對應欄位：

#### 階梯保額型
```json
"sa_ramp_up": [0.10, 0.20, 0.30, 0.40, 0.50, 1.00],
"notes": "Y1-Y5 基本保額為 base_sa 的 10/20/30/40/50%,Y6 起 100%"
```
範例：富邦順順美利 FBM、保誠 ARLPLU 0 歲投保、新光定期給付型

#### 增額型
```json
"sa_growth_curve": "increment_terminal",
"notes": "增額終身壽,基本保額逐年遞增"
```
範例：富邦美好利 FBP、台灣金多利、**遠雄美滿金永樂 WJ1** 🆕

#### 衰減型
```json
"sa_decay": true,
"notes": "保障型壽險:Y6 達峰後 db 隨年齡衰減"
```
範例：富邦美利大心 FAZ、富邦美利大運 FBO

#### 還本/退休型
```json
"income_phase_start": 65,
"notes": "Y65 後進入領回階段,cv_total 會逐年遞減"
```
範例：富邦活利優退分紅 PALA_B_C、**遠雄富貴喜多利 WM1** 🆕

#### 回饋金抵繳保費型
```json
"premium_offset_by_dividend": true,
"notes": "回饋金抵繳保費,cum_prem_net 為實際自付,cum_prem 為合約面額"
```
範例：富邦美好利 FBP、富邦美利大心 FAZ

#### 養老型 🆕
```json
"product_type": "endowment",
"protection_period": 10,
"notes": "養老保險, Y10 期滿給付滿期金"
```
範例：**遠雄美滿唯固利 BY1**、**美滿固特益 BT1**、**美滿美利固 BQ1** 🆕

## 安全預設與閾值（C、D）

### ⭐ 規則 C：min_sa / max_sa / max_age 安全預設

**抽取優先順序：**
1. **Excel 投保規則章節**找 keyword
2. **找不到 → 用安全預設值**（並標 ⚠️）：

| 幣別 | min_sa | max_sa | max_age |
|---|---|---|---|
| USD | 10000 | 5000000 | 75 |
| TWD | 300000 | 100000000 | 75 |
| AUD | 10000 | 3000000 | 75 |
| CNY | 50000 | 30000000 | 75 |

3. **絕對禁止用 min_sa: 50000 預設**（USD 預算 4000 算回保額會 < 5 萬，卡死）

### ⭐ 規則 D：mid_dividend_rate（分紅商品專屬）

只寫入 PRODUCTS 註冊（JSON / manifest 不需要）：

```js
{
  plan_code: '...',
  engine: 'prudential_v2',
  mid_dividend_rate: 0.055,
}
```

**前端顯示：** STEP3 比較表第 8 列「中分紅率」會以紫色顯示這個 % 值。

## Manifest 與部署（E、I、G、L）

### ⭐ 規則 E：_manifest.json key 命名 + 多年期商品

`key` 就是 plan_code，**1 個 plan_code = 1 條 entry**。

**多年期商品：**
- **凱基/富邦**：同 plan_code 包多年期 → manifest 寫 1 條
- **新光/保誠**：不同年期用不同 plan_code → manifest 寫多條

### ⭐ 規則 I：Manifest entry 必填欄位

```json
{
  "key": "PLAN_CODE",
  "company": "保險公司",
  "plan_code": "PLAN_CODE",
  "product_name": "商品名(去前綴+半形)",
  "currency": "USD or TWD",
  "period": 6,                          ← 缺這個前端會無法 STEP1 篩選
  "engine": "twlife_v1",
  "product_code": "PLAN_CODE",
  "path": "<company_dir>/<plan_code>.json"  ← 路徑錯前端 404
}
```

**處理 manifest 時對所有 entry 跑欄位完整性檢查**，缺欄位優先補齊。

### ⭐ 規則 G：跨輪上線部署狀況追蹤

開工前**核對你上傳的 `_manifest.json` 是哪一版**。如果有落差，**用你上傳的當基準**。**不要假設上輪修改已部署**。

主動列「**今輪 vs 上輪差異**」，標示哪些 plan_code 是覆蓋/新增/刪除。

### ⭐ 規則 L：同 plan_code 多版本檔追蹤

`_v5` `_v6` `_v7` 後綴避免跟前批撞名：

```
ARLPLU30_v5.json (2026-04-15 抽)
ARLPLU30_v6.json (2026-05-20 抽,有更新)
```

manifest path 用最新版，舊版 JSON 保留歷史。

## 多通路與重複（H）

### ⭐ 規則 H：同商品多通路 plan_code

**判斷標準：** 兩個 plan_code 對應同商品 if：
- product_name 一樣（去前綴後）
- base_age / base_sex / base_sa / period 一樣
- Y10 cum_prem 跟 cv_total 一致（誤差 < 1）

**處理選項：**
| 選項 | 何時用 |
|---|---|
| A. 共存（2 個都留） | 用戶想看不同通路差異 |
| B. 取代（刪舊版） | 用戶不在乎通路 |
| C. 合併 | 罕見，需重抽 |

**Claude 該怎麼做：** 偵測到時**一律先停下問人**。

🆕 **特例：主+附約檔同 plan_code**：
- WU1_NJD（一般通路）vs WU1_XK1_CJ2_Plus（搭附約 Plus 版）
- 主約相同但附約不同 → 通常只取主約乾淨的版本（_NJD）

## 前端提醒（M、N、O、P、🆕Q-extension）

### ⭐ 規則 M：stepped 商品前端提醒

```
⚠️ <plan_code> 是 stepped 商品（Y1 db < base_sa）：
   - Y1 db 僅 base_sa 的 X.X%，Y<period+1> 才達標
   - 前端反推保額不能用 Y1，用 meta.base_sa 或 schedule[period].death_benefit
```

### ⭐ 規則 N：還本商品前端提醒

```
⚠️ <plan_code> 是還本商品：
   - cv_total 後期會被生存金消耗下降（正常設計）
   - 「總受益」應算 cv_total + survival_benefit_cum + dividend_cum
   - 不能只看 cv_total
```

### ⭐ 規則 O：躉繳商品前端提醒

```
⚠️ <plan_code> 是躉繳商品：
   - 一次繳清,Y2+ cum_prem = Y1
   - 前端若有「年期選單」要顯示成「一次繳清」
   - 別用「base_premium × period」算總繳
```

### ⭐ 規則 P：月繳/半年繳/季繳商品

```
⚠️ <plan_code> 是 <月繳/半年繳/季繳> 商品：
   - meta.base_premium 已換算為「年繳概念」
   - 前端要顯示「期繳金額」需自行 ÷ <12/2/4>
   - schedule 的 cum_prem 是年度末累計,不需特別處理
```

### 🆕 ⭐ 規則 Q-ext：is_lump_sum_demo 商品前端提醒

```
⚠️ <plan_code> 是「躉繳 demo」商品：
   - 試算表為躉繳設定（period=1）
   - 商品本身可能支援多年期繳費
   - 前端應顯示警示「此資料只反映躉繳情境，建議洽業務員索取多年期試算表」
   - 比較功能仍可使用（同樣是躉繳的商品比較有意義）
```

### 🆕 ⭐ 規則 R：養老型商品前端提醒

```
⚠️ <plan_code> 是養老型商品：
   - 期滿那年 cv_basic = 0,但有 maturity_benefit
   - 前端「期滿總領」= maturity_benefit + survival_benefit_cum + dividend_cum
   - schedule 末筆要正確顯示滿期金
```

## 批次處理（Q）

### ⭐ 規則 Q：批次處理節奏

使用者明說「批次/一次處理」時：
- **不每檔停確認** → 走 Step B0 觸發點
- **只在最終交付集中列待校對項**
- **失敗的標 ❌ 不交付，但繼續處理下一個**

---

⚠️ **規則漏掉的後果：**
- 漏 A → 商品名重複公司名
- 漏 B → STEP1 篩選找不到
- 漏 C → STEP2 預算反推保額卡死
- 漏 D → 分紅顯示「分紅型」非數字
- 漏 E → manifest 重複/漏商品
- 漏 F → 全形/半形不一致
- 漏 G → 用上輪當基準衝突
- 漏 H → 同商品多 plan_code 沒問人
- 漏 I → 前端載入 404
- 漏 J → 多幣別誤判
- 漏 K → 特殊商品結構誤判
- 漏 L → 多版本檔覆蓋
- 漏 M~P → 前端反推保額/年繳保費錯誤
- 🆕 漏 Q-ext → 躉繳 demo 商品被誤以為純躉繳商品
- 🆕 漏 R → 養老型 schedule 末筆滿期金被前端視為合約結束 0

---

# 第三部分：公司踩雷地圖 🆕

## 8 家公司一覽

| 公司 | 引擎 | 主要 sheet | 特殊雷點 |
|---|---|---|---|
| 富邦 | twlife_v1 / prudential_v2 | 總表/列印頁-簡/分紅_H/M/L | 階梯/增額/衰減/退休型 4 種 |
| 凱基 | twlife_v1 | 明細版-試算頁/簽名頁/分紅計算_M | 多 sheet 多版本欄位 |
| 台壽 | twlife_v1 / prudential_v2 | 資料檢核頁/Profits1-3 | 還本商品多模板 |
| 友邦 | twlife_v1 | FACTOR/PREM/保險利益分析表 | RV 表手算 + #VALUE! |
| 宏泰 | twlife_v1 | (各種) | **加密 12345** |
| 保誠 | prudential_v2 | 試算表單 sheet | layout A/B + 60% 檔名錯 |
| 新光 | twlife_v1 | DBV/SBN/CSV 或 GP/Corridor/FACTOR | 直營版 vs 保經版 |
| 全球 | twlife_v1 | 月繳/stepped 多 | min_guaranteed_db 副欄 |
| **🆕 遠雄** | twlife_v1 | 輸入頁 + 一般版/簽約版/完整版/檢核頁 | **4 種 layout / 萬元單位 / 躉繳 demo / 主+附約** |

## 公司 sheet 特徵速查

| 公司 | 關鍵 sheet 名 | 引擎 |
|---|---|---|
| **富邦** 利變 | 總表 + 列印頁-簡 + 輸入頁 | twlife_v1 |
| **富邦** 分紅 | 總表_分紅_H/M/L | prudential_v2 |
| **富邦** 變額 | ROP / tbULMultiple / 計算內容-正/零/負 | ❌ 不支援 |
| **台壽** 一般 | 資料檢核頁 | twlife_v1 |
| **台壽** 分紅 | Profits1/2/3 + 比對用 | prudential_v2 |
| **凱基** 標準 | 明細版-試算頁 | twlife_v1 |
| **凱基** 分紅 | 試算表(簽名頁) + 分紅計算_M | twlife_v1 |
| **凱基** 養老 | 試算頁 + 商品名「養老」 | twlife_v1 |
| **保誠** ARLPLU | 試算表單 sheet ≥ 60 欄 | prudential_v2 |
| **保誠** RV | sheet 名含「RV 表」 | ❌ 不支援 |
| **新光** 直營 | DBV / SBN / CSV / AXT / RBN | twlife_v1 |
| **新光** 保經 | GP / Corridor Rule / FACTOR | twlife_v1 |
| **新光** 分紅 | gp_table / uv_table / div_table | ❌ 不支援 |
| **友邦** RV 表 | FACTOR + PREM + 保險利益分析表 | twlife_v1（手算）|
| **友邦/宏泰/全球** 一般 | 逐年表 / 明細表 / 試算明細 / 試算頁 | twlife_v1 |
| **🆕 遠雄** | 輸入頁 + 一般版/簽約版/完整版(保單內頁ver.)/檢核頁/列印頁 | twlife_v1 |

## 友邦踩雷

- **檔案格式：** 全部 .xls，要 LibreOffice 轉
- **公式爆炸：** 逐年表常見 #VALUE!，要走 Step 0.5 重算
- **RV 表手算：** 公式重算還是不行，從 FACTOR + PREM 表手算
- **單位陷阱：** USD 用「每千美元」、TWD 用「每萬元」基數，混用會差 10 倍
- **折扣分離：** 高保額折扣 + 自動轉帳折扣可同時存在，要合併計算

## 凱基踩雷

- **多 sheet：** 「明細版-試算頁」+「試算表(簽名頁)」+「分紅計算_M」+「試算頁」
- **多區塊：** 同 sheet 內可能有「以繳清」+「現金給付」兩段，要用 y 嚴格遞增過濾
- **月繳商品：** 抽「首期月繳」會差 6 倍，要抽「首年實繳保險費」
- **養老型：** 期滿那年 cv_total = 0 要用滿期金取代
- **6UBS 系列：** 同 plan_code 包多年期（6/10/15 年）

## 保誠踩雷

- **layout A vs B：** 同 prudential_v2 內部分流，欄位位置完全不同
- **檔名錯誤率高：** 第六輪 60% 檔案是檔名錯（複製沒改名），用 Excel R30 c7 內容驗證
- **身故倍率高：** ACLPEN26 (6.8x)、ACLPEU25 (12.6x)、ACLPEN27 (20.4x)，驗證放寬到 [0.5, 25]

## 新光踩雷

### 直營版 vs 保經公版差異

| 屬性 | 直營版 | 保經公版 |
|---|---|---|
| 列印頁尺寸 | 159-180×84-89 | 193-713×240-256 |
| 列印頁標題列 | R28+R29 | R11+R12 |
| 簡易版標題列 | R15-R16 | R7 |
| 列印頁 y 欄 | col 14 | col 2 |
| 列印頁 cv_basic | col 59 | col 8 |
| 列印頁 db（非還本） | col 42 | col 27（動態偵測）|
| 費率表 sheet | DBV/SBN/CSV/AXT/RBN | GP/Corridor Rule/FACTOR |

### cum_prem col 20 vs col 35

| 商品 | cum_prem 來源 |
|---|---|
| TBA / P2A / JZA / SMD（有抵繳機制） | col 35 |
| WZA / P3A / YK / MLXT / SX / XH / XT / XN / ZM / FLW（無抵繳） | col 20 |

### 還本商品 3 模板

| 模板 | R7 col 9 標題 | cv_basic 在 | cv_total 在 |
|---|---|---|---|
| MLXT | 「累計實繳保費(情境2)」 | col 10 | col 12 |
| XN | 「累計增加回饋金利益分析」 | col 10 | col 12 |
| ZM/FLW | 「解約金」 | col 9 | col 11 |

## 富邦踩雷

- **特殊商品設計多：** 階梯（FBM）、增額（FBP）、衰減（FAZ/FBO）、退休（PALA_B_C）
- **變額型：** ROP / tbULMultiple，永久跳過
- **分紅型：** 總表_分紅_H/M/L 三 sheet，走 prudential_v2

## 台壽踩雷

- **資料檢核頁：** 主要逐年表來源
- **分紅還本：** 吉享紅等走 prudential_v2 + is_endowment

## 全球踩雷

- **月繳商品：** base_premium 要換算
- **stepped 商品：** col 13 有 min_guaranteed_db 副欄

## 🆕 遠雄踩雷（13 檔實戰）

### Layout 4 種

見 Step 2.3「遠雄 4 種 Layout 對照表」。

### 萬元單位

13 檔中 4 檔 base_sa 是萬元單位（**WM1=75 萬、WI1=130 萬、WJ1=528 萬、WU1=95 萬**）。其他 USD 商品（B 開頭）跟某些 TWD 增額終身壽（WQ1/WN1/WR1）是元。

### 躉繳 demo 比例高

13 檔中 9 檔試算表是「躉繳設定」demo（BO1/BB1/BI1/BY1/BT1/BQ1/WQ1/WN1/WR1）。商品本身可能支援多年期，但試算表只跑了躉繳。**全部標 `is_lump_sum_demo: true`**。

### 主+附約檔

WJ1（含 NJD/HZ1/HF1）、WU1_NJD、WU1_XK1_CJ2_Plus 都是主+附約。
- 抽主約用「一般版/簽約版」最乾淨
- WU1+ Plus 版主約 c3 #VALUE! 全爆 → 推薦只用 WU1_NJD 那份

### 養老型

BY1/BT1/BQ1 三檔養老（檔名都帶 `_NZA`，NZA 是年金附約）：
- BT1 沒有「完整版 (保單內頁ver.)」 → fallback 到「檢核頁」(L3 layout)
- 末筆 cv_basic = 0，要保留滿期金

### 還本型

WM1（period=2）/ WI1（period=6）兩檔還本：
- 走 L1B layout
- surv_year/surv_cum 直接讀（c12/c15）

### declared vs guaranteed 陷阱

- **「宣告利率假設」= declared_rate**（在輸入頁 R28）
- **「商品預定利率」= guaranteed_rate**（在輸入頁 R29 / 一般版 R6 c29）
- **不要混淆！** v4 在 WM1/WI1 抽錯（把 R6 c29 的 0.01 當 declared_rate 是 bug）

---

# 第四部分：常見錯誤對照表 + 速查

## 速查 — 你該停下來等使用者確認的時機

| 步驟 | 停下確認什麼 |
|---|---|
| Step 0 結束 | 類型判斷、保經/直營版、還本/stepped/養老標記、layout 選擇 |
| Step 0.5 結束（若有） | RV 表手算邏輯對不對、#VALUE! 重建邏輯 |
| Step 1 結束 | base 參數、cum_prem 來源、guaranteed_rate 來源、unit_萬元 |
| Step 2 結束 | 逐年表欄位對應、還本/養老 schema 擴充 |
| Step 4 ❌ 出現 | 不要交付，回頭修哪一步 |
| Step 5 完成 | 交付 + PRODUCTS + manifest + 待校對清單 |
| 偵測到同商品多 plan_code | 規則 H：先停下問人 |
| 🆕 偵測到躉繳 demo | 提醒使用者商品可能支援多年期 |

批次模式（Step B0）只在 5 種異常觸發點停下，其餘自動跑。

## 常見錯誤對照表

| 症狀 | 原因 | 對應規則 |
|---|---|---|
| STEP3 比較表商品名跟公司 chip 重複 | product_name 沒去前綴 | 規則 A |
| STEP1 篩選按「美元分紅」找不到該分紅商品 | type 寫成「美元利率變動型」 | 規則 B |
| 使用者預算 4000 USD 算出 5000 USD 保費 | min_sa 用了 50000 預設 | 規則 C |
| STEP3 分紅商品「中分紅率」欄顯示「分紅型」 | PRODUCTS 沒寫 mid_dividend_rate | 規則 D |
| Manifest 載入失敗 / 重複 plan_code | key 命名衝突 | 規則 E |
| 全形 vs 半形括號不一致 | 三處括號正規化 | 規則 F |
| 用上輪輸出當基準 | 跨輪部署狀況 | 規則 G |
| STEP1 看到兩個一模一樣商品 | 多通路 plan_code 沒問人 | 規則 H |
| 商品載入 404 | manifest entry 缺 period 或 path | 規則 I |
| 多幣別誤判 | 商品名 vs Excel 標記不一致 | 規則 J |
| 增額型/衰減型 cv_total 中後期下降被誤殺 | 沒標 sa_growth_curve / sa_decay | 規則 K |
| 多版本檔覆蓋 | 沒用 _v5 _v6 後綴 | 規則 L |
| stepped 商品反推保額用 Y1 db | 沒寫規則 M 提醒 | 規則 M |
| 還本 cv_total 後期下降被當錯誤 | 沒寫規則 N | 規則 N |
| 躉繳商品總繳算錯 | 沒寫規則 O | 規則 O |
| 月繳商品 base_premium 顯示成期繳值 | 沒換算年化 | 規則 P |
| 🆕 躉繳 demo 被使用者誤以為純躉繳商品 | 沒標 is_lump_sum_demo + extraction_note | 規則 Q-ext |
| 🆕 養老型末筆滿期金被前端視為 0 | 沒抽 maturity_benefit | 規則 R |
| Step 4 第 6 項 fail（stepped Y1 db ≠ sa） | 套錯規則 | Step 4 第 6 項 |
| Step 4 第 5 項 fail（還本 cv 後期下降） | 套錯規則 | Step 4 第 5 項 |
| Step 4 第 3 項 fail（躉繳 Y2 應停沒過） | 沒分流 p=1 | Step 4 第 3 項 |
| Step 4 第 9 項 fail（discount 差 4-22 元）| 容差太嚴 | Step 4 第 9 項 |
| 自洽性通過但 db 全是 0 | 列印頁 db 欄位偏移 | Step 2 動態偵測 |
| 還本 schedule 末筆 surv_cum=0 | 條件用 surv_year > 0 而非 surv_cum > 0 | Step 2 還本 schema |
| 簡易版抽到後段資料覆蓋前段 | 還本商品兩個區塊 | Step 2 區塊偵測 |
| MLXT/XN 抽 cv_total 全 0 | 簡易版 R7 col 9 標題判斷錯 | Step 2 還本 3 模板 |
| 凱基「明細版-試算頁」抽到 2 倍筆數 | 同 sheet 多區塊沒過濾 | Step 2 多情境表頭過濾 |
| schedule 順序錯亂 | 沒排序 | Step 2 強制排序 |
| 友邦 #VALUE! 抽到 0 / None | 沒走 Step 0.5 重算 | Step 0.5 |
| 凱基月繳商品 base_premium 差 6 倍 | 抽到「首期月繳」非「首年實繳」 | Step 1.2 月繳/季繳規則 |
| 加密檔讀不到 | 沒解密 | Step F0.3 |
| .xls 檔 openpyxl 讀不到 | 沒轉 .xlsx | Step F0.2 |
| 🆕 遠雄 base_sa 不對（顯示 75 元） | 沒做萬元單位偵測 | Step 1.6 |
| 🆕 遠雄 declared_rate 抽錯（抽到 0.01） | 把「商品預定利率」當 declared | Step 1.8 / 鐵律 17 |
| 🆕 遠雄選錯 sheet 抽 schedule 短 | 沒按 layout 偵測選 sheet | Step 2.4 |
| 🆕 遠雄 base_premium 偏高（35084 vs 主約 ~30K）| 預計實繳含附約 | Step 1.2 優先序 |
| 🆕 遠雄 養老 schedule 卡 9 筆 | 沒處理 cv_basic=0 滿期金那筆 | Step 2.12 |

---

# 第五部分：已知限制 / 永久跳過

碰到以下情況，回報「**不支援，建議另開對話用專用流程處理**」並暫停：

1. Sheet 名包含「RV 表」/「保險費率表」/「附表」/「每千元基數」 → RV 表型
2. 檔名含「br 公版」+ 商品名含「分紅」 → 新光保經分紅，需 taishin_v1
3. 檔名含「投資型」/「投資型保險專案建議書」 → 投資型，**永久跳過**
4. 商品名含「年金保險」 → 年金型，需 kgi_annuity_v1
5. 商品名含「樂退」/「分期定額給付」 → 樂退年金，建議跳過
6. 基準頁找不到「保險年齡」「保額」「保費」其中任一 → Excel 結構特殊
7. 逐年表筆數 < 30 且非養老型/高齡投保 → 可能不是完整商品試算
8. cv_basic 跟 cv_total 差距異常（cv_total > cv_basic 的 5 倍以上）→ 結構誤判
9. 🆕 公式 #VALUE! 涵蓋 50% 以上欄位且 LibreOffice 重算無效 → 結構壞檔

---

# 附錄

## 附錄 A：友邦 RV 表結構速查

- FACTOR/PREM schema 變化
- FT/FV/FI/FJ 內部 plan_cd 編碼規則
- USD 用每千美元、TWD 用每萬元

## 附錄 B：凱基商品清單

- 6UBS 基業長鴻、5UEK 5UEC 5UEJ 5UE9 系列
- 養老型 schedule 補強（期滿那年 cv_total 用滿期金取代 0）
- 純預定利率終身壽 schema（cv_basic = cv_total，沒有 declared_rate）

## 附錄 C：保誠商品清單

- ARLPLU30/57/64：layout A vs B 兩種結構
- ACLPEN26 / ACLPEU25 / ACLPEN27：身故倍率 6.8x/12.6x/20.4x（合法商品設計）
- 第六輪：60% 檔案是檔名錯誤（複製檔案沒改名）

## 附錄 D：新光商品清單

- 直營版 vs 保經公版兩種結構
- 還本商品 3 模板（MLXT/XN vs ZM/FLW）
- cum_prem 動態 col 20 vs col 35 對照表

## 附錄 E：富邦商品清單

- 階梯保額型 sa_ramp_up：FBM 順順美利
- 增額型 sa_growth_curve：FBP 美好利
- 衰減型 sa_decay：FAZ 美利大心、FBO 美利大運
- 退休型 income_phase_start：PALA_B_C 活利優退

## 附錄 F：台灣人壽商品清單

- 保利美 USD 利變
- 吉享紅 TWD 分紅還本（prudential_v2）
- 金多利、金得利 增額型

## 附錄 G：全球人壽商品清單

- 月繳商品 base_premium 換算
- stepped 商品 min_guaranteed_db 副欄位

## 🆕 附錄 H：遠雄商品清單（13 檔實戰）

### USD 利變/增額終身壽（3 檔，layout L1，躉繳 demo）
- BO1 美滿美利旺美元利率變動型終身壽險
- BB1 美滿美利讚美元利率變動型增額終身壽險
- BI1 美滿超多旺2美元利率變動型增額終身壽險

### USD 養老（3 檔，layout L2/L3，躉繳 demo，含滿期金）
- BY1 美滿唯固利美元養老保險（10 年期，L2）
- BT1 美滿固特益美元養老保險（7 年期，L3 fallback）
- BQ1 美滿美利固美元養老保險（10 年期，L2）

### TWD 利變/增額終身壽（3 檔，layout L1，躉繳 demo）
- WQ1 美滿雄go利2利率變動型增額終身壽險
- WN1 美滿雄go利利率變動型增額終身壽險
- WR1 美滿雄福利2利率變動型增額終身壽險

### TWD 利變還本（2 檔，layout L1B，多年期，is_endowment）
- WM1 富貴喜多利利率變動型終身還本保險（period=2，base_sa 萬元）
- WI1 富貴喜相逢利率變動型終身還本保險（period=6，base_sa 萬元）

### TWD 利變增額（2 檔，layout L1，多年期，含主+附約）
- WJ1 美滿金永樂利率變動型終身增額壽險（period=20，含 NJD/HZ1/HF1 附約）
- WU1 美滿金享優2利率變動型增額終身壽險（period=6，含 NJD 附約）

### 跳過（4 檔）
- NIX 有利HIGH利率變動型年金保險甲型（年金險）
- NZB 保利High美元利率變動型年金保險甲型（年金險）
- NZA 美元躉繳利率變動型即期年金保險（年金險）
- WU1_XK1_CJ2_Plus（同 WU1，c3 #VALUE! 全爆，主約 sa 太小，建議用 WU1_NJD）

---

## v5.0 改版來源摘要

整合 8 份指令文件 + 220+ 商品實戰：

| 來源版本 | 主要貢獻 |
|---|---|
| 台灣 v2.2 | 批次協議、加密解密、壞檔識別、schedule 強制排序 |
| 富邦 v2.2 | Step P0 大批清單、Step F0 預處理、規則 K 商品設計類型、多幣別處理 |
| 友邦 v2.2 | Step 0.5 RV 表手算、product_id 命名規則、批量處理停-跑-檢策略 |
| 凱基 v2.2 | type 16 種對應、多 sheet 多版本欄位、月繳/季繳處理、養老型 schema |
| 保誠 v3.1 | 檔名 vs 內容驗證、layout A/B 偵測、身故倍率高商品的驗證放寬 |
| 全球 v3.1 | to_num() 工具、動態欄位偵測擴充、min_guaranteed_db 副欄位 |
| 新光 v3.0 | 保經公版/直營版偵測、還本 schema、stepped 標記、躉繳/半年繳處理 |
| **🆕 遠雄 v5.0** | **Layout 4 種偵測法、萬元單位三重保險、躉繳 demo 概念、主+附約處理、declared vs guaranteed 區分、養老型滿期金保留、整列污染重建、base_premium 優先序** |

---

**v5.0 完。**
