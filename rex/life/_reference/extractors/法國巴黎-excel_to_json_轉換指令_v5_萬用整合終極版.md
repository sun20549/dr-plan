# excel_to_json 轉換指令 — v5 Cardif Delta

> **這份文件是 v4.0 的補充包**，專門處理 v4.0 沒涵蓋的 **第 8 家公司：法商法國巴黎人壽 (Cardif Life Taiwan)**。
> 套用順序：先讀 v4.0 通用流程（Step 0~5），再讀本檔的 Cardif 專屬規則蓋過去。
> 本檔不重述 v4.0 已有規則，只列**新增 / 變更 / 例外**。

---

## 0. 何時觸發本 delta

當以下任一條件成立時，套用本 delta：

1. 檔名包含「**美吉鴻運 / 美添鴻運 / 鴻運旺旺來 / 鴻運滿億 / 鴻運金喜 / 鴻運雙享**」其中之一
2. 檔內任一 sheet 的 R8 / R3 / R5 含「**法商法國巴黎人壽**」或「**法國巴黎人壽**」
3. `面頁` sheet 存在且 R3C3 含「**POS Model**」字串（這是 Cardif 系統的特徵字串）
4. plan_code 開頭為 **`PRU` / `PRT` / `PCT`** 三組之一

任一條件成立 → engine 強制使用 `prudential_v2`，company 強制寫 `Cardif`。

---

## 1. 公司識別與命名規則

### 規則 C1：company 欄位
```
company: "Cardif"
```
**不可寫**「法國巴黎人壽」「法商法國巴黎人壽」「BNP Paribas Cardif」「巴黎」等其他變體。前端 PRODUCTS 註冊時對應顯示名稱由 frontend 處理。

### 規則 C2：product_name 去前綴
從 `商品摘要表` R3C1（或 `商品利益說明表` R3C1）抽商品全名後，**依序**去除：
1. 開頭的 `● ` 或 `※ ` 符號
2. 前綴「**法商法國巴黎人壽**」（10 字）
3. 若上一步沒匹配，試前綴「**法國巴黎人壽**」（7 字）
4. 若上一步沒匹配，試前綴「**Cardif**」

範例：
- `● 法商法國巴黎人壽美吉鴻運外幣分紅終身壽險(定期給付型)`
- → `美吉鴻運外幣分紅終身壽險(定期給付型)`

**禁止**自行翻譯「定期給付型」為「stepped」「scheduled」等英文，保持原中文。

### 規則 C3：絕對禁止用 R6 做商品名來源
Cardif 商品摘要表 R6C1 是免責聲明（以 `*` 或 `※` 開頭，含「本保險為分紅保險單」），**不是**商品名。抽商品名時必須過濾條件：

```python
# 正確
if isinstance(v, str) and v.lstrip().startswith('●') and '法國巴黎人壽' in v:
    product_name_full = v
# 錯誤 — 會抽到免責聲明
if '法國巴黎人壽' in v:
    product_name_full = v
```

---

## 2. 公版空白模板處理（最關鍵）

### 規則 C4：辨識空白模板

Cardif 流通的公版檔通常是「**未填入試算參數的空白模板**」。辨識特徵：

1. 檔名以「**公版_**」開頭
2. `輸入頁` R22 / R24 的 D 欄（保險金額輸入欄）為 `None` 或 `0`
3. `商品利益說明表(不含紅利部分)` 或 `商品利益說明表` R5 顯示「**保額：0元 / 首期原始保費：0元**」
4. 任一 schedule sheet 的 Y1 行所有數值欄都是 0 或 None

**遇到空白模板時，禁止**：
- ❌ 直接抽 0 / None 當數據（違反 v4.0 絕對禁止規則 #13）
- ❌ 在沒填值就停下，產出空 schedule 的 JSON
- ❌ 標 `data_status: "template_only"` 然後交付（前端會壞）

**正確流程**：執行下方規則 C5 的 fill+recalc。

### 規則 C5：fill+recalc 標準流程

#### Step C5.1：複製檔案到工作區並修補 autofilter

