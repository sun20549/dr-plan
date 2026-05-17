---
name: twlife-life-product
description: 上架「台灣人壽 (中國信託金控)」壽險商品到 rex/life 試算系統的專屬細節。涵蓋 TWLife Excel 結構、商品代碼、計算公式、加密密碼、地雷、已上架清單。當提到台灣人壽、twlife、臻威豐、TLZWFxx 商品時觸發。其他公司請看 SKILL.md 通用流程。
---

# 台灣人壽 (TWLife) 商品上架專屬 Skill

> 通用流程看 `SKILL.md`。本檔記錄**只在台灣人壽適用**的細節。

---

## 公司基本資料

| 項目 | 值 |
|------|---|
| 公司簡稱 (code) | `twlife` |
| 公司全名 | 台灣人壽保險股份有限公司 (中國信託金控) |
| 客服 | **0800-099-850** |
| LOGO | `../../images/twlife-logo.png` |
| 核准文號格式 | (TODO,待補) |
| Excel 副檔名 | **.xlsm** (新光是 .xls) |
| Excel 解密密碼 | **`0800099850`** (客服電話!) |

---

## Excel 結構

TWLife 用 `.xlsm` 格式,加密用客服電話當密碼。openpyxl 讀時要 `read_only=True` 避開 drawings parsing bug:

```python
import msoffcrypto, io
from openpyxl import load_workbook
office = msoffcrypto.OfficeFile(open(src,'rb'))
office.load_key(password='0800099850')
out = io.BytesIO(); office.decrypt(out); out.seek(0)
wb = load_workbook(out, read_only=True, data_only=True, keep_vba=False)
```

### 工作表清單(48 sheets,多)

| 用途 | sheet 名 |
|------|---------|
| 輸入 | `要保資料輸入` |
| 商品定義 | `PolicySetup` |
| 費率 | `premrates`(GP equivalent) |
| Corridor | `CorridorRate`(年齡別,非年度別!) |
| 保價/解約 | `policyValues` / `cashValues` (col 1 = yr 0) |
| 增額 RPU | `additionalPolicyValues` / `additionalCashValues` (col 1 = yr 0) |
| 中分紅 | `adFactors` / `adTerDbFactors` / `adTerCvFactors` (col 1 = yr 1) |
| Paid-up | `pws`(key '06001'=6yr-pay yr 1, value 1.5 at yr 6) |
| 高保費折扣 | `LargePremiumDiscountSetup` |
| 高面額折扣 | `LargeFaceAmounDiscountSetup`(有但 V1 未實作) |
| 免體檢 | `NonMedicalExamCoverage` |
| 繳別 | `PaymentModeSetup` |
| 試算結果(中分紅) | `Profits1` |
| 列印 | `簡易版` / `建議書` / `彙整表` / `明細版` |

### 索引格式

**premrates / policyValues / cashValues / addPV / addCV / adFactors / adTerDb / adTerCv:**
```
key = '{period:02d}{age:02d}{sex}'  
例: '0616M' = 6 年期 / 16 歲 / 男
```

**pws (paid-up schedule):**
```
key = '{period:02d}{policy_yr:03d}'  
例: '06006' = 6 年期 / 政策年度 6
```

### 重要:col 1 含義不一致

| sheet | col 1 對應 | 在 JSON 陣列中 |
|-------|-----------|---------------|
| policyValues / cashValues / addPV / addCV | yr 0 | index = yr |
| adFactors / adTerDb / adTerCv | yr 1 | **需 prepend 0,讓 index = yr** |

否則查表 off-by-one,J 會嚴重高估。adapter 一定要用 `col1_is_yr0=False` 對 adFactors 系列做 prepend。

---

## 計算公式(臻威豐 6 年期)

### Premium

```
表定年保費 (USD) = round(face_USD × premrate[key] / 1000)
```

例:M16 face 111,111 → 111.111 × 67.4 = 7,489 USD/yr

### 折扣

