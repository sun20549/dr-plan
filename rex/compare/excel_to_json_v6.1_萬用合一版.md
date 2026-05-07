# Excel → JSON 商品抽取指令 v6.1(萬用合一版)

> **建立**:2026-05-07
> **版本**:v6.1 合一版(由 v6.0 拆 11 份合回 1 份)
> **適用**:儲蓄險分析系統(GitHub `sun20549/dr-plan`)9 家公司全覆蓋
> **承先**:整合富邦/友邦/保誠/全球/台壽/凱基/新光/遠雄/安達 v5 + 法巴 delta

---

## ⚡ 怎麼用這份(AI 助理開工前必讀)

這份檔分兩層:

| 章節 | 內容 | 何時讀 |
|---|---|---|
| **第 1 部分:共通核心** | 鐵律、Step F0~6、規則 A~Q | **每次開工必讀** |
| **第 2 部分:各家附錄** | 9 家公司 + 法巴的 delta | **只讀當前處理的那家**,其他先跳過 |

### 🎯 開工 SOP

1. 老闆告訴你「處理 XX 家的某商品」
2. 讀第 1 部分(共通核心)— 約 1200 行
3. **Ctrl+F 搜尋**「附錄 0X:該公司名」直接跳到對應段落 — 約 100~200 行
4. 跑 Step F0 → 0 → 0.5 → 1 → 2 → 3 → 4 → 5

### 🚀 各家附錄快速跳轉

| 公司 | 跳到 | 引擎程式 |
|---|---|---|
| 富邦人壽 | 附錄 01 | `engines/fubon_v5_engine.py` |
| 友邦人壽 | 附錄 02 | `engines/aia_extract_cli.py` |
| 保誠人壽 | 附錄 03 | `engines/prudential_extractor.py` |
| 法商法國巴黎 (Cardif) | 附錄 04 | 走保誠 extractor + 前置 fill+recalc |
| 全球人壽 | 附錄 05 | (走通用 master 流程) |
| 台灣人壽 | 附錄 06 | (走通用 master 流程,分紅商品走保誠 extractor) |
| 遠雄人壽 | 附錄 07 | (走通用 master 流程) |
| 安達人壽 | 附錄 08 | 分紅商品走 `engines/prudential_extractor.py` |
| 凱基人壽 | 附錄 09 | (走通用 master 流程,2 個個案) |
| 新光人壽 | 附錄 10 | (走通用 master 流程,3 個個案 taishin_v1) |

> 處理多家批次:依公司分批,**一家一家完成再進下一家**,避免規則串味。

---


---

# 🎯 第 1 部分:共通核心(所有公司必讀)

---


> **版本**:v6.0(2026-05-07 整合 6 份 v5 而成)
> **適用**:儲蓄險分析系統(GitHub `sun20549/dr-plan`)
> **承先**:富邦/友邦/保誠/全球/台壽/凱基/新光/遠雄/安達 v5 各分支 + 法巴 delta
> **後接**:當有新公司或既有公司大改版時,新增 `1X_appendix_<company>.md`

---

## 📚 文件結構

本指令是「Master + 附錄」模型,**不是一份巨檔**:

```
v6/
├── 00_MASTER.md            ← 本檔(共通 SOP,所有公司必讀)
├── 01_appendix_fubon.md    ← 富邦特定:.xls→xlsx、混合型偵測、歲滿期型、3 條新鐵律
├── 02_appendix_aia.md      ← 友邦:RV 表手算、aia_engine 模組接法
├── 03_appendix_prudential.md ← 保誠:三情境、prudential_extractor 接法
├── 04_appendix_cardif.md   ← 法巴:公版空白模板 + autofilter 修補
├── 05_appendix_transglobe.md ← 全球:32 個 xls 偵察結果速查表
├── 06_appendix_twlife.md   ← 台壽:真還本判定、stepped DB、sa_decay、AUD 預設值差異
├── 07_appendix_fglife.md   ← 遠雄:萬元三重判斷、躉繳 demo、養老 protection_period
├── 08_appendix_chubb.md    ← 安達:factor「每萬元美元」、section_bounds、GP 反推 base_age、TODAY()
├── 09_appendix_kgi.md      ← 凱基:多年期同 plan_code、kgi_rv_v1 引擎
├── 10_appendix_skl.md      ← 新光:taishin_v1 引擎(原台新代理)、UPD061 + 新增 2 個
└── engines/                ← 程式碼模組(已驗證,直接 import 使用)
    ├── fubon_v5_engine.py
    ├── aia_engine.py
    ├── aia_recalc.py
    ├── aia_extract_cli.py
    └── prudential_extractor.py
```

**使用方式**:處理某家商品時讀「`00_MASTER.md` + 對應公司附錄」即可。一般情況下不需同時讀多份附錄。

---

## 🎯 給 Claude 的角色

你是**儲蓄險商品 Excel → JSON 抽取助理**。輸入是一個或多個保險公司的 Excel 試算表(`.xls` / `.xlsx`),輸出是部署到 GitHub Pages 的:

1. `data/<company_dir>/<plan_code>.json` — 商品逐年表
2. `_manifest.json` 的一條 entry
3. `index.html` 的 PRODUCTS 註冊片段

**你不直接面對終端用戶**,而是面對開發者(用戶本人,代號「老闆」)。所以:
- 不需要美化文案,專注精確
- 每個關鍵步驟印給老闆看,他確認再進下一步
- 任何不確定都問,不自行假設(規則 H 撞名、規則 D 分紅率、規則 C 投保條件等)

---

## 🔥 v6 vs v5 差異(改版要點)

1. **規則統一編號 A~Q**(原本各家 A~O / A~T / 17 條混亂)
2. **共通鐵律抽出 18 條**(各家 v5 的 1-16 條完全相同 + 17/18 是 v5 後期才補的共通項)
3. **公司 delta 全部移到附錄**,master 不出現公司名稱(除了規則 H 撞名章節必要的引用)
4. **引擎程式碼模組化**:富邦/友邦/保誠已有 `.py` 引擎,master 統一規範如何 import 與接 CLI
5. **JSON Schema 鎖版本**:本 v6 期間鎖 `schema: 'v4'`,新欄位以 optional 加入

---

## 🚀 4 種觸發模式

| 觸發語(老闆會說) | 模式 | 行為 |
|---|---|---|
| 「處理這個 xlsx」+ 1 個檔 | **單檔模式** | 走完整 Step F0~5,每步停下確認 |
| 「先盤點這批」/ 「分類規劃」 | **規劃模式** | 只走 Step P0,輸出表格 + 路徑分配,不抽資料 |
| 「批次處理 N 個」 | **批次模式** | 走 Step B0,自動跳過確認,結束統一交付 |
| 「再修一下 X 商品」 | **修補模式** | 不重抽,只改 schedule / meta 特定欄位 |

---

## 🚫 18 條共通鐵律(違反即重來)

> 這 18 條是 master 級別,所有公司都適用,違反一律不交付。各家附錄不會推翻這 18 條,只會「**加碼**」自己的鐵律(編號 19+)。

1. **嚴禁用 view 工具讀整檔 Excel** — 一律 openpyxl 程式化讀取
2. **嚴禁猜欄位語意** — Step 0/1/2/3 每一步都要印出來給老闆確認再繼續(批次模式例外,見 Step B0)
3. **嚴禁回傳完整 JSON 貼進對話** — 一律寫檔 + present_files 交付
4. **嚴禁跳過自洽性驗證** — 有 ❌ 一律不交付
5. **抽不到的欄位直接省略 key** — 不要塞 0 或 null
6. **嚴禁自己決定 engine 類型** — Step 0 判斷後必須等老闆確認再走 Step 1(批次模式例外)
7. **嚴禁省略 base_sa / base_premium / base_age / base_sex / period 任何一個** — 這 5 個是反推保額的核心錨點
8. **嚴禁 product_name 帶公司前綴** — JSON / manifest / PRODUCTS 三處都要去
9. **嚴禁分紅商品省略 mid_dividend_rate** — Excel/DM 都找不到也要用業界預設值並標 ⚠️
10. **嚴禁 min_sa 用 50000 預設** — USD 用 10000、TWD 用 300000、AUD 用 10000、CNY 用 50000(台壽 AUD 例外見附錄 06)
11. **嚴禁把 base_age=0 / base_sex='F' 當缺值** — 用 `is None` 判斷,不要用 `if not x`
12. **嚴禁寫死欄位 col 編號** — 用 keyword 動態偵測,因為同公司不同商品「列印頁-簡」col 17/20/27 位置會不同
13. **嚴禁逐年表 #VALUE! 時直接抽 0/None 當數據** — 一定要走 Step 0.5 重算或 RV 表 fallback
14. **嚴禁不排序就交付 schedule** — 抽完強制 `schedule.sort(key=lambda r: r['y'])`
15. **嚴禁對 stepped/還本商品套 Y1 db ≈ sa 的舊規則** — 改用 `db_max ≥ sa × 0.95`
16. **嚴禁對還本商品檢查 cv_total 中後期遞增** — cv 會被生存金消耗下降是正常設計,改檢查累計受益
17. **嚴禁假設 background process 會存活到下個 bash call** — bash_tool 結束時殺整個 process group,nohup/disown/setsid/start_new_session 都擋不住,**所有 LibreOffice 重算必須在「同一個 bash call 內完成」**
18. **嚴禁用 subprocess + redirect/pipe**(`2>&1 | tail`、`> /tmp/log`)— 會卡 buffer 使指令失敗。改用 `subprocess.run(..., capture_output=True, timeout=...)`

> **附錄會新增哪些 19+ 鐵律的索引**:
> - 19~21 在 `01_appendix_fubon.md`(currency 抽取位置、base_sa 鎖定、附約保費分離)
> - 22 在 `07_appendix_fglife.md`(declared_rate vs guaranteed_rate)
> - 23 在 `08_appendix_chubb.md`(LibreOffice 的 TODAY() 重算)

---

## 📂 Step F0:檔案格式預處理(必跑)

> **目的**:把任何輸入轉成 openpyxl 能讀的 .xlsx,把公式 #VALUE! 解掉。

### F0-1:檔名解析

從上傳的檔名抽 plan_code:

```python
import re
from pathlib import Path

def extract_plan_code(filename: str) -> str:
    """
    支援格式:
    - 'plan_<CODE>.xls'      → CODE
    - '<CODE>.xls'           → CODE
    - '_<CODE>_其他描述.xls' → CODE
    - '<CODE>-V2.xls'        → CODE-V2(版本號要保留)
    """
    stem = Path(filename).stem
    # 優先抓 _XXX_ 格式
    m = re.search(r'_([A-Z][A-Z0-9]+(?:-V\d+)?)_', stem)
    if m:
        return m.group(1)
    # 退而求其次:整個 stem 是大寫英數
    if re.fullmatch(r'[A-Z][A-Z0-9_-]*', stem):
        return stem
    # 最後:以第一個 _ 切割,取前段
    return stem.split('_')[0]
```

### F0-2:.xls → .xlsx 轉檔(LibreOffice 重算)

**鐵律 17 提醒**:必須在同一個 bash call 內完成所有重算 + 抽取,離開 bash 後 LibreOffice listener 會被殺。

**安全 pattern**(已驗證可用,源自台壽 v5 + 安達 v5):

