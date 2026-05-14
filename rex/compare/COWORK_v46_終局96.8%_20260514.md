# Cowork v46 — 終局 96.8% 處理覆蓋率(15 個 v1 收尾)

**時間**:2026-05-14 早晨(洗澡中)
**v2_full**:**331 / 464 = 71.3%** ⭐
**精確覆蓋(v2_full + prudential_v2)**:**375 / 464 = 80.8%**
**處理覆蓋(精算 + UI 隱藏)**:**449 / 464 = 96.8%** 🚀

---

## ✅ v46 做了什麼

把 21 個沒資料的 v1 stub 標記成 `unsupported_empty`(UI 自動隱藏),並修元大 QI/QI_2 缺 company info 的問題。

**標 unsupported 的 21 個**(都是 manifest 有名字但 JSON 全空):
- aia: NTIW1201
- ntsbu: 20TISN
- pca: P8TISN
- fubon (lowercase): FWD3-FWD8, P3TIRA, PCT01A01, 7PARWLSK
- twlife (lowercase): NUIC0901, NUPC0101, NUIC0803, NTIC0702, NTIC0801, NTPC0102
- sklife: SX1, TAR021, TAR031

**修 QI/QI_2**:補 company=元大人壽、product_name=金美寶、period=2

---

## 📊 終局分布

| 類別 | 數量 | 比例 | 用戶體感 |
|------|------|------|---------|
| **v2_full 全表精算** | **331** | **71.3%** | ⭐ 任意輸入精確 |
| prudential_v2 分紅 | 44 | 9.5% | ⭐ 三情境分紅 |
| unsupported(隱藏) | 74 | 15.9% | UI 不顯示 |
| **v1 估算** | **15** | 3.2% | 線性縮放(基準對齊) |

**剩 15 個 v1**(都有 base data + schedule,UI 線性縮放可用):
- HR 安心傳家(臺銀)
- JJ 金永旺(臺銀)
- FVX1 美金發發(第一金)
- PFVA_PFV 美年加鑫(富邦)
- QI / QI_2 金美寶(元大)
- PALA / PFNA / PFNB / PFNC(富邦分紅型)
- PRU01A21 / PRU02A21(富邦)
- 2RPISWLF / 3PARWLSLB(安達 2y/3y)
- NUEW0201(台灣)

---

## 🎁 整夜 marathon 完整成果(18 session)

```
v18 (28)  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░  6%   起點
v22 (90)  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░ 19%  遠雄解密
v28 (192) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 41%  凱基
v32 (258) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 55.6% Drew 合成
v37 (304) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 65.5% 🎉
v40 (304) + 53 unsup = 77%
v44 (323) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 69.6% (+新光)
v45 (331) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 71.3% (+全球 8)
v46 (331) + 74 unsup = 96.8% 🎉🎉🎉
```

**marathon 全程 v2_full**:**28 → 331(× 11.8 倍)**
**marathon 全程處理覆蓋**:6% → 96.8%

---

## 💾 commit 訊息

**Summary:**
```
v46 — 終局 v2_full 71.3% + 96.8% 處理覆蓋(剩 15 個 v1 線性)
```

**Description:**
```
v45 之後最後收尾:

1) 把 21 個 empty stub 標 unsupported_empty(UI 隱藏)
   - aia/ntsbu/pca/fubon/twlife/sklife 各家殘餘空檔
2) 修 元大 QI/QI_2 缺 company info

最終分布:
- v2_full: 331 (71.3%) 任意輸入精確
- prudential_v2: 44 (9.5%) 三情境分紅
- unsupported UI 隱藏: 74 (15.9%)
- v1 線性估算: 15 (3.2%)

剩 15 個 v1 都有 base + schedule,
UI 用線性縮放可用,只是不同年齡/性別精度遞減。
要再升級唯一路:業務員提供「公版精算範本」
(每個 1 檔 1 商品)。

整夜 marathon (18 session):
- v2_full 28 → 331 (×11.8 倍)
- 任意輸入精確 6% → 80.8%
- 處理覆蓋 6% → 96.8%
- 8 種 Excel extractor (AIA/KGI/Anda/Farglory/SKL/
  Yuanta/Transglobe/Chubb/Fubon)
- 遠雄密碼破解(VelvetSweatshop)
- 凱基 EBKD greedy regex
- fmt_sex float bug 修復
- 跨公司 alias 機制
- Drew 合成 gp_table(16+ 個樣本基準)
- RWD 5 breakpoint + 列印 A4 優化
```

---

**寫於**:2026-05-14 早晨
**marathon 真‧終局** 🎉🎉🎉

整夜陪你跑這趟值了 ❤️
洗完起床推上線就能用 ☀️

剩 15 個 v1,都還能跑(UI 不會掛),只是「不同年齡/性別」精度會差一點。
要 100% 精確只剩一條路:**請業務員拿到那 15 個的公版精算範本(就像之前全球/新光那種 xls)**,我這邊就能再升級。
