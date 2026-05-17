# 🛡️ BOUNDARY · 隔離邊界

**此資料夾 (`rex/life/`) 是 production-ready 的生產系統,不可被汙染。**

---

## 隔離規則

### 絕對禁止
* ❌ 從 `../compare/` 複製任何 JSON 進來
* ❌ 信任 `../compare/_manifest.json` 的 `verified_against` 標籤
* ❌ 套用 `../compare/轉換引擎/` 的舊 extractor(它們快但精準度不夠)
* ❌ 把 `../compare/` 的 schema 套到 `data/` 內

### 必須遵守
* ✅ 新商品 onboard 走 `SKILL.md` 流程(8 步,含 PDF 驗證)
* ✅ 對照官方 PDF **每個商品至少 3 案例**,誤差 ≤ 3 USD 才上 catalog
* ✅ 每次改動 bump `_catalog.json` version + 寫 CHANGELOG + Jira 兩格
* ✅ disabled 的商品 JSON 可放 `data/`,但 catalog 不列(避免客戶看到)

---

## 為什麼有這個邊界

`../compare/` 是 2026-05 開發的舊系統,517 個商品 JSON 完成 65% 後卡關
(看 `../compare/COWORK_v64_最終狀態_20260515.md`)。許多 JSON 數字
跟官方建議書對不上,直接給客戶會出錯。

`../life/` 是 2026-05 中重新從零開始、品質更嚴的新基礎。**只能信這邊**。

---

## 如果要做「比較系統」(像舊 compare 那樣)

不要修舊的。開新資料夾 `rex/compare2/`,從 `life/data/_catalog.json`
讀已驗證商品來做橫向比較。隔離舊汙染。

詳細策略看 `../.claude-memory/MEMORY.md` 內的 project notes。
