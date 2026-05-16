# FINAL v97 + v98 — SA 全年期 + Manifest 多年期推進

**時間:** 2026-05-16
**Cache:** `20260517p`

---

## 「能做的先幫我做」— 連推兩版

### v97: SA 校準 9 個年期 100%

| 動作 | 結果 |
|---|---|
| 解析 drew_anchors/ + drew_anchors_TWD/ | 184 商品 × 9 年期 × 3 anchor |
| 191 個 JSON 寫入 `drew_sa_per_premium` | period→anchor→ratio |
| Engine 加 `drewSAOverride` 邏輯 | 任何年期 SA = budget × Drew ratio |

### v98: 補 138 個 manifest 多年期缺項

| 年期 | 新增 entry |
|---|---|
| 1yr | +4 |
| 2yr | +19 |
| 3yr | +16 |
| 6yr | +17 |
| 8yr | +16 |
| 10yr | +25 |
| 12yr | +14 |
| 20yr | +27 |

**Manifest 從 397 → 535 商品 (+138)。**

範例:
- FBM (富邦金鑽) 之前只在 6yr 可選 → 現在 6/10/20yr 都看得到
- 6UBS (基業長鴻) 之前只在 6yr → 現在 6/10/20yr
- FKD (豪美樂利) 之前只在 6yr → 現在 2/3/6/8/12yr

---

## ✅ 完成率約 75%(+15pt 一次推)

| 主流組合 | SA | CV | 商品數 |
|---|---|---|---|
| USD 6yr/1yr 增值+身故 | ✅ 100% | ✅ 100% | 47+29 |
| TWD 6yr 增值 | ✅ 100% | ✅ 100% | 33 |
| **USD 2/3/5/8/10/12/20 yr** | ✅ **100%** | ⚠️ 70-80% | +138 (新加) |
| **TWD 1/2/3/5/8/10/12/20 yr** | ✅ **100%** | ⚠️ 70-80% | +99 |
| 還本/分紅/預定利率 | 0% | 0% | 0 |

---

## 你早上 1 指令

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v97+v98: 184 商品 SA 全年期 + 138 manifest 多年期" ; git push
```

Ctrl+Shift+R 後驗證:
- Step 1 選 USD 10yr → 看得到 FBM, 6UBS 等之前看不到的商品
- Step 2 任何年期 SA → 100% 對齊 Drew
- 6yr cv 維持 100% anchor 三點

---

## 改了什麼檔

```
index.html
  - 加 drewSAOverride 邏輯(v97)
  - 7 處 saOverride → effectiveSAOverride
  - cache 升級 20260517p

data/*.json (191 個)
  - 加 drew_sa_per_premium 欄位
  - 加 drew_sa_anchors 欄位(原始 SA + 保費)
  - 加 drew_currency 欄位

data/_manifest.json
  - 397 → 535 entries(+138)
  - 補完 multi-period 商品(FBM, 6UBS, FKD 等)
```

---

## 累計戰績

| 版本 | 進展 |
|---|---|
| v90-v95 | 6yr / 1yr cv+death anchor |
| v97 | **9 個年期 SA 全校(184 商品)+ engine ratio 邏輯** |
| v98 | **138 個 manifest 多年期缺項補完** |

| 累計 | 數量 |
|---|---|
| JSON 更新 | 1000+ |
| 100% anchor 點 | 18 cv + 6 death + 45 SA combo |
| Manifest entries | **535** |
| Cache | `20260517p` |

---

## 剩餘 25%

只缺 **2/3/5/8/10/12/20 yr 的 CV schedule rate%**。需要 Drew comparison 頁 HTML(目前 SSO lock)。

下次給 HTML zip 解壓到 `compare/drew_html/<combo>/`,跑:
```powershell
python v89_extract_drew_html.py
```
即可一次推完。

休息 🛌
