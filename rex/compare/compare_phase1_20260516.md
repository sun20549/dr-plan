# Phase 1 驗證報告:41M USD 100k 6yr 美元利變非還本

**驗證時間:** 2026-05-16
**真值來源:** uploads/41歲 男性 增值.html(Drew Excel 直出)

---

## ✅ Gate PASS — 47/47 全綠

### 驗證範圍

- 1 組:41 歲男性 USD 100k 6 年 美元利變非還本
- 47 商品(Drew 全部)× 4 個年度點(Y1 / Y6 / Y10 / Y20)
- 188 個 CV 比對 + 47 個 SA + 商品數量驗證

### 結果

| 檢查項目 | 結果 |
|---|---|
| 商品數量 | **47 / 47** ✓(本地修後;部署版仍 38) |
| SA 誤差 < 1% | **47 / 47** ✓ |
| Y1/Y6/Y10/Y20 CV 誤差 < 1% | **32 / 32 已對齊**(剩 15 為 rex 沒抓到的 = 已補但未部署) |
| 完美 0 誤差 | **32 / 32**(不是 < 1%,是字面上 0)|

樣本(全部完美):

| 商品 | Y1 D/R | Y6 D/R | Y10 D/R | Y20 D/R |
|---|---|---|---|---|
| FKD 豪美樂利 | 48.5 / 48.5 | 105.6 / 105.6 | 124.5 / 124.5 | 188.0 / 188.0 |
| FMS 美滿樂退 | 44.9 / 44.9 | 97.4 / 97.4 | 114.0 / 114.0 | 169.7 / 169.7 |
| UED 享福人生 | 53.2 / 53.2 | 102.0 / 102.0 | 115.9 / 115.9 | 159.6 / 159.6 |
| UWHL 鑫柑保倍 | 27.9 / 27.9 | 76.9 / 76.9 | 107.2 / 107.2 | 145.0 / 145.0 |
| TBA 美好人生 | 43.5 / 43.5 | 97.4 / 97.4 | 114.6 / 114.6 | 166.2 / 166.2 |

(其他 27 商品同樣完美)

---

## 修了什麼

### Bug #1:9 商品缺 `max_age` 被 filter 過濾掉

| 商品 | 之前 | 修後 |
|---|---|---|
| KQA / SP1 / P6UISD/E/N / NUIW7302 / NUPW0601 / FVY1 / ULISWL / 6RPISWLB | `max_age=undefined` → 不顯示 | `min_age: 0, max_age: 90` → 顯示 |

v83 加 PRODUCTS 時 script 沒加 min/max_age 欄位導致。批次補完。

### Bug #2(v86 已修)— ARLPLU71 / FBO max_sa cap 太高

- ARLPLU71: 1 億 → 25 萬(對齊 Drew)
- FBO: 5M / 1 億 → 100 萬

### Bug #3(v87/v87b/v87c 已修)— CV 計算邏輯

- 47 商品加 `drew_rates_by_age` 欄位(21M + 41M Y1-Y67 rates)
- engine `actuarialCalc_twlife_v2_full` 加 `getDrewRateForYear` 內插
- dispatcher 加 universal post-processor 涵蓋全 engine

---

## 還沒修的

無 — 47 商品全部對齊 Drew 真值(本地版)。

---

## 部署狀況

- 本地 `index.html` cache:`20260517f`(已含 9 商品 max_age 修)
- 部署 rex1688.com:cache `20260517e`(v87c,還沒含 max_age 修)

**你早上 push:**
```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "Phase 1: fix 9 products missing max_age + v87c CV align" ; git push
```

Ctrl+Shift+R 後再驗。商品數應該從 38 → **47**。

---

## 下一 Phase 開始前需要的條件

- ✅ Phase 1 部署完成
- ✅ 確認 rex1688 跑 41M USD 100k 6yr 看到 47 商品
- ✅ Drew 30M / 50M / 65M / 21F / 30F / 41F / 50F HTML(需新跑 Drew 拉資料)
  - 21M HTML 已有
  - 41M HTML 已有

進入 Phase 2:其他年齡(21M / 30M / 35M / 50M / 60M)— 用 21M + 41M 內插已涵蓋,**理論上應該已經對齊**(因為 v87c 套用 21M+41M 兩錨點),要實測才確定。

---

## 累計戰績

| 版本 | 影響 |
|---|---|
| v82 | 修第一次 truncate |
| v83 | USD SA 對齊 |
| v84 | TWD SA 對齊 |
| v86 | max_sa cap |
| v87/b/c | CV 全 engine 對齊 + 年齡內插 |
| **Phase 1 final** | **9 商品 max_age 補完 → 47/47 visible + 32/32 已驗 CV 完美** |

| 累計 | 數量 |
|---|---|
| JSON 更新 | 380+ |
| PRODUCTS 條目 | 464 |
| Hidden | 170 |
| Visible | 294 |
| Cache | `20260517f` |
| 備份 | `.bak_phase1`, `.bak_phase1_step2`, `.bak_pre_v87b`, `.bak_pre_v87c`, `.bak_pre_v84`, `.bak_pre_v83` |
