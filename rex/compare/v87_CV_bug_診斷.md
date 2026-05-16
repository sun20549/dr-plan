# v87 CV 計算 bug 診斷報告

**測試:** 41M USD 100k 6yr 美元利變非還本
**真值來源:** uploads/41歲 男性.zip(Drew Excel 直出 HTML,逐年 CV 真值)

---

## 結論

**rex 系統性高估 Y6 解約金 3-10pt**。SA 是對的(v86 已校),但 CV(解約金)整體偏高。

**這就是「點 Y6 回本率排序後跟 Drew 不一樣」的根本原因。**

---

## 對帳結果(15 個有 rex 對照的商品)

| 商品 | Drew Y6% | rex Y6% | 差(pt) | 分類 |
|---|---|---|---|---|
| **TBA 美好人生** | 97.4% | 108.0% | **+10.6** | ❌ 嚴重 |
| **FBO 美利大運** | 93.7% | 102.7% | **+9.0** | ❌ 嚴重 |
| **NUPW0202 美世長紅** | 100.5% | 108.5% | **+8.0** | ❌ 嚴重 |
| **FBW 豪神六六** | 95.2% | 101.0% | **+5.8** | ❌ 嚴重 |
| FKD 豪美樂利 | 105.6% | 110.0% | +4.4 | ⚠️ |
| F8W 鑫億 68 | 98.0% | 102.4% | +4.4 | ⚠️ |
| ARLPLU71 新美滿相傳 | 100.6% | 104.9% | +4.3 | ⚠️ |
| 6UBH 傳承守富 | 98.4% | 100.4% | +2.0 | ⚠️ |
| NUPW0102 美紅旺 | 101.3% | 103.2% | +1.9 | OK |
| FVW 豪美 368 | 96.7% | 98.5% | +1.8 | OK |
| 6PARWLSLD 紅運旺旺 | 101.5% | 100.1% | -1.4 | OK |
| ARLPLU57 新美康滿利 | 107.5% | 108.5% | +1.0 | OK |
| NUIW5203 超美利 | 101.5% | 102.5% | +1.0 | OK |
| 6UBS 基業長鴻 | 102.7% | 103.1% | +0.4 | OK |
| NUIW4703 吉美富 | 106.1% | 106.3% | +0.2 | OK |

### 摘要

- ❌ 誤差 > 5pt:**4 個**(TBA / FBO / NUPW0202 / FBW)
- ⚠️ 誤差 2-5pt:**4 個**(FKD / F8W / ARLPLU71 / 6UBH)
- ✅ 誤差 < 2pt:7 個

---

## 推測 root cause(待證實)

### 假設 1:v53 「cv 用 premium 比例放大」過頭

v53 的 fix 把「SA 比例放大」改成「premium 比例放大」。但對某些商品(尤其是增額/分紅型),
這個轉換可能加倍計算了某些 component(例如把累積增值 part 算了兩次)。

證據:
- TBA / NUPW0202(都是增額終身壽險 + 分紅) — 錯最多
- FBO(增額) — 錯多
- FBW(增額) — 錯多

### 假設 2:declared_rate / guaranteed_rate 算 double

twlife_v2_full engine 裡有
```
div_rate = max(0, declared - guaranteed) if declared > guaranteed else 0
```
如果 guaranteed_rate 沒設成 declared_rate(v75 有設),div_rate 會把宣告利率算進去 → CV 高估。

### 假設 3:schedule_at_base 的基準錯了

`base_sa` 在過去 60 多輪有改過。如果 base_sa 跟 schedule 對不上,
按比例放大會錯。

---

## 我下一步要做的(下次來繼續)

1. 把所有 47 個商品的 Drew Y6 真值 vs rex 算的值都抽出來(我已抽 Drew,rex 那邊還要再跑)
2. 按 engine 類型分組,找哪個 engine 系統性高估
3. 修對應的 cv 計算邏輯
4. 重跑 cv 校正(可能要重生 schedule)

### 待修商品優先級

P0(誤差 > 5pt,先修):
- TBA(新光)
- FBO(富邦)
- NUPW0202(台壽分紅)
- FBW(全球增額)

P1(2-5pt):
- FKD / F8W(全球)
- ARLPLU71(保誠)
- 6UBH(凱基)

---

## 數據檔

- `/tmp/drew_zips/41M_USD/41歲 男性 增值.html` — Drew 真值(用戶傳)
- `outputs/drew_41M_y6_rates.json` — 抽出來的 47 商品 Y6 rates
- 同樣資料夾還有 21M / Downloads / 41歲身故 等 HTML 可拿來校其他年齡 / 身故型 schedule

---

## 給用戶的 TL;DR

1. **SA 已校到 99%**(v83/v84/v86 修過)
2. **CV 計算系統性偏高 +3-10pt**(這次發現的新 bug)
3. **下次要做**:逐商品 diff CV → 修 engine
4. **目前**:你還是可以 push v84/v86 上去看 SA 改善;CV 排序問題是下次的事
