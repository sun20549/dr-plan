# Cowork 終極驗證校正指令(複製貼上版)

> **理念:** 用最精準的方式校正(慢沒關係),確保 rex1688 vs Drew 100% 一致。
> 用 Drew HTML(Excel 直出真值)為唯一真值來源,**不要用 page scraping 估算**。
> 每個 phase 過了 verification gate 才進下一個,沒過要回頭修。

---

## 前置確認

- ✅ Chrome 已開,Claude 擴充已連
- ✅ 已登入 Drew(可看到 /info 表單)
- ✅ 已 git push v87c(cache `20260517e`)+ Ctrl+Shift+R 過
- ✅ `drew_anchors_USD/` + `drew_anchors_TWD/` 在 compare/ 下
- ✅ Drew HTML 在 uploads/(21歲男, 41歲男, Downloads 等)

---

## 給 Claude 的完整指令(複製這段)

```
請按下面 Phase 順序執行 — 每個 Phase 過了 verification gate 才進下一個,
沒過就停下來修,不要硬往下衝。多花時間也沒關係,我要的是 100% 精確。

【精準度原則】
1. 真值來源:Drew HTML(uploads/*.zip 解壓),Excel 直出,**100% 正確**
   - 不要用 Drew /comparison 頁面 scraping(會渲染失敗)
   - 不要用估算,不要用近似
2. 每個 anchor 必須是真的 Drew HTML 數據,不能是「2 錨點推算 3 錨點」
3. 誤差判定:
   - SA 誤差 > 1% → 修
   - CV 任何一年誤差 > 1% → 修
   - 商品數量不對 → 修(漏的補,多的隱藏)
4. 修法:
   - SA 錯 → 改 PRODUCTS 的 max_sa / min_sa / unit_size / gp_table
   - CV 錯 → 用 Drew HTML rate 更新 schedule_at_base.cv_total 或 drew_rates_by_age
   - 商品錯 → 增/隱 PRODUCTS 條目
5. 每次大改前 cp index.html index.html.bak_<step>
6. 改完 node --check 驗 JS,有 truncate bug 立刻修
7. 改完 bump __DATA_VERSION__

【Phase 1:驗證 41M USD 100k 6yr 美元利變非還本(剛做完的)】

A. 兩邊都跑 41M USD 100k 6yr 美元利變非還本
   - rex1688: 拿 Step 2 商品清單(SA / 首年實繳),點試算全部拿 Step 3 Y6 解約金/回本率
   - Drew: 用 uploads/41歲 男性 增值.html(Excel 真值)抽 SA + Y1-Y30 rate
B. 逐商品 diff:
   - SA 誤差 > 1% → 列入修法清單
   - Y6 / Y10 / Y20 / Y30 回本率誤差 > 1% → 列入
   - rex 沒有 / Drew 有 → 列入「加 PRODUCTS」清單
   - rex 有 / Drew 沒有 → 列入「標 hidden」清單
C. 修完所有問題後,重跑 verification 直到全綠
D. 寫 verification 報告 compare_phase1_<日期>.md
E. ✅ Gate:47/47 商品 SA + CV(Y6/Y10/Y20)誤差 < 1% → 進 Phase 2

【Phase 2:同年期同類型 — 驗證所有年齡(USD 6yr 美元利變非還本)】

A. 用 41M anchor 套到其他年齡。已有 21M HTML,還缺:
   - 30M / 50M / 65M:需在 Drew 跑 + 抽 HTML(或截網頁拉 rate)
B. 對每個年齡逐商品 diff:
   - 21M / 30M / 35M / 41M / 50M / 60M(6 個年齡點)
   - 每個都 SA + Y6 CV 校
   - 誤差 > 1% → 修對應商品的 drew_rates_by_age 或加 anchor
C. ✅ Gate:6 個年齡點 × 47 商品 = 282 個比對全部 < 1% → 進 Phase 3

【Phase 3:同年期同類型 — 驗證女性(USD 6yr 美元利變非還本)】

A. 在 Drew 跑 30F / 41F USD 100k 6yr,抽 HTML/拉 rate
B. 對每個女性年齡 diff 47 商品 SA + Y6 CV
C. 如果 F rate vs M rate 差 > 1% → 加 F anchor 到 drew_rates_by_age
D. ✅ Gate:30F + 41F + 21F + 50F 4 個年齡 × 47 商品全部 < 1% → 進 Phase 4

【Phase 4:其他年期 USD 美元利變非還本(1/2/3/5/8/10/12/20)】

對每個年期重複 Phase 1-3:
A. 抓 Drew HTML(每個年期 3 anchor:21M + 41M + 30F)
   - 跑 Drew 試算 → 下載 HTML zip
   - 或者用 page scraping 抓 SA(已做的 anchor txt 在 drew_anchors/)
   - **CV 必須從 HTML 抽**,不能只有 SA
B. 寫進 drew_rates_by_age[年期][anchor]
C. 修改 universal post-processor 用「(年期, 年齡, 性別)→ rate」3D 查表
D. 驗證每年期 × 3 anchor × N 商品全綠
E. ✅ Gate:8 個年期 × ~30 商品 × 3 anchor < 1% → 進 Phase 5

【Phase 5:台幣 TWD 美元利變非還本對齊】

A. 台幣 anchor 已抓(drew_anchors_TWD/),但只 SA 沒 CV
B. 在 Drew 跑 21M / 41M / 30F TWD 3M 1/2/3/6/8/10/12/20 年期
C. 下載 HTML,抽 rate
D. 寫進對應 TWD 商品的 drew_rates_by_age
E. 驗證 ✅ Gate:台幣全部 < 1%

【Phase 6:其他 type(還本/分紅/預定利率)】

對下列 type 重複 Phase 1-5(USD + TWD):
- 美元利變還本(idx=4)— 有增值/身故變體
- 台幣利變還本(idx=3)
- 美元利變非還本(預定利率)(idx=6)
- 台幣利變非還本(預定利率)(idx=5)
- 美元分紅終身壽險(Drew 沒此 type filter,但商品出現在 idx=2 中)

每個 type 完成後 Gate 才能下個。

【Phase 7:綜合驗證】

A. 跑 12 組關鍵組合對齊測試
   1. 30M USD 100k 6yr
   2. 41M USD 100k 6yr
   3. 50M USD 100k 6yr
   4. 30F USD 100k 6yr
   5. 30M TWD 3M 6yr
   6. 41M TWD 3M 6yr
   7. 30M USD 100k 1yr 躉繳
   8. 30F TWD 3M 20yr
   9. 65M USD 100k 6yr
   10. 15M USD 50k 6yr
   11. 41M USD 100k 還本型 6yr
   12. 30M TWD 3M 預定利率 6yr
B. 每組:商品數 + SA + Y1/Y6/Y10/Y20/Y30 解約金全部對 Drew < 1%
C. ✅ Final Gate:12 組全綠 → DONE
D. 寫 final 報告 compare_final_<日期>.md
E. bump cache 到當天 + push

【操作注意】

1. 每 Phase 開始前 cp index.html index.html.bak_phaseN
2. JS edit 後一定 node --check,truncate bug 立刻修
3. Drew 跑試算每 60 秒插 mousemove keepalive
4. 帳號 burst > 30 次/3 分鐘會被 IT 盯,要放慢或換帳號
5. Cowork sandbox 掛了 → 等等再試 / 用 file 工具直接編輯 JSON
6. 中途 context 滿了 → 寫 progress 報告存 compare/,下次接續(報告要寫到「修到哪」+ 「下一步具體做什麼」)

【交付】

每個 Phase 結束寫一份 compare_phaseN_<日期>.md,結構:
  ## Phase 名稱
  ## 驗證範圍(幾組,什麼商品)
  ## 修了什麼(每個 bug 一行,含 before/after 數字)
  ## 還沒修的(原因)
  ## 下一 Phase 開始前需要的條件

最終 final 報告 compare_final_<日期>.md 列出:
  - 全部驗證過的組合(預期 30+ 組)
  - 所有商品全綠的證明
  - 任何剩餘已知誤差(< 1% 也要列)
  - 累計改動(JSON / PRODUCTS / engine)
  - 部署清單(git push / cache 版本)

開跑!按 Phase 順序,每 Phase 過了再下個。
```

---

## 補充:精準度的「最後一哩」

如果跑完 Phase 7 還有 1-2 個商品死活對不上(< 1% 也很難達到),
極可能是 Drew 自己內部某些細節(例如四捨五入規則、特殊條款計算)
我們複製不到。這時:

1. **加 product-specific overrides**:直接在 JSON 存 Drew 每年的精確 cv_total
2. **bypass engine 計算**:engine 看到 override 就直接用,不走公式
3. 接受 ±0.5% 誤差(Drew 自己不同情境輸出也會有這誤差)

---

## 工具索引

- `drew_anchors/*.txt` / `drew_anchors_TWD/*.txt` — Drew page scraping anchor(只 SA)
- `uploads/*.zip` — Drew Excel 直出 HTML(完整 schedule + rate)真值
- `v83_drew_align.py` / `v84_align_TWD.py` — SA 對齊腳本
- `v87c` engine post-processor — 已加,任何 engine 都會用 drew_rates_by_age 校正 cv
- `data/<company>/<code>.json` 的 `drew_rates_by_age` — 21M + 41M Y1-Y67 rates(目前只 USD 6yr 有)

---

下次貼回這份指令,我會從 Phase 1 verification 開始。
