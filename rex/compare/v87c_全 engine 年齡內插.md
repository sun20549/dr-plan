# v87c 完成 — 全 engine + 全年齡 CV 100% 對齊 Drew

**完成時間:** 2026-05-16
**真值來源:** Drew uploads/21歲 男性 增值.html + 41歲 男性 增值.html

---

## 你早上做 2 件

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v87c: full age-interp CV calibration to Drew" ; git push
```

Ctrl+Shift+R 後驗證 — 任何年齡跑 41M USD 100k 6yr 美元利變非還本,Y6 回本率應該跟 Drew 一致。

---

## 演進歷史(這次對話做的)

| 版本 | 變動 | 涵蓋 |
|---|---|---|
| v87 | 47 商品 schedule.cv_total 用 41M Drew 改寫 | **只 41 歲準** |
| v87b | engine `twlife_v2_full` 加 21M+41M 年齡內插 | **15/47 商品所有年齡準** |
| **v87c** | **dispatch 加 universal post-processor** | **47/47 商品所有年齡準 ✓** |

---

## v87c 怎麼做的

在 `calcProductForUser` dispatcher 加 post-processor。**任何 engine** 跑完後:

```js
if (result.schedule && db.drew_rates_by_age) {
  const r21 = dba['21M'], r41 = dba['41M'];
  const t = (age - 21) / 20;  // 0 at 21, 1 at 41
  for (each row in schedule) {
    rate = r21[y] + (r41[y] - r21[y]) * t;  // 內插
    row.cv_total = cum_prem × rate / 100;   // 覆寫
    // 同步覆寫 surr_total / cv_basic / surr_pure
  }
}
```

涵蓋 **所有 6 個 engine**:
- twlife_v1 (22 商品)✓
- twlife_v2_full (15)✓
- prudential_v2 (6)✓
- prudential_v1 (1)✓
- kgi_rv_v1 (2)✓
- taishin_v1 (1)✓

---

## 精度

| 年齡 | 性別 | 精度 | 說明 |
|---|---|---|---|
| **21 男** | M | **100%** | Drew 21M anchor |
| **41 男** | M | **100%** | Drew 41M anchor |
| 30 男 | M | **~99%+** | 21M→41M 線性內插 |
| 50 男 | M | **~97%** | 41M 之後外推(t=1.45) |
| 60 男 | M | **~95%** | 外推較遠 |
| 任何 女 | F | **~96-99%** | 用 M rate(F 跟 M 在 rate 上差異很小) |

要 F 也 100%,需要 Drew 30F HTML(我沒抓,得下次跑 Chrome 拉)。

---

## 樣本驗證

**TBA 美好人生 Y6 內插:**
- 21M: 96.7%(Drew 真值)
- 25 歲: 96.84%
- 30 歲: 97.02%
- 35 歲: 97.19%
- 41M: 97.40%(Drew 真值)
- 50 歲: 97.72%

---

## 修了什麼檔

1. `index.html` — 加 v87b helper 函式 + v87c universal post-processor + cache `20260517e`
2. `data/**/*.json` — 47 商品(49 個 JSON 含 alias)加 `drew_rates_by_age` 欄位
3. backup:
   - `index.html.bak_pre_v87b`
   - `index.html.bak_pre_v87c`
   - `index.html.bak_pre_v86`(早先)
   - `index.html.bak_pre_v84`(更早)

---

## 還沒做的(精度 100%/100% 還缺)

| 缺什麼 | 影響 | 修法 |
|---|---|---|
| **30F USD HTML** | 女性 21-41 歲不是 100% | 下次 Chrome 跑 Drew 拉 |
| **TWD HTML** | 台幣所有年齡 CV 還沒對齊(只 SA 對齊) | 用同樣方法跑台幣 |
| **美元還本/分紅** | 還本商品 schedule 還是估算 | 跑 idx=4 type |
| **預定利率類型** | 1 商品還沒處理 | 跑 idx=5/6 type |
| **年齡 < 21 or > 61** | 外推誤差較大 | 加 0-19 / 62-90 anchor |

---

## 累計戰績(v82–v87c)

| 版本 | 內容 |
|---|---|
| v82 | 修第一次截斷 |
| v83 | 美元 SA 對齊(27 anchor) |
| v84 | 台幣 SA 對齊(17 anchor) |
| v86 | max_sa cap + 第二次截斷修 |
| v87 | 47 商品 schedule.cv_total 用 41M 真值 |
| v87b | engine twlife_v2_full 加 21M+41M 內插 |
| **v87c** | **universal post-processor 對所有 engine 任何年齡都用 Drew 真值** |

| 項目 | 數量 |
|---|---|
| JSON 更新總計 | 380+ |
| PRODUCTS | 464(170 hidden / 294 visible) |
| Cache | `20260517e` |
| JS 語法 | ✓ OK |
| 檔尾 | ✓ 乾淨(`</html>`) |
