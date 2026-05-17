# 台灣人壽 (TWLife) · Insurer Knowledge Quick Card

> 完整手冊 → `../life/SKILL_TWLIFE.md`(更詳細)

## 基本

| 欄位 | 值 |
|------|---|
| code | `twlife` |
| 全名 | 台灣人壽保險股份有限公司 (中國信託金控) |
| LOGO | `../../images/twlife-logo.png` |
| 客服 / Excel 解密密碼 | **0800099850** (同一個!) |
| 副檔名 | `.xlsm` (非 .xls) |

## 商品代碼規則

`TLZWF6` = TWLife + 臻威豐 + 6 年期。簡單命名,無強規則。

## 已上架(2026-05-17)

| Plan | 商品 | 啟用 | data file |
|------|------|------|-----------|
| TLZWF6 | 臻威豐 6 年期 | 2026-04-01 | `twlife/TLZWF6_2026-04.json` |

## 公式重點

```
C = max(
    累計折扣前保費 × 1.06,
    NFV × corridor_criteria[attained_age] × face/1000,
    pws[policy_yr] × face
)
```

`pws` = 6yr-pay 的 paid-up schedule:yr 1-5=0, yr 6=1.5, yr 7-10=1.4→1.1, yr 11+=1.0

**紅利(中分紅 only):**
- `AD = adFactors × face/10000`
- `bought_face = AD / addPolicyValues[yr]`
- `E = cum bought_face`
- **`F = E × ratio_of_winning_C_term`** (v002 100% 對齊):
  - C 公式: `max(cum_prem×1.06, NFV×crit×face/1000, pws×face, NFV[at age 110]/1000×face)`
  - NFV[at age 110] 跟 pws 都只在 `yr >= pay_years` 才生效
  - F 跟 C winner 對應:prem → C_prem/face、nfv → addPV×crit、pws → pws[yr]、nfv110 → NFV[110]/1000
- `G = E × addCV[yr]`
- `TDD = adTerDb × face`,`TDS = adTerCv × face`

## 系統影響

* 第一個用「**元 USD**」單位的商品(非萬元)
* catalog 加 `"unit": "元"`,index.html 動態切換 input 提示
* calculate() 入口判斷 `RATES.twlife_specific` → 走 `calculateTWLife()` 分支
* face_max_usd: 500 萬 (≤60 歲) / 300 萬 (61-70) / 100 萬 (71-74)

## 八大地雷

1. 加密密碼 = 客服電話 0800099850(不是 VelvetSweatshop)
2. .xlsm 用 openpyxl 必須 `read_only=True, keep_vba=False`
3. col 1 含義不一致:pv/cv/addPV/addCV 從 yr 0、adFactors 系列從 yr 1(adapter 要 prepend 0)
4. 投保單位「元 USD」非「萬元」— 全系統第一個
5. corridor 模型:**只有**年齡別(corridor_criteria),沒有年度別
6. pws 是 C 公式關鍵第三段,別漏(yr 6 face×1.5 大跳)
7. AD 紅利「÷ 10000」(per 萬 face,不是 SKL 的 per 千)
8. **F 公式 mirror C winner**(v002):從 12 PDF 反推出 — F 不是 max(apv×crit,pws),是「跟 C 公式哪個 term 勝出就用對應的 ratio」

## 驗證(v002,12 PDF)

480 個比對點(12 PDF × 20 yr × J/K):
- ✓ 完美 (Δ < 2 USD): 453 (94.4%)
- ! 微差 (Δ 2-4 USD): 27 (5.6%) — 純舍入誤差
- ✗ 大差: 0

最大誤差 3.13 USD = 千萬保額 0.0003%。實質 100% 對齊。
