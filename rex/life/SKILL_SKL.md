---
name: skl-life-product
description: 上架「新光人壽」壽險商品到 rex/life 試算系統的專屬細節。涵蓋 SKL Excel 通用結構、商品代碼規則、計算公式差異(美鴻添富 vs 美鴻世代)、解密密碼、已知地雷、已上架清單。當使用者提到新光、SKL、UPDxxx 商品代碼,或要上架/維護新光商品時觸發。其他公司(富邦/友邦/安聯…)請看 SKILL.md 通用流程。
---

# 新光人壽 (SKL) 商品上架專屬 Skill

> 通用流程看 `SKILL.md`。本文件記錄**只在新光人壽適用**的細節 — 商品結構、公式、地雷、慣例。

---

## 公司基本資料

| 項目 | 值 |
|------|---|
| 公司簡稱 (code) | `skl` |
| 公司全名 | 新光人壽保險股份有限公司 |
| 客服 | 0800-031-115 |
| LOGO | `../../images/img_05_1d05f38a7f49.png` |
| 核准文號格式 | `SK-XX-XXXXXXXXX` (如 SK-03-114121703) |
| 主管機關 | 金管會保險局 |

---

## SKL Excel 通用結構

新光官方建議書 Excel(`.xls` 格式,xlrd 可讀):

### 解密

```python
import msoffcrypto, io, xlrd
office = msoffcrypto.OfficeFile(open('input.xls','rb'))
if office.is_encrypted():
    office.load_key(password='VelvetSweatshop')  # MS Office 預設密碼
    out = io.BytesIO(); office.decrypt(out); data = out.getvalue()
else:
    data = open('input.xls','rb').read()
wb = xlrd.open_workbook(file_contents=data, on_demand=True)
```

`VelvetSweatshop` 是 Microsoft Office 「無密碼但加密」的預設密碼,新光所有商品建議書都用這個。

### 常見工作表清單

| Sheet 名 | 內容 | 對應 JSON 欄位 |
|----------|------|----------------|
| `輸入頁` | 客戶輸入(姓名/性別/年齡/面額) | — (僅參考用) |
| `建議書-列印簽名` | 完整建議書欄位 | — |
| `商品利益表(不含紅利部份)` | 保證給付表 | — |
| `紅利彙總表(紅利部份)` | 中/低/零分紅情境表 | — |
| `OP` | 系統參數(繳別係數、折扣表、特殊上限) | `discounts`, `pay_freq_factors`, `funeral_cap_usd` |
| `Product_Setup` | 商品定義(代碼/年期/年齡上下限/預定利率) | `products[]` |
| `Proposal_Setup` | 列印設定 | — |
| `試算_最可能紅利` / `試算_較低紅利` / `試算_紅利為零` | 完整試算表(M/L/Z 三情境) | 驗證用 |
| `Result_DIV` | 紅利資料(AD/TDD/TDS × M/L/Z 共 6 欄) | `div[plan][sex][age]` |
| `Result_UV` | 保單價值(NFV/CSV/NSP) | `uv[plan][sex][age]` |
| `GP` | 原始保費率 | `gp[plan][sex][age]` |
| `Corridor Rule` | 兩條曲線:年度別 corridor + 年齡別 criteria | `corridor[plan]`, `corridor_criteria` |

### Result_UV / Result_DIV 命名規則

Index 格式:`{PlanCode}{Sex}{Age}-{Year}`

範例:
- `UPD012M4-1`  → UPD012 / 男 / 4 歲 / 第 1 年末
- `UPD012F35-0` → UPD012 / 女 / 35 歲 / 至發單時(yr 0)
- `UPD012F35-1` → UPD012 / 女 / 35 歲 / 第 1 年末

**注意:** `-0` 是「發單時」初值,`-N` 才是「第 N 年末」。本系統 JSON 內 `uv[plan][sex][age][N]` 對應 `-N` index。

### GP 表結構

```
GP[plan][sex][age] = 每千美元面額的單位費率
```

公式:`年保費 USD = GP × 投保金額(萬美元) × 10`

範例:M55 美鴻添富 GP=142.4 → 100 萬美元面額 → 142.4 × 100 × 10 = 142,400 USD/年

---

## SKL 商品代碼規則

