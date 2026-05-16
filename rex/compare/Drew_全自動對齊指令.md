# Drew → rex1688 全自動對齊指令

> 下次貼這份給 Claude,直接全自動跑完。
> 前置:Chrome 已開 https://drew.leishan.app 並登入磊山帳號。

---

## 任務

用 Claude in Chrome 開 https://drew.leishan.app(我已登入),對下列每個組合
都跑一次「規劃試算 → 下載建議書(.zip)」,存到桌面 `/drew_dumps/<年期>/<組合>.zip`

## 三錨點(固定預算才能反推 gp,別亂改)

| 代號 | 性別 | 年齡 | 預算 |
|---|---|---|---|
| A | 男 | 21 | USD 100,000 |
| B | 男 | 41 | USD 100,000 |
| C | 女 | 30 | USD 100,000 |

## 類型(每個年期都跑)

1. 美元利變非還本
2. 美元利變還本 — 增值型
3. 美元利變還本 — 身故型
4. 美元分紅終身壽險(只跑有的年期)

## 年期

`1(躉繳) / 2 / 3 / 5 / 6 / 8 / 10 / 12 / 20`

- 1 跟 6 已對齊,但仍重抽一次驗證
- **重點:其他 7 個年期(2/3/5/8/10/12/20)**

---

## 下載完做什麼

1. 解壓每個 zip,讀裡面 `*.html`
2. 沿用 `v75_drew_html_anchor.py` 的抽取邏輯抽:
   - 商品代號 (`code-pc`)
   - 保額 (`Insurance-amount-pc`)
   - 首年實繳 / 滿期實繳 / 宣告利率
3. 建 age × sex curve(log-linear,21M+41M anchor + 30F factor)
4. 寫進 `data/<company>/<code>.json` 的 `gp_table[0–90 × M/F]`
5. PRODUCTS 陣列裡:
   - Drew 有 / 我沒有 → **加進來**,建 stub JSON
   - Drew 沒有 / 我有 → **標 `hidden=true`**
   - 代號 / 年期 / 類型不一致 → **以 Drew 為準**改我這邊
6. 增值 vs 身故是 schedule 不同變體 → 同一個 JSON 用 `schedule_increment` / `schedule_death` 兩個欄位存
7. v82 後 cache 版本再 bump 一次(改 `__DATA_VERSION__`)

---

## 交付

- 一份對齊報告 `.md`:每年期幾個對齊、幾個新增、幾個隱藏、有沒有誤差 >5% 的
- 全部 push 到 GitHub
- 在 Step 2 用 **41M USD 100k 6 年**實際跑一次驗證截圖

---

## ⚠️ Drew Keepalive — 不點就會登出

- **每 60 秒**必須在 Drew 頁面做一個無害動作:
  滑鼠移動 / 點左上 logo / 切回首頁 / 重 hover 選單
  (用 Claude in Chrome 的 `javascript_tool` 模擬 mousemove + click logo)
- **每執行完一個年期** → 立刻檢查右上角是否還是「已登入」狀態
  - 若已被踢出 → 立刻停下來通知我,**不要自己嘗試重登**(會卡 SSO)
- 整段流程預估 15–25 分鐘,所以 keepalive 必須在 background interval 跑

建議注入語法(navigate 完成後馬上注一次):

```js
window.__keepalive = setInterval(() => {
  // 1. 觸發 mousemove(偽造活動)
  document.dispatchEvent(new MouseEvent('mousemove', {clientX: 100, clientY: 100}));
  // 2. 點 logo / brand(無害導回首頁)
  const logo = document.querySelector('.logo, .brand, header img, [class*="logo"]');
  if (logo) logo.click();
  console.log('[keepalive]', new Date().toLocaleTimeString());
}, 60000);
```

- 若中途 Drew 跳「Session 即將過期」彈窗 → 點「繼續」並回報我

---

## 其他注意

- Drew 有些商品在某些年期沒上架 → 抓不到就跳過,別當錯誤
- 還本/增值是同一商品 code,只是 schedule 算法不同 → 同一個 JSON 用
  `schedule_increment` / `schedule_death` 兩個欄位存
- **不要動 1yr 跟 6yr 已經 anchor 好的**(除非新數據誤差 >2%)
- 若 Chrome 連線失敗 / Drew 要重登,先停下來告訴我

---

## 預估規模

| 項目 | 數量 |
|---|---|
| 年期 | 9 |
| 類型 | 4 |
| 錨點 | 3 |
| **下載總數** | ~108 zip |
| **預估時間** | 15–25 分鐘 |

---

_由 v82 修檔同時整理,放在 `compare/` 根目錄方便下次直接複製。_