```python
import zipfile, re, shutil
from pathlib import Path

# 從 .xls 經 LibreOffice 轉來的 .xlsx 通常 autofilter XML 格式不符規範,
# openpyxl 寫入會炸,需先修補
def fix_autofilter(src_xlsx: Path, dst_xlsx: Path):
    """移除 sheet xml 內的 autoFilter 標籤,讓 openpyxl 可寫."""
    with zipfile.ZipFile(src_xlsx, 'r') as zin, \
         zipfile.ZipFile(dst_xlsx, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith('xl/worksheets/sheet') and item.filename.endswith('.xml'):
                txt = data.decode('utf-8')
                txt = re.sub(r'<autoFilter[^/]*/>', '', txt)
                txt = re.sub(r'<autoFilter[^>]*>.*?</autoFilter>', '', txt, flags=re.DOTALL)
                data = txt.encode('utf-8')
            zout.writestr(item, data)
```

**何時必須 fix_autofilter**：來源是 `.xls` 經 LibreOffice 轉 `.xlsx` 的檔。原生 `.xlsx` 不需要。

#### Step C5.2：定位 SA 輸入 cell

不同檔的 SA 輸入位置不固定，按下表查：

| 商品 | SA 輸入 cell | 單位 | 標準試算值 | 對應實際保額 |
|---|---|---|---|---|
| 美吉鴻運 | `輸入頁!D24` | 萬元 | `10` | 100,000 USD |
| 美添鴻運 | `輸入頁!D22` | 萬元 | `10` | 100,000 USD |
| 鴻運旺旺來 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運滿億 | `輸入頁!D24` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運金喜 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運雙享 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |

**注意**：`輸入頁` 的提示字「以每千元為單位」**不可信**——實測美吉/美添寫 100 會得到 1,000,000 USD（即 100 萬美元，超過業界試算量）。**正確單位是「萬元」**：
- USD 商品寫 10 → 100,000 USD（10 萬美元 = 業界標準）
- TWD 商品寫 100 → 1,000,000 TWD（100 萬台幣 = 業界標準）

寫入後務必驗證：重算後 `R5` 顯示應為「**保額：100,000元**」(USD) 或「**保額：1,000,000元**」(TWD)。若顯示「保額：1,000,000元」但商品是 USD → 寫太大了，重新填較小數字。

#### Step C5.3：寫入 + LibreOffice 重算

```python
import openpyxl, subprocess

def fill_and_recalc(src: Path, sa_cell: str, sa_value: int, out_dir: Path):
    """填入 SA + LibreOffice headless 重算."""
    wb = openpyxl.load_workbook(src)
    ws = wb['輸入頁']
    ws[sa_cell] = sa_value
    wb.save(src)
    
    out_dir.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ['libreoffice', '--headless', '--calc', '--convert-to', 'xlsx',
         '--outdir', str(out_dir), str(src)],
        capture_output=True, timeout=600
    )
    return out_dir / src.name
```

**timeout 設定**：單檔最多 600 秒。Cardif 大檔（如美吉 14MB）需 3-5 分鐘重算。**不可批次跑 6 檔**（會超時），逐檔處理。

#### Step C5.4：驗證重算結果

重算後務必檢查：

```python
wb = openpyxl.load_workbook(recalc_path, data_only=True, read_only=True)
ws = wb['商品利益說明表(不含紅利部分)']  # 終身壽 OR
ws = wb['建議書']                       # 還本

# 驗證 1: R5 (或對應位置) 不應為 None / 0
r5_val = ws.cell(5, 1).value
assert r5_val and '0元' not in r5_val, f"重算未生效: R5={r5_val}"

# 驗證 2: Y1 行 (R15 / R16) 應有實值
y1_cum_prem = ws.cell(15, 4).value or ws.cell(16, 4).value
assert isinstance(y1_cum_prem, (int, float)) and y1_cum_prem > 0
```

若驗證失敗 → 不要繼續，停下來告訴用戶。

---

## 3. Sheet 結構辨識

### 規則 C6：商品類型分類

