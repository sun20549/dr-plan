---
name: twlife-life-product
description: 上架「台灣人壽 (中國信託金控)」壽險商品到 rex/life 試算系統的專屬細節。涵蓋 TWLife Excel 結構、商品代碼、計算公式、加密密碼、地雷、已上架清單。當提到台灣人壽、twlife、臻威豐、TLZWFxx、美世長紅、美紅旺、美紅勝利、美紅富利、美紅鑽、TLMSCH、TLMHW、TLMHSL、TLMHFL、TLMHZ 商品時觸發。其他公司請看 SKILL.md 通用流程。
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
| Excel 副檔名 | **.xlsm** |
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

注意:**美紅旺(MHW)的 .xlsm 沒有加密**(可能新版的官方建議書去掉密碼了)。`msoffcrypto.is_encrypted()` 要先判斷,否則 decrypt 會拋。

### 工作表清單(視商品 47-55 sheets)

| 用途 | sheet 名 |
|------|---------|
| 輸入 | `要保資料輸入` |
| 商品定義 | `PolicySetup` |
| 費率 | `premrates` |
| Corridor | `CorridorRate`(年齡別,非年度別!) |
| 保價/解約 | `policyValues` / `cashValues` (col 1 = yr 0) |
| 增額 RPU | `additionalPolicyValues` / `additionalCashValues` (col 1 = yr 0) |
| 中分紅 | `adFactors` / `adTerDbFactors` / `adTerCvFactors` (col 1 = yr 1) |
| 低分紅 | `ldFactors` / `ldTerDbFactors` / `ldTerCvFactors`(對應後綴 _1=中 / _2=低 / _3=零) |
| Paid-up | `pws`(key '06001'=6yr-pay yr 1, value 1.5 at yr 6)— **不是所有商品都有** |
| 高保費折扣 | `LargePremiumDiscountSetup` |
| 還本險專屬 | `PBS_x` / `PBSCalculation_x` / `SPNP_x` / `IBS_x` / `INTR_x` / `Profits_x` / `PolicyYearFactorSetup` |

### 索引格式

```
key = '{period:02d}{age:02d}{sex}'  例: '0616M' = 6 年期 / 16 歲 / 男
pws key = '{period:02d}{policy_yr:03d}'  例: '06006' = 6 年期 / 政策年度 6
```

### col 1 含義不一致

| sheet | col 1 對應 | 在 JSON 中 |
|-------|-----------|----------|
| policyValues / cashValues / addPV / addCV | yr 0 | index = yr |
| adFactors / adTerDb / adTerCv | yr 1 | **需 prepend 0** |

---

## 計算公式(壽險,通用 4-way max)

### Premium

```
表定年保費 (USD) = round(face_USD × premrate[key] / 1000)
```

### 折扣級距

| 表定年保費 USD | 高保費折扣 |
|---------------|----------|
| < 10,000 | 0% |
| 10,000-13,999 | 1% |
| 14,000-17,999 | 2% |
| ≥ 18,000 | 3% |

加首期 1% + 續期 1%。

### C (身故保險金) — 4-way max

```
C = max(
    累計折扣前保費 × 1.06,
    NFV × corridor_criteria[attained_age] × face/1000,
    pws[policy_yr] × face,                                 # 沒 pws 表 → 跳過
    NFV[at attained_age 110]/1000 × face                   # yr ≥ pay_years 才生效
)
```

### F (累計增額身故) mirror C winner

```
prem    → F = E × C_prem / face
nfv     → F = E × addPV × CorridorCriteria
pws     → F = E × pws[yr]
nfv110  → F = E × NFV[at age 110]/1000
```

### 紅利 / D / G / TDD / TDS

```
AD = adFactors × face / 10000
bought = AD / addPolicyValues[yr]      # 用紅利買增額繳清面額
E = cumsum(round(bought))               # 整數累計(對齊 PDF 顯示)
G = E × addCashValues[yr]
D = CSV × face / 1000
TDD = adTerDbFactors × face
TDS = adTerCvFactors × face
J = C + F + TDD
K = D + G + TDS
```

