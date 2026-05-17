# ⚠️ DEPRECATED · 此資料夾為舊版,有許多未驗證問題

**狀態:** 凍結 (Frozen as of 2026-05-17)
**目前生產系統:** `../life/` (美元分紅試算器)

---

## 為什麼凍結

此資料夾(`rex/compare/`)為 2026 年 5 月初開發的儲蓄險比較系統,在
v64 (2026-05-15) 達到約 65% 完成度後卡關,**517 個商品 JSON 中有相當比例
資料準確度未驗證**,直接給客戶使用會出錯。

問題包含但不限於:
* 部分公司的 Excel 抽取邏輯有誤(IRR / 解約金跟官方建議書對不上)
* anchor + 兩兩內插的 approach 在中間年齡會偏差
* `_manifest.json` 內 `verified_against` 欄位很多寫了但實際未對齊
* 不同 engine (twlife_v2_full / SKL / 友邦) 對同一公司商品有結構不一致

---

## 「目前可信賴」的生產系統

[`rex/life/`](../life/) — 美元分紅試算器
* 採用「**對照官方 PDF 100% 驗證**」標準
* 完整壽險 4-way max 公式,含滿期年祝壽保險金
* 已上線商品:新光 4 + 台灣 3 = 7 個,全部 ±3 USD 對齊 PDF
* 每次改動 bump version,有 CHANGELOG + JIRA 流程

---

## 隔離規則

* 任何新工作 **絕對不可** 從 `rex/compare/` 複製 JSON 進 `rex/life/`
* `rex/life/` 是 source of truth,品質鐵則:對照 PDF 0% 誤差才上 catalog
* 舊資料夾保留作 **歷史參考**,但不可信任數字

---

## 如果之後要重啟「比較系統」

建議路徑:
1. 用 `rex/life/` 已驗證的 schema(`data/_catalog.json` + 各公司 JSON)當基礎
2. 寫新 `rex/compare2/`(不要碰舊 `rex/compare/`),從 catalog 抓資料做橫向比較
3. **新商品上架走 `rex/life/SKILL.md` 流程**,不要走舊的 `轉換引擎/` 一鍵抽取
4. 寫批次 onboarder 之前先確保 PDF 驗證流程跑得通

詳細策略看 `../.claude-memory/project-comparison-system.md`(若已寫)