Cardif 6 檔分兩種結構：

| 類型 | 商品 | schedule sheet | 特徵 |
|---|---|---|---|
| **whole_life** | 美吉、美添、旺旺來、金喜 | `商品利益說明表` (no trailing space, ~421×14) | 終身壽，三情境垂直堆疊 |
| **endowment** | 滿億、雙享 | `建議書` (~393×18) | 還本（含生存保險金），三情境垂直堆疊 |

**判斷方法**（不靠檔名）：

```python
def classify_kind(wb):
    """判斷是 whole_life 還是 endowment."""
    # endowment 特徵: 建議書 sheet R2C5 標題含「年度末\n生存保險金」
    if '建議書' in wb.sheetnames:
        ws = wb['建議書']
        v = ws.cell(2, 5).value
        if isinstance(v, str) and '生存保險金' in v:
            return 'endowment'
    return 'whole_life'
```

### 規則 C7：display sheet 不可用

以下 sheet 是 display layer（用 OFFSET/VLOOKUP 公式聚合），**LibreOffice 重算後公式失效**，不可用作數據來源：

- `商品利益說明表(不含紅利部分) ` （**注意尾端有空格**，158×26）
- `紅利彙總表`（166×29）
- `建議書-簽名送件(基本資料須正確)` （部分版本）

對應的真實數據 sheet：

| 不可用（display） | 可用（source） |
|---|---|
| `商品利益說明表(不含紅利部分) ` | `商品利益說明表(不含紅利部分)`（**無空格**） — 只有 base 不含分紅 |
| `紅利彙總表` | `商品利益說明表`（**無「不含紅利」**） — 含三情境分紅 |
| display 版的「建議書-簽名送件」 | `建議書` （還本商品專用） |

**辨識訣竅**：display sheet 的 max_column 通常 ≥ 26（28 / 29），source sheet 的 max_column 是 13 / 14 / 18。

---

## 4. 三情境區塊定位

### 規則 C8：區塊 header 偵測（雙位置策略）

Cardif 的三情境 header 在不同檔位於不同 col：

| 結構 | header 位置 |
|---|---|
| whole_life (`商品利益說明表`) | **col 7** 含「最可能紅利(中分紅)」/「較低紅利(低分紅)」/「可能紅利為零」 |
| endowment (`建議書`) | **col 1** 含同樣字串 |

**通殺策略**：同時掃 col 1 + col 7，任一 hit 即記錄。

### 規則 C8a：keyword 變體（重要）

Cardif 不同版本檔的 none 情境 label 不一致，至少看過 2 種寫法：

| 版本 | none 情境 keyword |
|---|---|
| 美吉/美添/金喜/滿億/雙享 | `可能紅利為零` |
| **鴻運旺旺來** | `零分紅` |

完整 keyword 對應表：

```python
label_to_sc = {
    '最可能紅利': 'mid', '中分紅': 'mid',
    '較低紅利': 'low', '低分紅': 'low',
    '可能紅利為零': 'none', '零分紅': 'none',  # 兩種都要
}
```

**漏掉 `零分紅` 會導致旺旺來只抽到 mid+low**，三情境檢查失敗。

### 規則 C8b：完整 find_blocks 程式碼

```python
def find_blocks(ws):
    label_to_sc = {
        '最可能紅利': 'mid', '中分紅': 'mid',
        '較低紅利': 'low', '低分紅': 'low',
        '可能紅利為零': 'none', '零分紅': 'none',
    }
    blocks = {}
    seen = set()
    for r in range(1, ws.max_row + 1):
        for c in [1, 7]:  # 雙位置
            v = ws.cell(r, c).value
            if not isinstance(v, str): continue
            for label, sc in label_to_sc.items():
                if label in v and sc not in seen:
                    # Y1 起點 = header 後 +5 行內 col1=1 且 col2 是數字
                    for r2 in range(r + 1, r + 15):
                        if ws.cell(r2, 1).value == 1 and isinstance(ws.cell(r2, 2).value, (int, float)):
                            blocks[sc] = r2
                            seen.add(sc)
                            break
                    break
    return blocks  # {'mid': 17, 'low': 155, 'none': 293}  例
```