```
UPD 0 6 1
||| | | |
||| | | └── plan variant (1=躉繳/年期版, 2=次要年期版)
||| | └──── 繳費年期代碼 (6=6年, 10=10年, 1=躉繳, 2=2年)
||| └────── 商品系列代碼 (0=美鴻系列, 1=...)
└────────── 產品線 (UPD=美元分紅)
```

實例:

| Plan Code | 商品 | 繳費 |
|-----------|------|------|
| `UPD061` | 美鴻添富 | 6 年期 |
| `UPD101` | 美鴻添富 | 10 年期 |
| `UPD012` | 美鴻世代 | 躉繳 |
| `UPD022` | 美鴻世代 | 2 年期 |

extract_xls.py 內 `pack_to_schema` 切割慣例:`k[:6]` = plan, `k[6]` = sex, `k[7:]` = age。

---

## 計算公式 — 商品差異

### A. 折扣模型

| 維度 | 美鴻添富 (UPD061/101) | 美鴻世代 UPD012 (躉繳) | 美鴻世代 UPD022 (2年期) |
|------|--------------------|-----------------------|------------------------|
| 高保費門檻 | 4 級 (< 1 萬 / 1-1.5 / 1.5-2 / ≥ 2 萬 USD) | 3 級 (< 6k / 6-10k / ≥ 10k USD) | 3 級 (< 3k / 3-5k / ≥ 5k USD) |
| 高保費折扣率 | 0% / 0.5% / 1% / 1.5% | 0% / 1% / 1.8% | 0% / 1% / 1.8% |
| 首期繳費折扣 (金融機構自動轉帳) | 1% | **0%** | 1% |
| 續期繳費折扣 | 1% | **0%** | 1% |
| 繳別 | 年/半年/季/月繳 | **只支援一次繳** | 年/半年/季/月繳 |
| 投保上限 | 1000 萬美元 | **750 萬美元** | **750 萬美元** |
| 0-15 歲上限 | 200 萬美元 | 200 萬美元 | 200 萬美元 |

**重點:** 美鴻添富的折扣放 JSON 頂層 `discounts`;美鴻世代必須**per-plan** 放在 `products[].discounts`(因為 UPD012/UPD022 規則不同)。

### B. 年度末身故金 C 公式

#### 美鴻添富 (UPD061/101)
```
C = corridor[年度] × 投保金額(USD)
# 高齡保護(可選): max(corridor × face, c_floor_nsp × face × 10)
```

#### 美鴻世代 (UPD012/022) ⚠️ 三段邏輯
```python
if 保險年齡 <= 15:
    C = funeral_cap_usd  # 22,439.02 USD (NTD 690,000 / fx 30.75)
else:
    C = max(
        corridor[年度] × face_USD,
        NFV[年度] × face_USD / 1000 × corridor_criteria[年齡]
    )
```

`corridor_criteria` 是年齡別倍率表(0-30 歲 2.1、31-40 歲 1.8、41-50 歲 1.6、51-60 歲 1.4...),從 `Corridor Rule` 工作表 column B 抽出。

**未滿 15 歲時 F = 0**(累計增額身故金不適用),J = C + F + H 變成 funeral_cap + I。

### C. 解約金 D / 增額 E/F/G / 紅利 H/I

兩商品共用:

```
D = CSV[年度] × face_USD / 1000
NSP = uv[年度][2]
bought = round(AD × 1000 / NSP)  # 當年買到的增額面額(per 千 USD)
cumE += bought
F = cumE × corridor[年度]  # 增額身故(under-15 時 = 0)
G = cumE × NSP / 1000      # 增額解約
H (TDD) = div[年度-1][1] × face_萬 × 10   # 終期身故紅利 — 取「前一年索引」!
I (TDS) = div[年度-1][2] × face_萬 × 10   # 終期解約紅利 — 同
J = C + F + H
K = D + G + I
```

⚠️ **TD_IND 偏移**: H/I 用 `year-1` 索引,這是 SKL Excel `TD_IND` 欄位的行為。不要寫 `year`。

---

## 已上架商品清單