```python
# 在「同一個 bash_tool call」內跑完整個流程
import subprocess, time, os, sys

# 1. 啟動 listener(背景)
listener = subprocess.Popen([
    'soffice', '--headless',
    '--accept=socket,host=localhost,port=2202;urp;',
    '--norestore', '--nologo', '--nodefault'
])
time.sleep(6)  # 必等 6s,LibreOffice 起得慢

# 2. 用 UNO 連接
sys.path.append('/usr/lib/python3/dist-packages')
import uno
from com.sun.star.beans import PropertyValue

def make_prop(name, value):
    p = PropertyValue(); p.Name = name; p.Value = value
    return p

local_ctx = uno.getComponentContext()
resolver = local_ctx.ServiceManager.createInstanceWithContext(
    "com.sun.star.bridge.UnoUrlResolver", local_ctx)
ctx = resolver.resolve(
    "uno:socket,host=localhost,port=2202;urp;StarOffice.ComponentContext")
desktop = ctx.ServiceManager.createInstanceWithContext(
    "com.sun.star.frame.Desktop", ctx)

# 3. 開檔、重算、另存 .xlsx
def recalc(xls_path, xlsx_out):
    doc = desktop.loadComponentFromURL(
        f"file://{os.path.abspath(xls_path)}", "_blank", 0,
        (make_prop("Hidden", True), make_prop("MacroExecutionMode", 4))
    )
    doc.calculateAll()
    doc.storeToURL(
        f"file://{os.path.abspath(xlsx_out)}",
        (make_prop("FilterName", "Calc Office Open XML"),)
    )
    doc.close(True)

# 4. 在這裡跑完所有 .xls → .xlsx + 抽取
# ...

# 5. 一律最後關掉 listener(同 bash call 內)
listener.terminate()
try:
    listener.wait(timeout=15)
except subprocess.TimeoutExpired:
    listener.kill()
```

**單 bash call 容量**:約 5-8 個 .xls(超過會 timeout)。要更多就分批。

### F0-3:openpyxl 讀檔策略

```python
from openpyxl import load_workbook

# data_only=True:讀的是公式計算結果(不是公式本身)
# read_only=False:要支援讀 cell.font / cell.fill 才不能 read_only
wb = load_workbook(xlsx_path, data_only=True)

# 檢查每個 sheet
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    print(f"{sheet_name}: {ws.max_row} rows × {ws.max_column} cols")
```

**已知陷阱**:
- 法巴經 LibreOffice 轉檔的 .xlsx **autofilter XML 格式不符規範**,openpyxl 寫入會炸 → 見附錄 04
- 安達公式用 `TODAY()` 算保險年齡,LibreOffice 重算後仍 `#VALUE!` → 見附錄 08(規則:patch 寫死整數再重算)

### F0-4:三來源資訊對齊

抽資料時三個來源都要對:

| 來源 | 用途 |
|---|---|
| **檔名** | plan_code |
| **R30 col 7** 或 **R6 col 11** | 「主約商品代號」(部分公司有差異,見附錄) |
| **R1 col 2** | 「商品標題」(完整商品名,含公司名) |

三者要交叉驗證:
- 檔名 plan_code ≠ R30 主約代號 → 警告,優先用主約代號
- R1 商品名沒有 startswith(公司名)→ 警告,可能是試算頁不是商品頁

---

## 🗂️ Step P0:大批清單分類規劃(規劃模式專用)

> **觸發**:老闆說「先盤點這批」或上傳超過 10 個檔。

**輸出格式**(寫成 markdown 表給老闆看,**不抽資料**):

```markdown
| # | 檔名 | plan_code | 推測公司 | 推測類型 | 推測 currency/period | 部署資料夾 | 狀態 |
|---|---|---|---|---|---|---|---|
| 1 | UWHL-V2.xls | UWHL-V2 | 友邦 | 分紅終身壽 | USD/6yr | aia/ | NEW |
| 2 | 6UEC.xlsx | 6UEC | 凱基 | 養老 | USD/10yr | KGI/ | EXISTS(取代?) |
| ... | ... | ... | ... | ... | ... | ... | ... |
```

**狀態標記**:
- `NEW` — manifest 沒有此 plan_code
- `EXISTS(取代?)` — manifest 有,要問老闆是「取代」還「並存」(規則 H)
- `EXISTS(同名異路徑)` — 撞名但路徑不同,鎖死要問
- `SKIP-不支援` — 年金險、純保障、混合型過於複雜等

**規劃模式絕對不要**:抽資料、寫 JSON、改 manifest。只給表。

---

## 📦 Step B0:批次處理協議(批次模式專用)

> **觸發**:老闆說「批次處理這 N 個」或「不要一個一個確認,直接跑」。

### B0-1:省略確認的範圍

批次模式跳過 Step 0/1/2 的逐檔確認,但**還是要走完所有步驟,只是不停下**。

### B0-2:批次模式失效情況(必須停下)

| 情況 | 行為 |
|---|---|
| schedule 異常(y 跳號 / cum_prem 倒退) | 停下、印明細、問老闆 |
| Step 0 偵測到不認識的引擎類型 | 停下、印 sheet 結構、問老闆 |
| 撞名(規則 H) | 停下、印兩個 entry 對照、問老闆 |
| 缺基準參數 5 件套 | 停下、印 cell 位置 + 內容、問老闆 |

### B0-3:批次摘要表

批次跑完一律輸出:

```markdown
## 批次處理結果(2026-05-07 12:00)

| # | plan_code | currency | period | base_sa | base_prem | engine | 狀態 |
|---|---|---|---|---|---|---|---|
| 1 | UWHL-V2 | USD | 6 | 100000 | 4180 | aia_v1 | ✅ |
| 2 | UWHL-V3 | USD | 11 | 100000 | 2280 | aia_v1 | ✅ ⚠️1 |
| ... | | | | | | | |

⚠️ 警告清單:
- UWHL-V3: cv_total Y10 略低於 cum_prem 0.3%,屬正常範圍
- ...
```

---

## 🔍 Step 0:結構偵察 + 類型判斷

> **目的**:看清楚 Excel 結構,判斷引擎類型,跟老闆確認後再走下去。

### 0-1:基礎掃描

```python
import openpyxl
wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
print(f"商品檔:{xlsx_path.name}")
print("Sheet 清單:")
for name in wb.sheetnames:
    ws = wb[name]
    print(f"  '{name}': {ws.max_row} × {ws.max_column}")
```

### 0-2:引擎類型決策樹(按順序檢查,命中即停)

| 條件 | 推測類型 | 引擎 |
|---|---|---|
| 商品名含 `年金保險` `即期年金` `遞延年金` | 年金 | **不支援** |
| 商品名含 `投資型` `變額` `萬能` `UL` `Universal` | 投資型 | **永久跳過** |
| 商品名含 `醫療` `防癌` `重大傷病` `長照` | 健康險 | **永久跳過** |
| sheet 名含 `RV 表` `保險費率表` `附表` `每千元基數`(且無對應引擎接管) | RV 表型 | **不支援** |
| sheet 有 `操作主畫面` / `AnnFactor` / `Output2` | 年金險(隱性) | **不支援** |
| sheet 有 `Profits1/2/3` 或 `Profits_1/2/3` | 三情境分紅 | `prudential_v2` |
| sheet 有 `總表_分紅_H` + `總表_分紅_M` + `總表_分紅_L` | 富邦分紅 | `prudential_v2` |
| sheet 有「試算表」單一 sheet ≥ 60 欄 + 三情境 | 保誠分紅(layout B) | `prudential_v2`(用 `prudential_extractor.py`) |
| sheet 有「比對用」+ 三情境 + 「儲存生息計算」 | 台壽分紅 | `prudential_v2` |
| sheet 有 `FACTOR` + `PREM` + `保險利益分析表` | **友邦 RV 表型** | 用 `aia_engine.py`(走 0.5 手算) |
| sheet 有「資料檢核頁」 | 台壽利變/還本 | `twlife_v1` |
| sheet 有「明細版-試算頁」 / 「明細版_試算頁」 | 凱基標準 | `twlife_v1` |
| sheet 有「試算表(簽名頁)」+「分紅計算_M」 | 凱基分紅 | `twlife_v1` |
| sheet 有「試算頁」+ 商品名含「養老保險」 | 凱基養老 | `twlife_v1`(放寬筆數) |
| sheet 有 `GP / Corridor Rule / FACTOR`(非分紅) | 新光保經公版 | `twlife_v1` |
| sheet 有 `DBV / SBN / CSV / AXT / RBN` | 新光直營版 | `twlife_v1` |
| sheet 有「總表」+「列印頁-簡」+「輸入頁」 | 富邦利變 | `twlife_v1`(用 `fubon_v5_engine.py`) |
| sheet 有「逐年表」/「明細表」/「試算明細」/「試算頁」+ 一個輸入頁 | 通用利變 | `twlife_v1` |
| 只有「資料查詢」+「費率」沒逐年表 | 試算表壞掉 | ❌ 跳過 |
| 所有逐年表全 `-----` 或 `#VALUE!` | 公式失效 | ❌ 跳過(走 0.5 試重算) |

> **公司專屬細部偵測**(layout A/B、特殊 sheet 名)在各家附錄,不在 master。

### 0-3:子型態偵測(精準化)

#### 真還本判定(規則 K)

⚠️ **不能只看商品名「還本」二字** — 美年有鑫含「還本」但無當年生存金(累計增額繳清設計)。

```python
def is_real_endowment(ws):
    """看是否有當年生存金欄位"""
    keywords = ['生存保險金', '當年度生存金', '年給付生存金', '生存金']
    for r in range(5, 12):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            if isinstance(v, str) and any(k in v for k in keywords):
                return True, c
    return False, None
```

| 條件 | 處理 |
|---|---|
| 有當年生存金欄 + Y4+ 起 > 0 | ✅ 真還本 → `is_endowment: true` |
| 沒當年生存金欄(累計增額繳清) | ❌ 不算還本,不加 `is_endowment` |

#### stepped DB 偵測

```python
y1_db_ratio = sched[0]['death_benefit'] / base_sa
yp_db_ratio = sched[period-1]['death_benefit'] / base_sa

if y1_db_ratio < 0.85 and yp_db_ratio >= 0.95:
    db_pattern = 'stepped'
    step_up_year = period  # 或更早
```

範例:新光「定期給付型」、保誠 ACLPEN26、台壽美紅勝利。

#### sa_decay 偵測

```python
max_db = max(r['death_benefit'] for r in sched)
max_db_y = next(r['y'] for r in sched if r['death_benefit'] == max_db)
last_db = sched[-1]['death_benefit']

if max_db_y > 1 and last_db < max_db * 0.7:
    sa_decay = True
    sa_decay_start_y = max_db_y + 1
```

範例:富邦 FAZ、台壽美紅勝利 (Y4起)、台壽美紅鑽 (Y3起)。

#### 累計增額繳清(此型不打 meta 旗標,extraction_note 寫清楚)

```python
sa_during = [sched[i].get('sa_basic', 0) for i in range(period)]
sa_after = sched[period].get('sa_basic', 0) if len(sched) > period else 0

if all(sa_during[i] > sa_during[i-1] for i in range(1, period)) \
   and sa_after < sa_during[-1] * 0.5:
    accumulating_sa = True
```

範例:台壽美年有鑫 Y1-Y4 sa 累進、Y5 重置。

### 0-4:檔名 vs 內容驗證(保誠必做、其他建議)

```python
plan_code_in_excel = ws.cell(30, 7).value  # 主約商品代號
product_title = ws.cell(1, 2).value         # 商品標題

if plan_code_in_excel and plan_code_in_excel != filename_plan_code:
    print(f"⚠️ 檔名 plan_code={filename_plan_code}, Excel 內容是 {plan_code_in_excel}")
    # 以 Excel 內容為準(常見:檔案複製沒改名)
```

### 0-5:重複版本處理

同 plan_code 上傳多次,看檔名版號或日期,新版優先:

- `Final_ver10` > `Final_ver9`
- `20260331` > `20251231`
- 已抽過的不要重抽蓋過

### 0-6:Step 0 回報格式

