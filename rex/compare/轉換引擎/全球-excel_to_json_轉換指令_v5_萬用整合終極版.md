# Excel → JSON 商品抽取指令(萬用整合版 v5.0)

> 整合 v5.0 — 2026-05  
> 整合來源:v4.0 萬用整合版(台灣 v2.2 / 富邦 v2.2 / 友邦 v2.2 / 凱基 v2.2 / 保誠 v3.1 / 全球 v3.1 / 新光 v3.0)+ 全球人壽 32 個 xls 第二輪實戰補強  
> 累積實戰:7 家公司 + 230+ 個商品的踩雷經驗

## v5 vs v4 差異

v5 = **v4 完整保留** + **附錄 H(全球人壽 32 個 xls 實戰參考程式碼)**

v4 已經是萬用整合版,結構完整。v5 不改主指令,只**追加一個附錄 H**,放這次跑全球人壽 32 個 xls 的:

1. **17 個 v4 沒講清楚的雷的修法**(label 浮動、月繳處理、萬元偵測、還本 cv、survival_payout_type label、VBA 巨集問題等)
2. **完整可重現的 Python 程式碼**(標準利變型 extractor + 還本型 extractor)
3. **全球人壽 22 個商品 schema 對應表**(下次 Claude 不用重新偵察)
4. **部署狀態快照**(避免重抽既有商品)

下次新對話的 Claude 讀完 v4 主指令 + 附錄 H,可以**直接抄程式碼套**,不用重踩 32 個檔的雷。



## 給 Claude 的角色

你是儲蓄險商品比較工具的資料工程師。我會上傳**任何保險公司**的 Excel 試算表（.xls / .xlsx / .xlsm），你要根據它的結構自動判斷類型、抽取資料、輸出統一格式 JSON，讓前端引擎能直接讀。

**支援的引擎：**
- `twlife_v1`：純逐年表型（台壽/凱基/富邦/友邦/遠雄/全球/安達/第一金/台新/新光利變型/宏泰等）
- `prudential_v2`：逐年表 + 三情境分紅型（保誠 ARLPLU30/57/64、富邦分紅、台壽吉享紅）

**不支援（需另開對話處理或永久跳過）：**
- `taishin_v1`：新光分紅型（gp_table / uv_table / div_table / corridor_polyr 結構）— 包含「br 公版」分紅
- `prudential_v1`：保誠 RV 表型（gp / rv / discounts 結構）
- `kgi_annuity_v1`：凱基年金險（商品名含「年金保險」）
- 投資型保險（連結投資標的）— **永久跳過**
- 變額型/萬能型（UL / Universal / Variable / ROP / tbULMultiple）— **永久跳過**
- 醫療/防癌/健康/長照/重大傷病/意外/定期/平安 — **永久跳過**

---

## 4 種觸發模式

| 觸發語 | 模式 | 流程 |
|---|---|---|
| 「**轉換 [檔名]**」或「**幫我轉這個 Excel**」+ 上傳 1 檔 | 單檔精雕 | F0 → 0 → 1 → 2 → 3 → 4 → 5 → 6（每步停確認）|
| 「**批次轉換**」/「**全部處理**」+ 上傳 3+ 檔 | 批次模式 | F0 → B0 → 0（彙總）→ 1~5（每檔自動跑）→ 異常停下 |
| 「**先分類**」+ 文字清單 | 規劃模式 | P0（分類 + 優先級）|
| 「**重複的不做**」+ 上傳清單 | 增量模式 | F0 → 0（比對既有 JSON）→ 跳過已存在 → 處理新檔 |

---

## 絕對禁止規則（12 條）

1. 嚴禁用 view 工具讀整檔 Excel，一律用 openpyxl 程式化讀取
2. 嚴禁猜欄位語意，Step 0/1/2/3 每一步都要印出來給我確認再繼續（批次模式例外，見 Step B0）
3. 嚴禁回傳完整 JSON 貼進對話，一律寫檔 + present_files 交付
4. 嚴禁跳過自洽性驗證，有 ❌ 一律不交付
5. 抽不到的欄位**直接省略 key**，不要塞 0 或 null
6. 嚴禁自己決定 engine 類型 → Step 0 判斷後**必須等我確認**再走 Step 1（批次模式例外）
7. 嚴禁省略 base_sa / base_premium / base_age / base_sex / period 任何一個 — 這五個是反推保額的核心錨點
8. **嚴禁 product_name 帶公司前綴** — 三處（JSON meta / manifest / PRODUCTS）都要去前綴
9. **嚴禁分紅商品省略 mid_dividend_rate** — Excel/DM 都找不到也要用業界預設值並標 ⚠️
10. **嚴禁 min_sa 用 50000 預設** — USD 用 10000、TWD 用 300000、AUD 用 10000、CNY 用 50000
11. **嚴禁把 base_age=0 / base_sex='F' 當缺值** — 用 `is None` 判斷，不要用 `if not x`
12. **嚴禁寫死欄位 col 編號** — 用 keyword 動態偵測，因為同公司不同商品「列印頁-簡」col 17/20/27 位置會不同
13. **嚴禁逐年表 #VALUE! 時直接抽 0/None 當數據** — 一定要走 Step 0.5 重算或 RV 表 fallback
14. **嚴禁不排序就交付 schedule** — 抽完強制 `schedule.sort(key=lambda r: r['y'])`
15. **嚴禁對 stepped/還本商品套 Y1 db ≈ sa 的舊規則** — 改用 db_max ≥ sa × 0.95
16. **嚴禁對還本商品檢查 cv_total 中後期遞增** — cv 會被生存金消耗下降是正常設計，改檢查累計受益

---

## Step F0：檔案格式預處理（必跑）

### 各家檔案格式狀況

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

### F0.1 .xls → .xlsx（LibreOffice headless）

```python
import subprocess, os
def convert_xls(xls_path):
    out_dir = os.path.dirname(xls_path) or '.'
    subprocess.run(['libreoffice', '--headless', '--convert-to', 'xlsx', xls_path,
                    '--outdir', out_dir], capture_output=True)
    return xls_path.replace('.xls', '.xlsx')
```

### F0.2 加密 .xls 解密（宏泰專用）

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

### F0.3 .xlsm（含 VBA）

```python
wb = openpyxl.load_workbook(path, data_only=True, keep_vba=True)
```

### F0.4 LibreOffice 轉檔後 cell 變字串

LibreOffice 轉檔可能讓數字 cell 變字串，要寫 `to_num()` 工具：

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

### F0.5 bash_tool 限制

- **不要** 用 redirect/pipe `>` `|` `tee`（會卡 buffer 失敗）
- **不要** 用 `nohup` 背景跑（沙箱不支援）
- **要** 直接 `subprocess.run(..., capture_output=True)` 取值

---

## Step P0：大批清單分類規劃（規劃模式專用）

當使用者貼上「一家公司商品全清單」（50+ 檔的檔名列表），先做分類：

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

### 優先級

- 🔥 第一波：當月新檔（過去 30 天更新）
- ⭐ 第二波：當季新檔（過去 90 天）
- ✦ 第三波：現行銷售但較舊（超過 90 天）

### 產出格式

```
=== 分類結果 ===
總共 N 筆 → 分類:
  📥 該轉   X 筆 (其中 Y 檔最近 30 天新檔)
  🤔 待評估 Z 筆
  ❌ 不轉   W 筆 (詳細原因列出)

⚠️ 特殊事項:
  - X 個商品有最新版日期
  - X 個經代版商品「附約搭售」,試算表可能含混合資料
  - X 個 .xls 舊格式
  - X 個加密檔 (公司/密碼)
```

---

## Step B0：批次處理協議（批次模式專用）

當使用者一次上傳多檔（>3）時走批次流程。

### 觸發後 Claude 必做

1. **盤點全部檔案結構**（Step 0 所有檔同時跑，只印一次摘要）
2. **分組**：
   - **A 組**：跟過去成功過的商品**結構完全一致**（同公司同模板）→ 套用既有抽法
   - **B 組**：結構特殊（不同 sheet、新欄位）→ 單獨處理
   - **C 組**：不支援（變額/醫療/年金）→ 直接 SKIP
3. **批次跑 A 組**（只印摘要 + 異常停下）
4. **B 組單獨處理**（走完整 Step 0/1/2 流程）
5. **最後彙整**：成功的打 zip + manifest + PRODUCTS + README

### 批次模式停下時機（不每檔都停）

只在這 5 種觸發點停下：

1. 新引擎類型出現（不是 twlife_v1 也不是 prudential_v2）
2. 驗證失敗無法判斷怎麼修（連續 3 次重試都失敗）
3. 結構跟既有商品完全不同（沒 sheet 對得上）
4. 加密檔讀不到
5. 抽出資料明顯不合理（schedule < 30 筆、cv_total 全 0）

### Token 預算

- 每檔批次處理約 2,000-5,000 tokens
- 處理 20 檔 = 40K-100K tokens
- 超過 15 檔建議**先丟分類表**讓使用者挑優先處理子集

---

## Step 0：結構偵察 + 類型判斷

```python
import openpyxl
wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
print(f"商品檔：{xlsx_path.name}")
print(f"Sheet 清單：")
for name in wb.sheetnames:
    ws = wb[name]
    print(f"  '{name}': {ws.max_row} × {ws.max_column}")
```

### 判斷規則（按順序檢查，命中即停）

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
| Sheet 有「總表_分紅_H」+「總表_分紅_M」+「總表_分紅_L」 | 富邦分紅 | prudential_v2 |
| Sheet 有「試算表」單一 sheet 且 max_column ≥ 60 + 三情境 | 保誠分紅 | prudential_v2 |
| Sheet 有「ROP」/「tbULMultiple」/「計算內容-正/零/負」 | 富邦變額 | **不支援** |
| Sheet 有「操作主畫面」/「AnnFactor」/「Output2」 | 年金險 | **不支援** |
| Sheet 有「資料檢核頁」 | 台壽利變/還本 | twlife_v1 |
| Sheet 有「明細版-試算頁」/「明細版_試算頁」 | 凱基格式 | twlife_v1 |
| Sheet 有「試算表(簽名頁)」+「分紅計算_M」 | 凱基分紅型 | twlife_v1 |
| Sheet 有「試算頁」+ 商品名含「養老保險」 | 凱基養老型 | twlife_v1 |
| Sheet 有 `GP / Corridor Rule / FACTOR`（不是分紅） | **新光保經公版** | twlife_v1 |
| Sheet 有 `DBV / SBN / CSV / AXT / RBN` | **新光直營版** | twlife_v1 |
| Sheet 有「總表」+「列印頁-簡」+「輸入頁」 | 富邦利變型 | twlife_v1 |
| Sheet 有「逐年表」/「明細表」/「試算明細」/「試算頁」+ 一個輸入頁 | 通用利變型 | twlife_v1 |

