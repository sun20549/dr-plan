# 費率 JSON Schema 規範

每個商品一個 JSON 檔,放在 `data/{公司簡稱}/{商品代碼}_{YYYY-MM}.json`。
所有欄位必須正確,否則前端會載入失敗或計算錯誤。

---

## 完整結構範例

```json
{
  "product_name": "新光人壽美鴻添富美元分紅終身壽險",
  "company_name": "新光人壽",
  "company_logo": "../../images/img_05_1d05f38a7f49.png",
  "approval_no": "SK-03-114121704",
  "effective_date": "2026-04-01",
  "data_version": "001",

  "discounts": {
    "high_premium_tiers": [
      {"min_prem": 0,     "max_prem": 9999,      "rate": 0.0},
      {"min_prem": 10000, "max_prem": 14999,     "rate": 0.005},
      {"min_prem": 15000, "max_prem": 19999,     "rate": 0.01},
      {"min_prem": 20000, "max_prem": 999999999, "rate": 0.015}
    ],
    "first_period": 0.01,
    "renewal": 0.01,
    "note": "門檻為原始年保費(USD),非投保面額"
  },

  "pay_freq_factors": {
    "一次繳": 1.0,
    "年繳":   1.0,
    "半年繳": 0.520,
    "季繳":   0.262,
    "月繳":   0.088
  },
  "pay_freq_periods": {
    "一次繳": 1,
    "年繳":   1,
    "半年繳": 2,
    "季繳":   4,
    "月繳":   12
  },

  "products": [
    {
      "code": "UPD061",
      "name": "新光人壽美鴻添富美元分紅終身壽險",
      "pay_years": 6,
      "currency": "美元",
      "unit": "萬元",
      "mature_age": 110,
      "min_age": 0,
      "max_age": 75,
      "reserve_rate": 0.0225
    }
  ],

  "gp": {
    "UPD061": {
      "M": {"0": 13.9, "1": 14.6, "...": "..."},
      "F": {"0": 12.5, "1": 13.1, "...": "..."}
    }
  },

  "corridor": {
    "UPD061": {"1": 0.3, "2": 0.6, "3": 0.9, "...": "..."}
  },

  "uv": {
    "UPD061": {
      "M": {
        "55": [
          [0, 0, 620.001],
          [71.26, 53.45, 632.99],
          "..."
        ]
      }
    }
  },

  "div": {
    "UPD061": {
      "M": {
        "55": [
          [0, 0, 0],
          [0, 0, 0],
          [2.666, 0, 0],
          "..."
        ]
      }
    }
  },

  "c_floor_nsp": {
    "UPD061": {
      "M": {"55": 905.664, "56": "..."}
    }
  }
}
```

---

## 欄位說明

### 商品識別

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `product_name` | string | ✅ | 完整商品名稱,顯示於 Hero/列印抬頭 |
| `company_name` | string | ✅ | 公司名稱(短名,如「新光人壽」) |
| `company_logo` | string | ✅ | LOGO 路徑(相對於 `life/index.html`) |
| `approval_no` | string | ✅ | 核准文號(顯示於商品 meta) |
| `effective_date` | string | ✅ | 啟用日期 `YYYY-MM-DD` |
| `data_version` | string | – | 資料版本(內部追蹤用) |

### `discounts` 折扣設定

#### `high_premium_tiers` — 高保費折扣級距

陣列,每筆 `{min_prem, max_prem, rate}`:
- `min_prem` / `max_prem`:**原始年保費 USD**(不是面額!)
- `rate`:折扣比例(0.015 = 1.5%)

⚠️ **常見錯誤**:把單位當成「面額千美元」或「面額萬美元」。
正確是「原始年保費 USD」。例如 100 萬美元面額 GP 142.4 → 年保費 142,400 USD → 落在 ≥ 20,000 級距 → 1.5%。

#### `first_period` / `renewal`

數字,首期 / 續期繳費折扣(通常 0.01 = 1%,適用金融機構自動轉帳)。

### `pay_freq_factors` / `pay_freq_periods` 繳別係數

* `factors`:每期保費 = 原始年保費 × factor
* `periods`:每年繳幾次

⚠️ 不同公司係數可能不同,務必依官方表格抓。

### `products` 商品定義(陣列)

每個 plan_code 一個 entry。常見一個商品檔含 1-2 個 plan(例如 UPD061 6 年 + UPD101 10 年)。

| 欄位 | 說明 | 範例 |
|------|------|------|
| `code` | plan code | `"UPD061"` |
| `name` | 全名 | `"新光人壽美鴻添富美元分紅終身壽險"` |
| `pay_years` | 繳費年期 | `6` |
| `currency` | `"美元"` / `"新台幣"` | `"美元"` |
| `unit` | 投保金額單位 | `"萬元"` |
| `mature_age` | 滿期年齡 | `110` |
| `min_age` / `max_age` | 投保年齡上下限 | `0` / `75` |
| `reserve_rate` | 預定利率(用於資訊顯示) | `0.0225` |

### `gp` — 原始保費費率表

