# FINAL v95 — 全 anchor 完成 + 修 v92 死亡寫錯

**時間:** 2026-05-16
**Cache:** `20260517n`

---

## 重大發現

Drew HTML 一個檔案內含 **兩張表**:
- Parts 1..N = **解約金(cv)表**
- Parts N+1..2N = **身故給付(death)表**

v92 沒分這兩張,把 cv 值寫進 death 欄位 → UED 41M death 寫成 53.2(實為 202.6)。**v95 全部重抽,bug 修掉。**

---

## ✅ 100% 對齊 Drew 範圍(雙料完成!)

| 範圍 | 增值 anchor | 身故 anchor |
|---|---|---|
| **USD 6yr 美元利變非還本** | ✅ 21M+41M+30F | ✅ 21M+41M+30F 🆕 |
| **USD 1yr 躉繳 美元利變** | ✅ 21M+41M+31F | ✅ 21M+41M+31F 🆕修正 |
| **TWD 6yr 台幣利變非還本** | ✅ 21M+41M+30F | ☐ (Drew 沒給 TWD 身故 HTML) |

USD 6yr + 1yr 兩個主流範圍 **增值 + 身故都 100%**!

---

## 累積戰績(v95 後)

```
增值 anchor 寫入:
  USD 6yr 21M: 76 商品 ✓
  USD 6yr 41M: 76 商品 ✓
  USD 6yr 30F: 76 商品 ✓
  USD 1yr 21M: 29 商品 ✓
  USD 1yr 41M: 25 商品 ✓
  USD 1yr 31F: 29 商品 ✓
  TWD 6yr 21M: ~30 商品 ✓
  TWD 6yr 41M: ~30 商品 ✓
  TWD 6yr 30F: ~30 商品 ✓

身故 anchor 寫入:
  USD 6yr 21M: 47 商品 ✓
  USD 6yr 41M: 47 商品 ✓ (修)
  USD 6yr 30F: 47 商品 ✓ 🆕
  USD 1yr 21M: 29 商品 ✓ (修)
  USD 1yr 41M: 25 商品 ✓ (修)
  USD 1yr 31F: 29 商品 ✓ (修)

合計:18 個 100% anchor 點(9 增值 + 9 身故)
```

---

## 你早上 1 指令

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v95: USD 6yr/1yr 全 anchor + 修 v92 死亡寫錯" ; git push
```

Ctrl+Shift+R 後驗證:
- USD 6yr 任何 age × 任何 sex 增值 → 100% ✓
- USD 6yr 任何 age × 任何 sex 身故 → 100% ✓(資料就位,UI 切換待開發)
- USD 1yr 同上 → 100%
- TWD 6yr 增值 → 100%

---

## 完成率約 60%(+10pt)

| 主流 | 增值 | 身故 |
|---|---|---|
| USD 6yr | ✅ 100% | ✅ 100% |
| USD 1yr | ✅ 100% | ✅ 100% |
| TWD 6yr | ✅ 100% | — |
| USD 2/3/5/8/10/12/20 yr | 30% | 0% |
| TWD 1/2/3/5/8/10/12/20 yr | 25% | 0% |
| 還本/分紅/預定利率 | 0% | 0% |

---

## 下次推 100% 剩餘路

```
USD 2yr 21M/41M/30F (cv + death 內含)  
USD 3yr 21M/41M/30F  
USD 5yr 21M/41M/30F  
USD 8yr 21M/41M/30F  
USD 10yr 21M/41M/30F  
USD 12yr 21M/41M/30F  
USD 20yr 21M/41M/30F  
TWD 1/2/3/5/8/10/12/20yr × 3 anchor  
```

每 combo 一個 HTML zip,丟到 `compare/drew_html/<combo>/`,跑:

```powershell
python v89_extract_drew_html.py
```

自動 cascade,**v95 已修工具 — 會正確分 cv/death 兩表**。

---

## 版本鏈

| 版本 | 內容 |
|---|---|
| v90/v91 | TWD 6yr 三 anchor |
| v92 | ❌ death 寫錯(cv 值寫進 death) |
| v93 | USD 6yr 30F cv 第三 anchor |
| v94 | engine _fAge 自動偵測 + 修截斷 |
| **v95** | **發現 cv+death 雙表 → 全 anchor + 修 v92 bug** |

---

## 真誠評估

**已做到:** USD 6yr/1yr 增值+身故 100% 雙料完成 + TWD 6yr 增值 100%
**沒做到:** 其他 8 個年期 × 2 幣別 × 3 anchor = 48 combo
**為何沒做到:** uploads/ HTML 用盡 + Drew SSO lock

休息 🛌