| Plan | 商品名稱 | 啟用日 | 核准文號 | data file |
|------|---------|--------|----------|-----------|
| UPD061 | 美鴻添富美元分紅終身壽險(六年期) | 2026-04-01 | SK-03-114121704 | `skl/UPD061_UPD101_2026-04.json` |
| UPD101 | 美鴻添富美元分紅終身壽險(十年期) | 2026-04-01 | SK-03-114121704 | `skl/UPD061_UPD101_2026-04.json` |
| UPD012 | 美鴻世代美元分紅終身壽險(躉繳) | 2026-01-01 | SK-03-114121703 | `skl/UPD012_UPD022_2026-01.json` |
| UPD022 | 美鴻世代美元分紅終身壽險(二年期) | 2026-01-01 | SK-03-114121703 | `skl/UPD012_UPD022_2026-01.json` |

JSON 共享規則:同個檔案可以包多個 plan(美鴻添富 UPD061/UPD101 共用,美鴻世代 UPD012/UPD022 共用)。Catalog 各自指向同一檔即可。

---

## 驗證 SOP(SKL 專屬)

每個新 SKL 商品上線前**至少**對照 3 份官方 PDF:

| PDF 案例 | 驗證重點 |
|----------|----------|
| **未滿 15 歲案例**(如 M5 150 萬) | 確認 funeral cap 鎖在 22,439.02、F=0、age 16 那年 C 解除上限 |
| **成人低面額案例**(如 F35 30 萬) | 確認年齡別 corridor_criteria 公式正確、yr 1 C 不是 corridor × face 而是 PVR × criteria |
| **成人高面額案例**(如 M55 100 萬) | 確認高保費折扣級距套用正確、TDD/TDS 偏移 |

對照欄位最少:`A 當年保費`、`B 累計保費`、`C 身故`、`D 解約`、`H 終期身故`、`I 終期解約`。

**目標誤差:0.01 USD 以內**。超過就回頭查公式 / 索引偏移 / 折扣級距。

驗證腳本範本看 `outputs/` 內,有 Python(對照 PDF 文字)和 Node(跑 JS calc)兩種。

---

## SKL 地雷彙整

### 1. 加密但無密碼
新光所有建議書 Excel 是加密的,用 `VelvetSweatshop` 即可解。

### 2. NFV / CSV / NSP per 千 USD
不是 per 萬 USD。要乘 `face_USD / 1000` 不是 `× face_萬 × 10`(數值等價,但語意要清楚)。

### 3. TD_IND 偏移
H / I 用「前一年」index。新商品上架時對照 PDF 第 4 年的 H 值驗證一定要過。

### 4. 美鴻世代未滿 15 歲特殊邏輯
- C = funeral_cap_usd
- F = 0
- 但 H/I 照常顯示(雖然 J 不會用到 H,而是 funeral_cap + I)
- age 達 16 那年 C 直接跳到 corridor × face,落差很大(這是預期行為)

### 5. 美鴻世代 UPD012 「只支援一次繳」
- `products[].pay_freq_factors` 只放 `{"一次繳": 1.0}`
- index.html `refreshFreqOptions()` 會自動過濾 #freq 下拉
- 不要 hardcode 年/半年/季/月繳

### 6. 高保費門檻單位是「USD 保費」不是「萬美元面額」
這個常踩。例:M55 100 萬美元面額 → GP 142.4 → 年保費 142,400 USD ≥ 20,000 → 套用 1.5%。
**門檻數字是保費,不是面額。**

### 7. corridor_criteria 是「年齡」表,corridor 是「年度」表
- `corridor[plan][yr]` = 年度別保額係數(用於 corr × face)
- `corridor_criteria[age]` = 年齡別 PVR 放大倍率(用於 NFV × face/1000 × crit)
- 兩個查表的 key 完全不一樣,別搞混

### 8. 商品代碼前綴是 6 字元
`UPD061` 是 6 字元,`pack_to_schema` 內 `k[:6]` 切割 plan code。若未來新光出 7 字元商品代碼要改邏輯。

---

## SKL adapter 範本(extract_xls.py)