---

## 滿期年處理 ★★★(v008 必修)

合約到 **保險年齡 110 歲** 滿期,給付「祝壽保險金」= 身故保險金。PDF 最後一列就是 attained = 110 那年,**J 完全等於 K**。

```js
// 必須 +1 才會包含滿期年那一列
const lastYear = prod.mature_age - age + 1;

// matYr = 111 - age (NOT 110 - age!) 因為 attained = age + yr - 1
const matYr = 111 - age;

// 滿期年 force K = J (祝壽保險金 = 身故保險金)
if (attainedAge >= 110) K_val = J_val;
```

PDF 對照:
| 案例 | 最後 yr | attained | J 身故 | K 解約/祝壽 |
|------|--------|---------|--------|-----------|
| M60 face 300k | 51 | 110 | 1,198,024.56 | **1,198,024.56** |
| M55 face 100k | 56 | 110 | 421,740.00 | **421,740.00** |

---

## 投保金額限制(臻威豐)

| 年齡 | 上限 |
|------|------|
| 60 歲以下 | 500 萬 USD |
| 61-70 歲 | 300 萬 USD |
| 71-74 歲 | 100 萬 USD |
| 75+ | 不可投保 |

其他 TWLife 商品未確認,**face_max_usd 預設 500 萬**,以官方為準。

---

## 已上架商品清單

### 已上線(catalog enabled)

| Plan Code | 商品 | 啟用日 | data file |
|-----------|------|--------|-----------|
| TLZWF6 | 臻威豐(六年期) | 2026-04-01 | `twlife/TLZWF6_2026-04.json` v009 |
| TLMSCH06 | 美世長紅(六年期) | 2026-04-01 | `twlife/TLMSCH06_2026-04.json` v001 |
| TLMHW06 | 美紅旺(六年期) | 2026-04-01 | `twlife/TLMHW06_2026-04.json` v001 |

### 已抽 JSON 但暫不上架(待驗證)

| Plan Code | 商品 | 為什麼 | 下一步 |
|-----------|------|--------|--------|
| TLMHSL01 / 02 | 美紅勝利(躉繳 / 2 年) | pws 衰減型(0.97→0.69,跟 TLZWF6 增益型相反) | 取 PDF 驗證 pws 邏輯 |
| TLMHFL01 | 美紅富利(躉繳) | adFactors 整張表為 0 | 問業務:無分紅 or 資料未填? |
| TLMHZ02 | 美紅鑽(2 年,還本險) | 還本險,需新公式(生存還本 + 增值回饋分享金 + 累計儲存生息) | 寫 `calculateTWLifeEndowment()` + 取 PDF |

---

## 驗證 SOP(TWLife 專屬)

對照 3 份 PDF (M16/F36/F56),目標 0.01 USD 以內。

**v002 已 100% 對齊**(12 PDF × 480 比對點,最大誤差 3.13 USD = 千萬保額 0.0003%)。

關鍵 insight:**F 公式跟 C 公式同一個 winner**,只是 nfv winner 那組,F 用 addPV (RPU 價) 不用 NFV (base 保價)。

---

## TWLife 地雷彙整(14 點)

### 1. 加密密碼是客服電話
不是 VelvetSweatshop(新光),是 **0800099850**。**美紅旺(MHW)沒加密**,要先判斷。

### 2. .xlsm + openpyxl 衝突
要 `read_only=True, keep_vba=False`,否則 drawings parsing 會死。

### 3. col 1 含義不一致
- pv/cv/addPV/addCV: col 1 = yr 0
- adFactors/adTerDb/adTerCv: col 1 = yr 1
- 必須 prepend 0 給後者,否則 off-by-one