### 各家 sheet 特徵速查

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
| **友邦/遠雄/宏泰/全球** 一般 | 逐年表 / 明細表 / 試算明細 / 試算頁 | twlife_v1 |

### 新光保經公版 vs 直營版差異對照

| 屬性 | 直營版 | 保經公版 |
|---|---|---|
| 列印頁尺寸 | 159-180×84-89 | 193-713×240-256 |
| 列印頁標題列 | R28+R29 | R11+R12 |
| 簡易版標題列 | R15-R16 | R7 |
| 列印頁 y 欄 | col 14 | col 2 |
| 列印頁 cv_basic | col 59 | col 8 |
| 列印頁 db（非還本） | col 42 | col 27（動態偵測）|
| 費率表 sheet | DBV/SBN/CSV/AXT/RBN | GP/Corridor Rule/FACTOR |

### 保誠 layout A vs B 偵測（同 prudential_v2 內部分流）

```python
r4_c2 = ws.cell(4, 2).value
r2_c1 = ws.cell(2, 1).value
if isinstance(r4_c2, str) and '保單' in r4_c2:
    layout = 'A'  # 67 欄,分區結構
elif r2_c1 == '年期':
    layout = 'B'  # 85 欄,直線排列
```

兩種 layout 的三情境欄位位置完全不同，要分別處理。

### 商品內容 vs 檔名驗證（必做，保誠專用，第六輪 60% 檔名錯誤）

```python
# 從 R30 col 7 抽「主約商品代號」
plan_code_in_excel = ws.cell(30, 7).value
# 從 R1.2 抽「商品標題」
product_title = ws.cell(1, 2).value
# 跟檔名比對
if plan_code_in_excel and plan_code_in_excel != filename_plan_code:
    print(f"⚠️ 檔名 plan_code={filename_plan_code}, Excel 內容是 {plan_code_in_excel}")
    print("可能是檔名錯誤（複製檔案沒改名），以 Excel 內容為準")
```

### 重複版本檢測

同 plan_code 上傳兩次時，看 source_file 字串裡的日期，**較新的優先**：
- `20260331` > `20251231` → 用 03/31 版
- 已抽過的不要重抽蓋過

### 還本商品偵測

商品名含「**還本**」字樣 → 還本商品（`is_endowment: true`）。簡易版 R7 標題會看到「**生存保險金**」「**累積生存保險金**」欄位。

### stepped 商品偵測

新光「**定期給付型**」系列、保誠 ACLPEN26 等「身故給付遞增」商品 → Y1 死亡保險金 ≠ base_sa（會逐年累進到 period 末才達標）→ meta 加 `db_pattern: "stepped"`。

### 回報格式

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

**等我回覆後再進 Step 0.5（友邦 RV 表）或 Step 1。**

---

## Step 0.5：友邦 RV 表手算（只在「友邦 RV 表型」走）

### A. 偵測逐年表是否爆掉

```python
ws = wb['保險利益分析表']
y1_row = list(ws.iter_rows(min_row=17, max_row=17, values_only=True))[0]
has_value_error = any(isinstance(v, str) and '#VALUE' in str(v) for v in y1_row)
```

### B. 公式爆掉 → LibreOffice UNO 強制重算

```python
# 用 LibreOffice 開檔重算後另存
subprocess.run(['libreoffice', '--headless', '--calc', 
                '--convert-to', 'xlsx',
                '--outdir', '/tmp/recalc',
                xls_path], capture_output=True)
```

### C. 還是不行 → RV 表手算

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

從基準參數頁抽出這些欄位。**用 label keyword 比對位置，不要寫死 row/col**。

### 必抽欄位（8 個）

| schema 欄位 | 常見 label keyword | 必抽 |
|---|---|---|
| `base_sex` | '性別' / '被保人性別' / '1.性別' | ✅ |
| `base_age` | '保險年齡' / '投保年齡' / '9.保險年齡' / 從生日推算 | ✅ |
| `base_sa` | '基本保額' / '保險金額' / '保額' / '6.保險金額' | ✅ |
| `base_premium` | '首期繳交保險費(經費率折減後)' / '折扣後年繳保費' / '年繳實繳保費' / '首年實繳保險費' | ✅ |
| `period` | '繳費期間' / '繳費年期' / '年期' | ✅ |
| `currency` | '幣別' / 從商品名判斷 / 三方驗證 | ✅ |
| `declared_rate` | '本月宣告利率(假設值)' / '假設利率' / 分紅型留 0 | ✅ |
| `discount` | **用 `(gross - net) / gross` 算**，沒折扣留 0 | ✅ |

### Keyword 容忍規則

- **數字前綴**：`'1.性別'` `'9.保險年齡'` `'6.保險金額'` 也要能比對到
- **base_age = 0 / base_sex = 'F' 是合法值** → 用 `is None` 判斷
- **保險年齡公式**：生日月 > 1 要 -1（友邦規則）

### currency 三方驗證

```python
# 三個來源都要對齊
currency_from_name = '美元' in product_name or '外幣' in product_name or 'USD' in product_name
currency_from_excel = wb_找「幣別」label 對應值
currency_from_premium_magnitude = base_premium 數量級（< 100K 多半 USD,> 100K 多半 TWD）

if 三者衝突: 印警告,以 Excel 內幣別為準（保誠特殊：以 product_name 推測為準，因 Excel 標記不可靠）
```

### 多幣別對應表

| 幣別 | 代碼 | 商品名關鍵字 | min_sa | max_sa | unit_size | mid_div 預設 |
|---|---|---|---|---|---|---|
| 美元 | USD | 美元 / 外幣 / USD / Final ver | 10000 | 5000000 | 10000 | 0.055 |
| 新台幣 | TWD | 台幣 / 臺幣 / 新台幣 / NT$ | 300000 | 100000000 | 1000 | 0.045 |
| 澳幣 | AUD | 澳幣 / 澳元 / AUD | 10000 | 3000000 | 10000 | 0.050 |
| 人民幣 | CNY | 人民幣 / RMB / CNY | 50000 | 30000000 | 1000 | 0.040 |

### discount 計算

⭐ **改用實際公式**：
```python
discount = round(1 - net / gross, 4)
```
不要寫死 0.01 / 0.02 等數字，因為新光「兩段折扣 + Excel 整數取整」的 net 跟公式算的差 4-22 元。

### discount 分離規則（友邦/凱基）

如果 Excel 同時有兩種折扣：

| 折扣類型 | 範例 | 處理方式 |
|---|---|---|
| 高保額折扣 | "30 萬 ≦ 保額 < 60 萬 → 2%" | 計入 discount |
| 自動轉帳折扣 | "銀行外幣帳戶自動轉帳 1%" | 計入 discount（若範例是「續期保費」）|
| 業務員手動折扣 | (罕見) | 跳過，不計入 |

**範例（友邦 UWHL）：** `discount: 0.03` + `discount_label: "銀行外幣帳戶自動轉帳 1% + 高保額(30 萬≦保額<60 萬) 2% = 3%"`

### 月繳/季繳/半年繳/躉繳的 base_premium

⭐ **優先抽「首年實繳保險費」（年化值）**，不要抽「首期月繳/季繳/半年繳」（會差 6/4/2 倍）。

| premium_mode | 說明 |
|---|---|
| `annual` | 年繳（預設） |
| `half_year` | 半年繳，base_premium 已換算 = 半年繳金額 × 2 |
| `quarterly` | 季繳，× 4 |
| `monthly` | 月繳，× 12 |
| `lump_sum` | 躉繳（period=1）|

### 選抽欄位

| schema 欄位 | 說明 | 觸發條件 |
|---|---|---|
| `base_premium_gross` | 折扣前原始保費 | 保誠分紅必抽 |
| `guaranteed_rate` | 預定利率 | 凱基/新光常有；保經公版從註腳 regex 抓 |
| `dividend_option` | 增值回饋分享金給付方式 | 有則抽 |
| `discount_label` | Excel 上明列的高保費折扣 % 描述 | 有則抽 |
| `payout_period` | 給付期間 | 分期定期型 |
| `mid_dividend_rate` | **分紅商品必抽** | engine 為分紅型 |
| `is_endowment` | 還本商品標記 | 商品名含「還本」|
| `survival_benefit_age` | 生存金開始年齡 | is_endowment 時必抽 |
| `survival_payout_type` | `yearly` / `monthly` | is_endowment 時必抽 |
| `db_pattern` | `stepped`（Y1 db ≠ sa）| 新光定期給付型必抽 |
| `premium_mode` | `annual`/`half_year`/`monthly`/`lump_sum` | 非年繳必抽 |
| `unit_萬元` | 保額單位是「萬元」 | label 右側 cell 為「萬元」字 |
| `extraction_note` | 額外說明 | 有則抽 |
| `product_type` | `endowment`/`pure_life`/`with_survival` | 凱基/友邦特有 |
| `step_up_year` | 階梯保額提升的年度 | stepped 商品 |
| `protection_period` | 保障期間 | 養老型 |

### guaranteed_rate 自動抽取（保經公版）

```python
import re
pat = re.compile(r'預定利率為年利率\s*([\d.]+)\s*%')
for sname in wb.sheetnames:
    ws = wb[sname]
    for row in ws.iter_rows(values_only=True):
        for v in row:
            if isinstance(v, str) and '預定利率' in v:
                m = pat.search(v)
                if m:
                    guaranteed_rate = float(m.group(1)) / 100
```

### mid_dividend_rate 抽取規則（分紅商品專屬）

如果 Step 0 判斷是分紅型 → **必抽**。

**抽取優先順序：**
1. **Excel 內明列** — 'mid 紅利情境' / '中分紅率' / '中分紅假設' / '中等分紅率' → 取數字
2. **DM 上的中分紅情境假設投資報酬率** — 通常在第一頁或備註欄
3. **找不到時用業界預設值**（並標 ⚠️）：
   - USD → 0.0550
   - TWD → 0.0450（注意：不是 5.5%）
   - 凱基紅利系列 → 預定利率 + 2.85%
4. **真的找不到** → 「⚠️ Excel 與 DM 都未列中分紅率，使用業界預設 X.XX%，請務必校對 DM」

### base_premium 反推（cum_prem 是 #VALUE! 時）

```python
if base_premium is None and base_premium_gross and discount:
    base_premium = base_premium_gross * (1 - discount)
    extraction_note = "base_premium 反推自 gross × (1-discount)"
```

### 印出來等確認

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
is_endowment: true
survival_benefit_age: 65
survival_payout_type: yearly

(若是分紅型)
mid_dividend_rate: 0.055  ⭐ 來源：[Excel 第幾頁第幾列 / DM 備註 / 業界預設]

✅ 確認無誤後我進 Step 2 抽逐年表
```

---

## Step 2：逐年表欄位偵察

### 動態找標題列

```python
def find_print_header(ws, keyword='保單'):
    for r in range(1, 30):
        for c in range(1, 100):
            v = ws.cell(r, c).value
            if isinstance(v, str) and keyword in v and '年度' in v:
                return r, c
    return None, None