```python
def adapter_skl_meihong_shidai(wb):
    """新光美鴻世代 (UPD012/UPD022) — Excel 工作表結構"""
    # 1. GP
    gp = {}
    s = get_sheet(wb, 'GP')
    for r in range(1, s.nrows):
        plan = s.cell_value(r, 1); sex = s.cell_value(r, 2)
        age = int(s.cell_value(r, 3)); gp_val = s.cell_value(r, 5)
        if not plan: continue
        gp.setdefault(plan, {}).setdefault(sex, {})[str(age)] = gp_val

    # 2. Corridor (年度) + Criteria (年齡)
    s = get_sheet(wb, 'Corridor Rule')
    corridor = {'UPD012': {}, 'UPD022': {}}
    criteria = {}
    for r in range(s.nrows):
        a = s.cell_value(r, 0); crit = s.cell_value(r, 1)
        if isinstance(a, float) and isinstance(crit, (int, float)) and crit > 0:
            criteria[str(int(a))] = crit
        yr = s.cell_value(r, 3); u012 = s.cell_value(r, 4); u022 = s.cell_value(r, 5)
        if isinstance(yr, float) and isinstance(u012, (int, float)) and u012 > 0:
            corridor['UPD012'][str(int(yr))] = u012
            corridor['UPD022'][str(int(yr))] = u022

    # 3. Result_UV
    uv = parse_result_uv(wb)  # 用通用解析函式

    # 4. Result_DIV (取中分紅 AD/TDD/TDS 三欄)
    div = parse_result_div(wb, mid_cols=(1, 2, 3))

    # 5. Per-plan discounts
    def discounts_for(plan):
        if plan == 'UPD012':
            return {
                'high_premium_tiers': [
                    {'min_prem': 0,      'max_prem': 5999,      'rate': 0},
                    {'min_prem': 6000,   'max_prem': 9999,      'rate': 0.010},
                    {'min_prem': 10000,  'max_prem': 999999999, 'rate': 0.018},
                ],
                'first_period': 0, 'renewal': 0,
            }
        else:  # UPD022
            return {
                'high_premium_tiers': [
                    {'min_prem': 0,     'max_prem': 2999,      'rate': 0},
                    {'min_prem': 3000,  'max_prem': 4999,      'rate': 0.010},
                    {'min_prem': 5000,  'max_prem': 999999999, 'rate': 0.018},
                ],
                'first_period': 0.01, 'renewal': 0.01,
            }

    products = [
        {'code': 'UPD012', 'pay_years': 1, ...,
         'discounts': discounts_for('UPD012'),
         'pay_freq_factors': {'一次繳': 1.0},
         'pay_freq_periods': {'一次繳': 1},
         'face_max_wan': 750, 'face_max_wan_young': 200},
        {'code': 'UPD022', 'pay_years': 2, ...,
         'discounts': discounts_for('UPD022'),
         'pay_freq_factors': {'一次繳':1, '年繳':1, '半年繳':0.52, '季繳':0.262, '月繳':0.088},
         'pay_freq_periods': {'一次繳':1, '年繳':1, '半年繳':2, '季繳':4, '月繳':12},
         'face_max_wan': 750, 'face_max_wan_young': 200},
    ]

    return {
        'company_name': '新光人壽',
        'approval_no': 'SK-03-114121703',
        'company_logo': '../../images/img_05_1d05f38a7f49.png',
        'funeral_cap_usd': round(690000 / 30.75, 2),  # 22439.02
        'funeral_cap_note': '15歲以下喪葬費用上限 NTD 690,000 / fx 30.75',
        'corridor_criteria': criteria,
        'products': products,
        'gp': gp, 'corridor': corridor, 'uv': uv, 'div': div,
    }
```

---

## 未來 SKL 商品上架 checklist

新商品(同公司)要上時跑這個:

- [ ] 確認 plan code(如果不是 UPDxxx,確認 extract_xls 切割邏輯撐得住)
- [ ] 比對與現有商品的差異(折扣表/繳別/年齡限制/特殊上限)
- [ ] 若公式跟美鴻添富/世代不同 → 寫新 adapter 函式 + 在 `ADAPTERS` dict 加 entry
- [ ] 跑 extract → 對照 3 份 PDF(M5 / F35 / M55 之類)≤ 0.01 USD
- [ ] 寫入 `data/skl/{plan}_{YYYY-MM}.json`
- [ ] `_catalog.json` 加 entry (family / term / version 都填)
- [ ] 版本 bump、CHANGELOG、JIRA_TICKET 同步更新
- [ ] 列印 PDF 預覽:封面 / Hero / 表格 / 頁尾全部正常
- [ ] push

---

## 相關檔案

* `SKILL.md` — 通用上架流程(其他公司用)
* `SCHEMA.md` — JSON 欄位完整規範
* `tools/extract_xls.py` — 抽取主程式 + SKL adapter
* `data/skl/` — SKL 所有商品費率 JSON
* `private/sources/skl/` — 原始 .xls(.gitignore 保護)
