# 基金持股報價總表 — 交付清單

## 試算表內容

**編輯網址：** `https://docs.google.com/spreadsheets/d/1uEpbDJc_-40ir4jCqYpZr9a73zi4OyORVeXvcXpLprw/edit`

| 分頁 | 內容 | 持股數 | 資料日期 | GID |
|---|---|---|---|---|
| 目錄 | 索引 | — | — | `0` |
| fund1 | 安聯網路資安趨勢基金-AT累積類股(美元) | 前 10 | 2026/3/31 | `1095667789` |
| fund2 | 首域盈信印度次大陸基金第一類股(美元-累積) | 前 10 | 2026/4/30 | `1931916329` |
| fund3 | 摩根士丹利美國增長基金 A (美元) | 前 10 | 2026/3/31 | `1066680720` |
| fund4 | 安盛環球基金-數位經濟基金A CAP美元 | 前 10 | 2026/3/31 | `1544209889` |
| fund5 | 景順環球消費趨勢基金A股 美元 | 前 10 | 2026/4/30 | `1109330038` |
| igv | iShares Expanded Tech-Software Sector ETF | 前 10（116 檔中）⚠️ | 2026/4/30 | `1503812856` |
| skyy | First Trust Cloud Computing ETF | 全部 63 | 2026/5/13 | `1824090450` |
| bkch | Global X Blockchain ETF | 全部 39 | 2026/5/14 | `1129662680` |

## 🔧 報價工具 — Apps Script 已安裝

試算表最上方多了一個 **「📈 報價工具」** 選單，底下兩個指令：

1. **🛠️ 一鍵安裝欄位（漲跌%、金額、時間戳）** — 第一次先點這個
2. **🔄 立即更新報價** — 之後想刷新時點這個

### 第一次使用流程（重要）

第一次點選單會跳 Google 授權視窗。**這步必須你親自點。**

1. 開啟試算表編輯網址
2. 上方選單列點「📈 報價工具」
3. 點「🛠️ 一鍵安裝欄位（漲跌%、金額、時間戳）」
4. 跳「需要授權」視窗 → 點「繼續」
5. 選你的 Google 帳號（育松那組）
6. Google 會警告「此應用程式未經驗證」（因為是你自己寫的） → 點 **進階** → 點「前往**未命名的專案**（不安全）」
7. 看一下權限列表（會說要管理你的試算表） → 點 **允許**
8. 回到試算表，看到所有 8 個分頁都多出三個新欄位：
   - **H 欄：漲跌%** — 自動算 (現價-昨收)/昨收
   - **I 欄：漲跌金額** — 現價 - 昨收
   - **J1：「更新時間」標題；J2：實際時間戳**（每次按更新會寫入當下時間 yyyy/MM/dd HH:mm 台北時區）

授權只要做一次。之後每次想要最新報價就只要點「🔄 立即更新報價」，會強制 GOOGLEFINANCE 重算 + 寫新時間戳。

> 為什麼我自己不能代點：點「繼續」「允許」是授予腳本動你 Google 試算表的權限。安全規則不允許我代執行需要使用者授權的動作。

## 還沒做的（請你親自完成）

| 項目 | 流程 |
|---|---|
| **發佈成 CSV** | 檔案 → 共用 → 發佈到網路 → 整份文件 + CSV → 勾自動重新發佈 → 拿到 `2PACX-...` 給我 |
| **IGV 後 106 檔（如果要補完）** | 上 iShares 網站下載 IGV 完整 CSV，丟到工作資料夾，我再幫你接續填到 igv 分頁 |

## 注意事項

### GOOGLEFINANCE 仍可能有空白格

按「立即更新報價」後 GF 還是受 Google 端節流影響，少數標的可能仍是空白。等幾分鐘再按一次通常就會回填。

### 不會有報價的標的（IFERROR 會顯示空白）

| 分頁 | 標的 | 原因 |
|---|---|---|
| fund3 | MORGAN STANLEY FUNDS PLC LIQ | 貨幣市場基金，無公開報價 |
| fund5 | SUMITOMO ELECTRIC (TYO:5802) | 日股 GOOGLEFINANCE 有時不支援 |
| bkch | CASH / CANADIAN DOLLAR / OTHER PAYABLE | 現金/外幣/應付項，非個股 |
| skyy | US Dollar | 現金 |

### 跨國個股代號（bkch 分頁）

加拿大用 `TSE:`、香港 `HKG:0xxx`、德國 `FRA:`。若上線後有些拉不到價，可手動改為 `NEO:` 或 `TSXV:` 等替代代號。

### 可能要核對的個股

- **skyy row 3 — Everpure, Inc. (Class A) 代號 P**：First Trust 官網就是這樣寫，但名稱配單字母代號偏冷僻，請你看到後確認一下是不是預期的標的。

## 資料來源

| 來源 | 用途 |
|---|---|
| https://fund.cnyes.com/detail/.../shareholding | fund1~fund5 持股 |
| https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=SKYY | SKYY 完整 63 檔 |
| https://www.globalxetfs.com/funds/bkch/ | BKCH 完整 39 檔 |
| https://www.ishares.com/us/products/239771/ | IGV 前 10（完整版需下載 CSV） |
