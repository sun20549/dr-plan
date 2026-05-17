# Project · rex/life/

壽險商品試算頁,目前是 rex 內主力產品。

## 架構

```
life/
├── index.html              # 通用試算頁 (~137 KB, 2700+ 行)
├── compare.html            # 多商品比較頁
├── data/
│   ├── _catalog.json       # 商品目錄(輕量)
│   └── skl/                # 新光商品費率 JSON
├── settings.json           # LINE / 業務員 / FX 設定
├── tools/extract_xls.py    # Excel → JSON 抽取工具
├── private/sources/        # 原始 .xls (.gitignore 保護)
├── SKILL.md                # 通用上架流程
├── SKILL_SKL.md            # 新光人壽專屬手冊
├── SCHEMA.md               # JSON 欄位規範
├── CHANGELOG.md            # 版本紀錄
└── JIRA_TICKET.md          # 每次 push 的 Jira 文案
```

**HTML/JS 完全資料驅動** — 新商品只要丟 JSON + 改 catalog,完全不用動 index.html。

## 商品選單(3 段下拉)

```
保險公司  →  商品系列(family)  →  年期(term)
[新光人壽] [美鴻添富 / 美鴻世代]   [6 年/10 年/躉繳/2 年]
```

`_familyOf()` / `_termOf()` 有 fallback,catalog 缺欄位不會掛。

## 計算邏輯雙軌

兩種商品計算公式不一樣,calculate() 用旗標自動切換:

| 商品 | C 公式 | 折扣位置 | 繳別 |
|------|--------|----------|------|
| 美鴻添富 (UPD061/101) | `corridor[yr] × face` (簡單) | JSON 頂層 `discounts` | 年/半年/季/月繳 |
| 美鴻世代 (UPD012/022) | 三段:funeral_cap / corridor × face / NFV × face × criteria | `products[].discounts` (per-plan) | UPD012 只一次繳 |

判斷依據:JSON 是否有 `funeral_cap_usd` + `corridor_criteria` 欄位。

## 列印 PDF 重點

- A4 橫向,@page margin 12mm × 18mm
- `.container` 限寬 240mm 置中(避免拉伸)
- 封面 P1 + Hero/圖表 P2 + 試算表 P3+(每頁 20 列)
- 浮水印「僅供試算 · 非正式建議書」對角線淡灰

## 客戶記錄

- 存 `localStorage` (`customers-v1`)
- 跟 index.html 完全分離,更新版本**不會遺失**
- 換瀏覽器 / 清資料才會清,所以建議用「匯出 JSON」備份