| 表定年保費 USD | 高保費折扣 | + 首期 1% | + 續期 1% | = 合併上限 |
|---------------|----------|----------|----------|----------|
| < 10,000 | 0% | 1% | 1% | 2% |
| 10,000-13,999 | 1% | 1% | 1% | **3%** |
| 14,000-17,999 | 2% | 1% | 1% | **4%** |
| ≥ 18,000 | 3% | 1% | 1% | **5%**(? 標籤寫 4%)|

(高面額折扣 LargeFaceAmount 表存在但 V1 未實作)

### C (年度末身故保險金) — 三段 max

```python
C = max(
    累計折扣前保費 × 1.06,                                   # premium-based floor
    NFV[key][yr] × corridor_criteria[attained_age] × face/1000,  # NFV-based
    pws[period_yr_key] × face                                     # paid-up boost
)
```

**`pws` 值表 (06xxxx = 6 年期 yr xxx):**
| 政策年度 | pws | 說明 |
|---------|-----|------|
| 1-5 | 0 | 繳費期間中,不適用 |
| 6 | 1.5 | 繳費完成當年,保額放大 1.5x |
| 7-10 | 1.4, 1.3, 1.2, 1.1 | 漸進降回 1.0 |
| 11+ | 1.0 | 穩定 |

**`corridor_criteria` 年齡別倍率:**
| Attained Age | corridor_criteria |
|-------------|-------------------|
| 0-30 | 2.1 |
| 31-40 | 1.8 |
| 41-50 | 1.6 |
| 51-60 | 1.3 |
| 61-70 | 1.2 |
| 71-90 | 1.05 |
| 91+ | 1.0 |

### D (年度末解約金)

```
D = CSV[key][yr] × face / 1000
```

### 紅利(中分紅)

```python
# 年度紅利金額
AD_USD_yr = adFactors[yr] × face / 10000

# 用紅利買增額繳清保險面額
bought_face_yr = round(AD_USD_yr / addPolicyValues[yr])

# 累計增額面額 (PDF 顯示為 D)
E = sum of bought_face_yr

# 累計增額身故金 (PDF 顯示為 E)
F = E × max(addPolicyValues[yr] × CorridorCriteria, pws[yr])
   # ⚠ elderly (age > 50) 在繳費期間中此公式不準,實際 PDF 用 ramp curve

# 累計增額解約金 (PDF 顯示為 G)
G = E × addCashValues[yr]

# 終期身故紅利 (PDF 顯示為 F)
TDD = adTerDbFactors[yr] × face

# 終期解約紅利 (PDF 顯示為 H)
TDS = adTerCvFactors[yr] × face

# 總身故 (PDF 顯示為 I = B + E + F)
J = C + F + TDD

# 總解約 (PDF 顯示為 J = C + G + H)
K = D + G + TDS
```

### 投保金額限制

| 年齡 | 上限 |
|------|------|
| 60 歲以下 | 500 萬 USD |
| 61-70 歲 | 300 萬 USD |
| 71-74 歲 | 100 萬 USD |
| 75+ | 不可投保 |

---

## 已上架商品清單

| Plan Code | 商品 | 啟用日 | 核准文號 | data file |
|-----------|------|--------|----------|-----------|
| TLZWF6 | 臻威豐美元分紅終身壽險(六年期) | 2026-04-01 | TWL-2026 (TODO 確認) | `twlife/TLZWF6_2026-04.json` |

---

## 驗證 SOP(TWLife 專屬)

對照 3 份 PDF (M16/F36/F56):

| 案例 | 年齡 | face_USD | 重點驗證 |
|------|-----|---------|---------|
| M16 | 16 | 111,111 | 年輕 + 折扣前 < 1萬 (0% 高保費),首期 1% only |
| F36 | 36 | 20,002 | 中年 + 折扣前 < 1萬,首期 1% only |
| F56 | 56 | 333,333 | elderly + 折扣前 ≥ 1.8萬 (3% 高保費 + 1% 首期 = 4% combined) |

至少驗 yr 1, 4, 6 的 J(身故總和)、K(解約總和)、首期保費。

目標:0.01 USD 以內。