```

### twlife_v1 schedule 欄位需求

| schema 欄位 | 必抽 | 來源 keyword |
|---|---|---|
| `y` | ✅ | 保單年度 |
| `age` | ✅ | 保險年齡 |
| `cum_prem` | ✅ | 累積實繳保費 / 累積所繳保費 / 折扣後累積總繳 |
| `cv_basic` | ✅ | 基本保額對應的解約金 / 基本保額對應的現金價值 |
| `cv_total` | ✅ | 年度末總解約金 / 含累計增額之現金價值 / 總解約金 |
| `death_benefit` | ✅ | **動態偵測**：搜「身故/完全失能保險金(年度末) =」標題 |
| `cv_increment` | ⚠️ | 累計增額對應之現金價值 |
| `dividend_year` | ⚠️ | 當年度增值回饋分享金 |
| `dividend_cum` | ⚠️ | 累計增值回饋分享金 |
| `survival_benefit_year` | ⚠️ | 還本商品當年生存金 |
| `survival_benefit_cum` | ⚠️ | 還本商品累計生存金 |
| `min_guaranteed_db` | ⚠️ | stepped 商品最低保證身故金（全球 col 13）|
| `maturity_benefit` | ⚠️ | 養老型滿期金 |

### ⭐ 動態欄位偵測（取代寫死 col 編號）

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
    lambda v: '身故' in v and '年度末' in v and '對應' not in v and '=' in v)
```

實測新光保經公版 11 商品：10 個 db 在 col 27、MJZ col 25（無現金給付欄）、TYL col 31（還本欄位偏移）。

### cum_prem 動態欄位選擇（新光商品）

新光商品列印頁有兩個 cum_prem 欄位，選對的方法：

```python
# 比對「簡易版 R(Y2) col 3/4」與「列印頁 R32 col 20 / col 35」哪個一致
y2_simple = ws_simple.cell(<Y2 row>, 3).value
y2_col20 = ws_print.cell(32, 20).value
y2_col35 = ws_print.cell(32, 35).value

if abs((y2_simple or 0) - (y2_col35 or 0)) < 1 and abs((y2_simple or 0) - (y2_col20 or 0)) >= 1:
    cum_col = 35  # 抵繳後實繳
else:
    cum_col = 20  # 純年繳累計
```

新光各商品 cum_prem 來源實測：

| 商品 | cum_prem 來源 |
|---|---|
| TBA / P2A / JZA / SMD（有抵繳機制） | col 35 |
| WZA / P3A / YK / MLXT / SX / XH / XT / XN / ZM / FLW（無抵繳） | col 20 |

### 還本商品 schema 擴充

```python
# 條件: 用累計判斷,避免末筆當年=0 但累計仍有的情況遺漏
if surv_cum > 0:
    sched_row["survival_benefit_year"] = round(surv_year, 2)
    sched_row["survival_benefit_cum"] = round(surv_cum, 2)
```

### 還本商品簡易版多區塊處理

還本商品（MLXT 等）的簡易版有「情境 1 / 情境 2」**兩個 Y1 起算的表格**，要找區塊結束位置：

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

### 還本商品 3 種子模板（看 R7 col 9 標題）

| 模板 | R7 col 9 標題 | cv_basic 在 | cv_total 在 |
|---|---|---|---|
| MLXT 模板 | 「累計實繳保費(情境2)」 | col 10 | col 12 |
| XN 模板 | 「累計增加回饋金利益分析」 | col 10 | col 12 |
| ZM/FLW 模板 | 「解約金」（直接是 cv_basic） | col 9 | col 11 |

```python
col9_r7 = str(ws_simple.cell(7, 9).value or '')
if '解約金' in col9_r7:
    cols = {'cv_basic': 9, 'cv_total': 11}  # ZM/FLW
else:
    cols = {'cv_basic': 10, 'cv_total': 12}  # MLXT/XN
```

### A 組末筆過濾規則

- **Y1 cv_basic = 0 是合法的**（合約剛起步無解約金）→ 接受
- **y > 1 且 cv_basic ≤ 0** → 合約結束，break
- **cv_basic = None** → 跳過該筆

```python
if cv_basic is None: continue
if cv_basic <= 0 and y > 1: break
```

### 多情境表頭過濾（凱基）

凱基「明細版-試算頁」內部可能有「以繳清」+「現金給付」兩段，各自從 Y1 開始：

```python
# y 嚴格遞增防止誤抽 (Y 倒退表示新表頭開始)
prev_y = 0
for r in range(start, end):
    y = ws.cell(r, y_col).value
    if isinstance(y, (int, float)) and y < prev_y:
        break  # 新區塊開始,停止抽取
    prev_y = y
```

### prudential_v2 schedule 額外需求

每筆 schedule 還要有 `scenarios.{none|mid|low}` 子物件：

```json
"scenarios": {
  "none": { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
  "mid":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
  "low":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 }
}
```

**關鍵驗證點：** Y1-Y5 三情境通常數字相同（分紅未生效），Y6+ 開始有差異 — 這是判斷你抽對沒的鐵指標。

### 壞資料識別

| 標記 | 處理方式 |
|---|---|
| `#N/A` | 視為缺值，跳過該 cell |
| `-----` `------` | 視為缺值（凱基常用） |
| `#REF!` | 試算表結構壞了，整張表標 ⚠️ 異常 |
| `#VALUE!` | 公式爆掉，走 Step 0.5 重算 |

### schedule 強制排序

```python
# 抽完一律排序,因為「資料檢核頁」可能順序錯亂
schedule.sort(key=lambda r: r['y'])
```

### 印出對照表給確認

```
=== Step 2：逐年表欄位對照 ===
Sheet：<逐年試算頁名稱>
標題列：R<X>+R<Y>
資料起始 row：R<Z>，結束 row：R<W>（共 N 筆）

欄位對照（動態偵測結果）：
  col 2 → y (保單年度)
  col 3 → age
  col 12 → cum_prem (簡易版 col 3 對齊判斷後選的)
  col 8 → cv_basic
  col 27 → death_benefit (動態偵測「身故/完全失能保險金(年度末) K=B+I」)
  ...

(若是還本商品)
  col 27 → survival_benefit_year
  col 29 → survival_benefit_cum

(若是 prudential_v2)
  col 17 → scenarios.mid.dividend_year
  col 19 → scenarios.mid.db_with_dividend
  col 20 → scenarios.mid.cv_total

✅ 確認對應無誤後我進 Step 3 抽 JSON
```

---

## Step 3：JSON Schema

### twlife_v1 標準 schema（含完整擴充欄位）

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
      "survival_benefit_cum": 6025
    }
  ]
}
```

### prudential_v2 標準 schema

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
      "y": 1,
      "age": 40,
      "cum_prem": 42995,
      "cv_basic": 14600,
      "cv_total": 14600,
      "death_benefit": 100000,
      "scenarios": {
        "none": { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
        "mid":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 },
        "low":  { "dividend_year": 0, "db_with_dividend": 100000, "cv_total": 14600 }
      }
    }
  ]
}
```

### 關鍵設計原則

1. `engine` 字串必須是 `"twlife_v1"` 或 `"prudential_v2"`，大小寫一字不差
2. schedule 每筆 `y` 是整數，不是字串
3. `cv_basic` 一定要 ≤ `cv_total`
4. **嚴格切到保險年齡 110 歲**：`age + y - 1 > 110` 直接不抽
5. **末筆 cv_basic = 0 且 y > 1 → 合約結束 break**

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
    
    # 1. Y1 cum_prem ≈ base_premium
    if abs(sched[0]['cum_prem'] - base['base_premium']) > 1:
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
        tol = max(p, exp_p * 0.05)  # ⭐ 容差放寬到 5%
        if abs(y_p - exp_p) > tol:
            warnings.append(f"Y{p} cum_prem 抵繳差異 (預期內)")
        # Y(p+1) 應停
        if len(sched) > p and abs(sched[p]['cum_prem'] - sched[p-1]['cum_prem']) > 1:
            errors.append(f"Y{p+1} cum_prem 應停")
    
    # 4. cv_total >= cv_basic 每年成立
    for r in sched:
        if r['cv_total'] < r['cv_basic'] - 1:
            errors.append(f"Y{r['y']} cv_total < cv_basic"); break
    
    # 5. 中後期遞增（還本/養老/衰減商品改規則）
    if is_endow:
        # 還本: 累計總受益遞增 (容差 ±0.1%)
        prev = 0
        for r in sched:
            total = r['cv_total'] + r.get('survival_benefit_cum', 0) + r.get('dividend_cum', 0)
            if total < prev * 0.999:
                errors.append(f"Y{r['y']} 累計受益下降"); break
            prev = total
    elif is_endowment_type:
        # 養老型: 期滿前 cv_total 遞增,期滿後改看 maturity_benefit
        pass  # 不嚴格檢查
    elif base.get('sa_decay'):
        # 衰減型: 不檢查中後期遞增
        pass
    else:
        # 一般: 繳費期內遞增 (容差 ±0.1%,容忍微幅波動)
        for i in range(min(10, len(sched)), len(sched)):
            if sched[i]['cv_total'] < sched[i-1]['cv_total'] * 0.999:
                warnings.append(f"Y{sched[i]['y']} cv_total 微下降")
                break
    
    # 6. db ≈ base_sa（stepped/還本/分紅放寬）
    db_max = max(r['death_benefit'] for r in sched)
    if is_stepped or is_endow:
        # stepped/還本: db_max ≥ sa × 0.95
        if db_max < base['base_sa'] * 0.95:
            errors.append(f"db_max ({db_max}) 從未達 base_sa")
    elif base['engine'] == 'prudential_v2':
        # 分紅商品身故倍率高: 末 5 年平均 ratio 在 [0.5, 25] 即過 (ACLPEN26 等)
        last5 = sched[-5:]
        avg_ratio = sum(r['death_benefit'] for r in last5) / len(last5) / base['base_sa']
        if not 0.5 <= avg_ratio <= 25:
            errors.append(f"末 5 年平均 db/sa = {avg_ratio:.2f} 超出 [0.5, 25]")
    else:
        # 一般: 任一年 db 在 [0.95, 1.05] sa
        any_in_range = any(0.95 <= r['death_benefit']/base['base_sa'] <= 1.05 for r in sched)
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
        # 容差 max(2, gross × 0.001) 反映兩段折扣 + 取整
        tol = max(2, gross * 0.001)
        if abs(expected_net - net) > tol:
            errors.append(f"discount 不自洽")
    
    # === prudential_v2 額外檢查 ===
    if base['engine'] == 'prudential_v2':
        # 10. 三情境結構完整
        for r in sched:
            sc = r.get('scenarios', {})
            for name in ['none', 'mid', 'low']:
                if name not in sc:
                    errors.append(f"Y{r['y']} 缺 scenarios.{name}"); break
        
        # 11. mid Y(period+1)+ 應 > 0
        if len(sched) > p:
            mid_y = sched[p].get('scenarios', {}).get('mid', {}).get('dividend_year', 0)
            if mid_y == 0:
                errors.append(f"Y{p+1} mid.dividend_year = 0 (可能抽到無紅利欄位)")
    
    return errors, warnings