### 規則 C9：區塊終止判斷

每區塊到 110 歲止（Y1-Y110，共 110 列）。終止條件：

```python
def extract_block(ws, y1_row):
    rows = []
    prev_y = 0
    for r in range(y1_row, ws.max_row + 1):
        v1 = ws.cell(r, 1).value
        if not isinstance(v1, (int, float)): break  # 進到下個區塊的 header
        y = int(v1)
        if y < prev_y: break  # 跨入下個區塊的 Y1
        prev_y = y
        rows.append(...)
```

### 規則 C9a：read_only 模式效能

`openpyxl.load_workbook(read_only=True)` 模式下，反覆呼叫 `ws.cell(r, c)` 會極慢（每次都 re-stream sheet XML）。**必須**先把整 sheet 快取進 list：

```python
def cache_sheet(ws):
    return list(ws.iter_rows(values_only=True))  # 0-indexed tuple list

cached = cache_sheet(ws)
v = cached[r-1][c-1]  # 1-indexed access
```

實測：不快取時抽單檔約 30-60 秒，快取後 < 5 秒。

---

## 5. 欄位映射

### 規則 C10：whole_life 欄位（`商品利益說明表`）

```
col 1 = y           (保單年度)
col 2 = age         (保險年齡, Y75+ 後可能 None)
col 3 = prem_year   (折扣後實繳保險費，當年)
col 4 = cum_prem    (累計折扣後實繳保險費)        ← cum_prem
col 5 = death_benefit (年度末身故/完全失能保障 base)  ← death_benefit
col 6 = cv_basic    (年度末解約金/祝壽保險金 base)   ← cv_basic
col 7 = div_year    (增額分紅保額_當年, C 欄)        ← scenarios.{sc}.dividend_year
col 8 = div_cum_inc_db (累積已分配增額分紅保額_身故 D)
col 9 = div_long_db    (長青額外分紅保額_身故 E)
col 10 = div_cum_inc_cv (累積已分配增額分紅保額_解約 F)
col 11 = div_long_cv   (長青解約額外分紅保額 G)
col 12 = db_with_div  (年度末壽險保障+假設紅利 = A+D+E)  ← scenarios.{sc}.db_with_dividend
col 13 = cv_with_div  (年度末可能領取解約金總和 = B+F+G)  ← scenarios.{sc}.cv_total
```

### 規則 C11：endowment 欄位（`建議書`）

```
col 1 = y
col 2 = age
col 3 = prem_year
col 4 = cum_prem                              ← cum_prem
col 5 = survival_benefit_year                 ← survival_benefit_year (還本特有)
col 6 = death_benefit (壽險保障 base, B)       ← death_benefit
col 7 = cv_basic    (解約金 base, C)            ← cv_basic
col 8 = div_year    (年度保單紅利, D)            ← scenarios.{sc}.dividend_year
col 9 = div_cum     (累積已領年度紅利, E)        ← scenarios.{sc}.dividend_cum
col 10 = final_div_db (終期紅利_身故, F)
col 11 = final_div_cv (終期紅利_解約, G)
col 12 = A+D 生存金+年度紅利
col 13 = db_with_div  (B+F 壽險+終期紅利)        ← scenarios.{sc}.db_with_dividend
col 14 = C+G 解約+終期紅利
col 15 = H 累積壽險
col 16 = cv_with_div  (I 累積解約+生存金+紅利)   ← scenarios.{sc}.cv_total
```

### 規則 C12：cv_total 主層

主層的 `cv_total`（不在 scenarios 內）統一取 **`scenarios.none.cv_total`**（保證情境）：

```python
for row in schedule:
    if 'none' in row['scenarios']:
        row['cv_total'] = row['scenarios']['none']['cv_total']
```

### 規則 C13：survival_benefit_cum 累計（還本商品）

`建議書` sheet 沒有「累計生存金」欄，需自行累加：

