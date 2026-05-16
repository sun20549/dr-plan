# life/ — 分紅型壽險高精度試算工具

從各家壽險公司官方建議書 Excel 抽出費率與分紅資料,在瀏覽器裡重現「建議書試算」介面,支援多年期、多分紅情境、即時切換。

精度:**A/B/C/D/E/G/H/I 與官方試算 0% 誤差**(浮點四捨五入差 < 1 USD);F 從第 3 年起 0% 誤差,僅第 2 年略低估約 1‰。

> ⚠️ 個人試算用途。不對外營業。費率/分紅率每月可能更新,使用前請確認 JSON 內 `effective_date` 與最新公告一致。

---

## 資料夾結構

```
life/
├── index.html                ← 主試算頁(單檔 HTML,離線可用)
├── data/                     ← 各公司費率 JSON
│   ├── skl/                  ← 新光人壽
│   │   └── UPD061_UPD101_2026-04.json
│   ├── fubon/                ← (預留)富邦人壽
│   └── allianz/              ← (預留)安聯人壽
├── tools/
│   └── extract_xls.py        ← 從官方 Excel 抽 JSON 的腳本
├── private/                  ← 原始 .xls(被 .gitignore 排除)
├── .gitignore
└── README.md
```

---

## 已支援商品

| 公司 | 商品 | 代碼 | 繳費年期 | 幣別 | JSON 檔 |
|------|------|------|----------|------|---------|
| 新光人壽 | 美鴻添富美元分紅終身壽險 | UPD061 | 6 年 | USD | `data/skl/UPD061_UPD101_2026-04.json` |
| 新光人壽 | 美鴻添富美元分紅終身壽險 | UPD101 | 10 年 | USD | `data/skl/UPD061_UPD101_2026-04.json` |

---

## 如何新增公司/商品

### 步驟 1 — 拿到官方 Excel
業務員系統或公司內網會提供建議書試算 Excel。把它放進 `private/sources/{公司簡稱}/`。

### 步驟 2 — 跑抽取腳本

```bash
cd life/tools
pip install msoffcrypto-tool xlrd
python3 extract_xls.py \
    ../private/sources/skl/20260516-建議書_美鴻添富.xls \
    ../data/skl/UPD061_UPD101_2026-04.json
```

腳本會自動:
- 處理 Excel 的 VelvetSweatshop 弱加密(建議唯讀)
- 從工作表抽 GP 費率表、Corridor 表、Result_UV/Result_DIV
- 重新打包成扁平 JSON 給前端用

> 如果遇到不同公司的 Excel 結構,需要改寫 `extract_xls.py` 裡的 `extract_rates_xxx()` 函式。建議照 schema 命名:`extract_rates_{公司簡稱}_{商品簡稱}`。

### 步驟 3 — 確認 JSON schema

每份 JSON 應該長這樣:

```json
{
  "product_name": "新光人壽美鴻添富美元分紅終身壽險",
  "approval_no": "SK-03-114121704",
  "effective_date": "2026-04-01",
  "discounts": { "high_premium": 0.015, "first_period": 0.010, "renewal": 0.010 },
  "pay_freq_factors": { "年繳": 1.0, "半年繳": 0.520, ... },
  "pay_freq_periods": { "年繳": 1, "半年繳": 2, ... },
  "products": [ { "code":"UPD061", "name":"...", "pay_years":6, ... }, ... ],
  "gp":       { "UPD061": { "M": { "0": 13.9, "1": 14.6, ... }, "F": {...} } },
  "corridor": { "UPD061": { "1": 0.3, "2": 0.6, ... } },
  "uv":       { "UPD061": { "M": { "55": [[0,0,620.0],[71.3,53.4,633.0], ...] } } },
  "div":      { "UPD061": { "M": { "55": [[0,0,0,0,0,0], ...] } } }
}
```

### 步驟 4 — 驗證

抽完後一定要對照原 Excel 的試算結果做驗證。建議流程:

1. 在原 Excel 跑一個典型案例(例如 55 歲男、100 萬美元、6 年期、中分紅)
2. 在 `life/index.html` 跑同樣輸入
3. 比對 A(年保費)、B(累計保費)、C(身故金)、D(解約金)應該完全吻合
4. H、I(終期紅利)應該完全吻合
5. F、G 可能有 < 5% 誤差(因為原 Excel 的精確 PUI 模擬太複雜)

驗證通過後再 commit。

---

## 計算邏輯摘要

`年保費 = GP費率 × 投保金額(萬美元) × 10 × (1 - 折扣率)`

折扣率組成:
- 高保費折扣 1.5%(投保金額 ≥ 2 萬美元)
- 首期/續期繳費折扣 1%(轉帳)
- 合計 2.5%

每年的身故、解約、紅利由查表決定:
- **C 基本身故金** = `Corridor[年] × 投保金額(USD)`
- **D 基本解約金** = `Result_UV.csv[年] × 投保金額(萬) × 10`
- **AD 年度紅利** = `Result_DIV.ad_m[年] × 投保金額(萬) × 10`
- **E PUI 面額(累計)** = `Σ AD_k / Result_UV.nsp[k] × 1000`
- **F 累計增額身故** = `E × Corridor[年]`
- **G 累計增額解約** = `E × Result_UV.nsp[年] / 1000`
- **H 終期身故紅利** = `Result_DIV.tdd_m[年-1] × 投保金額(萬) × 10`(注意是上一年的索引)
- **I 終期解約紅利** = `Result_DIV.tds_m[年-1] × 投保金額(萬) × 10`

---

## 部署

純靜態頁面,適合用 GitHub Pages、Netlify 或直接放任何靜態主機。沒有後端,所有計算都在瀏覽器執行。

雙擊 `index.html` 也能直接離線使用(只需要同資料夾的 `data/` 在旁邊)。

---

## 已知限制

- F/G(累計增額身故/解約)用簡化公式,前 2 年會略低估
- 不支援要保人/被保險人不同人的話術頁(原 Excel 有,本工具僅做試算)
- 不會自動產出列印用的建議書 PDF;若需 PDF 請用瀏覽器的「列印 → 另存 PDF」
- 月繳/季繳/半年繳的繳次係數寫死在 JSON 裡,不同公司可能不同;新增時記得確認

---

## 設計決策記錄

- **為什麼不用 compare/**:那邊用的 schema 是給「快速比較 IRR」設計的,Schedule 只有 20-60 列且 PV/CV 表是空的。本工具需要完整 22000+ 列的 UV/DIV 表才能算到 110 歲。
- **為什麼用 fetch 而非 inline JSON**:1.7 MB JSON inline 到 HTML 會讓檔案難維護;分離後可以單獨更新費率而不動 UI 程式。
- **為什麼按月份檔名而非 latest**:費率每月可能微調,保留歷史版本方便回溯客戶試算(「我去年三月給你看的數字是哪一版?」)。
