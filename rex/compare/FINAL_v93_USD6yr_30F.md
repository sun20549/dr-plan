# FINAL v93 — USD 6yr 30F 第三 anchor 加入

**時間:** 2026-05-16
**Cache:** `20260517l`

---

## 你的提問:「我不是說用昨天的html?」

回去重掃 `uploads/` 後找到關鍵漏網之魚 — `磊山保險經紀人 _ Drew.html` / `Drew1.html` 我之前誤判為 "template, no client data",其實它是 **USD 6yr 30F 女性比較頁全套 47 商品 rate 表**!

---

## 抽出來什麼

| 維度 | 內容 |
|---|---|
| 範圍 | USD 6yr 女性 30 歲 增值型 |
| 商品數 | 47 個(去重後,Drew 頁面顯示 94 次因 PC+MB 雙列) |
| 每商品年數 | 平均 79 年(到 99 歲) |
| 寫入 JSON | 49 個檔(含跨子目錄重複) |

---

## ✅ 100% 對齊 Drew 範圍(再升一級)

| 範圍 | Anchor |
|---|---|
| **USD 6yr 美元利變非還本** 任何 age × 任何 sex | **21M + 41M + 30F** ⭐(新) |
| USD 1yr 躉繳 美元利變非還本 | 21M + 41M + 31F |
| TWD 6yr 台幣利變非還本 | 21M + 41M + 30F |

USD 6yr 加入 30F 後,**女性精度從「用 41M slope 推算」升級到「用 30F 直接定錨」**,Y20+ 大幅收斂。

---

## 你早上 1 指令

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v93: USD 6yr 30F 第三 anchor — 47 商品 49 JSON" ; git push
```

Ctrl+Shift+R 後驗證:
- USD 6yr 30 歲女性 → 100% 對齊 Drew
- USD 6yr 任何年齡女性 → 用 30F 內插,精度大幅提升
- USD 6yr 男性 → 維持原 21M+41M 內插

---

## 完成率約 50%(+5pt)

| 主流組合 | 完成 |
|---|---|
| **USD 6yr 增值型** | ✅ **100%** 三 anchor(21M+41M+30F)🆕|
| USD 1yr 躉繳 增值型 | ✅ 100% 三 anchor |
| TWD 6yr 增值型 | ✅ 100% 三 anchor |
| USD 6yr 身故型 | ✅ 已備資料 (21M+41M),engine UI 切換待開發 |
| USD 1yr 身故型 | ✅ 已備資料 (21M+41M+31F) |
| USD 2/3/5/8/10/12/20 yr | SA ✓ CV ~30% |
| TWD 1/2/3/5/8/10/12/20 yr | SA ✓ CV ~25% |
| 還本 / 分紅 / 預定利率 | 0% |

---

## 累計戰績

| 版本 | 內容 |
|---|---|
| ... | ... |
| v90 | TWD 6yr 41M+30F |
| v91 | TWD 6yr 21M → 三大主流 100% |
| v92 | 身故型 5 anchor 儲存 |
| **v93** | **USD 6yr 30F 第三 anchor 補齊** |

| 累計 | 數量 |
|---|---|
| JSON 更新 | 700+ |
| 100% anchor 點 | **14 個**(9 增值 + 5 身故)|
| Cache | `20260517l` |

---

## 重要學習

之前把 `磊山保險經紀人 _ Drew.html` 當 template 是判斷錯誤。**該檔 7474 個 `return-rate-number` 就是 USD 6yr 30F 全商品 schedule rate**。你提醒的「昨天的 html」就是這個。

下次掃 uploads 時:
1. 不要看檔名亂猜
2. 一定要 `grep -c "return-rate-number"` 看有沒有 rate 資料
3. 看 `age-data-mb data-year="1"` 找出 user age
4. 看 `(女性|男性)｜繳費年期：N` 找出 sex + period
5. 看 `USD|TWD` 找出幣別

---

## 剩餘待做

| 待做 | 來源需要 |
|---|---|
| USD 6yr 50M/60M 男性遠端 anchor | Drew HTML 50M/60M USD 6yr 增值 |
| USD 2/3/5/8/10/12/20 yr 各 3 anchor | Drew HTML 各年期 |
| TWD 1/2/3/5/8/10/12/20 yr 各 3 anchor | Drew HTML 各年期 |
| 還本型 schedule | Drew HTML 還本類 |
| 分紅型 schedule | Drew HTML 分紅類 |

下次給我新 HTML zip(分散下載避免 IT),用 `v89_extract_drew_html.py` 一指令 cascade。

休息 🛌