```python
if kind == 'endowment':
    cum_surv = 0
    for row in schedule:
        cum_surv += row.get('survival_benefit_year') or 0
        if cum_surv > 0:
            row['survival_benefit_cum'] = round(cum_surv, 2)
```

---

## 6. plan_code 抽取

### 規則 C14：plan_code 來源

**唯一可信來源**：`面頁` sheet R4C6（標籤在 R4C3 = "商品代號"）。

```python
def find_plan_code(wb):
    if '面頁' in wb.sheetnames:
        ws = wb['面頁']
        for r in range(1, 10):
            if ws.cell(r, 3).value == '商品代號':
                v = ws.cell(r, 6).value
                if isinstance(v, str) and re.match(r'^[A-Z]{3}\w+', v):
                    return v
    return None
```

**禁止**用 `Product_Inf` 或 `Product_Code` sheet 抽 plan_code：
- `Product_Inf` 是「**這個檔可選的所有商品代號清單**」（多商品共用模板），不是當前商品的代號
- `Product_Code` 是內部短碼（SIxTS/SIxHR 等），不是對外的 plan_code

**禁止**用 `ProductMain` 抽 plan_code：該 sheet R2C8 在某些檔（如滿億）顯示其他商品的代號（PCT01A01），不是當前商品。實測：滿億 ProductMain R2C8 = `PCT01A01` 但實際是 `PCT03A01`。

### 規則 C15：6 檔 plan_code 對照表

| 商品 | plan_code | 幣別 | 期 | kind |
|---|---|---|---|---|
| 美吉鴻運 | PRU02A21 | USD | 7 | whole_life |
| 美添鴻運 | PRU01A21 | USD | 2 | whole_life |
| 鴻運旺旺來 | PRT01A01 | TWD | 6 | whole_life |
| 鴻運滿億 | PCT03A01 | TWD | 2 | endowment |
| 鴻運金喜 | PRT02A01 | TWD | 2 | whole_life |
| 鴻運雙享 | PCT01A01 | TWD | 2 | endowment |

`product_id` 欄位寫 plan_code（不加 company 前綴，與其他公司一致）。

---

## 7. 基準參數抽取

### 規則 C16：base 區位置（多 sheet fallback）

不同 Cardif 檔的 base info（保額/保費/年期/年齡/性別/幣別）放在**不同 sheet 跟不同 row**。**禁止**只查單一 sheet — 必須按優先序嘗試多個 sheet：

| 優先序 | sheet | base info 列範圍 | 適用商品 |
|---|---|---|---|
| 1 | `商品利益說明表`（無「不含紅利」） | R3 / R5 / R7 / R9 | 終身壽 4 檔（美吉/美添/旺旺來/金喜） |
| 2 | `商品利益說明表(不含紅利部分)`（無空格） | R8 / R10 / R12 / R14 | 部分檔 |
| 3 | `商品利益說明表(不含紅利部分) `（有尾端空格） | R8 / R10 / R12 / R14 | display sheet 變體 |
| 4 | `商品利益說明表_(不含紅利部分) `（帶底線+空格） | R8 / R10 / R12 / R14 | 還本 2 檔（滿億/雙享）|
| 5 | `建議書` | （多半沒 base info）| 最後 fallback |

**特別注意**：滿億跟雙享**沒有** `商品利益說明表` 這個 sheet，他們的 base info 在 `商品利益說明表(不含紅利部分)`（無空格、164×26）的 R8 / R10 / R12 / R14。

### 規則 C16a：保額/保費 keyword 變體

不同 sheet 的標籤用詞略不同，regex 要能涵蓋：

| 概念 | 至少要支援的 keyword |
|---|---|
| 保額 | `保額：` / `保險金額：` |
| 原始保費 | `首期原始保費：` / `每期原始保費：` |
| 折扣後保費 | `首期折扣後保費：` |
| 折扣率 | `首期繳費折扣：` / `首期 /續期繳費折扣：` |