**已知問題:F56 yr 4 增額身故 F 微差 ~75 USD = J 總和的 0.018%。** elderly 在繳費期間的 F 公式 PDF 用 ramp curve (0.5624→0.6960→1.5),非單純 addPV × Corridor。下版修。

---

## TWLife 地雷彙整

### 1. 加密密碼是客服電話
不是 VelvetSweatshop(新光),是 **0800099850**。不同商品可能不同。

### 2. .xlsm + openpyxl 衝突
要 `read_only=True, keep_vba=False`,否則 drawings parsing 會死。

### 3. col 1 含義不一致
- pv/cv/addPV/addCV: col 1 = yr 0
- adFactors/adTerDb/adTerCv: col 1 = yr 1
- 必須統一(adapter 對後者 prepend 0)否則 off-by-one

### 4. 投保單位「元」非「萬」
全系統第一個用「元 USD」單位的商品。catalog 加 `"unit": "元"` 標示,index.html 動態切換 input 提示。

### 5. corridor 模型
**沒有**年度別 corridor,**只有**年齡別 (`corridor_criteria`)。adapter 內 corridor 欄位設空 `{}`。

### 6. pws (Paid-up Schedule) 是關鍵
6yr-pay 在 yr 6 結束時,保額直接放大 1.5x。這是 C 公式三段 max 中重要的一段,別漏。

### 7. AD 紅利「除以 10000」
公式 `AD = adFactors × face / 10000`(per 萬 face,不是 per 千)。跟新光 SKL 不同。

### 8. F formula 對 elderly 有特殊 ramp(未解)
M16/F36 完美,但 F56 elderly 案例在繳費期間中 F 用某種 growth curve。
V1 用 `F = E × max(addPV × Corridor, pws)` 對 elderly 高估 ~0.02%。

### 9. 折扣級距單位
USD 保費(同新光),不是面額。1萬/1.4萬/1.8萬 USD 保費 → 1%/2%/3%。

---

## adapter 範本(extract_xls.py)

```python
def adapter_twlife_jenweifeng_6yr(src):
    """台灣人壽臻威豐 6 年期 — JSON 抽取"""
    import msoffcrypto, io, re
    from openpyxl import load_workbook

    office = msoffcrypto.OfficeFile(open(src,'rb'))
    office.load_key(password='0800099850')
    out = io.BytesIO(); office.decrypt(out); out.seek(0)
    wb = load_workbook(out, read_only=True, data_only=True, keep_vba=False)

    def get_table(sheet, period='06', col1_is_yr0=True):
        out = {}
        for row in wb[sheet].iter_rows(values_only=True):
            if not row[0] or not isinstance(row[0], str): continue
            m = re.match(r'^(\d{2})(\d{2})([MF])$', row[0])
            if not m or m.group(1) != period: continue
            age, sex = m.group(2), m.group(3)
            vals = [v or 0 for v in row[1:]]
            if not col1_is_yr0: vals = [0] + vals  # prepend yr 0
            out.setdefault(sex, {})[str(int(age))] = vals
        return out

    PERIOD = '06'
    # pv/cv/addPV/addCV: col 1 = yr 0 → index = yr
    pv = get_table('policyValues', PERIOD, col1_is_yr0=True)
    cv = get_table('cashValues', PERIOD, col1_is_yr0=True)
    apv = get_table('additionalPolicyValues', PERIOD, col1_is_yr0=True)
    acv = get_table('additionalCashValues', PERIOD, col1_is_yr0=True)
    # adFactors etc: col 1 = yr 1 → prepend 0
    adf = get_table('adFactors', PERIOD, col1_is_yr0=False)
    adb = get_table('adTerDbFactors', PERIOD, col1_is_yr0=False)
    adc = get_table('adTerCvFactors', PERIOD, col1_is_yr0=False)
    # ... build doc ...
```

---

## 相關檔案

* `SKILL.md` — 通用上架流程
* `SKILL_SKL.md` — 新光人壽專屬
* `SCHEMA.md` — JSON 欄位規範(twlife_specific 區段)
* `data/twlife/` — 台灣人壽 JSON
* `private/sources/twlife/` — 原始 .xlsm