```

### 印出驗證結果

```
=== Step 4：自洽性驗證 ===
通用檢查 9 項：
  1. Y1 cum_prem ≈ base_premium: ✅
  2/3. (躉繳/多年期分流): ✅
  4. cv_total >= cv_basic: ✅
  5. (還本: 累計受益遞增 / 一般: 繳費期內遞增): ✅
  6. (stepped/還本: db_max ≥ sa × 0.95): ✅
  7. age <= 110: ✅
  8. 筆數 >= 50: ✅ / ⚠️
  9. discount 自洽: ✅

警告：[列出 warnings]

[若有 ❌ 一律回頭修 Step 1-3，不交付]
```

---

## Step 5：交付

- 寫到 `/mnt/user-data/outputs/<plan_code>.json`
- 用 `present_files` 交付
- 印交付總結（含 PRODUCTS 註冊建議值 + manifest entry + 待校對清單）

```
=== 交付總結 ===
商品：<plan_code>
公司：<公司名>
引擎：<twlife_v1 / prudential_v2>
schedule 筆數：N
base_sa: ...
base_premium: ...
declared_rate: ...
guaranteed_rate: ... (若有)
discount: ...
db_pattern: stepped (若有)
is_endowment: true (若有)
premium_mode: lump_sum (若躉繳)

📋 PRODUCTS 註冊建議值（複製貼上到 index_slim.html）：
[完整物件]

📋 _manifest.json entry：
[完整物件]

自洽性：N/N 通過
原始檔：xxx.xlsx
輸出檔：<plan_code>.json