```python
m = re.search(r'保額：([\d,]+)', v) or re.search(r'保險金額：([\d,]+)', v)
m = re.search(r'首期原始保費：([\d,]+)', v) or re.search(r'每期原始保費：([\d,]+)', v)
```

### 規則 C16b：性別字串變體

| 來源 | 寫法 |
|---|---|
| 商品利益說明表 R7 | `男/36歲` |
| 商品利益說明表(不含紅利部分) R10 | `男性 / 36歲` |

regex：`r'性別/年齡：(男性?|女性?)\s*/\s*(\d+)歲'`（`性?` 讓「性」可選，`\s*` 容忍空格）。

### 規則 C16c：完整 extract_base_params 流程

```python
def extract_base_params(wb, kind):
    candidate_sheets = [
        '商品利益說明表',
        '商品利益說明表(不含紅利部分)',
        '商品利益說明表(不含紅利部分) ',  # 帶空格
        '商品利益說明表_(不含紅利部分) ',  # 帶底線+空格
        '建議書',
    ]
    base = {}
    for sn in candidate_sheets:
        if sn not in wb.sheetnames: continue
        ws = wb[sn]
        for r in range(1, 21):
            for c in range(1, ws.max_column + 1):
                v = ws.cell(r, c).value
                if not isinstance(v, str): continue
                # 各種 regex (見規則 C16a / C16b)
                ...
        # 若關鍵欄位齊了就停
        if all(k in base for k in ('base_sa', 'base_premium', 'period', 'base_age', 'base_sex')):
            break
    if base.get('base_premium') and base.get('base_premium_gross'):
        base['discount'] = round(1 - base['base_premium'] / base['base_premium_gross'], 4)
    return base
```

### 規則 C17：discount 必為 ≥ 0.01

Cardif 商品的「**首期繳費折扣**」（金融機構自動轉帳/銀行匯款 1%）幾乎不會 0。若 `discount` 算出 0 或負數 → fill+recalc 沒生效，回 Step C5 重做。

### 規則 C18：mid_dividend_rate 處理

Cardif Excel 內**不明列**中分紅率。預設值：

```python
mid_dividend_rate = 0.055 if currency == 'USD' else 0.045
```

**必須**在 JSON 輸出標 `_dividend_rate_source: "industry_default_⚠️_pending_DM_verification"`，並在 manifest 待校對清單列出。

---

## 8. db_pattern 偵測

### 規則 C19：stepped 偵測

「定期給付型」商品中，Y1 死亡保障 ≪ SA 是 stepped 階梯保障的特徵。Cardif 還本商品的 Y2 db 也常跳很大（因累計分紅造成壽險保障跳階）。

**自動偵測規則**：

```python
def detect_db_pattern(schedule, base_sa):
    if not schedule or not base_sa: return None
    y1_db = schedule[0].get('death_benefit') or 0
    y2_db = schedule[1].get('death_benefit') if len(schedule) > 1 else y1_db
    if y1_db < base_sa * 0.95: return 'stepped'           # Y1 即已階梯
    if y2_db and y1_db and y2_db > y1_db * 1.5: return 'stepped'  # Y2 跳躍式成長
    return None
```

### 規則 C19a：6 檔實測 db_pattern 結果

| 商品 | Y1 db | base_sa | Y2/Y1 | 標記 |
|---|---|---|---|---|
| 美吉鴻運 | 8,961 | 100,000 | 2.02× | **stepped** (Y1 < SA × 0.95) |
| 美添鴻運 | 100,000 | 100,000 | 2.00× | **stepped** (Y2/Y1 = 2.0×) |
| 鴻運旺旺來 | 102,714 | 1,000,000 | 2.00× | **stepped** (Y1 < SA × 0.95) |
| 鴻運滿億 | 844,787 | 1,000,000 | 2.14× | **stepped** (Y1 < SA × 0.95) |
| 鴻運金喜 | 1,000,000 | 1,000,000 | 1.00× | （不標記,前端視為 normal） |
| 鴻運雙享 | 1,000,000 | 1,000,000 | 1.84× | **stepped** (Y2/Y1 = 1.84×) |

