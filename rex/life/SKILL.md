---
name: life-product-onboard
description: 把新的壽險商品 Excel 上架到 rex/life 試算系統。當使用者提供一份新的壽險商品 .xls/.xlsm 試算表(例如富邦、友邦、安聯的美元分紅商品),想加入到計算器時觸發。包含:解密、分析工作表結構、寫 adapter、抽 JSON、驗證、加入 catalog、列出測試 checklist。
---

# 壽險商品上架 Skill

把新的壽險商品 Excel 上架到 `rex/life/` 試算系統的標準流程。

## 何時觸發

當使用者:
- 提供新公司的壽險商品 Excel 檔(`.xls` / `.xlsm`)
- 說「幫我加入這個商品」/「上架這個商品」/「擴充新光以外的公司」
- 要求 extract / parse 一個保險試算 Excel
- 提到富邦/友邦/安聯/國泰/全球...等保險公司 + Excel

## 標準作業流程(8 步)

### Step 1 — 確認檔案 + 公司代碼

問使用者:
- Excel 檔放在哪裡(`private/sources/{公司}/...`)
- 公司簡稱英文(skl / fubon / allianz / cathay / globallife...)
- 啟用日期 YYYY-MM-DD

### Step 2 — 解密 + 探查結構

```bash
python3 tools/extract_xls.py --company {temp} {file.xls} {scratch.json}
```

如果 `--company` 還沒對應 adapter,**先用 python 互動式 inspect**:

```python
import xlrd, msoffcrypto, io
office = msoffcrypto.OfficeFile(open('input.xls','rb'))
if office.is_encrypted():
    office.load_key(password='VelvetSweatshop')
    out = io.BytesIO(); office.decrypt(out); data = out.getvalue()
else:
    data = open('input.xls','rb').read()
wb = xlrd.open_workbook(file_contents=data, on_demand=True)
for i in range(wb.nsheets):
    s = wb.sheet_by_index(i)
    print(f'[{i}] {s.name!r}  rows={s.nrows} cols={s.ncols}')
    if 0 < s.nrows < 20:
        for r in range(min(5, s.nrows)):
            print('  ', [s.cell_value(r,c) for c in range(min(8, s.ncols))])
```

對照 `SCHEMA.md` 找出 GP / Corridor / UV / DIV 表的位置。

### Step 3 — 寫 adapter

在 `tools/extract_xls.py` 加一個 `adapter_{company}_{product}()` 函式:

```python
def adapter_fubon_xxx(wb):
    """富邦人壽 XXX 商品 — 工作表結構 ???"""
    # 1. GP 表
    gp = {}
    s = get_sheet(wb, '...')  # 對應該公司的 GP 工作表名
    ...

    # 2. Corridor
    ...

    # 3. Result_UV
    ...

    # 4. Result_DIV (中分紅前 3 欄)
    ...

    # 5. Product Setup
    products = [...]

    return {
        'company_name': '富邦人壽',
        'approval_no': '...',
        'company_logo': '../../images/fubon-logo.png',
        'discounts': {
            'high_premium_tiers': [...],  # 對照官方建議書的折扣表
            'first_period': 0.01,
            'renewal': 0.01,
        },
        'pay_freq_factors': {...},
        'pay_freq_periods': {...},
        'products': products,
        'gp_raw': gp,
        'corridor': corridor,
        'uv_raw': uv,
        'div_raw': div,
    }
```

然後在 `ADAPTERS` dict 加 entry:
```python
ADAPTERS = {
    'skl': adapter_skl_meihong,
    'fubon': adapter_fubon_xxx,  # 新加
}
```

### Step 4 — 跑抽取

```bash
python3 tools/extract_xls.py \
    --company fubon \
    --effective-date 2026-06-01 \
    private/sources/fubon/input.xls \
    data/fubon/FBXXX_2026-06.json
```

腳本自動:解密 → 跑 adapter → 打包 schema → 驗證 → 寫 JSON。

### Step 5 — 在 _catalog.json 加 entry

```json
{
  "code": "fubon",
  "name": "富邦人壽",
  "logo": "../../images/fubon-logo.png",
  "products": [
    {
      "code": "FBXXX",
      "name": "富邦XXX美元分紅終身壽險",
      "short": "富邦XXX",
      "currency": "USD",
      "pay_years": 6,
      "data_file": "fubon/FBXXX_2026-06.json",
      "plan_code": "FBXXX",
      "effective_date": "2026-06-01",
      "version": "001"
    }
  ]
}
```

### Step 6 — 驗證計算(對照官方 PDF)

寫 Node 驗證腳本,跑兩個案例(高保費 + 低保費),對照官方建議書 PDF:

| 欄位 | 第 1 年 | 第 6 年 | 第 20 年 |
|------|--------|--------|---------|
| A 當年保費 | ✓/✗ | ✓/✗ | ✓/✗ |
| B 累計保費 | ✓/✗ | ✓/✗ | ✓/✗ |
| C 基本身故金 | ✓/✗ | ✓/✗ | ✓/✗ |
| D 解約金 | ✓/✗ | ✓/✗ | ✓/✗ |
| E 增額面額 | ✓/✗ | ✓/✗ | ✓/✗ |
| H 終期身故紅利 | ✓/✗ | ✓/✗ | ✓/✗ |
| I 終期解約紅利 | ✓/✗ | ✓/✗ | ✓/✗ |

全部 0.1% 以內誤差才能上線。

### Step 7 — 更新版本與 CHANGELOG

* `_catalog.json` 新商品 `version: "001"`
* `CHANGELOG.md` 開新章節記錄上架
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
**對照官方折扣表抓清楚,別假設都一樣**

### 繳別係數差異
* 各家不同,**從 OP 工作表抓**,別 hardcode

### 商品代碼前綴長度
* SKL 用 6 字元 (UPD061)
* 其他公司可能不同
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
// 標準寫法(任何終身壽險都應該這樣)
const lastYear = prod.mature_age - age + 1;
// ... loop ...
let J_val = C + F + TDD;
let K_val = D + G + TDS;
if (attainedAge >= 110) K_val = J_val;  // 祝壽保險金 = 身故保險金
```

驗證:對照官方 PDF 看最後一列 attained age,確認 J = K(若不是 110 滿期,要查條款)。

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

* `SCHEMA.md` — 完整 JSON 欄位規範
* `tools/extract_xls.py` — 抽取主程式
* `data/_catalog.json` — 商品目錄
* `CHANGELOG.md` — 版本紀錄
* `index.html` — 主試算頁(通常不需要動)