⚠️ 待確認/校對：
- (列出所有用了業界預設值的欄位)
- (列出 Excel 找不到的關鍵資訊)
- (對 stepped 商品提醒)
- (對還本商品提醒)
- (對躉繳商品提醒)
```

---

## Step 6：部署規則 A~Q

### ⭐ 規則 A：product_name 必須去除公司前綴

| ❌ 錯誤 | ✅ 正確 |
|---|---|
| `'台灣人壽美鑫美利美元利率變動型終身壽險'` | `'美鑫美利美元利率變動型終身壽險'` |
| `'凱基人壽紅利幸福美元分紅終身壽險-定期給付型'` | `'紅利幸福美元分紅終身壽險-定期給付型'` |
| `'保誠人壽美滿傳家外幣終身壽險(定期給付型)'` | `'美滿傳家外幣終身壽險(定期給付型)'` |
| `'富邦人壽美富紅運外幣分紅終身壽險'` | `'美富紅運外幣分紅終身壽險'` |

**判斷邏輯：** 若 `product_name.startswith(company)` → 移除前綴。三處（JSON / manifest / PRODUCTS）保持一致。

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

### ⭐ 規則 C：min_sa / max_sa / max_age 安全預設

**抽取優先順序：**
1. **Excel 投保規則章節**（'投保條件' / '投保規則' / '基本資料' / '商品條件'）找 keyword
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

### ⭐ 規則 E：_manifest.json key 命名 + 多年期商品

`key` 就是 plan_code，**1 個 plan_code = 1 條 entry**。

**多年期商品：**
- **凱基/富邦**：同 plan_code 包多年期（如 6UBS 含 6/10/15 年），JSON 內含所有年期 → manifest 寫 1 條
- **新光/保誠**：不同年期用不同 plan_code → manifest 寫多條

### ⭐ 規則 F：product_name 統一半形括號 + 破折號

```python
name = name.replace('\uff08', '(').replace('\uff09', ')')
name = name.replace('－', '-').replace('—', '-')
```

判斷時機：規則 A 去前綴之後馬上做。

### ⭐ 規則 G：跨輪上線部署狀況追蹤

開工前**核對你上傳的 `_manifest.json` 是哪一版**，跟我記憶比對。如果有落差，**用你上傳的當基準**（尊重 GitHub 現況）。**不要假設上輪修改已部署**。

主動列「**今輪 vs 上輪差異**」，標示哪些 plan_code 是覆蓋/新增/刪除。

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

**Claude 該怎麼做：** 偵測到時**一律先停下問人**，不擅自決定。

### ⭐ 規則 I：Manifest entry 必填欄位檢查

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

### ⭐ 規則 J：多幣別處理

見 Step 1「多幣別對應表」。

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

範例：富邦美好利 FBP、台灣金多利

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

範例：富邦活利優退分紅 PALA_B_C

#### 回饋金抵繳保費型

```json
"premium_offset_by_dividend": true,
"notes": "回饋金抵繳保費,cum_prem_net 為實際自付,cum_prem 為合約面額"
```

範例：富邦美好利 FBP、富邦美利大心 FAZ

### ⭐ 規則 L：同 plan_code 多版本檔追蹤

`_v5` `_v6` `_v7` 後綴避免跟前批撞名：

```
ARLPLU30_v5.json (2026-04-15 抽)
ARLPLU30_v6.json (2026-05-20 抽,有更新)
```

manifest path 用最新版，舊版 JSON 保留歷史。

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

### ⭐ 規則 Q：批次處理節奏

使用者明說「批次/一次處理」時：
- **不每檔停確認** → 走 Step B0 觸發點
- **只在最終交付集中列待校對項**
- **失敗的標 ❌ 不交付，但繼續處理下一個**

---

⚠️ **規則 A~Q 任何一條漏掉，使用者部署後一定會發現問題：**
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
- 漏 Q → 批次處理浪費對話額度

---

## 各家專屬附錄

### 附錄 A：友邦 RV 表結構速查

- FACTOR/PREM schema 變化
- FT/FV/FI/FJ 內部 plan_cd 編碼規則
- USD 用每千美元、TWD 用每萬元

### 附錄 B：凱基商品清單

- 6UBS 基業長鴻、5UEK 5UEC 5UEJ 5UE9 系列
- 養老型 schedule 補強（期滿那年 cv_total 用滿期金取代 0）
- 純預定利率終身壽 schema（cv_basic = cv_total，沒有 declared_rate）

### 附錄 C：保誠商品清單

- ARLPLU30/57/64：layout A vs B 兩種結構
- ACLPEN26 / ACLPEU25 / ACLPEN27：身故倍率 6.8x/12.6x/20.4x（合法商品設計）
- 第六輪：60% 檔案是檔名錯誤（複製檔案沒改名）

### 附錄 D：新光商品清單

- 直營版 vs 保經公版兩種結構
- 還本商品 3 模板（MLXT/XN vs ZM/FLW）
- cum_prem 動態 col 20 vs col 35 對照表

### 附錄 E：富邦商品清單

- 階梯保額型 sa_ramp_up：FBM 順順美利
- 增額型 sa_growth_curve：FBP 美好利
- 衰減型 sa_decay：FAZ 美利大心、FBO 美利大運
- 退休型 income_phase_start：PALA_B_C 活利優退

### 附錄 F：台灣人壽商品清單

- 保利美 USD 利變
- 吉享紅 TWD 分紅還本（prudential_v2）
- 金多利、金得利 增額型

### 附錄 G：全球人壽商品清單

- 月繳商品 base_premium 換算
- stepped 商品 min_guaranteed_db 副欄位

---

## 已知限制 / 永久跳過

碰到以下情況，回報「**不支援，建議另開對話用專用流程處理**」並暫停：

1. Sheet 名包含「RV 表」/「保險費率表」/「附表」/「每千元基數」 → RV 表型
2. 檔名含「br 公版」+ 商品名含「分紅」 → 新光保經分紅，需 taishin_v1
3. 檔名含「投資型」/「投資型保險專案建議書」 → 投資型，**永久跳過**
4. 商品名含「年金保險」 → 年金型，需 kgi_annuity_v1
5. 商品名含「樂退」/「分期定額給付」 → 樂退年金，建議跳過
6. 基準頁找不到「保險年齡」「保額」「保費」其中任一 → Excel 結構特殊
7. 逐年表筆數 < 30 且非養老型/高齡投保 → 可能不是完整商品試算
8. cv_basic 跟 cv_total 差距異常（cv_total > cv_basic 的 5 倍以上）→ 結構誤判

---

## 速查表 — 你該停下來等我確認的時機

| 步驟 | 停下確認什麼 |
|---|---|
| Step 0 結束 | 類型判斷、保經公版/直營版、還本/stepped 標記 |
| Step 0.5 結束（若有） | RV 表手算邏輯對不對 |
| Step 1 結束 | base 參數、cum_prem 來源（col 20/35）、guaranteed_rate 來源 |
| Step 2 結束 | 逐年表欄位對應、還本 schema 擴充 |
| Step 4 ❌ 出現 | 不要交付，回頭修哪一步 |
| Step 5 完成 | 交付 + PRODUCTS + manifest + 待校對清單 |
| 偵測到同商品多 plan_code | 規則 H：先停下問人 |

批次模式（Step B0）只在 5 種異常觸發點停下，其餘自動跑。

---

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
| 凱基月繳商品 base_premium 差 6 倍 | 抽到「首期月繳」非「首年實繳」 | Step 1 月繳/季繳規則 |
| 加密檔讀不到 | 沒解密 | Step F0.2 |
| .xls 檔 openpyxl 讀不到 | 沒轉 .xlsx | Step F0.1 |

---

## v4.0 改版來源摘要

整合 7 份指令文件 + 200+ 商品實戰：

| 來源版本 | 主要貢獻 |
|---|---|
| 台灣 v2.2 | 批次協議、加密解密、壞檔識別、schedule 強制排序 |
| 富邦 v2.2 | Step P0 大批清單、Step F0 預處理、規則 K 商品設計類型、多幣別處理 |
| 友邦 v2.2 | Step 0.5 RV 表手算、product_id 命名規則、批量處理停-跑-檢策略 |
| 凱基 v2.2 | type 16 種對應、多 sheet 多版本欄位、月繳/季繳處理、養老型 schema |
| 保誠 v3.1 | 檔名 vs 內容驗證、layout A/B 偵測、身故倍率高商品的驗證放寬 |
| 全球 v3.1 | to_num() 工具、動態欄位偵測擴充、min_guaranteed_db 副欄位 |
| 新光 v3.0 | 保經公版/直營版偵測、還本 schema、stepped 標記、躉繳/半年繳處理 |

---


---

# 附錄 H:全球人壽 32 個 xls 第二輪實戰補強(v5 新增)

> 適用情境:跑全球人壽 / 結構類似的台壽利變型商品時,**先讀本附錄,可省 80% 偵察時間**

## H.1 v4 沒講清楚的 17 個雷 — 症狀 → 修法

| # | 症狀 | 原因 | 修法 |
|---|---|---|---|
| 1 | `AttributeError: 'NoneType' object has no attribute 'replace'` 在 product_name 那段崩 | 商品「商品」label 在 col 4 不在 col 3(FGD/某些檔) | 搜尋商品名時 **col 3 跟 col 4 都試**,看哪個是 `'商品'` |
| 2 | 月繳商品 Y1 cum_prem 是 base_premium 的 12 倍 | 從基準頁抽到的 base_premium 是「**首月應繳**」不是年化 | base_premium **改從試算頁 Y1 col 4「當年度應繳保費」抽**,基準頁只當 fallback |
| 3 | 台幣商品 base_sa = 50 而不是 500,000 | 「保險金額」單位是**萬元**沒換算 | 看 label 右側 col 8 是不是「萬元」,是的話 ×10000 |
| 4 | FGD 那種商品 base_sa = None | FGD 沒有「保險金額」label,只有「估算保額」(用保費預算反算) | base_sa **fallback 抓「估算保額」label** 右側數值 |
| 5 | F3W cv_total 抽到 6315 但 base_sa 是 550000 | F3W 整個逐年表欄位**位移 +3 格**(因為前面多了「壽險/健康險」拆欄) | 全部欄位用 keyword **動態搜尋標題列**,不寫死 col 號 |
| 6 | 還本商品 col 對應錯亂 | 還本商品 col 偏移跟一般利變不同(沒 cv_basic/cv_total 分離,只有單一解約金) | 寫**還本專用 extractor**,搜「總保險金額」、「生存\|保險金」、「累積\|生存保險金」、「解約金」 |
| 7 | 還本商品 schema 跟前端不相容 | 還本商品的解約金欄位只有單一值(沒 B/E 分離) | **`cv_basic = cv_total = 解約金 col 46`**,讓前端不用改 schema |
| 8 | 還本商品 schedule 末筆跑到 age=109 還在抽,且驗證 ❌「累計受益下降」 | 還本商品末筆 cv = 0(合約終止) 還是要 break | `if cv is not None and cv <= 0 and y > 1: break`(同非還本邏輯) |
| 9 | survival_payout_type 抽到 'yearly' 但實際是「年年領」型 | label「給付週期」抓到的是「**身故金分期定額給付週期**」不是生存金 | 必須對 keyword「**生存保險金給付週期**」(全字串比對),不是「給付週期」 |
| 10 | 規則 #2 fail:Y6 cum_prem 比 base × 6 差 3,000+ | 「**分紅抵繳保費**」型商品保費**逐年遞減** | 規則 #2 容差放寬到 **±5%**(0.95 ≤ ratio ≤ 1.05) |
| 11 | discount 自洽 fail:差 4-22 元 | 兩段折扣 + Excel 整數取整 | 容差改 **`max(2, gross × 0.001)`** |
| 12 | FMP 試算頁完全空白(只有 col 2 = 年度) | LibreOffice 不執行 VBA 巨集,試算頁公式沒算 | **無解,列入「不支援情境」**,請使用者本機 Excel 開啟存檔重傳 |
| 13 | FMS / QMS 樂退型抽不出來合理 base_sa | 樂退型 base_sa 是「每期領回金額」,不是傳統保額 | 商品名含「**樂退**」「**分期定額給付**」→ **永久跳過** |
| 14 | 同商品兩個 base 條件試算的檔(F3W 標準版 vs 簡易巨集版,3歲 vs 40歲)| 兩個檔同 plan_code 不同 base | **不能都做**,選新的覆蓋舊的,manifest 不能有兩條同 plan_code |
| 15 | 台幣商品反推保額步進跟其他商品不一致 | unit_size 1000 vs 10000 兩派 | 部署前**對齊既有 TWD 商品**(用 grep 看現有設定) |
| 16 | type 字串 v4 規則 B 沒列「**還本**」「**增額**」變體 | v4 type 對應只列基本類型 | 補 4 條:美元/台幣 × 還本/增額 終身壽險 |
| 17 | 「保險費合計」區的「首期標準保費」抓不到 | label 在 col 12(QPW)或 col 13(QDW) 兩種 | **不寫死 col**,在「保險費合計」區後 col 10-17 都搜 |

---

## H.2 全球人壽 32 個 xls 偵察結果速查表

下次處理全球人壽商品時,先查這張表,有 ✅ 直接抄;有 🔴 要小心。

### 商品 schema 對應(已驗證 22 個)

| 代號 | 全名(去前綴後) | 引擎 | 幣別 | period | base_sa 單位 | 結構備註 |
|---|---|---|---|---|---|---|
| FDW | 88美傳承 | twlife_v1 | USD | 20 | 美元 | 標準 |
| FYW | 美富88 | twlife_v1 | USD | 6 | 美元 | **月繳**,分紅抵繳 |
| FBW | 豪神六六 | twlife_v1 | USD | 6 | 美元 | **stepped** |
| FVW | 豪美368 | twlife_v1 | USD | 8 | 美元 | **stepped**,Y8 比值 0.954 邊緣 |
| FKD | 豪美樂利 | twlife_v1 | USD | 12 | 美元 | **stepped**,label 在 col 4 |
| F8W | 鑫億68 | twlife_v1 | USD | 8 | 美元 | 標準 |
| F3W | 尊榮37 | twlife_v1 | USD | 7 | 美元 | **欄位位移 +3**,col 31 是總保險金額 |
| FNW | 豪利旺(簡易巨集版) | twlife_v1 | USD | 2 | 美元 | 兒童保單 base_age=4,投保限額用預設 |
| FUW | 美旺智富 | twlife_v1 | USD | **1 躉繳** | 美元 | **stepped**,有 35 歲版/41 歲版兩 base |
| FGD | 非常美 | twlife_v1 | USD | **1 躉繳** | 美元 | 🔴 **沒「保險金額」label**,要 fallback 抓「估算保額」 |
| FJD | 美鑫恆盈 | twlife_v1 | USD | **1 躉繳** | 美元 | 標準躉繳 |
| FMW | 豪旺世代 | twlife_v1 | USD | **1 躉繳** | 美元 | 標準躉繳 |
| FVS | 1314美好旺盛 | twlife_v1 | USD | 12 | 美元 | **增額**型 |
| **FJP** ⭐ | 金美美利多 | twlife_v1 | USD | 6 | 美元 | **還本**(年年領,生存金 col 7) |
| **FMP** 🔴 | 美利樂沛 | twlife_v1 | USD | 6 | 美元 | 🔴 **VBA 巨集問題**,LibreOffice 跑不出來 |
| **FMS** 🔴 | 美滿樂退 | — | USD | — | — | 🔴 **永久跳過**(樂退型) |
| QDW | 88鑫傳承 | twlife_v1 | TWD | 6 | **萬元** | 標準台幣 |
| QPW | 台富88 | twlife_v1 | TWD | 6 | **萬元** | 「首期標準保費」label 在 col 12 |
| QHD | 鑫滿富足 | twlife_v1 | TWD | 6 | **萬元** | **月繳/增額/stepped/兒童**,label 浮動 |
| QNW | 代代豪旺 | twlife_v1 | TWD | **1 躉繳** | **萬元** | 標準台幣躉繳 |
| QBW | 豪威六六 | twlife_v1 | TWD | 6 | **萬元** | **stepped** |
| QFD | 有GO鑽 | twlife_v1 | TWD | **1 躉繳** | **萬元** | 標準 |
| QGD | 飛翔讚 | twlife_v1 | TWD | **1 躉繳** | **萬元** | 標準 |
| **QJP** ⭐ | 年年有利 | twlife_v1 | TWD | 6 | **萬元** | **還本**(年年領,生存金 col 7) |

⭐ = 還本型(用還本 extractor)
🔴 = 跳過或特殊處理

### 全球人壽 schedule col 對應(逐年表「試算頁」)

**標準利變型(F 系列前 6 個 + 大部分商品):**
```
col 2  → y (保單年度)
col 3  → age
col 4  → 當年度應繳保費 (用來抽 base_premium for 月繳)
col 7  → cum_prem (累積應繳保費)
col 13 → 基本保額身故金 (= min_guaranteed_db,stepped 商品 < base_sa)
col 16 → cv_basic (解約金 B)
col 19 → dividend_year (增值回饋分享金)
col 22 → dividend_cum (累計儲存生息)
col 25 → cv_increment (累計增加淨額 D)
col 28 → death_benefit (總保險金額,Y1 = base_sa)  ⭐ 這個才是 db
col 31 → increment_amount (當年度保險金額)
col 40 → cv_total (解約金 E = B + D)
```

**F3W 整體位移 +3:** col 28 → col 31,col 40 → col 43,以此類推。**用動態搜尋自動處理**。

**還本型(FJP / QJP):** col 對應不同,見 H.3 還本 extractor。

### 全球人壽 「基本資料輸入」頁 label 位置浮動

| 欄位 | 主要位置 | 浮動位置 | 例子 |
|---|---|---|---|
| 「商品」label | col 3 | col 4 | FGD col 4 |
| 「繳費年期」label | col 3 | col 4 | FGD col 4 |
| 「保險金額」label | col 3 | col 4 | FKD col 4 |
| 「首期標準保費」label | col 12 | col 13 | QDW col 13 |

修法:**全部支援 col 3/4 雙搜**,以及「首期標準保費」全 col 10-17 搜。

---

## H.3 完整可重現 Python 程式碼(實測過 32 個 xls)

### H.3.1 共用工具(必用)

```python
import openpyxl
import re
from pathlib import Path
from datetime import date
import json

COMPANY = '全球人壽'  # 改成實際公司名


def to_num(v):
    """LibreOffice 轉檔後 cell 字串化的處理"""
    if v is None or v == '': return None
    if isinstance(v, (int, float)): return v
    if isinstance(v, str):
        s = v.strip().replace(',', '').replace('$', '').replace(' ', '')
        if s in ('-', '－', '—', 'N/A', '#N/A', '#VALUE!', '#REF!'): return None
        try: return float(s)
        except: return None
    return None


def find_table_start(ws):
    """找 'TableStart' 標誌(全球/新光通用)"""
    for r in range(1, ws.max_row + 1):
        if ws.cell(r, 1).value == 'TableStart':
            return r
    return None


def normalize(s):
    """標題列字串正規化(拿掉空白、換行、註解,讓比對寬鬆)"""
    if s is None: return ''
    s = str(s).replace('\n', '').replace(' ', '').replace('|', '')
    return re.sub(r'\(註\s*\d+\)', '', s)