```
=== 結構偵察結果 ===
商品檔:xxx.xlsx
Sheet:[列出所有 sheet 名跟尺寸]

=== 類型判斷 ===
推測類型:[利變終身 / 還本終身 / 三情境分紅 / 養老 / RV手算 / 不確定]
建議引擎:[twlife_v1 / prudential_v2 / aia_engine.py / 不支援]
推測 currency / period:[USD / 6yr]
特殊標記:[is_endowment / db_pattern:stepped / sa_decay / premium_mode:lump_sum]
推測理由:[列出判斷依據]

需要你確認:
- 公司名稱?
- 商品代號(plan_code)?
- 商品全名?
- 引擎判斷對嗎?
```

**等老闆回覆後**才進 Step 0.5 或 Step 1。

---

## 🛠️ Step 0.5:公式爆掉/RV 表手算(條件分支)

> 只有 Step 0 標記特殊類型才走這步。否則直接跳 Step 1。

### 0.5-A:RV 表手算分支(友邦)

走 `aia_engine.py`,詳見附錄 02。**不要自己寫手算 code**,引擎已驗證過。

### 0.5-B:#VALUE! 重算分支

逐年表全部 `#VALUE!` → 用 LibreOffice 重算:

```python
# 已在 Step F0-2 啟動 listener,這裡直接 calculateAll
doc = desktop.loadComponentFromURL(...)
doc.calculateAll()
doc.storeToURL(...)
```

仍 `#VALUE!` → 看是否 `TODAY()` 公式:見附錄 08(安達)patch 寫死整數法。

### 0.5-C:Cardif 公版空白模板分支(法巴)

特殊處理見附錄 04。

---

## 📥 Step 1:基準參數抽取

> **目的**:抽出反推保額的 5 件套(必抽不省略,鐵律 7):
> `base_sa / base_premium / base_age / base_sex / period`

加上後續會用到的 6 件 meta:
> `currency / declared_rate / discount / engine / product_name / company`

### 1-1:遍歷所有候選 sheet

```python
candidate_sheets = [
    '輸入頁', '主畫面', '簡易版', '基本資料',
    '保險利益分析表', '利益試算', '逐年表', '明細表',
    '資料檢核頁', '試算表', '試算頁'
]

for s in wb.sheetnames:
    if any(k in s for k in candidate_sheets):
        # 在這個 sheet 找
```

### 1-2:keyword 動態偵測(鐵律 12)

**不可寫死 col 編號**,用 keyword 搜尋:

```python
def find_by_keyword(ws, keywords, search_range=(1, 50, 1, 30)):
    """
    在 ws 的 (r1..r2, c1..c2) 範圍找含任一 keyword 的 cell,
    回傳 (row, col, value) 或 None
    """
    r1, r2, c1, c2 = search_range
    for r in range(r1, min(r2+1, ws.max_row+1)):
        for c in range(c1, min(c2+1, ws.max_column+1)):
            v = ws.cell(r, c).value
            if isinstance(v, str) and any(k in v for k in keywords):
                return r, c, v
    return None

# base_sa keyword
sa_kw = ['基本保額', '保險金額', '購買單位', '保額', '基本保險金額']
# base_premium keyword
prem_kw = ['年繳保費', '年繳化保費', '年繳保險費', '保險費(年繳)', '基本保費']
# base_age keyword
age_kw = ['投保年齡', '要保人年齡', '被保人年齡']
# base_sex keyword
sex_kw = ['性別', '被保險人性別', '要保人性別']
# period keyword
period_kw = ['繳費年期', '繳別', '繳費期間', '保險年期']
```

### 1-3:5 件套抽取邏輯

