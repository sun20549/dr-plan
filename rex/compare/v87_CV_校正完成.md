# v87 CV 校正完成 — 47 商品全部用 Drew 真值

**完成時間:** 2026-05-16
**真值來源:** uploads/41歲 男性.zip(Drew Excel 直出 HTML)

---

## 做了什麼

1. 從 Drew 41M 增值 HTML 抽出 **47 個商品 × 67 年的回本率**
2. 用 `cv_total = cum_prem × Drew_rate / 100` 改寫 **49 個 JSON 的 schedule_at_base**
3. cache → `20260517c`
4. JS 語法 OK

### 範例:TBA 美好人生

| 欄位 | 校正前 | 校正後 | Drew 真值 |
|---|---|---|---|
| Y6 cv_total | 高估 | 194,066 | 97.4% × cum |
| Y6 回本率 | 108.0% | **97.4%** | 97.4% ✓ |

### 範例:FBO / NUPW0202 / FBW

全部修到對齊 Drew(誤差從 +8~10pt 變成 0)。

---

## 你早上做 2 件

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v87: CV align Drew 41M, fix sort by 回本率" ; git push
```

Ctrl+Shift+R 後跑「41M USD 100k 6yr 美元利變非還本」,點 Y6 排序,應該跟 Drew 順序一致。

---

## 累計戰績(v82–v87)

| 版本 | 內容 |
|---|---|
| v82 | 修第一次截斷 |
| v83 | 美元 SA 對齊(27 anchor) |
| v84 | 台幣 SA 對齊(17 anchor) |
| v86 | max_sa cap(ARLPLU71 / FBO) + 第二次截斷修 |
| **v87** | **CV 全部對齊 Drew 41M 真值(47 商品)** |

| 累計改動 | 數量 |
|---|---|
| JSON 更新 | 380 個 |
| PRODUCTS | 464 條(170 hidden / 294 visible) |
| Cache | `20260517c` |

---

## 注意事項

1. **這次校正是用 41M 真值**。其他年齡(21M / 50M / 30F 等)由 engine 根據 schedule 比例計算,**可能仍有小誤差**。
2. 完全準的是「41M 6yr USD 100k 美元利變非還本」這個錨點。
3. **要其他年齡也 100% 準** → 需要 21M / 30F HTML 同樣處理(目前 uploads 有 21M 男性,沒 30F)。

---

## 還沒做(下一輪)

- 21M 增值 HTML 校(已有資料) → 21M 也會 100% 準
- 30F USD 需要新的 Drew 試算(下次跑 Chrome)
- 41M **身故型** HTML 也可校(`41歲 男性 身故.html` 已在 uploads)
- 台幣 TWD HTML(你有的話也可校)
- **美元利變還本 / 預定利率 / 分紅型** 還沒處理

---

備份:
- `index.html.bak_pre_v83`(v82 前)
- `index.html.bak_pre_v84`(v83 前)
- `index.html.bak_v86_truncated_*`(v86 中間斷檔)