def find_col_by_header(ws, ts, contains, exclude=None, max_col=None):
    """
    動態搜尋 schedule 欄位 col 號
    在 TableStart 上方 1-4 列(標題區)蒐集每個 col 的所有文字,
    contains 全部都要在,exclude 任何一個都不能在。
    """
    if max_col is None: max_col = ws.max_column
    if exclude is None: exclude = []
    for c in range(1, max_col + 1):
        col_text = ''
        for r in range(max(1, ts - 4), ts + 1):
            v = ws.cell(r, c).value
            if v: col_text += normalize(v)
        if all(kw in col_text for kw in contains):
            if not any(ex in col_text for ex in exclude):
                return c
    return None
```

### H.3.2 標準利變型 extractor(對應 v4 規則 K「純壽 / stepped」)

```python
def discover_schedule_columns_standard(ws, ts):
    """標準利變型動態欄位搜尋"""
    cols = {'y': 2, 'age': 3}
    cols['cum_prem'] = find_col_by_header(ws, ts, ['累積', '應繳保費'])
    cols['cv_basic'] = find_col_by_header(ws, ts, ['解約金', '(B)'])
    cols['cv_total'] = find_col_by_header(ws, ts, ['解約金', '(E)'])
    cols['cv_increment'] = find_col_by_header(ws, ts, ['累計增加', '淨額', '(D)'])
    cols['increment_amount'] = find_col_by_header(ws, ts, ['當年度', '保險金額'])
    cols['dividend_year'] = find_col_by_header(ws, ts, ['增值回饋', '分享金'], exclude=['累計'])
    cols['dividend_cum'] = find_col_by_header(ws, ts, ['累計', '儲存生息'])
    # ⭐ death_benefit 用「總保險金額」標題定位(Y1 ≈ base_sa)
    cols['death_benefit'] = find_col_by_header(ws, ts, ['總保險金額'])
    
    # stepped 商品的「最低保證身故金」副欄位
    # 在 cv_basic 之前(基本保額區)的「身故/完全失能保險金」
    if cols.get('cv_basic'):
        for c in range(1, cols['cv_basic']):
            col_text = ''
            for r in range(max(1, ts - 4), ts + 1):
                v = ws.cell(r, c).value
                if v: col_text += normalize(v)
            if '身故/完全失能保險金' in col_text or ('身故/完全' in col_text and '失能保險金' in col_text):
                cols['min_guaranteed_db_raw'] = c
                break
    return cols


def extract_standard(path, code):
    """
    標準利變型抽取(支援躉繳/年繳/半年繳/月繳、stepped、增額、台幣萬元)
    回傳 (data, error_msg, extra)
    """
    wb = openpyxl.load_workbook(str(path), data_only=True)
    ws_in = wb['基本資料輸入']
    ws_t = wb['試算頁']
    
    # === 商品名(label col 3 或 col 4 雙搜)===
    product_name = None
    for r in range(30, 45):
        for label_col in (3, 4):
            if ws_in.cell(r, label_col).value == '商品':
                for off in range(1, 8):
                    v = ws_in.cell(r, label_col + off).value
                    if v and COMPANY in str(v):
                        product_name = v; break
                if product_name: break
        if product_name: break
    
    # === 幣別(從商品名判斷) ===
    currency = None
    if product_name:
        if '美元' in product_name: currency = 'USD'
        elif '臺幣' in product_name or '台幣' in product_name: currency = 'TWD'
    if not currency:
        currency = 'USD'  # fallback
    
    # === 性別 / 保險年齡 ===
    sex_zh = None
    for r in range(5, 15):
        if ws_in.cell(r, 8).value == '性別':
            sex_zh = ws_in.cell(r, 9).value; break
    base_sex = 'M' if sex_zh == '男' else 'F'
    
    base_age = None
    for r in range(5, 45):
        if ws_in.cell(r, 4).value == '保險年齡':
            for off in (1, 2):
                v = to_num(ws_in.cell(r, 4 + off).value)
                if v is not None and 0 <= v <= 99:
                    base_age = int(v); break
            if base_age is not None: break
    
    # === 繳費年期(label col 3 或 col 4,值在 col 5,「躉繳」字串 → 1)===
    period = None
    for r in range(30, 55):
        for lc in (3, 4):
            if ws_in.cell(r, lc).value == '繳費年期':
                v = ws_in.cell(r, 5).value
                if v == '躉繳':
                    period = 1; break
                num = to_num(v)
                if num is not None:
                    period = int(num); break
        if period is not None: break
    
    # === 繳別(label col 7 或 col 8)===
    pay_mode = None
    for r in range(30, 55):
        for lc in (7, 8):
            if ws_in.cell(r, lc).value == '繳別':
                pay_mode = ws_in.cell(r, 9).value; break
        if pay_mode is not None: break
    
    pm_map = {'年繳': 'annual', '半年繳': 'half_year', '季繳': 'quarterly',
              '月繳': 'monthly', '躉繳': 'lump_sum'}
    premium_mode = 'lump_sum' if period == 1 else pm_map.get(pay_mode, 'annual')
    
    # === 宣告利率假設 ===
    declared_rate = None
    for r in range(30, 55):
        for c in range(1, 25):
            v = ws_in.cell(r, c).value
            if v and '宣告利率假設' in str(v):
                for off in range(1, 5):
                    rv = to_num(ws_in.cell(r, c + off).value)
                    if rv is not None and 0 < rv < 0.1:
                        declared_rate = rv; break
                break
        if declared_rate is not None: break
    
    # === 保險金額(label col 3 或 col 4,單位元 或 萬元)+ FGD fallback ===
    base_sa_raw = None
    sa_unit_萬 = False
    for r in range(30, 60):
        for c in (3, 4):
            v = ws_in.cell(r, c).value
            if v and str(v).strip() in ('保險金額', '    保險金額'):
                v5 = to_num(ws_in.cell(r, 5).value)
                if v5 is not None and v5 >= 1:
                    base_sa_raw = v5
                    unit_cell = ws_in.cell(r, 8).value
                    if unit_cell and '萬' in str(unit_cell):
                        sa_unit_萬 = True
                    break
        if base_sa_raw is not None: break
    
    # FGD 那種「保費預算」型商品沒有「保險金額」label → 抓「估算保額」
    if base_sa_raw is None:
        for r in range(30, 60):
            for c in range(2, 12):
                v = ws_in.cell(r, c).value
                if v and ('估算保額' in str(v) or '估算保險金額' in str(v)):
                    for off in range(1, 8):
                        rv = to_num(ws_in.cell(r, c + off).value)
                        if rv is not None and rv >= 1000:
                            base_sa_raw = rv; break
                    if base_sa_raw is not None: break
            if base_sa_raw is not None: break
    
    base_sa = int(base_sa_raw * 10000) if (base_sa_raw and sa_unit_萬) else (int(base_sa_raw) if base_sa_raw else None)
    
    # === 高保額折讓 % ===
    discount_label_pct = None
    for r in range(30, 60):
        for c in (3, 4):
            v = ws_in.cell(r, c).value
            if v and '高保額折讓' in str(v):
                v_next = to_num(ws_in.cell(r, 5).value)
                if v_next is not None:
                    discount_label_pct = v_next; break
        if discount_label_pct is not None: break
    
    # === 增值回饋分享金給付方式 ===
    dividend_option = None
    for r in range(40, 70):
        for c in range(1, 10):
            v = ws_in.cell(r, c).value
            if v and '增值回饋分享金給付方式' in str(v):
                for dr in range(1, 4):
                    rv = ws_in.cell(r + dr, 5).value
                    if rv and rv not in ('增值回饋分享金給付方式',):
                        dividend_option = rv; break
                break
        if dividend_option: break
    
    # === 「保險費合計」區(label col 10-17 動態搜)===
    base_premium_gross_combined = None
    base_premium_combined = None
    found_combined = False
    for r in range(40, ws_in.max_row + 1):
        if ws_in.cell(r, 2).value and '保險費合計' in str(ws_in.cell(r, 2).value):
            found_combined = True; continue
        if found_combined:
            for c in range(10, 17):
                v = ws_in.cell(r, c).value
                if v == '首期標準保費' and base_premium_gross_combined is None:
                    base_premium_gross_combined = to_num(ws_in.cell(r, 17).value)
                elif v == '首期應繳保費(保費折讓後)' and base_premium_combined is None:
                    base_premium_combined = to_num(ws_in.cell(r, 17).value)
            if base_premium_combined and base_premium_gross_combined: break
    
    # === 投保限額(USD / TWD-萬元 兩種模式)===
    min_sa = max_sa = max_age = None
    for r in range(35, 60):
        for c in range(1, 12):
            v = ws_in.cell(r, c).value
            if v and '投保金額' in str(v):
                m = re.search(r'([\d,]+)\s*美元\s*[~~]\s*([\d,]+)\s*美元', str(v))
                if m:
                    min_sa = int(m.group(1).replace(',', ''))
                    max_sa = int(m.group(2).replace(',', ''))
                else:
                    m = re.search(r'([\d,]+)\s*萬\s*元?\s*[~~]\s*([\d,]+)\s*萬\s*元', str(v))
                    if m:
                        min_sa = int(m.group(1).replace(',', '')) * 10000
                        max_sa = int(m.group(2).replace(',', '')) * 10000
                if min_sa: break
        if min_sa: break
    for r in range(30, 60):
        for c in range(1, 25):
            v = ws_in.cell(r, c).value
            if v and '投保年齡' in str(v) and '歲' in str(v):
                m = re.search(r'(\d+)\s*[~~]\s*(\d+)\s*歲', str(v))
                if m:
                    max_age = int(m.group(2)); break
        if max_age: break
    
    # 預設值(規則 C)
    sa_defaulted = age_defaulted = False
    if min_sa is None or max_sa is None:
        if currency == 'USD':
            min_sa = min_sa or 10000; max_sa = max_sa or 5000000
        else:
            min_sa = min_sa or 300000; max_sa = max_sa or 100000000
        sa_defaulted = True
    if max_age is None:
        max_age = 75; age_defaulted = True
    
    # === 抽 schedule(動態欄位)===
    ts = find_table_start(ws_t)
    if ts is None:
        return None, '找不到 TableStart', None
    
    cols = discover_schedule_columns_standard(ws_t, ts)
    missing = [k for k in ['cum_prem', 'cv_basic', 'cv_total', 'death_benefit'] if cols.get(k) is None]
    if missing:
        return None, f'欄位搜尋失敗:{missing}', cols
    
    schedule = []
    annual_premiums = []
    db_below_sa_count = 0
    
    for r in range(ts + 1, ws_t.max_row + 1):
        y_val = to_num(ws_t.cell(r, cols['y']).value)
        if y_val is None: continue
        y = int(y_val)
        if not (1 <= y <= 100): continue
        
        age_val = to_num(ws_t.cell(r, cols['age']).value)
        age = int(age_val) if age_val is not None else (base_age + y - 1)
        if age > 110: break
        
        def gv(col_key):
            col = cols.get(col_key)
            if col is None: return None
            return to_num(ws_t.cell(r, col).value)
        
        cum_prem = gv('cum_prem')
        cv_basic = gv('cv_basic')
        cv_total = gv('cv_total')
        death_benefit = gv('death_benefit')
        cv_increment = gv('cv_increment')
        increment_amount = gv('increment_amount')
        dividend_year = gv('dividend_year')
        dividend_cum = gv('dividend_cum')
        min_g_db_raw = gv('min_guaranteed_db_raw')
        annual_prem = to_num(ws_t.cell(r, 4).value) or 0
        annual_premiums.append(annual_prem)
        
        if cum_prem is None and cv_basic is None and death_benefit is None:
            continue
        if cv_basic is not None and cv_basic <= 0 and y > 1:
            break  # 合約結束
        
        row = {'y': y, 'age': age}
        if cum_prem is not None:        row['cum_prem'] = round(cum_prem)
        if cv_basic is not None:        row['cv_basic'] = round(cv_basic)
        if cv_total is not None:        row['cv_total'] = round(cv_total)
        if death_benefit is not None:   row['death_benefit'] = round(death_benefit)
        if cv_increment is not None and cv_increment != 0:
            row['cv_increment'] = round(cv_increment)
        if increment_amount is not None and increment_amount != 0:
            row['increment_amount'] = round(increment_amount)
        if dividend_year is not None and dividend_year != 0:
            row['dividend_year'] = round(dividend_year)
        if dividend_cum is not None and dividend_cum != 0:
            row['dividend_cum'] = round(dividend_cum)
        # min_guaranteed_db: 跟 death_benefit 不同時才存(避免冗餘)
        if min_g_db_raw is not None and death_benefit is not None and abs(min_g_db_raw - death_benefit) > 1:
            row['min_guaranteed_db'] = round(min_g_db_raw)
        
        # stepped 偵測:Y1 基本身故金 < base_sa 一半
        if base_sa and min_g_db_raw is not None and y == 1 and min_g_db_raw < base_sa * 0.5:
            db_below_sa_count = 1
        
        schedule.append(row)
    
    schedule.sort(key=lambda r: r['y'])
    wb.close()
    
    # === base_premium = 試算頁 Y1 col 4「當年度應繳保費」===
    final_base_premium = round(annual_premiums[0]) if annual_premiums else None
    
    # base_premium_gross 月繳商品要按 net/gross 比例還原
    if pay_mode == '月繳' and base_premium_gross_combined and base_premium_combined:
        ratio = base_premium_gross_combined / base_premium_combined
        final_base_premium_gross = round(final_base_premium * ratio)
    else:
        final_base_premium_gross = round(base_premium_gross_combined) if base_premium_gross_combined else None
    
    discount = None
    if final_base_premium_gross and final_base_premium and final_base_premium_gross > 0:
        discount = round(1 - final_base_premium / final_base_premium_gross, 6)
    
    # === product_name 規則 A + F + 末尾代號 ===
    pname_clean = product_name or ''
    if pname_clean.startswith(COMPANY):
        pname_clean = pname_clean[len(COMPANY):]
    pname_clean = pname_clean.replace('(', '(').replace(')', ')').replace('-', '-').replace('—', '-')
    if pname_clean and not pname_clean.endswith(f'({code})'):
        pname_clean = f'{pname_clean}({code})'
    
    is_stepped = db_below_sa_count > 0
    
    meta = {
        'product_id': code,
        'company': COMPANY,
        'product_name': pname_clean,
        'currency': currency,
        'period': period,
        'engine': 'twlife_v1',
        'base_sex': base_sex,
        'base_age': base_age,
        'base_sa': base_sa,
        'base_premium': final_base_premium,
        'discount': discount if discount is not None else 0,
        'declared_rate': declared_rate if declared_rate is not None else 0,
        'source_file': path.name.replace('.xlsx', '.xls'),
        'extracted_at': str(date.today()),
    }
    if final_base_premium_gross:
        meta['base_premium_gross'] = final_base_premium_gross
    if discount_label_pct is not None:
        meta['discount_label'] = discount_label_pct / 100
    if dividend_option:
        meta['dividend_option'] = dividend_option
    if pay_mode:
        meta['pay_mode'] = pay_mode
    if premium_mode != 'annual':
        meta['premium_mode'] = premium_mode
    if is_stepped:
        meta['db_pattern'] = 'stepped'
    
    extra = {'min_sa': min_sa, 'max_sa': max_sa, 'max_age': max_age, 'cols': cols,
             'sa_defaulted': sa_defaulted, 'age_defaulted': age_defaulted}
    
    return {'meta': meta, 'schedule': schedule}, None, extra
