# 新光人壽 (SKL) · Insurer Knowledge Quick Card

> 完整手冊 → `../life/SKILL_SKL.md`(338 行)
> 本檔是 quick reference,給未來 session 快速 orient 用。

## 基本

| 欄位 | 值 |
|------|---|
| code | `skl` |
| LOGO | `../../images/img_05_1d05f38a7f49.png` |
| 核准文號格式 | `SK-XX-XXXXXXXXX` |
| Excel 密碼 | `VelvetSweatshop` (MS Office 預設) |
| 客服 | 0800-031-115 |

## 商品代碼規則

`UPD061` 6 字元:`UPD` 美元分紅 + `0` 美鴻系列 + `6` 6 年期 + `1` 主版。

## 已上架(2026-05-17 為止)

| Plan | 商品 | 啟用 | 核准 | data file |
|------|------|------|------|-----------|
| UPD061 | 美鴻添富 6 年 | 2026-04-01 | SK-03-114121704 | `skl/UPD061_UPD101_2026-04.json` |
| UPD101 | 美鴻添富 10 年 | 2026-04-01 | SK-03-114121704 | (同上,共享) |
| UPD012 | 美鴻世代 躉繳 | 2026-01-01 | SK-03-114121703 | `skl/UPD012_UPD022_2026-01.json` |
| UPD022 | 美鴻世代 2 年 | 2026-01-01 | SK-03-114121703 | (同上,共享) |

## 公式重點

**美鴻添富(簡單):** `C = corridor[yr] × face_USD`,折扣放 JSON 頂層。

**美鴻世代(複雜):** 三段邏輯,折扣 per-plan:
1. 保險年齡 ≤ 15 → `C = funeral_cap_usd` (22,439.02 USD,NTD 690k/30.75)
2. ≥ 16 → `C = max(corridor[yr]×face, NFV×face/1000×corridor_criteria[age])`
3. 未滿 15 時 F=0

## 八大地雷

1. Excel 加密但無密碼 → 用 `VelvetSweatshop`
2. NFV/CSV/NSP 是 per 千 USD(不是萬)
3. TDD/TDS 用「前一年」index(`year - 1`)
4. 美鴻世代未滿 15 歲:C=cap、F=0、age 16 那年大跳
5. UPD012 只支援一次繳,別 hardcode 年/半月/季/月繳
6. 高保費門檻單位是 **USD 保費**(不是萬美元面額)
7. `corridor[yr]` 跟 `corridor_criteria[age]` 是兩張獨立表,key 不一樣
8. 商品代碼前綴 6 字元(`k[:6]` 切割)

## 驗證 SOP

至少跑 3 個 PDF 案例,誤差 ≤ 0.01 USD:
- 未滿 15 案例(驗 funeral cap)
- 成人低面額(驗年齡別 criteria 公式)
- 成人高面額(驗高保費折扣 + TDD/TDS 偏移)
