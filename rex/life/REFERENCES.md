# 📚 REFERENCES · 上架新商品前的參考寶庫

> 從舊 `rex/compare/`(已凍結)搶救的有用資料,**唯讀** — 看設計、查真值、學結構。
> **嚴禁**從 `_reference/` 直接複製 JSON / 算結果。所有新商品 onboard 必須走 `SKILL.md` 流程,從 .xlsm 重抽 + PDF 對齊驗證。

---

## 1️⃣ Drew anchor 真值表 ⭐⭐⭐

**位置:** `_reference/drew_anchors.json` (結構化) + `_reference/drew_anchors_raw/*.txt`(原始 18 檔)

**內容:** 業務員 Drew 收集的官方試算真值,16 個 anchor × 247 條真值記錄 / 72 獨立商品。

**Anchor 命名:** `{period}_{age}{sex}_{currency}.txt`
* 例:`06_21M_NTWD` = 6 年期 / 21 歲男 / 台幣
* 涵蓋:1/2/3/5/6/8/10/12/20 年期 × 21M/30F/41M/50F/51F/54F/61F

**每條記錄欄位:**
```json
{
  "company": "友邦人壽",
  "name": "增利High利率變動型終身壽險",
  "plan_code": "NISL",
  "pay_yr": 6,
  "total_face": 3310000,    // 總保額(算出來的)
  "gross_prem": 3043545,    // 折扣前年保費
  "net_prem": 2998044       // 折扣後年保費
}
```

**怎麼用:**
1. 上架新商品時,查 anchor 內有沒有同 `(plan_code, period, age, sex, budget)` 記錄
2. 有的話 = 已有真值,我抽出來的數字直接對 — 等同 PDF 級驗證
3. 沒的話 = 走 SKILL.md PDF 對照流程

**範例呼叫:**
```python
import json
anchors = json.load(open('_reference/drew_anchors.json'))
# 找「友邦 NISL 6年期 21M 台幣 3M 預算」真值
for p in anchors['06_21M_NTWD']['products']:
    if p['plan_code'] == 'NISL':
        print(p)  # 找到 → 驗證對照
```

---

## 2️⃣ 535 商品清單(去重後 491)⭐⭐

**位置:** `_reference/product_inventory.json`

**內容:** 13 家公司 / 491 個獨立商品代碼 + 商品全名 + 對應 engine。

**公司分佈:**
| 公司 | 商品數 |
|------|--------|
| 富邦人壽 | 88 |
| 凱基人壽 | 64 |
| 全球人壽 | 62 |
| 台灣人壽 | 61 |
| 保誠人壽 | 50 |
| 遠雄人壽 | 49 |
| 新光人壽 | 42 |
| 友邦人壽 | 36 |
| 元大人壽 | 17 |
| 安達人壽 | 10 |
| 第一金/台新/臺銀 | 12 |

**怎麼用:** 上架前查「這家公司現有哪些商品」、「商品代碼長什麼樣」。**不要信內部數字,只用結構參考**。

---

## 3️⃣ 11 個各公司 extractor + 萬用指令 ⭐⭐⭐

**位置:** `_reference/extractors/`

| 公司 | 檔案 | 類型 | 備註 |
|------|------|------|------|
| 友邦 (AIA) | `友邦aia_engine.py` | Python | 已驗 23 商品(UED/UWHL/NHISWL...)|
| 友邦 | `友邦extract_cli.py` | Python | 批次跑 |
| 友邦 | `友邦_recalc.py` | Python | 重算工具 |
| 保誠 | `保誠prudential_extractor.py` | Python | 三情境分紅型 |
| 富邦 | `富邦excel_to_json_v5_engine.py` | Python | v5 引擎 |
| 富邦 | `富邦-...指令_v5_萬用整合終極版.md` | Markdown | 5 公司/294 商品實戰 |
| 全球 | `全球-...指令_v5_...md` | Markdown | |
| 台灣 | `台灣-...指令_v5_...md` | Markdown | |
| 安達 | `安達-...指令_v4_萬用整合版.md` | Markdown | |
| 法國巴黎 | `法國巴黎-...指令_v5_...md` | Markdown | |
| 遠雄 | `遠雄-...指令_v5_...md` | Markdown | |

**3 個 engine 類型(看 markdown 指令了解):**
- `twlife_v1` — 純逐年表型(60% 商品)
- `prudential_v2` — 三情境分紅型(25% 商品)
- `simple_print_v1` — 簡單列印頁型(5% 商品)

**怎麼用:**
1. 上架某公司新商品前,先看對應 extractor 的程式碼 / 指令 markdown
2. 了解 Excel 工作表結構、特殊欄位、踩過的雷
3. **但抽出來的數字一律重新走 SKILL.md 8 步流程驗證**,不可信任舊邏輯

---

## 🚫 BOUNDARY 規則(再強調)

* ❌ 不可從 `_reference/` 複製任何 JSON 到 `data/`
* ❌ 不可在 production calc 內 import `_reference/extractors/*.py`
* ❌ 不可信任任何「verified_against」標籤(舊系統都標但實際沒對齊)
* ✅ 可以讀來「學設計」、「找真值對照」、「查商品代碼」

---

## 上架新商品的標準 SOP(整合 reference 後)

1. **Step 0(新增)** — 查 reference:
   - 看 `product_inventory.json` 確認商品代碼
   - 看 `drew_anchors.json` 是否有真值記錄(有 → 多一條驗證軌道)
   - 看 `extractors/<公司>*` 了解結構與雷
2. Step 1-8 走 `SKILL.md` 標準流程
3. 驗證:PDF 對照 + Drew anchor 對照(如有),雙重對齊才能 enable

---

## Reference 維護

* 此資料夾為 **2026-05-17 從 compare/ 一次性 snapshot**
* 之後 compare/ 若有更新不會 sync 過來(刻意脫鉤)
* 若需更新 anchor,跑 `tools/refresh_references.py`(未寫,需要時再做)