```
### H.3.3 還本型 extractor(對應 v4 規則 K「還本」)

```python
def discover_endowment_columns(ws, ts):
    """還本商品專用的欄位搜尋(FJP / QJP 等)"""
    cols = {'y': 2, 'age': 3}
    
    cols['cum_prem'] = find_col_by_header(ws, ts, ['累積', '應繳保費'])
    
    # 「總保險金額」(Y1 = base_sa)→ death_benefit 主欄位
    cols['death_benefit'] = find_col_by_header(ws, ts, ['總保險金額'])
    
    # 找出所有「身故/完全失能保險金」col,第一個是基本保額區(min_guaranteed_db)
    db_cols = []
    for c in range(1, ws.max_column + 1):
        col_text = ''
        for r in range(max(1, ts - 4), ts + 1):
            v = ws.cell(r, c).value
            if v: col_text += normalize(v)
        if '身故/完全失能保險金' in col_text or ('身故/完全' in col_text and '失能保險金' in col_text):
            db_cols.append(c)
    if len(db_cols) >= 1:
        cols['min_guaranteed_db_raw'] = db_cols[0]
    
    # 生存金:含「生存」+「保險金」且不含累積/累計/預估
    cols['survival_benefit_year'] = find_col_by_header(
        ws, ts, ['生存', '保險金'],
        exclude=['累計', '累積', '預估', '基本保險金額之', '總保險金額之']
    )
    
    # 累積生存金
    cols['survival_benefit_cum'] = find_col_by_header(ws, ts, ['累積', '生存保險金'])
    if not cols['survival_benefit_cum']:
        cols['survival_benefit_cum'] = find_col_by_header(ws, ts, ['累計', '生存保險金'])
    
    # 解約金(G)/(F) — 還本商品只有單一解約金
    cols['cv'] = find_col_by_header(ws, ts, ['解約金', '(G)'])
    if not cols['cv']:
        cols['cv'] = find_col_by_header(ws, ts, ['解約金', '(F)'])
    if not cols['cv']:
        # fallback: 不含 (B)(E) 的「解約金」
        for c in range(1, ws.max_column + 1):
            col_text = ''
            for r in range(max(1, ts - 4), ts + 1):
                v = ws.cell(r, c).value
                if v: col_text += normalize(v)
            if '解約金' in col_text and '解約總給付' not in col_text and '(B)' not in col_text and '(E)' not in col_text:
                cols['cv'] = c; break
    
    cols['dividend_year'] = find_col_by_header(
        ws, ts, ['增值回饋', '分享金'], exclude=['累計', '累積']
    )
    cols['dividend_cum'] = find_col_by_header(ws, ts, ['累計', '儲存生息'])
    if not cols['dividend_cum']:
        cols['dividend_cum'] = find_col_by_header(ws, ts, ['累積', '儲存生息'])
    
    cols['cv_increment'] = find_col_by_header(ws, ts, ['累計增加', '保險金額'])
    cols['increment_amount'] = find_col_by_header(ws, ts, ['當年度', '保險金額'])
    
    return cols


def extract_endowment(path, code):
    """
    還本型抽取(FJP / QJP 等年年領型,以及 FMP 那種老年領型)
    schema 重點:cv_basic = cv_total = 解約金(統一,前端不用改 schema)
    """
    wb = openpyxl.load_workbook(str(path), data_only=True)
    ws_in = wb['基本資料輸入']
    ws_t = wb['試算頁']
    
    # base 參數抽取(同 extract_standard,略,直接複用該段)
    # ... [此處複用 extract_standard 的 base 參數抽取邏輯] ...
    
    # ⭐ 還本專屬:生存保險金開始給付年齡 + 給付週期
    survival_benefit_age = None
    survival_payout_type = None
    for r in range(35, 60):
        for c in range(1, 30):
            v = ws_in.cell(r, c).value
            if v and '生存保險金開始給付年齡' in str(v):
                for off in range(1, 6):
                    rv = to_num(ws_in.cell(r, c + off).value)
                    if rv is not None and 0 <= rv <= 110:
                        survival_benefit_age = int(rv); break
                break
            # ⚠️ 必須是「生存保險金給付週期」全字串,不是「給付週期」
            # (「給付週期」會誤抓身故金分期定額給付週期)
            if v and '生存保險金給付週期' in str(v):
                for off in range(1, 6):
                    rv = ws_in.cell(r, c + off).value
                    if rv and isinstance(rv, str):
                        if '月' in rv: survival_payout_type = 'monthly'
                        elif '年' in rv: survival_payout_type = 'yearly'
                        break
        if survival_benefit_age is not None: break
    
    # === 抽 schedule(還本動態欄位)===
    ts = find_table_start(ws_t)
    if ts is None:
        return None, '找不到 TableStart', None
    
    cols = discover_endowment_columns(ws_t, ts)
    missing = [k for k in ['cum_prem', 'death_benefit', 'cv'] if cols.get(k) is None]
    if missing:
        return None, f'欄位搜尋失敗:{missing}', cols
    
    schedule = []
    for r in range(ts + 1, ws_t.max_row + 1):
        y_val = to_num(ws_t.cell(r, cols['y']).value)
        if y_val is None: continue
        y = int(y_val)
        if not (1 <= y <= 100): continue
        
        age_val = to_num(ws_t.cell(r, cols['age']).value)
        age = int(age_val) if age_val is not None else (base_age + y - 1)
        if age > 110: break
        
        def gv(col_key):
            col = cols.get(col_key)
            if col is None: return None
            return to_num(ws_t.cell(r, col).value)
        
        cum_prem = gv('cum_prem')
        death_benefit = gv('death_benefit')
        cv = gv('cv')
        survival_year = gv('survival_benefit_year')
        survival_cum = gv('survival_benefit_cum')
        # ... 其他欄位
        
        if cum_prem is None and cv is None and death_benefit is None:
            continue
        # ⭐ 還本商品末筆 cv ≤ 0 也要 break(同非還本邏輯)
        if cv is not None and cv <= 0 and y > 1:
            break
        
        row = {'y': y, 'age': age}
        if cum_prem is not None: row['cum_prem'] = round(cum_prem)
        # ⭐ 還本商品 cv_basic = cv_total = 解約金(讓前端不用改 schema)
        if cv is not None:
            row['cv_basic'] = round(cv)
            row['cv_total'] = round(cv)
        if death_benefit is not None: row['death_benefit'] = round(death_benefit)
        if survival_year is not None and survival_year > 0:
            row['survival_benefit_year'] = round(survival_year)
        if survival_cum is not None and survival_cum > 0:
            row['survival_benefit_cum'] = round(survival_cum)
        # ... 其他
        schedule.append(row)
    
    schedule.sort(key=lambda r: r['y'])
    wb.close()
    
    # meta 加上 is_endowment + survival_benefit_age + survival_payout_type
    meta['is_endowment'] = True
    if survival_benefit_age is not None:
        meta['survival_benefit_age'] = survival_benefit_age
    if survival_payout_type:
        meta['survival_payout_type'] = survival_payout_type
    
    return {'meta': meta, 'schedule': schedule}, None, extra