**結論**：6 檔中 5 檔是 stepped，僅金喜是 normal。商品名含「**(定期給付型)**」幾乎都是 stepped 商品。

### 規則 C19b：「定期給付型」商品最後保險

若商品名含「**(定期給付型)**」字樣但 `detect_db_pattern` 回 None（兩條件都不觸發），需**人工審查 Y(period+1) 的 db 軌跡**：

```python
if '定期給付型' in product_name and not db_pattern:
    period_plus_1 = next((r for r in schedule if r['y'] == period + 1), None)
    if period_plus_1 and period_plus_1.get('death_benefit'):
        if period_plus_1['death_benefit'] > base_sa * 1.3:
            db_pattern = 'stepped'  # 人工審查確認
```

---

## 9. JSON 輸出 schema（Cardif 專屬）

### 規則 C20：whole_life schema

```json
{
  "meta": {
    "product_id": "PRU02A21",
    "company": "Cardif",
    "product_name": "美吉鴻運外幣分紅終身壽險(定期給付型)",
    "currency": "USD",
    "period": 7,
    "engine": "prudential_v2",
    "base_sex": "M",
    "base_age": 36,
    "base_sa": 100000,
    "base_premium": 8613,
    "base_premium_gross": 8700,
    "discount": 0.01,
    "declared_rate": 0,
    "mid_dividend_rate": 0.055,
    "_dividend_rate_source": "industry_default_⚠️_pending_DM_verification",
    "min_sa": 10000,
    "max_sa": 5000000,
    "max_age": 75,
    "db_pattern": "stepped",
    "source_file": "公版_美吉鴻運建議書_V1_0_0_0.xls",
    "extracted_at": "YYYY-MM-DD"
  },
  "schedule": [
    {
      "y": 1,
      "age": 36,
      "cum_prem": 8613,
      "cv_basic": 2622,
      "death_benefit": 8961,
      "cv_total": 2622,
      "scenarios": {
        "mid":  { "dividend_year": 0, "db_with_dividend": 8961, "cv_total": 2622 },
        "low":  { "dividend_year": 0, "db_with_dividend": 8961, "cv_total": 2622 },
        "none": { "dividend_year": 0, "db_with_dividend": 8961, "cv_total": 2622 }
      }
    }
  ]
}
```

### 規則 C21：endowment schema（多 `is_endowment` + 還本欄位）

```json
{
  "meta": {
    "...": "...",
    "is_endowment": true
  },
  "schedule": [
    {
      "y": 1,
      "age": 36,
      "cum_prem": 793910,
      "cv_basic": 385657,
      "death_benefit": 844787,
      "survival_benefit_year": 13783,
      "survival_benefit_cum": 13783,
      "cv_total": 385657,
      "scenarios": {
        "mid": {
          "dividend_year": 0,
          "dividend_cum": 0,
          "db_with_dividend": 844787,
          "cv_total": 399440
        },
        "low":  { "...": "..." },
        "none": { "...": "..." }
      }
    }
  ]
}
```

---

## 10. Step 4 自洽性驗證（Cardif 專屬）

在 v4.0 通用驗證之外，Cardif 額外要驗：

### 驗證 C-V1：Y1-Y(period-1) 三情境一致
分紅 Y(period) 起才生效。前 (period-1) 年三情境的 `db_with_dividend` 跟 `cv_total` 應**完全相等**。

```python
period = meta['period']
for row in schedule:
    if row['y'] < period:
        m = row['scenarios']['mid']
        l = row['scenarios']['low']
        n = row['scenarios']['none']
        assert m['db_with_dividend'] == l['db_with_dividend'] == n['db_with_dividend'], \
            f"Y{row['y']} 三情境 db 不一致 — fill+recalc 可能失敗"
```

**例外**：滿億、雙享是 2 年期還本，Y1 起就有 col 8 (生存金) ≠ 0，但 dividend_year 仍應 Y1=0。

### 驗證 C-V2：cum_prem 階梯
Y1 cum_prem ≈ base_premium，Y(period) cum_prem ≈ base_premium × period，Y(period+1) 起 cum_prem 不變。

