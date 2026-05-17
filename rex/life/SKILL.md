---
name: life-product-onboard
description: 把新的壽險商品 Excel 上架到 rex/life 試算系統。當使用者提供一份新的壽險商品 .xls/.xlsm 試算表(例如富邦、友邦、安聯、台灣、新光、保誠的美元或台幣分紅商品),想加入到計算器時觸發。包含:解密、分析工作表結構、寫 adapter、抽 JSON、驗證、加入 catalog、列出測試 checklist。
---

# 壽險商品上架 Skill

把新的壽險商品 Excel 上架到 `rex/life/` 試算系統的標準流程。

## 何時觸發

當使用者:
- 提供新公司的壽險商品 Excel 檔(`.xls` / `.xlsm`)
- 說「幫我加入這個商品」/「上架這個商品」/「擴充新光以外的公司」
- 要求 extract / parse 一個保險試算 Excel
- 提到富邦/友邦/安聯/國泰/全球/保誠/凱基/遠雄/元大...等保險公司 + Excel

## 標準作業流程(9 步)

### Step 0 — 查 reference 寶庫 ★(2026-05-17 新增)

新商品上架前**先看** `REFERENCES.md`:

1. **`_reference/product_inventory.json`** — 確認商品代碼是否已存在於 491 商品清單(13 公司)
2. **`_reference/drew_anchors.json`** — 業務員 Drew 收集 247 條真值記錄。查 `(plan_code, period, age, sex)` 是否有真值對照 → 多一條驗證軌道
3. **`_reference/extractors/<公司>*`** — 對應公司的 Python extractor / Markdown 指令,看 Excel 結構與踩過的雷

**注意:** Reference 只能讀,不可直接複製 JSON 或 import 舊邏輯。詳細邊界規則看 `BOUNDARY.md`。

### Step 1 — 確認檔案 + 公司代碼

問使用者:
- Excel 檔放在哪裡(`private/sources/{公司}/...`)
- 公司簡稱英文(skl / fubon / allianz / cathay / globallife / twlife / pca / kgilife...)
- 啟用日期 YYYY-MM-DD

### Step 2 — 解密 + 探查結構

```bash
python3 tools/extract_xls.py --company {temp} {file.xls} {scratch.json}
```

如果 `--company` 還沒對應 adapter,**先用 python 互動式 inspect**:

```python
import msoffcrypto, io
office = msoffcrypto.OfficeFile(open('input.xlsm','rb'))
if office.is_encrypted():
    office.load_key(password='0800099850')  # 台灣人壽用客服電話,新光用 VelvetSweatshop
    out = io.BytesIO(); office.decrypt(out); data = out.getvalue()
else:
    data = open('input.xlsm','rb').read()
from openpyxl import load_workbook
wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_vba=False)
for s in wb.sheetnames[:20]: print(s)
```

對照 `SCHEMA.md` 找 GP / Corridor / UV / DIV 表位置。

### Step 3 — 寫 adapter

在 `tools/extract_xls.py` 加 `adapter_{company}_{product}()` 函式。
**先看** `_reference/extractors/<公司>*` 有沒有現成研究 → 可大幅省時。

### Step 4 — 跑抽取,得到 JSON

```bash
python3 tools/extract_xls.py --company fubon --effective-date 2026-06-01 \
    private/sources/fubon/input.xlsm data/fubon/FBXXX_2026-06.json
```

### Step 5 — 在 _catalog.json 加 entry

含必要欄位:code / family / term / name / unit / pay_years / version "001" / data_file 等

### Step 6 — 驗證計算(雙軌)

* **PDF 對照** — 至少 3 案例,誤差 ≤ 3 USD(workflow-validation.md)
* **Drew anchor 對照(若有)** — 查 `_reference/drew_anchors.json` 內有沒有 (plan_code, age, sex, period) 真值

至少驗 yr 1, 6, 30, 50,**含滿期年那列(attained=110)J=K 強制驗** ★ v008 必查項