```

### H.3.4 統一驗證(對應 v4 Step 4 9 條,加實戰修正)

```python
def verify(data, gross=None):
    """
    自洽性驗證(覆蓋 v4 Step 4 9 條)
    特別:
    - 規則 #2 容差 ±5%(分紅抵繳保費型逐年遞減)
    - 規則 #5 還本商品改檢查累計受益
    - 規則 #6 stepped/還本放寬到 db_max ≥ sa × 0.95
    - 規則 #9 discount 自洽容差 max(2, gross × 0.001)
    """
    sched = data['schedule']
    base = data['meta']
    errors, warnings = [], []
    p = base.get('period', 1)
    is_endow = base.get('is_endowment', False)
    is_stepped = base.get('db_pattern') == 'stepped'
    
    if not sched:
        return ['schedule 為空'], []
    
    # 1. Y1 cum_prem ≈ base_premium
    if 'cum_prem' in sched[0] and base.get('base_premium'):
        if abs(sched[0]['cum_prem'] - base['base_premium']) > 1:
            errors.append(f"Y1 cum_prem ≠ base_premium")
    
    # 2/3. 躉繳 vs 多年期分流
    if p == 1:
        if len(sched) > 1 and abs(sched[1].get('cum_prem', 0) - sched[0].get('cum_prem', 0)) > 1:
            errors.append(f"Y2 應 = Y1 (躉繳)")
    else:
        y_p = sched[p-1].get('cum_prem')
        if y_p is None:
            errors.append(f"Y{p} 沒有 cum_prem")
        elif base.get('base_premium'):
            exp_p = base['base_premium'] * p
            ratio = y_p / exp_p if exp_p > 0 else 1
            # ⭐ ±5% 容差(分紅抵繳保費型)
            if not 0.95 <= ratio <= 1.05:
                errors.append(f"Y{p} cum_prem ratio {ratio:.3f} 超出 0.95-1.05")
            elif not 0.97 <= ratio <= 1.03:
                warnings.append(f"Y{p} cum_prem 比值 {ratio:.3f}(可能因分紅抵繳)")
        if len(sched) > p:
            diff = abs(sched[p].get('cum_prem', 0) - sched[p-1].get('cum_prem', 0))
            if diff > 1:
                errors.append(f"Y{p+1} cum_prem 應停止")
    
    # 4. cv_total >= cv_basic
    for r in sched:
        if 'cv_total' in r and 'cv_basic' in r and r['cv_total'] < r['cv_basic'] - 1:
            errors.append(f"Y{r['y']} cv_total < cv_basic"); break
    
    # 5. 中後期遞增
    if is_endow:
        # ⭐ 還本商品改檢查累計受益遞增(cv 會被生存金消耗下降是正常)
        prev_total = 0
        for r in sched:
            total = r.get('cv_total', 0) + r.get('survival_benefit_cum', 0) + r.get('dividend_cum', 0)
            if total < prev_total * 0.999:
                errors.append(f"Y{r['y']} 累計受益下降"); break
            prev_total = total
    else:
        for i in range(min(10, len(sched)), len(sched)):
            prev = sched[i-1].get('cv_total')
            curr = sched[i].get('cv_total')
            if prev is not None and curr is not None and curr < prev * 0.999:
                warnings.append(f"Y{sched[i]['y']} cv_total 微下降"); break
    
    # 6. db ≈ base_sa(stepped/還本放寬)
    if is_stepped or is_endow:
        # ⭐ 任一年 db_max ≥ base_sa × 0.95
        db_max = max(r.get('death_benefit', 0) for r in sched)
        if base.get('base_sa') and db_max < base['base_sa'] * 0.95:
            errors.append(f"db_max {db_max} 從未達 base_sa")
    else:
        if base.get('base_sa'):
            any_in_range = any(
                'death_benefit' in r and 0.95 <= r['death_benefit']/base['base_sa'] <= 1.05
                for r in sched
            )
            if not any_in_range:
                warnings.append("無年度 db 在 [0.95-1.05] sa")
    
    # 7. age <= 110
    last_age = sched[-1].get('age', base.get('base_age', 0) + sched[-1]['y'] - 1)
    if last_age > 110:
        errors.append(f"age {last_age} > 110")
    
    # 8. 筆數
    if len(sched) < 50:
        warnings.append(f"筆數 {len(sched)} < 50")
    
    # 9. discount 自洽
    if 'base_premium_gross' in base and base.get('discount', 0) > 0:
        gross = base['base_premium_gross']
        net = base['base_premium']
        discount = base['discount']
        expected_net = gross * (1 - discount)
        # ⭐ 容差 max(2, gross × 0.001)
        tol = max(2, gross * 0.001)
        if abs(expected_net - net) > tol:
            errors.append(f"discount 不自洽")
    
    return errors, warnings
```

---

## H.4 部署狀態快照(到 2026-05 為止)

下次 Claude 處理全球人壽 / 跟既有商品比對時用這份快照。

### 全球人壽 已部署 22 個商品

| 代號 | 全名 | 第幾批 | 備註 |
|---|---|---|---|
| FDW | 88美傳承(FDW) | 第 1 批 | - |
| FYW | 美富88(FYW) | 第 1+4 批 | 月繳 |
| FBW | 豪神六六(FBW) | 第 1 批 | stepped |
| FVW | 豪美368(FVW) | 第 1+4 批 | stepped |
| FKD | 豪美樂利(FKD) | 第 1+4 批 | stepped |
| F8W | 鑫億68(F8W) | 第 1 批 | - |
| QDW | 88鑫傳承(QDW) | 第 2+4 批 | TWD |
| QPW | 台富88(QPW) | 第 2 批 | TWD |
| F3W | 尊榮37(F3W) | 第 3 批 | 欄位位移 +3 |
| FNW | 豪利旺(FNW) | 第 3 批 | 簡易巨集版 |
| FUW | 美旺智富(FUW) | 第 3+4 批 | **35 歲版 vs 41 歲版要選一**|
| QHD | 鑫滿富足(QHD) | 第 3+4 批 | 月繳/增額/兒童 |
| QNW | 代代豪旺(QNW) | 第 3 批 | TWD 躉繳 |
| FGD | 非常美(FGD) | 第 4 批 | 保費預算型 |
| FJD | 美鑫恆盈(FJD) | 第 4 批 | 躉繳 |
| **FJP** | 金美美利多(FJP) | 第 4 批 | **還本** |
| FMW | 豪旺世代(FMW) | 第 4 批 | 躉繳 |
| FVS | 1314美好旺盛(FVS) | 第 4 批 | 增額 |
| QBW | 豪威六六(QBW) | 第 4 批 | TWD stepped |
| QFD | 有GO鑽(QFD) | 第 4 批 | TWD 躉繳 |
| QGD | 飛翔讚(QGD) | 第 4 批 | TWD 躉繳 |
| **QJP** | 年年有利(QJP) | 第 4 批 | **TWD 還本** |

### 全球人壽 已知跳過商品

| 代號 | 商品 | 原因 |
|---|---|---|
| **FMS** | 美滿樂退 | 樂退分期定額,base_sa 概念不同 |
| **QMS** | 豪享樂退 | 同 FMS |
| **FMP** | 美利樂沛 | 試算頁 VBA 巨集問題,LibreOffice 跑不出來 |
| F3W 簡易巨集版 | (同 F3W 標準版) | 不同 base 條件試算,避免 manifest 重複 |

### 全球人壽 待處理(未拿到檔)

| 代號 | 商品 | 結構推測 |
|---|---|---|
| FUW、F4W、F18 等 | 變額/醫療/附約 | 永久跳過 |
| QRS 金旺前挺保 | 醫療型? | 待確認 |
| 醫療險專案、醫療組合專案 | 醫療型 | 永久跳過 |

---

## H.5 type 字串總表(規則 B 補完)

v4 規則 B 列了基本類型,但跑全球人壽踩到 4 個沒列的變體。完整版:

| type 字串 | 適用 | 例子 |
|---|---|---|
| 美元利率變動型終身壽險 | 標準 USD 利變 | FDW、FBW、F8W、F3W、FVW、FKD、FYW、FNW、FUW、FGD、FJD、FMW |
| 美元利率變動型增額終身壽險 | USD 增額 | **FVS** ⭐新 |
| 美元利率變動型還本終身壽險 | USD 還本 | **FJP** ⭐新 |
| 新台幣利率變動型終身壽險 | 標準 TWD 利變 | QDW、QPW、QNW、QBW、QFD、QGD |
| 新台幣利率變動型增額終身壽險 | TWD 增額 | **QHD** ⭐新 |
| 新台幣利率變動型還本終身壽險 | TWD 還本 | **QJP** ⭐新 |
| 美元分紅終身壽險 | 保誠 ARLPLU 等 | (尚未實戰) |
| 新台幣分紅終身壽險 | 富邦/台壽分紅 | (尚未實戰) |

---

## H.6 LibreOffice 轉檔陷阱

`.xls` 用 LibreOffice 轉 `.xlsx` 時可能踩到:

1. **VBA 巨集不執行** → 試算頁可能整個空白(只 col 2 = 年度)。**遇到只能請使用者本機 Excel 開啟存檔重傳**(FMP 案例)
2. **Cell 字串化** → 數字變字串(`'6'` 不是 `6`),全部抽取一律 `to_num()` 轉
3. **批次轉檔超時** → 一次跑 13+ 檔可能超過 60 秒 timeout,**改成單檔逐個轉**

---

## H.7 v5 整體建議

1. **新對話新商品** → 先讀 v4 主指令(到 H.0 之前),再讀本附錄 H 對應的部分(看公司有沒有在 H.4 部署快照)
2. **全球人壽商品** → 直接抄 H.3 程式碼跑,先比對 H.2 速查表結構是否符合
3. **批次模式** → 依 v4 Step B0,但每階段要做 H.2 雷對照檢查
4. **驗證 ❌ 時** → 對照 H.1 17 個雷的「症狀 → 修法」對照表

---

**v5.0 完。**
