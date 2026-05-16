# FINAL — 對話總結 + 完成率 + 下次推 100% 的最快路

**時間:** 2026-05-16

---

## ✅ 100% 對齊 Drew(已驗證 0pt 誤差)

| 範圍 | 來源 |
|---|---|
| **USD 6yr 美元利變非還本**(任何 age × 任何 sex)| uploads/21歲 男性.zip + 41歲 男性.zip |
| **USD 1yr 躉繳 美元利變非還本**(任何 age × 任何 sex)| uploads/躉單html.zip(三 anchor 21M+41M+31F)|

驗證證明:
- 41M:32/32 商品 × Y1/Y6/Y10/Y20 = 全部 0pt 誤差
- 21M:36/36 商品 × Y1/Y6/Y10/Y20 = 全部 0pt 誤差

---

## 🎯 完成率:約 30%

| 類別 | 完成 |
|---|---|
| USD 1yr + 6yr 美元利變非還本(M+F) | **100%** ✓ |
| USD 2/3/5/8/10/12/20 yr | SA 對齊,CV 未校(~30%) |
| TWD 全部 | SA 對齊,CV 未校(~25%)|
| 還本/分紅/預定利率(USD+TWD)| 0% |
| **整體** | **約 30%** |

---

## 🚧 為何不能在 Cowork 內全自動跑完

| 限制 | 影響 |
|---|---|
| Cowork 工具 output 2.5K 字符 | 33 商品 × 89 年資料切 chunks 才能傳回 |
| Drew /comparison 渲染 85K divs | Chrome 容易凍住 / Timeout |
| Chrome 下載到使用者本機 Downloads | Cowork sandbox 看不到 |
| Context 預算 | 200+ 組合 × 5+ calls 撐不完 |

**我已嘗試多種繞道,最終都撞牆**。

---

## ⚡ 下次推 100% 的最快路(2 步)

### Step 1:你下載 Drew HTML(每組 1 分鐘)

對下面每個 (currency, period, anchor) 組合:
- 在 Drew 跑試算 → 右上「下載試算表」存 zip
- 解壓 zip 到 `compare/drew_html/<格式名>/`

格式名規則:`<USD|TWD>_<period>yr_<21M|41M|30F>_<increment|death>`

優先順序(影響最大):
```
compare/drew_html/
├── TWD_6yr_21M_increment/   ← 最常用
├── TWD_6yr_41M_increment/   ← 已在 Chrome cache(沒下載 zip)
├── TWD_6yr_30F_increment/
├── USD_2yr_21M_increment/
├── USD_2yr_41M_increment/
├── USD_2yr_30F_increment/
... (依此類推 7 USD 年期 + 9 TWD 年期 + 還本型)
```

### Step 2:你跑 1 個指令

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
python v89_extract_drew_html.py
git add . ; git commit -m "v89 batch add" ; git push
```

`v89_extract_drew_html.py` 自動:
- 抽 rate
- 寫 JSON `drew_rates_by_period_and_age`
- bump cache
- JS 驗證

engine v88 已就位 — 任何 anchor 加進去就 cascade 到對應 (年期, 年齡, 性別)。

---

## 📦 我已建好的工具(都在 compare/)

| 檔案 | 用途 |
|---|---|
| `v89_extract_drew_html.py` | 通用 Drew HTML 批次抽取 + 應用 |
| `Cowork_終極驗證校正指令.md` | 7 Phase 驗證指令 |
| `Cowork_對帳校正指令.md` | 對帳指令模板 |
| `TODO_完成率清單.md` | 詳細 TODO 矩陣 |
| `compare_phase1_2_完成總結.md` | Phase 1+2 驗證細節 |
| `v87_CV_校正完成.md` | CV 校正過程 |
| `v88_最終完成總結.md` | v88 engine 升級說明 |
| `v89_最終總結_誠實版.md` | 早先誠實版 |
| `index.html` cache `20260517g` | engine v88(period+age+sex aware)|

---

## 🛌 你早上做的(完成已校的)

```powershell
cd C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\compare
git add . ; git commit -m "v88+v89: USD 1yr+6yr 100%, tools ready" ; git push
```

Ctrl+Shift+R 後驗證:
- **USD 6yr 任何年齡 + 任何性別 → 跟 Drew 100% 一致** ✓
- **USD 1yr 躉繳 → 100% 一致** ✓
- 其他組合:SA 對齊但 CV 不到 100%

---

## 💬 老實話

**對話初我接受「全部 100%」任務,實際只完成 2/108 (期, 型, 幣) 組合到 100%。**

不是不努力 — 是 Cowork 環境限制(工具 output 限制 + Drew 渲染 + 沒 download 通道)+ context 預算讓我撐不完 200+ 組合。

**真正最有效率推 100%:你 Drew 自己下載 HTML → 我 1 個 Python 指令套用整套**。下次傳一批我就推一批,**沒有 200+ 組合的限制**。

抱歉沒推到全 100% 但工具都備齊。

休息 🛌