```
gp[plan][sex][age] = 每萬美元面額的單位費率
```

* `plan`:plan_code (如 `"UPD061"`)
* `sex`:`"M"` 或 `"F"`(字串)
* `age`:`"0"` 到 max_age 的字串 key

公式:`年保費 = gp × 投保金額(萬美元) × 10`

### `corridor` — 各年度保額係數

```
corridor[plan][yr] = 該年度保額 / 投保金額
```

`yr` 是字串 key `"1"` ~ `"110"`。

公式:`年度末身故金 C = corridor[yr] × 投保金額(USD)`

### `uv` — 保單價值表

```
uv[plan][sex][age] = [
  [NFV_yr0, CSV_yr0, NSP_yr0],
  [NFV_yr1, CSV_yr1, NSP_yr1],
  ...
]
```

每年 3 個數字(per 千美元面額):
* `NFV`:保單價值準備金
* `CSV`:解約金
* `NSP`:單筆保費(用於計算分紅買增額繳清)

公式:
* `年度末解約金 D = CSV × 投保金額(萬美元) × 10`
* `增額繳清面額 = AD / NSP × 1000`
* `累計增額解約金 G = E × NSP / 1000`

### `div` — 分紅資料

```
div[plan][sex][age] = [
  [AD_yr0, TDD_yr0, TDS_yr0],
  [AD_yr1, TDD_yr1, TDS_yr1],
  ...
]
```

中分紅情境(per 千美元面額):
* `AD`:年度紅利
* `TDD`:終期身故紅利
* `TDS`:終期解約紅利

⚠️ TDD 與 TDS 在前端使用時要取**前一年索引** (`year - 1`),這是新光 Excel 的 TD_IND 邏輯。

### `c_floor_nsp` — C 下限(高齡保護)· 美鴻添富用

```
c_floor_nsp[plan][sex][age] = 最終 NSP 值(千美元)
```

當 `corridor[yr]` 降到很低時(極高齡),C 會卡在這個 floor,避免異常低值。

公式:`C = max(corridor[yr] × face, c_floor_nsp × face × 10)`

### `corridor_criteria` + `funeral_cap_usd` — 美鴻世代專屬

```
corridor_criteria[attainedAge] = 年齡別倍率(0-30=2.1、31-40=1.8、41-50=1.6…)
funeral_cap_usd = 22439.02   # NTD 690,000 ÷ 30.75
```

美鴻世代 C 公式三段邏輯:
1. **保險年齡 ≤ 15** → C = `funeral_cap_usd`(15 歲以下喪葬費用上限)
2. **保險年齡 ≥ 16** → `C = max(corridor[yr] × face_USD, NFV × face_USD / 1000 × corridor_criteria[age])`

未滿 15 歲時 F=0(累計增額身故金不適用),J = C + F + H 數值上等於 funeral_cap + I。

### Per-product 欄位(美鴻世代啟用)

放在 `products[]` 內,優先於 top-level 同名欄:

| 欄位 | 說明 |
|------|------|
| `discounts` | 折扣設定(覆蓋頂層) |
| `pay_freq_factors` | 繳別係數(覆蓋頂層) |
| `pay_freq_periods` | 繳別期數(覆蓋頂層) |
| `face_max_wan` | 投保上限(成人)— 預設 1000 萬 |
| `face_max_wan_young` | 投保上限(0-15 歲)— 預設 200 萬 |

---

## 加新公司商品的流程

1. 拿到該公司的試算 Excel,放在 `private/sources/{公司}/`
2. 在 `tools/extract_xls.py` 加一個 adapter 函式(或修改現有 schema 對應)
3. 跑 `python3 tools/extract_xls.py --company {公司簡稱} {input.xls} {output.json}`
4. 在 `data/_catalog.json` 加 entry:
   ```json
   {
     "code": "fubon",
     "name": "富邦人壽",
     "logo": "../../images/fubon-logo.png",
     "products": [
       {
         "code": "FBXXX",
         "name": "富邦XXX商品",
         "short": "富邦XXX",
         "currency": "USD",
         "pay_years": 6,
         "data_file": "fubon/FBXXX_2026-05.json",
         "plan_code": "FBXXX",
         "effective_date": "2026-05-01",
         "version": "001"
       }
     ]
   }
   ```
5. 重新整理瀏覽器測試
6. 對照官方 PDF 至少 2 個案例(高 / 低面額)驗證計算結果

---

## 驗證 Checklist

新商品上線前一定要對照官方 PDF 確認:
- [ ] 第一年實繳保費(任一案例)
- [ ] 年度末身故金 C(第 1、6、20 年)
- [ ] 年度末解約金 D(第 1、6、20 年)
- [ ] 累計增額面額 E(第 5、10 年)
- [ ] 終期紅利 H、I(出現首年 + 第 20 年)
- [ ] 高保費折扣級距套用正確(< 1 萬 / 1-1.5 / 1.5-2 / ≥ 2 萬美元 USD 保費)

通過後再 push,並在 CHANGELOG 留下驗證紀錄。