### 4. 投保單位「元」非「萬」
全系統第一個用「元 USD」單位的商品。catalog 加 `"unit": "元"` 標示。

### 5. corridor 模型
**沒有**年度別,**只有**年齡別 (`corridor_criteria`)。adapter 內 corridor 欄位設空 `{}`。

### 6. pws (Paid-up Schedule) 是關鍵
TLZWF6 在 yr 6 結束時保額直接放大 1.5x。是 C 公式重要的一段。

### 7. AD 紅利「除以 10000」
公式 `AD = adFactors × face / 10000`(per 萬 face)。跟新光 SKL 不同。

### 8. F formula mirror C winner(v002 反推)
從 12 PDF 反推 — F 不是 max(apv×crit, pws),是「跟 C 公式哪個 term 勝出就用對應的 ratio」。

### 9. 折扣級距單位
USD 保費(同新光),不是面額。1萬 / 1.4萬 / 1.8萬 → 1% / 2% / 3%。

### 10. 滿期年必須包含 (attained = 110) ★★★ v008
- `lastYear = mature_age - age + 1`,差 1 就漏掉**最尾端那一列**
- 滿期年 force `K_val = J_val`(祝壽保險金 = 身故保險金)
- 用戶最會在「最後一列數字不見」抓到這個 bug

### 11. matYr 換算 attained 110 的 index
`matYr = 111 - age`(NOT `110 - age`),因為 `attained = age + yr - 1`。

### 12. 不是所有 TWLife 商品都有 pws(v009)★
- 有 pws:TLZWF6 / 美紅勝利
- **無 pws:美世長紅 / 美紅旺 / 美紅富利 / 美紅鑽**
- 計算時不能 fallback 為 1.0(會讓 C 永遠 ≥ faceUSD),要直接跳過:
  ```js
  const hasPws = Object.keys(pws).length > 0;
  const pwsYr = (hasPws && yr >= payYears) ? (pws[String(yr)] ?? 1.0) : 0;
  ```

### 13. 美紅勝利 pws 是衰減型(待驗證)
- TLZWF6: pws[06006]=1.5 → 衰減到 1.0(**增益型**)
- 美紅勝利: pws[01003]=1.0 → 衰減到 0.69(**衰減型**!)
- 計算器應該能處理(F 公式 winner dispatch 同樣套),但需 PDF 驗證

### 14. 還本險(美紅鑽 MHZ)是完全不同物種
- 多 7 個 sheets:PBS_x、PBSCalculation_x、SPNP_x、IBS_x、INTR_x、Profits_x、PolicyYearFactorSetup
- 公式:生存還本金(每年)+ 增值回饋分享金 + 累計儲存生息(0.62% 假設利率)
- **需要全新 `calculateTWLifeEndowment()` 函數**,不能套 `calculateTWLife()`

---

## adapter 範本

完整版本看 `tools/extract_xls.py` 或 `outputs/twlife_extract_all.py`(這次上 5 商品用過)。

```python
def extract_table(wb, sheet, period, col1_is_yr0=True):
    out = {}
    if sheet not in wb.sheetnames: return out
    for row in wb[sheet].iter_rows(values_only=True):
        if not row[0] or not isinstance(row[0], str): continue
        m = re.match(r'^(\d{2})(\d{2})([MF])$', row[0])
        if not m or m.group(1) != period: continue
        vals = [(v or 0) for v in row[1:]]
        if not col1_is_yr0: vals = [0] + vals
        out.setdefault(m.group(3), {})[str(int(m.group(2)))] = vals
    return out
```

---

## 相關檔案

* `SKILL.md` — 通用上架流程
* `SKILL_SKL.md` — 新光人壽專屬
* `SCHEMA.md` — JSON 欄位規範(twlife_specific 區段)
* `data/twlife/` — 台灣人壽 JSON(7 個檔)
* `private/sources/twlife/` — 原始 .xlsm(7 個檔)