### Step 7 — 更新版本與 CHANGELOG

* `_catalog.json` 新商品 `version: "001"`
* `CHANGELOG.md` 開新章節
* 給 Jira 文案(複製貼用)

### Step 8 — 通知使用者測試

請使用者:
1. Ctrl+F5 刷新瀏覽器
2. 從「保險公司」下拉切換到新公司
3. 跑同樣案例對照(投保金額 / 年齡 / 性別)
4. 列印 PDF 看版面有沒有跑掉

## 常見地雷

### 折扣模型差異
* 新光:高保費 4 級 + 首期 1% + 續期 1%
* 富邦:可能是 3 級 + 集彙折扣
* 友邦:可能加上「銀行通路折扣」
* **對照官方折扣表抓清楚,別假設都一樣**

### 繳別係數差異
各家不同,**從 OP 工作表抓**,別 hardcode

### 商品代碼前綴長度
* SKL 用 6 字元 (UPD061)
* TWLife:TLZWF6 / TLMSCH06 / TLMHW06 等,長度不一
* `pack_to_schema` 內有 `k[:6]` / `k[6]` / `k[7:]` 切割邏輯,**需要時擴充**

### TD_IND 偏移
* 新光的 終期紅利 H/I 用「前一年索引」 (`year - 1`)
* 其他公司可能用當年,**對照 PDF 第 4 年的 H 值驗證**

### 高齡 C 下限
* 新光 yr 35+ C 凍結於 NSP × face
* 其他公司可能不同,**驗證 yr 30/40/50 看 C 走勢**

### 滿期年處理 ★★★(2026-05 踩過,必查)

**終身壽險合約都在保險年齡 110 歲滿期**,給付「祝壽保險金」= 身故保險金。

PDF 表格**最後一列就是 attained = 110 那年,J(身故)= K(解約)完全相同**。

容易踩兩個 bug:
1. **`lastYear` off-by-one** — `lastYear = mature_age - age + 1`(差 1 就漏掉最尾端那一列)
   - 因為 `attained = age + yr - 1`,要看到 attained=110 需 `yr = 111 - age`
   - 漏掉那一列 → 用戶會抓「最後一列數字不見」
2. **滿期年 K = J 必須對齊** — 即使資料層自然收斂(CSV[110]=NFV[110]、addCV=addPV、TDS=TDD),
   Excel 2 位小數會留 ±1 USD 殘差,**直接 force `K_val = J_val` 在 attainedAge ≥ 110**

```js
const lastYear = prod.mature_age - age + 1;
let J_val = C + F + TDD;
let K_val = D + G + TDS;
if (attainedAge >= 110) K_val = J_val;
```

## 上架完成 Checklist

- [ ] adapter 函式寫好並通過驗證
- [ ] JSON 產出 + 大小合理(1-2 MB)
- [ ] catalog.json 新 entry
- [ ] 對照官方 PDF 2 個案例 0% 誤差
- [ ] **PDF 最後一列(滿期年)attained age 確認,J = K 對齊** ★ v008 新增
- [ ] CHANGELOG 紀錄
- [ ] 公司 LOGO 放到 `../../images/`
- [ ] 瀏覽器測試:切換公司、性別、年齡、面額都正常
- [ ] 列印 PDF 封面 + Hero + 表格正常

## 相關檔案

* `REFERENCES.md` — Reference 寶庫總入口(Drew anchor + 商品清單 + 11 extractor)★ v9 新增
* `BOUNDARY.md` — 跟舊 compare/ 的隔離邊界
* `SCHEMA.md` — 完整 JSON 欄位規範
* `SKILL_SKL.md` / `SKILL_TWLIFE.md` — 各公司專屬手冊
* `tools/extract_xls.py` — 抽取主程式
* `data/_catalog.json` — 商品目錄
* `CHANGELOG.md` — 版本紀錄
* `index.html` — 主試算頁