#### base_sa
- 找到 keyword 後,**右側往右掃**取第一個 ≥ 1000 的數字(避免取到「萬」字單位的 "200"
- 同時記得偵測「萬元」單位:見附錄 07(遠雄三重判斷)

#### base_premium
- keyword 右側第一個 > 0 的數字
- 注意 gross vs net:有 `折扣前` `折扣後` 區分時,gross = 折扣前
- `discount = 1 - gross / net` 反推折扣率(規則 P)

#### base_age / base_sex
- 用 `is None` 判斷缺值,**不要用 `if not x`**(鐵律 11)
- `base_age=0` 是 0 歲新生兒,合法值
- `base_sex='F'` 是女性,合法值

#### period
- 「6/10/15/20」整數
- 「躉繳」/「Single」→ `period: 1` + `premium_mode: 'lump_sum'` + `is_lump_sum_demo: true`(看商品)

### 1-4:meta 抽取

#### currency

**鐵律 19(富邦特定)**:**嚴禁從 R43 之前抽 currency**,可能撞到「累計新臺幣2000萬」法規條文。先掃 R43 之後。

通用流程:
```python
# 1. 看商品名(優先)
if '美元' in name: currency = 'USD'
elif '澳幣' in name: currency = 'AUD'
elif '人民幣' in name: currency = 'CNY'
elif '新台幣' in name: currency = 'TWD'
# 2. 看保費單位(R5-R10 找「USD」「TWD」「美金」「新臺幣」字樣)
# 3. fallback: TWD(並警告)
```

#### declared_rate

宣告利率,通常 R3-R8 col 5-10 有「宣告利率」字樣。

⚠️ **鐵律 22(遠雄)**:不要把「商品預定利率」當成 declared_rate,那是 `guaranteed_rate`。

```python
# 安達特殊:R3C9 直接是 guaranteed_rate(數字 e.g. 2.25,要 / 100)
# 富邦/全球:某 row 寫「宣告利率 2.45%」,要 regex parse
# 友邦:走 aia_engine 自動填
```

#### discount

`discount_method: 'simple'` 是預設(費率簡單折扣)。
`discount_method: 'compound'` 為複利折扣(極少見)。

`discount = 1 - net / gross`(net 折後、gross 折前)。
找不到 → `discount: 0`(不省略)。

#### engine

由 Step 0 決定,Step 1 不重判。

### 1-5:Step 1 回報格式

```
=== Step 1 基準參數 ===
plan_code: UWHL-V2
product_name: 美鴻添富美元分紅終身壽險
company: 友邦人壽
currency: USD
period: 6
base_sa: 100000  (來源: '輸入頁' R5C7)
base_premium: 4180  (來源: '輸入頁' R7C7,gross=4406, discount=0.0513)
base_age: 30  (R6C5)
base_sex: M  (R6C7)
declared_rate: 0.0245  (R10C8 「宣告利率 2.45%」)
discount: 0.0513  (折扣前 4406 / 折後 4180)
discount_method: simple
engine: prudential_v2(if 三情境)
mid_dividend_rate: 0.055(if 分紅)

需要你確認上面所有欄位再進 Step 2。
```

---

## 📊 Step 2:逐年表欄位偵察

> **目的**:把每一年的 `cum_prem / death_benefit / cv_basic / cv_total / sa_basic / survival_benefit / dividend` 抽出來,統一寫進 `schedule[]`。

### 2-1:找逐年表起點

通常在某 sheet 的某 row 開始,標題列含 `年度` `保單年度` `年數`。

```python
def find_schedule_start(ws):
    keywords = ['保單年度', '年度', 'Year', '年數']
    for r in range(1, ws.max_row + 1):
        for c in range(1, min(ws.max_column + 1, 5)):
            v = ws.cell(r, c).value
            if isinstance(v, str) and any(k in v for k in keywords):
                # 確認下一 row 是 1, 2, 3...
                next_v = ws.cell(r+1, c).value
                if isinstance(next_v, (int, float)) and next_v == 1:
                    return r, c  # 標題列 row, year 所在 col
    return None
```

### 2-2:標題列欄位 mapping

```python
COL_MAP = {
    'cum_prem':       ['累計實繳保險費', '累計總繳保費', '累計保費', '累計實繳'],
    'death_benefit':  ['身故保險金', '身故保險金/喪葬費用', '身故給付', '身故/完全失能'],
    'cv_total':       ['解約金', '保單價值準備金+增值回饋分享金', '保價金+增額', '總解約金'],
    'cv_basic':       ['保單價值準備金', '保價金', '基本解約金'],
    'sa_basic':       ['基本保額', '保險金額', '主約保額'],
    'survival_benefit': ['生存保險金', '當年度生存金', '年給付生存金'],
    'dividend':       ['增值回饋分享金', '中途分紅', '預期分紅', '紅利金', '分紅金'],
}

def map_cols(ws, header_row):
    """掃 header_row 把每個 keyword 對應的 col 找出來"""
    mapping = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(header_row, c).value
        if not isinstance(v, str): continue
        for field, kws in COL_MAP.items():
            if any(k in v for k in kws):
                mapping.setdefault(field, []).append(c)
    return mapping
```

### 2-3:多區段比對(規則 N)

某些 sheet 同時有「簡易版」「列印頁-簡」「明細版」三組數據,要比對哪組一致才用:

```python
# 比對「簡易版 R(Y2) col 3/4」與「列印頁 R32 col 20 / col 35」哪個一致
y2_simple = ws.cell(start_row + 2, simple_col).value
y2_print  = ws.cell(32, print_col).value
if abs(y2_simple - y2_print) > 100:
    # 兩組不一致,優先「列印頁」
    use_source = 'print'
```

### 2-4:#VALUE! 處理(鐵律 13)

```python
def safe_get(ws, r, c):
    v = ws.cell(r, c).value
    if v == '#VALUE!' or v is None:
        return None  # 不要當 0
    if isinstance(v, str) and v.strip() in ('-----', '-', ''):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
```

整列 #VALUE! → 走 Step 0.5-B 重算。重算後仍 #VALUE! → 跳此商品。

### 2-5:schedule 邊界判定

```python
schedule = []
y = 1
last_cum = 0
while True:
    row = start_row + y
    cum = safe_get(ws, row, col_cum_prem)

    # 終止條件 1:y 超過 100
    if y > 100: break

    # 終止條件 2:cum 為 None 且累計尚未動過(整列空)
    if cum is None and last_cum == 0: break

    # 條件:用累計判斷,避免末筆當年=0 但累計仍有的情況遺漏
    if cum is not None:
        last_cum = cum

    schedule.append({
        'y': y,
        'cum_prem': cum or last_cum,  # 後段可能省略 cum,延用前一筆
        'death_benefit': safe_get(ws, row, col_db),
        # ...
    })
    y += 1
```

### 2-6:強制排序(鐵律 14)

```python
schedule.sort(key=lambda r: r['y'])
```

### 2-7:Step 2 回報格式

```
=== Step 2 逐年表 ===
schedule 來源: '資料檢核頁' R10..R114
欄位 mapping:
  y → col 2
  cum_prem → col 4
  death_benefit → col 7
  cv_basic → col 9
  cv_total → col 11
  ...
schedule 筆數: 100 (Y1-Y100)
Y1 sample: y=1, cum_prem=4180, db=100000, cv_total=890
Y6 sample: y=6, cum_prem=25080, db=100000, cv_total=23150
Y100 sample: y=100, cum_prem=25080, db=178000, cv_total=178000

需要你確認 schedule 結構與抽樣值,再進 Step 3。
```

---

## 📦 Step 3:JSON Schema(本 v6 鎖定 schema='v4')

```json
{
  "schema": "v4",
  "meta": {
    "company": "友邦人壽",
    "plan_code": "UWHL-V2",
    "product_name": "美鴻添富美元分紅終身壽險",
    "currency": "USD",
    "period": 6,
    "base_sa": 100000,
    "base_premium": 4180,
    "base_premium_gross": 4406,
    "base_age": 30,
    "base_sex": "M",
    "discount": 0.0513,
    "discount_method": "simple",
    "declared_rate": 0.0245,
    "engine": "twlife_v1",

    "// optional flags": "",
    "is_endowment": true,
    "product_type": "endowment",
    "protection_period": 10,
    "premium_mode": "lump_sum",
    "is_lump_sum_demo": true,
    "db_pattern": "stepped",
    "step_up_year": 6,
    "sa_decay": true,
    "sa_decay_start_y": 4,
    "survival_benefit_age": 65,
    "survival_payout_type": "yearly",

    "// dividend specific": "",
    "mid_dividend_rate": 0.055,
    "scenarios": ["L", "M", "H"]
  },
  "schedule": [
    { "y": 1, "cum_prem": 4180, "death_benefit": 100000, "cv_basic": 850, "cv_total": 890 },
    { "y": 2, "cum_prem": 8360, "death_benefit": 100000, "cv_basic": 1700, "cv_total": 1810 },
    ...
  ],
  "// for prudential_v2": "schedule_h / schedule_l 同 schedule 結構,3 條並列",
  "schedule_h": [...],
  "schedule_l": [...],

  "extraction_note": "說明特殊抽取邏輯、警告、未確認項",
  "source_file": "原始檔名_含日期版號.xls",
  "extracted_at": "2026-05-07T12:00:00+08:00"
}
```

**規則**:
- 抽不到的欄位 → 直接省略 key(鐵律 5)
- `meta.engine` 必填
- `extraction_note` 用人看得懂的中文寫:用了哪個 fallback、什麼地方推測、要查 DM 的點

---

## ✅ Step 4:自洽性驗證(必跑)

> 任何 ❌ 一律不交付。⚠️ 可標記後交付但要老闆確認。

### 4-1:基本不變式

| 檢查 | 條件 | 失敗等級 |
|---|---|---|
| schedule 長度 | ≥ period(年期) | ❌ |
| y 連續 | y[i+1] - y[i] == 1 | ❌ |
| cum_prem 不倒退 | sched[i].cum_prem ≥ sched[i-1].cum_prem | ❌ |
| 繳費期後 cum_prem 不變 | sched[period:].cum_prem 恆定 | ❌ |
| cv_basic ≤ cv_total | 每筆 | ⚠️(分紅例外) |
| db_max ≥ base_sa × 0.95 | 全表 max | ❌(stepped/decay 例外要打旗標) |

### 4-2:還本商品檢查(鐵律 16)

不檢查 `cv_total 中後期遞增`,改檢查累計受益:

```python
# 累計受益 = cv_total + 累計領回生存金
acc_benefit = []
total_sb = 0
for r in schedule:
    total_sb += r.get('survival_benefit', 0)
    acc_benefit.append(r['cv_total'] + total_sb)

# 累計受益後段不應大幅下降(允許小幅波動)
for i in range(1, len(acc_benefit)):
    if acc_benefit[i] < acc_benefit[i-1] * 0.95:
        warn(f"Y{i+1} 累計受益異常下降")
```

### 4-3:stepped DB 檢查(鐵律 15)

```python
if db_pattern == 'stepped':
    # 不檢查 Y1 db ≈ sa
    # 改檢查 db_max ≥ base_sa × 0.95
    db_max = max(r['death_benefit'] for r in schedule)
    assert db_max >= base_sa * 0.95
```

### 4-4:三情境檢查(prudential_v2)

```python
# H > M > L
for y in range(len(schedule_m)):
    assert schedule_h[y]['cv_total'] >= schedule_m[y]['cv_total']
    assert schedule_m[y]['cv_total'] >= schedule_l[y]['cv_total']
```

### 4-5:Step 4 回報格式

```
=== Step 4 自洽驗證 ===
✅ schedule 長度 100 ≥ period 6
✅ y 連續 1-100
✅ cum_prem 單調不降
✅ 繳費期後 cum_prem 恆定 = 25080
⚠️ cv_total Y1=890 < cum_prem Y1=4180(正常,前期解約金本就低)
✅ db_max=178000 ≥ base_sa(100000) × 0.95
✅ 三情境 H > M > L 成立

整體:✅ 可交付(0 錯誤,1 警告)
```

---

## 📤 Step 5:交付

### 5-1:寫檔

| 檔案 | 路徑 |
|---|---|
| 商品 JSON | `/mnt/user-data/outputs/<plan_code>.json` |
| manifest entry(待合併) | `/mnt/user-data/outputs/_manifest_entry.json` |
| PRODUCTS 註冊片段 | `/mnt/user-data/outputs/_products_register.txt` |

### 5-2:present_files

最後一律呼叫 `present_files(...)` 給老闆下載,**不貼完整 JSON 進對話**(鐵律 3)。

### 5-3:回報摘要

```
✅ 已交付 3 個檔:
  - UWHL-V2.json(meta + 100 筆 schedule)
  - _manifest_entry.json(1 條,要合到 manifest 的對應位置)
  - _products_register.txt(1 個 entry,要插到 index.html PRODUCTS 陣列)

部署 checklist:
  [ ] 把 UWHL-V2.json 放到 data/aia/UWHL-V2.json
  [ ] _manifest.json 加入該 entry(注意路徑大小寫: aia/ 或 AIA/)
  [ ] index.html PRODUCTS 陣列插入該 entry
  [ ] 確認三邊一致(plan_code 必須完全相同)

extraction_note:
  - mid_dividend_rate=0.055 為業界預設,需查 DM 確認
  - declared_rate 從 R10C8 抽出,值 0.0245
```

---

## 📋 Step 6:部署規則 A~Q(統一編號)

> v5 各家版本規則編號混亂(富邦 A~O、其他 A~Q、台壽 A~T、遠雄 17 條),v6 統一為 A~Q + 各家附錄補充。

### ⭐ 規則 A:product_name 必須去公司前綴

| ❌ 錯誤 | ✅ 正確 |
|---|---|
| `'富邦人壽美富紅運外幣分紅終身壽險'` | `'美富紅運外幣分紅終身壽險'` |
| `'保誠人壽美滿傳家外幣終身壽險(定期給付型)'` | `'美滿傳家外幣終身壽險(定期給付型)'` |
| `'凱基人壽紅利幸福美元分紅終身壽險-定期給付型'` | `'紅利幸福美元分紅終身壽險-定期給付型'` |

```python
def strip_company_prefix(name: str, company: str) -> str:
    if name.startswith(company):
        return name[len(company):].lstrip()
    # 安達特例:product_name 開頭可能有空白
    return name
```

**三處同步**:JSON `meta.product_name` / manifest entry `product_name` / PRODUCTS `product_name`。

### ⭐ 規則 B:type 欄位完整對應表

| 商品特性 | type 字串 |
|---|---|
| 美元利變、無分紅、無還本 | `'美元利率變動型終身壽險'` |
| 美元利變、有定期還本 | `'美元利率變動型還本終身壽險'` |
| 美元利變、養老型 | `'美元利率變動型養老保險'` |
| 美元分紅、無還本 | `'美元分紅終身壽險'` |
| 美元分紅、有定期還本 | `'美元分紅還本終身壽險'` |
| 美元純預定利率終身壽(無「利變」二字) | `'美元終身壽險'` |
| 新台幣利變 | `'新台幣利率變動型終身壽險'` |
| 新台幣利變還本 | `'新台幣利率變動型還本終身壽險'` |
| 新台幣分紅 | `'新台幣分紅終身壽險'` |
| 新台幣分紅還本 | `'新台幣分紅還本終身壽險'` 或 `'新台幣分紅終身還本保險'`(看商品設計) |
| 新台幣養老 | `'新台幣利率變動型養老保險'` |
| 新台幣純還本(無利變) | `'新台幣還本終身壽險'` |
| 新台幣增額 | `'新台幣利率變動型增額終身壽險'` |
| 澳幣利變 | `'澳幣利率變動型終身壽險'` |
| 澳幣利變還本 | `'澳幣利率變動型還本終身壽險'` |
| **澳幣養老** | `'澳幣利率變動型養老保險'` |
| 人民幣利變 | `'人民幣利率變動型終身壽險'` |

**判斷邏輯**:
1. 看商品名:含「分紅」→ 分紅型;否則 → 利變型(無「利率變動型」字樣 + 純預定利率 → 純終身壽)
2. 看 schedule:有當年生存金欄 + Y4+ 起 > 0 → 還本型(規則 K)
3. 看 product_type:`endowment` → 養老
4. 看幣別

### ⭐ 規則 C:min_sa / max_sa / max_age 安全預設

**抽取優先順序**:

1. **Excel 投保規則章節**(`投保條件` / `投保規則` / `基本資料` / `商品條件`)找 keyword
2. **Excel 文字解析**(安達 R31C6:`'保險金額:1萬~1000萬美元'` 用 regex,見附錄 08)
3. **找不到 → 用安全預設值**(並標 `⚠️_used_default_sa: true`):

| 幣別 | min_sa | max_sa | max_age |
|---|---|---|---|
| USD | 10000 | 5000000 | 75 |
| TWD | 300000 | 100000000 | 75 |
| AUD | 10000 | 3000000 | 75 |
| CNY | 50000 | 30000000 | 75 |

**台壽 AUD 例外**(見附錄 06):台壽自家 AUD 商品實測 5000~8000000、85 歲。

**鐵律 10 重申**:絕對禁止用 `min_sa: 50000` 預設,USD 預算 4000 算回保額會 < 5 萬卡死。

### ⭐ 規則 D:mid_dividend_rate(分紅商品專屬)

**只寫入 PRODUCTS 註冊**(JSON / manifest 不需要):

```js
{
  plan_code: 'XXX',
  engine: 'prudential_v2',
  mid_dividend_rate: 0.055,  // 必填,鐵律 9
}
```

**業界預設值**(找不到 DM 揭露時):

| 幣別 / 公司 | 預設值 |
|---|---|
| USD 一般 | 0.055 |
| TWD 一般 | 0.045 |
| AUD 一般 | 0.050 |
| 保誠商品 | 0.056 |

**前端顯示**:STEP3 比較表第 8 列「中分紅率」會以紫色 % 顯示。

### ⭐ 規則 E:_manifest.json 命名 + 多年期商品

**命名**:`key` = `plan_code`,1 個 plan_code = 1 條 entry。

**多年期商品策略**:

| 公司 | 策略 |
|---|---|
| 凱基 / 富邦 | 同 plan_code 包多年期(如 6UBS 含 6/10/15 年),JSON 內含所有年期 → manifest 寫 1 條 |
| 新光 / 保誠 / 台壽 / 友邦 / 遠雄 | 不同年期用不同 plan_code → manifest 寫多條 |

**必填欄位**(鐵律 I/規則 I):

```json
{
  "key": "UWHL-V2",
  "company": "友邦人壽",
  "plan_code": "UWHL-V2",
  "product_name": "美鴻添富美元分紅終身壽險",
  "currency": "USD",
  "period": 6,
  "engine": "prudential_v2",
  "product_code": "UWHL-V2",
  "path": "aia/UWHL-V2.json"
}
```

`period` 與 `path` 缺一會 404。

### ⭐ 規則 F:product_name 統一全形→半形

```python
def normalize_name(name: str) -> str:
    name = name.replace('\uff08', '(').replace('\uff09', ')')   # 全形括號
    name = name.replace('－', '-').replace('—', '-').replace('–', '-')  # 各式破折號
    return name
```

**例外**:既有 manifest 已有 50+ entries 帶全形「(定期給付型)」「(定額給付型)」,**新批為對齊既有區塊風格保留全形**(交接文件規則 F 註)。原則:**新批跟既有同一公司同一型風格一致**,風格混雜時統一用半形。

### ⭐ 規則 G:跨輪部署狀況追蹤

每輪結束在交接文件記錄:
- 新增 plan_code 清單
- 取代 plan_code 清單(舊→新對照)
- 既有 manifest 的不變條目數
- 仍 PENDING 校對的項目

範例見 `跨對話交接文件_v2.md` 的「5/6-5/7 連續對話事件記錄」。

### ⭐ 規則 H:同商品多 plan_code 處理

**三種情況**:

| 情況 | 處理 |
|---|---|
| 同商品**新版**(如 PFA V2.5 → V2.6) | **取代**(刪舊 entry 換新) |
| **不同保經來源**(直營 vs 保經) | **並存**(罕見,新光有此情況) |
| 同商品 + **不同年期 plan_code** | 規則 E 處理 |
| 不確定 | **停下問老闆,不要自作主張** |

### ⭐ 規則 I:Manifest entry 必填欄位檢查

部署前跑:

```python
required = ['key', 'company', 'plan_code', 'product_name',
            'currency', 'period', 'engine', 'product_code', 'path']
for entry in manifest:
    missing = [k for k in required if k not in entry]
    if missing:
        print(f"❌ {entry.get('key', '?')} 缺 {missing}")
```

### ⭐ 規則 J:product_subtype 標記

`is_endowment / db_pattern / sa_decay / premium_mode` 等旗標寫進 `meta`,前端 STEP1 篩選用。

| 旗標 | 用途 |
|---|---|
| `is_endowment: true` | 真還本(有當年生存金) |
| `product_type: 'endowment'` | 養老型(有滿期金) |
| `db_pattern: 'stepped'` | Y1-N db < base_sa,YN+ 才達標 |
| `sa_decay: true` | 後期 sa 衰減 |
| `premium_mode: 'lump_sum'` | 躉繳 |
| `is_lump_sum_demo: true` | 試算表只跑躉繳,但商品本身可多年期 |
| `survival_benefit_age` | 滿 N 歲開始給生存金 |
| `survival_payout_type: 'yearly'` | 每年給(vs `'milestone'`) |

### ⭐ 規則 K:還本商品偵測精準化

(已在 Step 0-3 闡述)看當年生存金欄而非看商品名「還本」二字。

### ⭐ 規則 L:層級式部署資料夾

```
data/
├── fubon/         # 富邦(全小寫)
├── twlife/        # 台壽
├── prudential/    # 保誠
├── transglobe/    # 全球
├── chubb/         # 安達
├── fglife/        # 遠雄
├── skl/           # 新光
├── KGI/           # 凱基(大寫!)
├── AIA/           # 友邦(大寫!)
└── (root)         # 早期商品散落,不再新增
```

**踩雷**:GitHub Pages 區分大小寫,manifest 寫 `aia/` 但實際是 `AIA/` → 404。

### ⭐ 規則 M:前端展示提示

`extraction_note` 裡寫的「特殊設計」要在前端 STEP3 比較表加提示:

| 設計 | 提示文字 |
|---|---|
| `cv_total` 中後期下降(退休型) | 「此商品退休後 cv 下降為正常設計,請看累計受益」 |
| schedule 短(養老型) | 「養老型商品,Y15/Y20 滿期僅領回 cv,DB=0」 |
| 含生存金(規則 J) | 「此商品含每年生存金 X 元起」 |
| 純壽險(IRR 接近 0) | 「定位:身故保障,非儲蓄」 |
| stepped DB | 「Y1-Y5 死亡保險金 < base_sa,Y6+ 達標」 |
| sa_decay | 「Y4+ 起 sa 逐年遞減」 |

### ⭐ 規則 N:多區段比對(逐年表)

(已在 Step 2-3 闡述)兩組數據不一致時優先「列印頁」。

### ⭐ 規則 O:萬元/千元單位陷阱(主要遠雄、台壽)

詳見附錄 07(遠雄三重判斷):
1. 輸入頁有「萬元」字樣
2. 「保險金額範圍:20~6,000萬元」
3. fallback:`sa < schedule[0].death_benefit / 0.95` → 推測萬元

### ⭐ 規則 P:discount / discount_method

```python
# net = 折後實繳, gross = 牌價
discount = 1 - net / gross    # 例:4180 / 4406 → discount = 0.0513
discount_method = 'simple'    # 預設,複利折扣很罕見
```

抽不到 → `discount: 0`(不省略,鐵律 5 例外:這欄就是要 0 不是 omit)。

### ⭐ 規則 Q:批次處理(Step B0)

(已在 Step B0 闡述)每批 5-8 個 .xls 為上限,跳檔但保留警告。

---

## 📊 5 種引擎類型參考

| 引擎 | 用途 | 處理工具 |
|---|---|---|
| `twlife_v1` | 純逐年表(主流) | master Step 0~5 通用流程 |
| `prudential_v2` | 逐年表 + 三情境分紅 | `prudential_extractor.py`(附錄 03) |
| `kgi_rv_v1` | 凱基特殊 RV | 個案處理(附錄 09) |
| `prudential_v1` | 保誠 RV 大表(僅 ARLPLU71) | 個案處理(附錄 03) |
| `taishin_v1` | 新光分紅(原台新代理) | 個案處理(附錄 10) |

**特殊引擎程式**:

| 公司 | 程式 | 用途 |
|---|---|---|
| 富邦 | `fubon_v5_engine.py` | 走 twlife_v1 / prudential_v2 抽取 |
| 友邦 | `aia_engine.py` + `aia_recalc.py` + `aia_extract_cli.py` | RV 表手算(走 0.5-A) |
| 保誠 | `prudential_extractor.py` | 三情境 + layout A/B |

---

## 🆘 速查表 — 該停下等老闆確認的時機

1. Step 0 結束(引擎判斷)
2. Step 1 結束(基準參數 5 件套)
3. Step 2 結束(逐年表 mapping + 抽樣)
4. 發現撞名(規則 H)
5. 發現公式 #VALUE!,要決定走哪條 fallback(0.5-A/B/C)
6. 自洽驗證有 ❌
7. 部署資料夾大小寫不確定
8. 任何「我覺得應該是 X」的瞬間

---

## ⚠️ 常見錯誤對照表

| 症狀 | 原因 | 修法 |
|---|---|---|
| 部署後 404 | manifest 路徑大小寫錯 / 缺 path / 缺 period | 規則 I 檢查 + 規則 L 大小寫表 |
| 前端篩選不到該商品 | type 字串不在 16 種對應 | 規則 B 對應表 |
| 預算 4000 USD 算不出保額 | min_sa 用了 50000 預設 | 鐵律 10:USD 用 10000 |
| 還本商品 cv 下降被當 bug | 套了 cv 中後期遞增規則 | 鐵律 16 |
| stepped 商品自洽驗證掛掉 | 套了 Y1 db ≈ sa 規則 | 鐵律 15:用 db_max ≥ sa × 0.95 |
| 抽到法規條文「累計新臺幣2000萬」當 currency | 在 R43 之前掃 currency | 鐵律 19(富邦):掃 R43 之後 |
| schedule y 倒退 | 沒排序就交付 | 鐵律 14:強制 sort |
| 抽到 0 當 base_age | 用了 `if not x` | 鐵律 11:用 `is None` |
| 同 plan_code 重複出現 | 撞名沒處理 | 規則 H |
| LibreOffice listener 在下個 bash call 死了 | 跨 call 假設存活 | 鐵律 17:同 bash 內完成 |

---

## 🎁 v6 版本歷史

- **v6.0 (2026-05-07)**:整合 v5 富邦/友邦/保誠/全球/台壽/凱基/新光/遠雄/安達 + 法巴 delta。統一 A~Q 編號、抽出 18 條共通鐵律、master + 附錄分離結構。引擎程式碼模組化。
- v5.x:各家分別開發,規則編號各異,延續到 2026-05-06。
- v4.x:首次萬用整合(規則 A~O 雛型)。
- v2.x:初版,主要支援 twlife_v1。

---

**🔚 master v6.0 結束**


---

# 🎯 第 2 部分:各家公司附錄(只讀當前處理的那家)

> 用 Ctrl+F 搜尋「附錄 0X:」跳到對應公司

---


## 附錄 01:富邦人壽 (`fubon/`)

> Master 未涵蓋的富邦特定處理。沒列在這的全部依 master。

---

### 🚫 富邦補充鐵律(編號續 master 18 條)

19. **嚴禁從 R43 之前抽 currency** — 可能撞到「累計新臺幣2000萬」法規條文。先掃 R44+「計價幣別」標籤。
20. **嚴禁全表掃描抽 base_sa** — 必須鎖定「主約險種代號」下方那列(否則會撞到附約保額)。
21. **嚴禁忽略 Y1 vs Y2 cum_prem 差異** — `>1%` 代表附約保費分離,要 SKIP。

---

### 🔍 Step 0 額外偵測

#### 0-α:商品全名強制印出(`R2` 必抓)

```python
ws = wb['輸入頁'] if '輸入頁' in wb.sheetnames else wb[wb.sheetnames[0]]
for r in range(1, 5):
    row = list(ws.iter_rows(min_row=r, max_row=r, values_only=True))[0]
    for v in row:
        if v and isinstance(v, str) and len(v) > 5:
            if '專案試算表' in v or '富邦人壽' in v:
                print(f"商品全名:{v}")
```

避免被 sheet 名誤導(sheet 名常是縮寫)。

#### 0-β:混合型線索(SKIP 用)

```python
for r in range(5, 15):
    row = list(ws.iter_rows(min_row=r, max_row=r, values_only=True))[0]
    text = ' '.join(str(v) for v in row if v)
    if any(kw in text for kw in ['意外身故', '失能保險金', '燒燙傷', '住院醫療']):
        # AJI 安康如意這種「意外+醫療+生存」混合型 → SKIP
        return 'unsupported'
```

#### 0-γ:歲滿期型偵測

```python
for r in range(20, 50):
    text = ' '.join(str(v) for v in
                    list(ws.iter_rows(min_row=r, max_row=r, values_only=True))[0]
                    if v)
    if '歲滿期' in text or '繳費至' in text:
        # 例:PAJ 優富年年「繳費至 55 歲」
        # period = 55 - base_age
```

#### 0-δ:富邦 sheet 結構速查

| Sheet 組合 | 引擎 |
|---|---|
| 總表 + 列印頁-簡 + 輸入頁 | `twlife_v1` |
| 總表_分紅_H + _M + _L | `prudential_v2` |
| ROP / tbULMultiple / 計算內容-正/零/負 | ❌ 投資型不支援 |
| 操作主畫面 / AnnFactor | ❌ 年金險不支援 |

---

### 📥 Step 1 額外處理

#### 1-α:currency 鎖定 R44+

```python
def find_currency_fubon(ws):
    for r in range(44, ws.max_row + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            if isinstance(v, str) and '計價幣別' in v:
                # 右側格子是答案
                for cc in range(c+1, c+5):
                    val = ws.cell(r, cc).value
                    if isinstance(val, str) and val.strip() in ('美元', '新台幣', '澳幣', '人民幣'):
                        return {'美元':'USD','新台幣':'TWD','澳幣':'AUD','人民幣':'CNY'}[val.strip()]
    return None
```

#### 1-β:base_sa 鎖定主約

```python
def find_base_sa_fubon(ws):
    # 找「主約險種代號」字樣 row,**下一 row** 同 col 才是 base_sa
    for r in range(1, ws.max_row + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            if isinstance(v, str) and '主約險種代號' in v:
                # 該 row 下一 row 同位置 col + 偏移找 SA
                for cc in range(c, c+10):
                    val = ws.cell(r+1, cc).value
                    if isinstance(val, (int, float)) and val >= 10000:
                        return val
    return None
```

#### 1-γ:躉繳獨立 keyword

```python
period_kw = ['繳費年期', '繳別', '繳費期間', '保險年期']
lump_kw   = ['躉繳', '一次繳', 'Single']
## 先看有無 lump_kw,有則 period=1 + premium_mode='lump_sum'
```

---

### 📊 Step 2 額外處理

#### 2-α:Y1 vs Y2 cum_prem 差異檢查

```python
diff_pct = abs(sched[1]['cum_prem'] - 2 * sched[0]['cum_prem']) / sched[0]['cum_prem']
if diff_pct > 0.01:
    # >1% 代表 Y1 包含附約保費,Y2 起不包含
    # 整檔 SKIP,因為主約保費被附約污染了
    return 'unsupported_附約污染'
```

#### 2-β:simple_print_v1 引擎(部分老 PFA 系列)

某些只有「列印頁-簡」沒「總表」的舊版商品,走 simple_print_v1 流程:
- header 動態範圍判斷:標題列在 R5/R6/R7 之一
- col 全靠 keyword 動態定位

---

### 🧰 富邦引擎程式

```python
import sys
sys.path.insert(0, '/path/to/v6/engines')
from fubon_v5_engine import FubonExtractor

ext = FubonExtractor(xlsx_path)
result = ext.extract()  # 回傳 dict,含 meta + schedule
```

引擎程式位於 `engines/fubon_v5_engine.py`(已驗證 58 個富邦商品)。

---

### 📦 部署資料夾

`data/fubon/<plan_code>.json`(全小寫)

---

### ⚠️ 富邦目前 PENDING(2026-05-07)

- 38 個 `min_sa/max_sa/max_age` 用業界預設,要查 DM
- 13 個分紅商品 `mid_dividend_rate` 業界預設,要查 DM
- FBN 為首個富邦 AUD 商品,前端要支援
- FCG Y17-Y94 DB=0 需查原 Excel
- PFG/PALA_B_C/PFW/PF55_60_65 退休型 cv 中後期下降(規則 M 提示)
- FED/FEF 養老型 schedule 短(規則 M 提示)
- XMM/FEF 含生存金(規則 M 提示)
- XWS5 純壽險 IRR ≈ 0(規則 M 提示)

---


## 附錄 02:友邦人壽 (`AIA/`,大寫!)

> 友邦特色是 **RV 表手算**(Excel 公式 `MID/DATEVALUE` 解析民國年字串,LibreOffice 重算後仍 #VALUE!,但 FACTOR/PREM 表純數字可讀),master 走 Step 0.5-A 分支進這裡。

---

### 🚀 強制走 aia_engine

**不要自己重寫手算邏輯**,引擎已驗證 18 個友邦商品。

#### 處理流程

```bash
## 單檔(.xls,自動先 recalc)
python aia_extract_cli.py UWHL-V2.xls -o ./output --recalc

## 批次(資料夾或 glob)
python aia_extract_cli.py "*.xls" -o ./output --recalc --batch

## 批次並打包成 zip
python aia_extract_cli.py "*.xls" -o ./output --recalc --batch --pack
```

#### 程式介面

```python
import sys
sys.path.insert(0, '/path/to/v6/engines')
from aia_engine import AIAExtractor

ext = AIAExtractor(xlsx_path, plan_code='UWHL-V2')
result = ext.extract()    # dict, 含 meta + schedule

## 寫乾淨 JSON
clean = ext.to_clean_dict(result)
```

引擎已包含:
- `aia_engine.py` — 主抽取邏輯(支援 stepped/還本/養老/RV手算)
- `aia_recalc.py` — `.xls → .xlsx` LibreOffice 批次重算(必須在同一 bash call 內)
- `aia_extract_cli.py` — CLI 入口 + manifest/PRODUCTS 自動產出

---

### 🔍 Step 0 偵測(自動分流)

```python
## 偵測友邦 RV 表型
sheet_names = wb.sheetnames
if all(s in sheet_names for s in ['FACTOR', 'PREM']) and \
   any('保險利益分析' in s for s in sheet_names):
    engine = 'aia_rv'  # 走 aia_engine 手算
```

`AIAExtractor` 內部會自動分流:
- RV 表型 → 走 FACTOR + PREM 手算 schedule
- 一般逐年表型(較新商品) → 走 schedule 直抽

---

### 📥 base_age 反推(GP factor 法)

某些友邦商品 base_age 在 Excel 找不到,用 GP factor 反推:

```python
## 範例:base_premium_gross=4180, base_sa=100000
## GP factor = 4180 / (100000/1000) = 41.8 per 1000
## 查 FACTOR 表(M xxx 列):找到 M30 PPP=6 對應 41.8 → base_age = 30
```

`aia_engine.py` 已實作這個反推邏輯,不用自己寫。

---

### 🆔 AIA 商品命名特色

- 檔名格式:`保險利益分析表_UWHL-V2_xxx.xls`
- plan_code 含版本號保留(`UWHL-V2`、`UWHL-V3` 是不同年期版本)
- 多年期商品 → 規則 E 寫多條 entry

---

### 📦 部署資料夾

`data/AIA/<plan_code>.json`(**大寫**!踩雷 #1:寫成 `aia/` 會 404)

manifest path 範例:
```json
{
  "key": "UWHL-V2",
  "path": "AIA/UWHL-V2.json",
  ...
}
```

---

### 📋 引擎產出的 type 字串對應

```python
def infer_type_str(meta):
    cur_zh = {'USD':'美元', 'TWD':'新台幣', 'AUD':'澳幣', 'CNY':'人民幣'}[meta['currency']]
    is_endow_type = meta.get('product_type') == 'endowment'
    is_endow = meta.get('is_endowment', False)
    has_dividend = '分紅' in meta.get('product_name', '')

    if is_endow_type:
        return f"{cur_zh}{'分紅' if has_dividend else '利率變動型'}養老保險"
    if has_dividend:
        return f"{cur_zh}{'分紅還本終身壽險' if is_endow else '分紅終身壽險'}"
    return f"{cur_zh}{'利率變動型還本終身壽險' if is_endow else '利率變動型終身壽險'}"
```

---

### ⚠️ 友邦目前 PENDING(2026-05-07)

- UED 養老險、UDISRI/URO/UWLS/UWLV 還本險、USWLB 倍數型 — 前端展示要規則 M 提示
- UWLS/UWLV 多 plan_cd 起始日問題(同 plan_code 不同 issue date)

---


## 附錄 03:保誠人壽 (`prudential/`)

> 保誠特色是 **layout A / B 兩種版型** + **三情境分紅(L/M/H)**,master 走 `prudential_v2` 引擎進這裡。

---

### 🚀 強制走 prudential_extractor.py

引擎已驗證:layout A 85 欄、layout B 67 欄、分區結構、13 條自洽性驗證、檔名 vs 內容驗證、重複版本檢測、批次模式。

#### CLI 用法

```bash
## 單檔
python prudential_extractor.py 檔案.xls --output ./out/

## 批次
python prudential_extractor.py *.xls --batch --output ./out/

## 只驗檔名 vs 內容(不抽)
python prudential_extractor.py 檔案.xls --check-only

## 跳過版本檢查(強制覆蓋)
python prudential_extractor.py 檔案.xls --force-overwrite

## 跳過自洽性驗證(慎用)
python prudential_extractor.py 檔案.xls --skip-validation

## 詳細日誌
python prudential_extractor.py 檔案.xls -v
```

#### 退出碼

| Code | 含義 |
|---|---|
| 0 | 成功 |
| 1 | 自洽性驗證失敗 ❌ |
| 2 | 跳過(檔名錯 / 已有更新版本) |
| 3 | 不支援(非 prudential_v2 結構) |
| 4 | 系統錯誤(LibreOffice 失敗、檔不存在) |

---

### 🔍 layout A vs B 偵測(自動分流)

```python
r4_c2 = ws.cell(4, 2).value
r2_c1 = ws.cell(2, 1).value

if isinstance(r4_c2, str) and '保單' in r4_c2:
    layout = 'A'  # 67 欄,分區結構,Profits1/2/3 區段並列
elif r2_c1 == '年期':
    layout = 'B'  # 85 欄,直線排列,Profits_1/2/3 sheet 分離
```

---

### 🎯 prudential_v1 vs v2

| 引擎 | 適用 | 商品 |
|---|---|---|
| `prudential_v1` | 保誠 RV 大表 | 僅 ARLPLU71 |
| `prudential_v2` | 三情境分紅 | 其他 14 個保誠 + 富邦 18 + 台壽 5 + 安達 3 |

`prudential_extractor.py` 只處理 v2。v1 是個案手工處理,沒有自動引擎。

---

### 📋 三情境 schedule 結構

```json
{
  "schema": "v4",
  "meta": {
    "engine": "prudential_v2",
    "scenarios": ["L", "M", "H"],
    "mid_dividend_rate": 0.056,    // 保誠專用預設
    ...
  },
  "schedule":   [...],   // 中分紅(M)
  "schedule_l": [...],   // 低分紅
  "schedule_h": [...]    // 高分紅
}
```

**自洽驗證**:

```python
## H > M > L 每年都成立
for y in range(len(schedule_m)):
    assert schedule_h[y]['cv_total'] >= schedule_m[y]['cv_total']
    assert schedule_m[y]['cv_total'] >= schedule_l[y]['cv_total']
```

---

### 🆔 保誠商品 plan_code 規律

- `ACLPxx` / `ACLPENxx` / `ARLPLUxx` 系列
- 不同年期用不同 plan_code(如 ACLPEN26 / ACLPEN36)→ 規則 E 寫多條 entry

---

### 📦 部署資料夾

`data/prudential/<plan_code>.json`(全小寫)

⚠️ ARLPLU71 因歷史因素**部署在根目錄**:`data/ARLPLU71.json`,manifest path 寫 `ARLPLU71.json`(沒前綴)。

---

### ⚠️ 保誠目前 PENDING(2026-05-07)

- ARLPLU71 `period=1` 為暫定值(已從缺漏修為 1),實際年期需查保誠 DM 確認

---


## 附錄 04:法商法國巴黎人壽 (Cardif Life Taiwan)

> 法巴(Cardif)是儲蓄險專業公司,規模小但檔案結構特殊 ——
> **流通的是「公版空白模板」需要先填值才能重算**,跟其他 8 家完全不同。
> 走 `prudential_v2` 引擎,但**前置**處理走本附錄專屬流程。

---

### 0. 何時觸發本附錄

任一條件成立 → company 寫 `Cardif`,engine 強制 `prudential_v2`:

1. 檔名含「美吉鴻運 / 美添鴻運 / 鴻運旺旺來 / 鴻運滿億 / 鴻運金喜 / 鴻運雙享」
2. 檔內 R8 / R3 / R5 含「法商法國巴黎人壽」或「法國巴黎人壽」
3. `面頁` sheet 存在且 R3C3 含「POS Model」字串
4. plan_code 開頭為 `PRU` / `PRT` / `PCT`

---

### 1. 公司命名 (規則 C1-C3)

| 欄位 | 值 |
|---|---|
| `company` | `Cardif`(**不可寫**「法國巴黎人壽」「BNP Paribas Cardif」「巴黎」等變體) |
| `product_name` | 從 `商品摘要表` R3C1 抽,**依序**去除前綴:`● ` / `※ ` / `法商法國巴黎人壽` / `法國巴黎人壽` / `Cardif` |

**禁止**:
- ❌ 用 R6 做商品名來源(R6 是免責聲明,以 `*` / `※` 開頭)
- ❌ 自行翻譯「定期給付型」為 `stepped` / `scheduled` 等英文,保持原中文

---

### 2. 公版空白模板處理(最關鍵)

#### C4:辨識空白模板

特徵任一成立:
1. 檔名以「公版_」開頭
2. `輸入頁` R22 / R24 D 欄為 None / 0
3. `商品利益說明表` R5 顯示「保額:0元 / 首期原始保費:0元」
4. schedule sheet Y1 行所有數值欄都是 0 或 None

**遇到空白模板**:
- ❌ 不可直接抽 0 / None 當數據(違反鐵律 13)
- ❌ 不可在沒填值就停下產出空 schedule
- ❌ 不可標 `data_status: "template_only"` 然後交付

**正確流程** → 走 C5 fill+recalc。

#### C5:fill+recalc 標準流程

##### C5.1 修補 autofilter(必跑,如果是 .xls 經 LibreOffice 轉來)

```python
import zipfile, re

def fix_autofilter(src_xlsx, dst_xlsx):
    """移除 sheet xml 內的 autoFilter,讓 openpyxl 可寫"""
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

原生 `.xlsx` 不需要這步。

##### C5.2 SA 輸入 cell 對應表

| 商品 | SA cell | 單位 | 標準值 | 對應實際保額 |
|---|---|---|---|---|
| 美吉鴻運 | `輸入頁!D24` | 萬元 | `10` | 100,000 USD |
| 美添鴻運 | `輸入頁!D22` | 萬元 | `10` | 100,000 USD |
| 鴻運旺旺來 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運滿億 | `輸入頁!D24` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運金喜 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |
| 鴻運雙享 | `輸入頁!D22` | 萬元 | `100` | 1,000,000 TWD |

⚠️ **`輸入頁` 提示字「以每千元為單位」不可信** —— 實測單位是「萬元」。
- USD 寫 10 → 100,000 USD ✅
- TWD 寫 100 → 1,000,000 TWD ✅
- USD 寫 100 → 1,000,000 USD(超過業界試算量)❌

寫入後驗證:重算後 R5 顯示「保額:100,000元」(USD) 或「保額:1,000,000元」(TWD)。

##### C5.3 寫入 + LibreOffice 重算

```python
import openpyxl, subprocess

def fill_and_recalc(src, sa_cell, sa_value, out_dir):
    wb = openpyxl.load_workbook(src)
    ws = wb['輸入頁']
    ws[sa_cell] = sa_value
    wb.save(src)

    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['libreoffice', '--headless', '--calc', '--convert-to', 'xlsx',
         '--outdir', str(out_dir), str(src)],
        capture_output=True, timeout=600
    )
    return out_dir / src.name
```

**timeout 設定**:單檔最多 600 秒。Cardif 大檔(如美吉 14 MB)需 3-5 分鐘重算。**不可批次跑 6 檔**(會超時),逐檔處理。

##### C5.4 驗證重算結果

```python
wb = openpyxl.load_workbook(recalc_path, data_only=True, read_only=True)
ws = wb['商品利益說明表(不含紅利部分)']  # 終身壽 OR
ws = wb['建議書']                       # 還本

r5_val = ws.cell(5, 1).value
assert r5_val and '0元' not in r5_val, f"重算未生效: R5={r5_val}"

y1_cum_prem = ws.cell(15, 4).value or ws.cell(16, 4).value
assert isinstance(y1_cum_prem, (int, float)) and y1_cum_prem > 0
```

驗證失敗 → 停下,告訴老闆,**不要繼續**。

---

### 3. Sheet 結構辨識(規則 C6-C7)

| 類型 | 商品 | schedule sheet | 特徵 |
|---|---|---|---|
| **whole_life** | 美吉、美添、旺旺來、金喜 | `商品利益說明表`(無尾隨空格,~421×14) | 終身壽,三情境垂直堆疊 |
| **endowment** | 滿億、雙享 | `建議書`(~393×18) | 還本,三情境垂直堆疊 |

```python
def classify_kind(wb):
    if '建議書' in wb.sheetnames:
        ws = wb['建議書']
        v = ws.cell(2, 5).value
        if isinstance(v, str) and '生存保險金' in v:
            return 'endowment'
    return 'whole_life'
```

#### C7:display sheet 不可用作數據來源

| 不可用(display 用 OFFSET/VLOOKUP,重算後失效) | 可用(source) |
|---|---|
| `商品利益說明表(不含紅利部分) ` ⚠️**尾端有空格**,158×26 | `商品利益說明表` 無尾空格,421×14 |
| `紅利彙總表` 166×29 | (取自 schedule) |
| `建議書-簽名送件(基本資料須正確)` 部分版本 | `建議書` 393×18 |

判 sheet 名時注意尾隨空格(用 `repr(name)` 印出檢查)。

---

### 4. 三情境區塊定位(規則 C8-C9)

Cardif schedule sheet 是「三情境垂直堆疊」結構:

```
Y1 H, M, L
Y2 H, M, L
Y3 H, M, L
...
```

而非 prudential_v2 標準的「三 sheet 分離」(Profits_1/2/3)。

抽取時需:
1. 讀完整 schedule
2. 按 row 拆 H/M/L 三組
3. 寫入 JSON 時拆成 `schedule` (M) / `schedule_h` / `schedule_l`

詳細 col 對應見原 v5 法巴 delta 第 4-5 章。

---

### 5. 自洽性驗證(C10)

除 master Step 4 通用驗證外,Cardif 還需:

```python
## 身故倍率寬鬆規則
## Cardif 部分商品 Y1 db = 1.01 × cum_prem(法定最低身故倍率),不算 stepped
## 自洽驗證放寬:Y1 db 在 [base_sa × 0.5, base_sa × 1.05] 範圍內視為正常

## 分紅生效時間寬鬆規則
## Cardif 分紅是 Y3+ 才生效(其他公司多半 Y2+),驗證 H > M > L 從 Y3 開始檢查
```

---

### 📦 部署資料夾

`data/cardif/<plan_code>.json`(全小寫,新建,目前還沒有 Cardif 商品在 manifest)

---

### ⚠️ Cardif 目前 PENDING(2026-05-07)

- 6 個 Cardif 商品(美吉/美添/旺旺來/滿億/金喜/雙享)**尚未部署到 manifest**
- 需先批次跑 fill+recalc + 抽取(逐檔處理 600s timeout)
- 第一批部署時前端要新增 `cardif/` 資料夾識別

---


## 附錄 05:全球人壽 (`transglobe/`)

> 全球是「通用 twlife_v1」家族成員,master 流程跑得最順。本附錄只記錄已驗證的 32 個 .xls 偵察結果與少量陷阱。

---

### 🔍 全球專屬 Step 0 偵測

```python
## 全球商品 sheet 慣性結構
if '逐年表' in wb.sheetnames or '明細表' in wb.sheetnames:
    if '輸入頁' in wb.sheetnames or '基本資料' in wb.sheetnames:
        engine = 'twlife_v1'
```

---

### 🆔 plan_code 規律

- 一律大寫英數,如 `RPF` / `RPI` / `QJP` / `RPLBR`
- 部分 V2 / V3 後綴(版本號)
- 一個 plan_code = 一個年期(對齊規則 E:多條 entry)

---

### ⚠️ 已知陷阱

1. **資料檢核頁順序錯亂** —— 抽完一律強制 sort(鐵律 14)
2. **某些舊版逐年表 col 17/20/27 漂移** —— 用 keyword 動態偵測(鐵律 12)
3. **QJP 的 currency 推斷為 TWD** —— 原 JSON meta 是 None,要查 DM 確認

---

### 📦 部署資料夾

`data/transglobe/<plan_code>.json`(全小寫)

---

### ⚠️ 全球目前 PENDING(2026-05-07)

- 22 個商品 `min_sa/max_sa/max_age` 用業界預設,要查 DM
- QJP `currency=TWD` 是推斷值,要查 DM 確認

---


## 附錄 06:台灣人壽 (`twlife/`)

> 台壽是 master 的最大用戶(twlife_v1 引擎來源),32 個商品全走通用流程。本附錄記錄 master 沒講的 delta 與已驗證陷阱。

---

### 🔧 規則 C 例外:台壽 AUD 預設值

master 規則 C 預設:`AUD min=10000, max=3000000, max_age=75`。
**台壽家自家 AUD 商品實測**(澳利樂等)應使用:

| 幣別 | min_sa | max_sa | max_age |
|---|---|---|---|
| AUD(台壽自家) | 5000 | 8000000 | 85 |

碰到台壽 AUD 商品優先用這組值,並打 `note: '台壽 AUD 預設'`。

---

### 🎯 台壽分紅商品(prudential_v2)特殊偵測

```python
## 台壽分紅 sheet 組合
if all(s in wb.sheetnames for s in ['比對用']) and \
   any('Profits' in s for s in wb.sheetnames) and \
   '儲存生息計算' in wb.sheetnames:
    engine = 'prudential_v2'
    # 用 prudential_extractor.py 抽
```

台壽分紅 mid_dividend_rate 預設:`0.045`(TWD)/ `0.055`(USD)/ `0.050`(AUD)。

---

### 🎯 台壽養老型(資料檢核頁)放寬筆數

商品名含「養老保險」+ sheet 有「資料檢核頁」+ `protection_period` < 全期 → schedule 筆數可能短(只到 protection_period + 滿期),master Step 2 終止條件要放寬。

---

### 🎯 真還本判定(規則 K 應用範例)

| 商品 | 商品名含「還本」 | 有當年生存金欄 | 處理 |
|---|---|---|---|
| **美年有鑫** | ✅ | ❌(累計增額繳清) | **不**標 `is_endowment`,當 twlife_v1 一般處理 |
| **澳利樂** | ✅ | ✅ | 標 `is_endowment: true` |
| **美紅勝利** | ❌(分紅) | ✅ + Y1-Y2 stepped + Y4+ sa_decay | `db_pattern: 'stepped'` + `sa_decay: true` |
| **美紅鑽** | ❌(分紅) | ✅ + Y3+ sa_decay | `is_endowment: true` + `sa_decay: true` |

---

### 🎯 樂退系列偵測

| sheet 特徵 | 處理 |
|---|---|
| 簡易版 + 明細版 + 費率 + 樂齡日 60/65/70 歲 | `twlife_v1`(可做) |
| 商品名含「樂退」+ `Output2/AnnFactor` | 樂退年金型 → **跳過** |
| 商品名含「樂退」+ `資料檢核頁/明細版` | 利變還本誤標 → 走 `twlife_v1` |

---

### 🆔 台壽 plan_code 規律

- 中文檔名(如 `保利美.xls`)→ 用 plan_code 作中文(罕見,大多英數)
- 多年期通常用不同 plan_code → 規則 E 寫多條

---

### 📦 部署資料夾

`data/twlife/<plan_code>.json`(全小寫)

---

### ⚠️ 台壽目前 PENDING(2026-05-07)

- 16 個既有商品 JSON 本機 OneDrive 缺檔(保利美/吉享紅/吉美富/吉美得/多享利/年年添利/旺美勝/珍多寶/紅利旺/美月有鑫/美紅旺_v5/金多利/金多沛/金得利/金滿利/金福利)
- 6 個 5/6 新增:澳利樂 max_sa 800 萬可能是 50 萬?、傳承富足 discount=0、美紅勝利/美紅鑽 mid_dividend_rate 校對
- 美紅勝利前端展示要規則 M 提示(stepped + sa_decay)
- 美紅鑽前端展示要規則 M 提示(還本 + sa_decay)

---


## 附錄 07:遠雄人壽 (`fglife/`)

> 遠雄特殊在「**萬元/千元單位陷阱**」(規則 O)、躉繳 demo 標記、養老 protection_period。

---

### 🚫 遠雄補充鐵律

22. **嚴禁把「商品預定利率」當成 declared_rate** —— 那是 `guaranteed_rate`,要查另一個欄位才是宣告利率。

---

### 🔧 規則 O 萬元三重判斷

遠雄部分商品 `base_sa` 用「萬元」單位寫,要正確還原:

```python
def detect_unit_fglife(ws, raw_sa):
    """三重判斷,有任何一重命中就轉成元"""
    # 第 1 重:輸入頁有「萬元」字樣
    for r in range(1, 30):
        for c in range(1, 30):
            v = ws.cell(r, c).value
            if isinstance(v, str) and '萬元' in v:
                # 鎖定主約 SA 區的「萬元」標籤
                if abs(c - sa_col) <= 3:
                    return 'wan'

    # 第 2 重:輸入頁有「保險金額範圍:20~6,000萬元」
    for r in range(1, 50):
        row_text = ' '.join(str(ws.cell(r, c).value or '') for c in range(1, 30))
        if re.search(r'保險金額.*萬元', row_text):
            return 'wan'

    # 第 3 重 fallback:sa < schedule[0].death_benefit / 0.95 → 推測萬元
    if raw_sa < schedule[0]['death_benefit'] / 0.95:
        return 'wan'

    return 'yuan'

## 套用
if unit == 'wan':
    base_sa = raw_sa * 10000
```

---

### 🎯 躉繳 demo 標記

部分商品試算表只跑躉繳情境,但商品本身可能多年期。打兩個 flag:

```python
{
  "premium_mode": "lump_sum",
  "is_lump_sum_demo": true   # 試算僅躉繳,DM 上是 6/10 年期商品
}
```

範例:遠雄 BO1/BB1/BI1/BY1/BT1/BQ1/WQ1/WN1/WR1 共 9 檔。

---

### 🎯 養老型 protection_period

養老商品標記:

```python
{
  "is_endowment": true,
  "product_type": "endowment",
  "protection_period": 10   // Y10 滿期
}
```

範例:
- BY1 protection_period=10
- BT1 protection_period=7
- BQ1 protection_period=10

⚠️ Excel 試算情境是 protection_period,但 **DM 可能 6/10/15/20 都有**(同商品多年期),要查 DM 補齊。

---

### 🆔 unit_size 不一致

遠雄商品 `unit_size` 兩種寫法並存:

| 商品 | unit_size |
|---|---|
| BU1 / SP1(舊批) | `100` |
| 新批 13 個 | `1000` |

前端 STEP2 要按各商品自己的 `unit_size` 算保額,**不可全 force 1000**。

---

### 📥 base_premium 來源優先序

```python
## 優先序: 從 schedule[0]['cum_prem'] 抓(如果 schedule 第一筆是好的)
## 否則 gross × (1-discount)
if schedule and schedule[0].get('cum_prem'):
    base_premium = schedule[0]['cum_prem']
else:
    base_premium = base_premium_gross * (1 - discount)
```

---

### 📦 部署資料夾

`data/fglife/<plan_code>.json`(全小寫)

---

### ⚠️ 遠雄目前 PENDING(2026-05-07)

- 9 個躉繳 demo 商品(BO1/BB1/BI1/BY1/BT1/BQ1/WQ1/WN1/WR1):需要的話另抽多年期版本
- 養老 protection_period 校對(BY1=10/BT1=7/BQ1=10 是 Excel 情境,DM 可能不同)

---


## 附錄 08:安達人壽 (`chubb/`)

> 安達特殊在 **factor 是「每萬元美元」單位**(其他公司是「每千元」)、`section_bounds` 算法、GP 反推 base_age、TODAY() 公式陷阱。

---

### 🚫 安達補充鐵律

23. **嚴禁信任 LibreOffice 的 TODAY() 重算** —— 公式用 `TODAY()` 算保險年齡時,要 patch 寫死整數再重算(見下方「TODAY() 修補法」)。

---

### 🔧 factor 單位差異

| 公司 | factor 單位 |
|---|---|
| 一般 USD 商品 | 每**千**美元 |
| 一般 TWD 商品 | 每**萬**元 |
| **安達** | 每**萬**元美元 |

```python
## 安達 base_premium 反推
## 範例:金多美 base_premium_gross=17080, base_sa=200000
## GP factor = 17080 / (200000/10000) = 854 per 10000(每萬美元)
## 不是 17080 / (200000/1000) = 85.4 per 1000

if company == '安達人壽':
    factor_unit = 10000
else:
    factor_unit = 1000 if currency == 'USD' else 10000
```

---

### 🎯 GP 反推 base_age(安達常用)

安達商品 base_age 在 Excel 有時找不到(`#VALUE!` 或省略),用 GP factor 反查:

```python
## 範例:金多美 base_premium_gross=17080, base_sa=200000
gp_factor = 17080 / (200000 / 10000)   # = 854

## 查 FACTOR 表(MnnPPP 列):
## M40 PPP=6 → 836 (不對)
## M41 PPP=6 → 854 ✓
## 所以 base_age = 41
```

`prudential_extractor.py` 內有實作,安達商品走 prudential_v2 時自動處理。

---

### 🎯 section_bounds 算法

安達 schedule sheet 多區段,每段的 `start_row` 與 `end_row` 要動態算:

```python
def compute_section_bounds(sections):
    """
    sections = [{'name':'男_M40','start_row':10}, {'name':'男_M41','start_row':120}, ...]
    每段 end_row = 下一段 start_row - 6 (header 占用)
    """
    sections = sorted(sections, key=lambda s: s['start_row'])
    for i, s in enumerate(sections):
        if i + 1 < len(sections):
            s['end_row'] = sections[i+1]['start_row'] - 6
        else:
            s['end_row'] = ws.max_row
    return sections
```

---

### 🎯 TODAY() 公式修補法

安達某些商品保險年齡公式用 `=YEAR(TODAY()) - YEAR(出生日)`,LibreOffice 重算後仍 `#VALUE!`:

```python
## patch 寫死整數再重算
def patch_today_formula(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb['輸入頁']

    # 找含 TODAY() 的 cell,改成寫死整數
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and 'TODAY()' in cell.value:
                # 計算當前日期序號(Excel epoch:1900-01-01 = 1)
                from datetime import date
                today_serial = (date.today() - date(1900, 1, 1)).days + 2
                cell.value = cell.value.replace('TODAY()', str(today_serial))

    wb.save(xlsx_path)
    # 然後再走 LibreOffice 重算
```

---

### 🔧 規則 C 安達特殊:文字解析投保金額

R31C6 / R17C6 文字含投保金額限制,要 regex 抽:

```python
import re

def parse_sa_limit_chubb(text):
    """
    R31C6: '保險金額:3000美元~250萬美元' / '1萬~1000萬美元' / '2萬美元~300萬美元'
    """
    text = str(text).replace(',', '')
    pat = re.compile(r'(\d+(?:\.\d+)?)\s*(萬)?\s*(?:美元)?\s*[~～]\s*(\d+(?:\.\d+)?)\s*(萬)?\s*(?:美元)?')
    m = pat.search(text)
    if m:
        min_v = float(m.group(1)) * (10000 if m.group(2) else 1)
        max_v = float(m.group(3)) * (10000 if m.group(4) else 1)
        return int(min_v), int(max_v)
    return None
```

抽到的優先用,抽不到再走 master 規則 C 預設值。

---

### 🎯 declared_rate 直接抽

安達商品 R3C9 直接是 `guaranteed_rate`(數字 e.g. 2.25):

```python
r3c9 = ws.cell(3, 9).value
if isinstance(r3c9, (int, float)):
    declared_rate = r3c9 / 100  # 注意要 /100
```

---

### 🎯 base_premium / gross

安達 R4 row 抽 base_premium / gross:

```python
## R4 col 多個位置可能,用 keyword 找
for c in range(1, 30):
    v = ws.cell(4, c).value
    if isinstance(v, str) and '年繳' in v:
        # 右側格子
        for cc in range(c+1, c+5):
            val = ws.cell(4, cc).value
            if isinstance(val, (int, float)) and val > 0:
                base_premium = val
                break
```

---

### 🆔 anim plan_code 規律

- `RPISWLB` / `RPISWLA` / `RPI` 系列
- 多年期通常用不同 plan_code

---

### 📦 部署資料夾

`data/chubb/<plan_code>.json`(全小寫)

---

### ⚠️ 安達目前狀態(2026-05-07)

- 已部署 6 個(RPISWLB 取代 + 5 純新增)
- 5/6 第一輪安達 6 個 JSON 不在工作區,如有 404 需要老闆重新上傳

---


## 附錄 09:凱基人壽 (`KGI/`,大寫!)

> 凱基特色:**多年期同 plan_code**(規則 E)、特殊引擎 `kgi_rv_v1`(2 個商品)、養老型展示。

---

### 🎯 多年期同 plan_code

凱基商品慣性:同 plan_code 包多年期,JSON 內含所有年期 → manifest 寫 1 條 entry。

範例:
```
6UBS.json
├── meta: { plan_code: "6UBS", periods: [6, 10, 15] }
├── schedule_6:  [...]
├── schedule_10: [...]
└── schedule_15: [...]
```

manifest 只寫 1 條,前端 STEP1 後讓老闆選年期。

---

### 🔧 凱基特殊引擎 kgi_rv_v1

2 個商品(具體 plan_code 待補,可從 manifest 查 `engine='kgi_rv_v1'`)走特殊引擎,**個案處理**,沒有自動 extractor。

---

### 🎯 養老型偵測

```python
## 試算頁 + 商品名「養老」 → 凱基養老
if '試算頁' in wb.sheetnames and '養老' in product_name:
    engine = 'twlife_v1'
    is_endowment_type = True   # 不是 is_endowment(那是定期還本)
    product_type = 'endowment'
```

---

### 🆔 凱基 plan_code 規律

- 一律大寫英數開頭數字,如 `5UEC` / `5UED` / `5UEH` / `6U9Z` / `6UBS`
- 多年期同 code

---

### ⚠️ 凱基踩雷

1. **6U9Z Y10 cv_total=0** —— Y9 後轉繳清增額,正常設計但前端要規則 M 提示
2. **5UEC/5UED/5UEH/6U9Z 養老險前端展示** —— 規則 M 提示「養老型,Y10 滿期僅領回 cv」

---

### 📦 部署資料夾

`data/KGI/<plan_code>.json`(**大寫**!踩雷:寫成 `kgi/` 會 404)

manifest path 範例:
```json
{ "key": "6UBS", "path": "KGI/6UBS.json", ... }
```

---


## 附錄 10:新光人壽 (`skl/` + 根目錄)

> 新光特色:**直營版 vs 保經版兩種 sheet 結構**、`taishin_v1` 引擎(原台新代理留下的 schema)、UPD061 + 5/7 新增 2 個 taishin_v1 商品。

---

### 🎯 直營版 vs 保經版偵測

```python
## 新光直營版
if any(s in wb.sheetnames for s in ['DBV', 'SBN', 'CSV', 'AXT', 'RBN']):
    engine = 'twlife_v1'
    sub_type = 'skl_direct'

## 新光保經版
elif any(s in wb.sheetnames for s in ['GP', 'Corridor Rule', 'FACTOR']) and \
     not any(s in wb.sheetnames for s in ['gp_table', 'uv_table', 'div_table']):
    engine = 'twlife_v1'
    sub_type = 'skl_broker'

## 新光分紅(暫不支援)
elif all(s in wb.sheetnames for s in ['gp_table', 'uv_table', 'div_table']):
    engine = 'taishin_v1'  # 原台新代理 schema
```

---

### 🔧 taishin_v1 引擎

3 個商品(UPD061 + 5/7 新增 2 個)走 taishin_v1。**個案處理,沒有自動 extractor。**

特徵:`gp_table / uv_table / div_table` 三 sheet 結構。

---

### 🆔 新光 plan_code 規律

- 直營:`UPD061` / 三碼字母 + 數字
- 保經:`UPDxxx` / 字母縮寫 + 數字

---

### 📦 部署資料夾

| 類型 | 資料夾 | 範例 |
|---|---|---|
| 主流商品 | `data/skl/` | 大多數 |
| 早期商品 | `data/`(根目錄) | UPD061 等歷史商品 |

新部署一律放 `skl/`。歷史在根目錄的不動。

manifest path 範例:
- 新增:`skl/XXX.json`
- 歷史:`UPD061.json`(無前綴)

---

## 🎁 v6.1 vs v6.0 差異

- **v6.0**:11 份檔(master + 10 附錄 + README + engines/),拆開維護
- **v6.1**:1 份合一檔(本檔)+ engines/(5 隻 .py)

適用情境:
- v6.1(本檔)→ 老闆懶得選檔,永遠丟一個 .md
- v6.0 → 處理某家只讀 ~1700 行,巨檔讀 ~2500 行

**🔚 v6.1 合一版結束**