```python
expected_y1 = meta['base_premium']
assert abs(schedule[0]['cum_prem'] - expected_y1) < 2, "Y1 cum_prem 不對"
expected_yp = meta['base_premium'] * meta['period']
yp_row = next(r for r in schedule if r['y'] == meta['period'])
assert abs(yp_row['cum_prem'] - expected_yp) < meta['period'] * 2, "Y(period) cum_prem 不對"
```

### 驗證 C-V3：plan_code 與檔名相符
建表（規則 C15）對照，避免抓錯 sheet。

---

## 11. 速查表

```
公司名: Cardif (固定)
引擎: prudential_v2 (固定)
信任的 plan_code: 面頁 R4C6
SA 標準試算: USD 寫 10 (=10萬USD), TWD 寫 100 (=100萬TWD)
SA 輸入位置: 美吉/滿億 D24, 其他 D22
schedule sheet: 終身壽=商品利益說明表, 還本=建議書
三情境 header col: 終身壽=col 7, 還本=col 1
三情境 keyword: 中分紅 / 低分紅 / 「可能紅利為零」OR「零分紅」
mid_dividend_rate: USD 0.055, TWD 0.045 (預設+標⚠️)
重算工具: LibreOffice headless (timeout 600s/檔)
.xls 來源: 需先 fix_autofilter
read_only 模式: 必須先 cache_sheet 再 index access (避免反覆 ws.cell())
```

---

## 12. 驗證憑證 (本 delta 已驗證)

跑 batch_extract.py 對 6 檔測試結果（2026-05-07）：

```
批次完成: 成功 6 / 失敗 0
  ✅ PRU02A21   美吉鴻運外幣分紅終身壽險(定期給付型)        period=7  schedule=74  (USD)
  ✅ PRU01A21   美添鴻運外幣分紅終身壽險(定期給付型)        period=2  schedule=74  (USD)
  ✅ PRT01A01   鴻運旺旺來終身壽險(定期給付型)             period=6  schedule=74  (TWD)
  ✅ PCT03A01   鴻運滿億分紅終身保險(定期給付型)            period=2  schedule=74  (TWD, endowment)
  ✅ PRT02A01   鴻運金喜分紅終身壽險(定期給付型)            period=2  schedule=74  (TWD)
  ✅ PCT01A01   鴻運雙享終身保險(定期給付型)              period=2  schedule=74  (TWD, endowment)
```

**全部 0 warnings**（自洽性驗證 C-V1 / C-V2 全通過）。

抽取耗時（單檔，扣除 fill+recalc）：< 5 秒/檔。
fill+recalc 耗時：1-5 分鐘/檔（檔案大小決定）。

---

## 附錄 A：v4.0 哪些規則被本 delta 覆蓋

| v4.0 規則 | Cardif 變更 |
|---|---|
| Step 0 結構辨識 | 加 Cardif 觸發條件（規則 0） |
| Step 0.5 LibreOffice 重算 | 變成**強制執行**（規則 C5） |
| Step 1 plan_code 抽取 | 改用 `面頁 R4C6` 唯一信任源（規則 C14） |
| Step 1 product_name 去前綴 | 加「法商法國巴黎人壽」「法國巴黎人壽」前綴（規則 C2） |
| 絕對禁止規則 #13（不抽 #VALUE!）| 擴展為「不抽空白模板」（規則 C4） |
| 絕對禁止規則 #6（不猜欄位）| Cardif 欄位映射查表（規則 C10/C11） |

未列入的 v4.0 規則維持原樣。

## 附錄 B：本 delta 沒涵蓋的 Cardif 商品

本 delta 只驗證了 6 檔（美吉/美添/旺旺來/滿億/金喜/雙享）。未來遇到其他 Cardif 商品時：
- 若 plan_code 開頭是 `PRU` / `PRT` → 大概率 whole_life，套規則 C10
- 若 plan_code 開頭是 `PCT` → 大概率 endowment，套規則 C11
- 若以上都不對 → 停下來人工核對，不要硬套
