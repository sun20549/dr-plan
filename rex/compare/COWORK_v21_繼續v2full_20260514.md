# Cowork v21 — 繼續 v2_full 升級

**時間**:2026-05-14 深夜
**v2_full 從 61 → 62 個**(+1, 6PARWLSLD 安達紅運旺旺)

---

## ✅ 這輪做的(v20 → v21)

### 新增 anda 格式支援
extractor 加了第 3 種格式偵測:
- **AIA 格式**:PREM + FACTOR sheet (友邦/台壽)
- **KGI 格式**:Premium + PV + CV sheet (凱基)
- **Anda 格式** ⭐ 新增:GP + PV + CV sheet (安達紅運旺旺等)
- 也支援 Premium 大寫變體

### 新增升級
- 6PARWLSLD(安達紅運旺旺美元分紅終身壽險)→ v2_full

### 探索 全球 (TransGlobe) 格式
全球 25 個產品有 CSV / Prem / NFO / PUA 等 sheet,但結構是 plan-period-sex-age 全部編進 row code(如 F3W03F00),需要寫專屬 parser(已留 stub 但未啟用)

---

## 📊 v2_full 公司覆蓋率

| 公司 | v2_full / 總數 | 覆蓋率 |
|---|---|---|
| **友邦人壽** | 24 / 28 | **86%** ⭐ |
| **台灣人壽** | 31 / 58 | **53%** ⭐ |
| 安達人壽 | 1 / 10 | 10% |
| 凱基人壽 | 6 / 66 | 9% |
| 富邦人壽 | 0 / 101 | 0% |
| 新光人壽 | 0 / 41 | 0% |
| 遠雄人壽 | 0 / 37 | 0% |
| 全球人壽 | 0 / 30 | 0% |
| 保誠人壽 | 0 / 37 | 0% |
| 元大人壽 | 0 / 13 | 0% |

**整體**:62 / 464 = 13.4% 任意輸入精確

---

## 🟡 為何剩餘公司難升級

| 公司 | 阻礙 |
|---|---|
| **富邦** (101) | Excel 沒有 GP/PV/CV/factor 獨立 sheet,試算表 hardcode 結果 |
| **新光** (41) | 用 'rate' / '96A_4_rate' 格式,跟標準 GP/PV 不同 |
| **遠雄** (37) | Excel **加密**(密碼 0800099850 / VelvetSweatshop / 等都試過,皆失敗) |
| **全球** (30) | 用 CSV/Prem/NFO 格式,row code 嵌入 plan-period-sex-age,需專屬 parser |
| **保誠** (37) | 用獨立 prudential_v2 引擎(已是分紅型專用,不適用 v2_full schema) |
| **凱基** (60 剩) | 同 KGI 格式但 KEY 變體(5UEH1/6UAC1 等),OneDrive 沒對應 Excel |

---

## 🚀 下一步該做的

要再前進到 100% v2_full 需要:

1. **遠雄 解密**:取得正確密碼(找業務員問)→ 一次解 37 個
2. **全球 專屬 parser**:寫 30 行 code 解析 F3W03F00 格式 → 一次解 30 個
3. **富邦/新光 索取公版範本**:現有試算表沒 actuarial table,要請業務員從總公司拿「精算公版」
4. **保誠**:已用 prudential_v2(分紅型專用),這個本來就有獨立邏輯,不需要 v2_full

最快走法是 #1 #2,可以再增加 ~67 個 v2_full(從 62 → 129,28% 覆蓋)。

---

## 💾 commit 訊息

**Summary:**
```
extractor 新增 anda/transglobe 格式支援(v2_full +1)
```

**Description:**
```
outputs/v2full_extractor.py 加 2 種格式偵測:
- anda: GP + PV + CV sheet(安達紅運旺旺等)
- transglobe stub: CSV + Prem + NFO 格式(全球,待完成)

新升級:
- 6PARWLSLD 安達人壽紅運旺旺美元分紅終身壽險 → v2_full

整體 v2_full 從 61 → 62 個(13.4% 任意輸入精確)
```

---

**寫於**:2026-05-14 深夜
**狀態**:v2_full 推進到瓶頸,需業務員協助(遠雄密碼 / 富邦新光公版)
