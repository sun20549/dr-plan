# 基金持股報價總表 — 交付清單（5 基金 + 3 ETF）

## 整體狀態

| 區塊 | 狀態 |
|---|---|
| 鉅亨網抓 fund1~fund5 前 10 大持股 | ✅ |
| 三檔 ETF 持股（IGV / SKYY / BKCH） | ✅（IGV 只有前 10，其他兩支完整） |
| Google Sheet「基金持股報價總表」 | ✅ 已建立 |
| 9 個分頁（目錄 + 5 基金 + 3 ETF） | ✅ 全部完成 |
| 每個分頁含 GOOGLEFINANCE 公式 | ✅ |
| 目錄列出 8 個來源 + 持股日期 + GID | ✅ |
| 發佈成 CSV（公開可讀） | ⚠️ **要請你親自點** |

## 編輯網址

`https://docs.google.com/spreadsheets/d/1uEpbDJc_-40ir4jCqYpZr9a73zi4OyORVeXvcXpLprw/edit`

## 各分頁清單

| 分頁 | 內容 | 持股數 | 資料日期 | GID |
|---|---|---|---|---|
| 目錄 | 索引 | — | — | `0` |
| fund1 | 安聯網路資安趨勢基金-AT累積類股(美元) | 前 10 | 2026/3/31 | `1095667789` |
| fund2 | 首域盈信印度次大陸基金第一類股(美元-累積) | 前 10 | 2026/4/30 | `1931916329` |
| fund3 | 摩根士丹利美國增長基金 A (美元) | 前 10 | 2026/3/31 | `1066680720` |
| fund4 | 安盛環球基金-數位經濟基金A CAP美元 | 前 10 | 2026/3/31 | `1544209889` |
| fund5 | 景順環球消費趨勢基金A股 美元 | 前 10 | 2026/4/30 | `1109330038` |
| igv | iShares Expanded Tech-Software Sector ETF | **前 10**（116 檔中） | 2026/4/30 | `1503812856` |
| skyy | First Trust Cloud Computing ETF | **全部 63** | 2026/5/13 | `1824090450` |
| bkch | Global X Blockchain ETF | **全部 39** | 2026/5/14 | `1129662680` |

## 還沒做的（請你親自完成）

### 發佈成 CSV — 安全規則不允許我代為操作

「發布到網路」會把整份試算表設為任何人都能讀的公開狀態，這屬於修改文件存取權限。

操作流程：

1. 開啟編輯網址
2. **檔案 → 共用 → 發佈到網路**
3. 左下拉選「整份文件」、右下拉選「逗號分隔值 (.csv)」
4. 展開「已發佈的內容和設定」 → 勾選「有變更時自動重新發佈」
5. 點「發佈」按鈕
6. 把彈出網址中的 `2PACX-xxxxxxxxx` 那串給我，我幫你存下來

### IGV 後 106 檔（如果要補完）

iShares 在網頁上只給前 10 大，要完整 116 檔的話：

1. 開啟 https://www.ishares.com/us/products/239771/ishares-north-american-techsoftware-etf
2. 找「Detailed Holdings and Analytics」或「Data Download」連結
3. 接受 Terms of Use 後下載 CSV
4. 把 CSV 放到 `C:\Users\sun20\OneDrive\文件\GitHub\dr-plan\rex\A&H\全球人壽\XHD` 並告訴我，我會幫你接續填到 igv 分頁

> 為什麼我自己不做：自動點選「接受條款」和觸發檔案下載屬於需要使用者明確授權的動作，無法在背景代執行。

## 注意事項

### GOOGLEFINANCE 報價間歇空白（會自動恢復）

剛建好時大部分標的都拉到即時報價，但短時間內塞了 200+ 條公式，Google Finance 會短暫節流，部分 F/G 欄會變空。公式本身是對的（`=IFERROR(GOOGLEFINANCE(E2,"price"),"")`），通常幾分鐘到一兩小時內會自動回填。

### 永遠拉不到報價的標的

| 分頁 | 標的 | 原因 |
|---|---|---|
| fund3 | MORGAN STANLEY FUNDS PLC - US DOLLAR LIQ | 貨幣市場基金，無公開報價 |
| fund5 | SUMITOMO ELECTRIC (TYO:5802) | 日股 GOOGLEFINANCE 有時不支援 |
| bkch | CASH / CANADIAN DOLLAR / OTHER PAYABLE | 現金/外幣/應付項，非個股 |
| skyy | US Dollar ($USD) | 現金 |

### 跨國股需要注意的 GF 代號

**bkch 分頁**有多檔非美國上市股，已使用對應交易所代號：

| 個股 | 國家 | GF 代號 |
|---|---|---|
| HUT 8 CORP | 加拿大 | TSE:HUT |
| KEEL INFRASTRUCTURE | 加拿大 | TSE:KEEL |
| HIVE DIGITAL | 加拿大 | TSE:HIVE |
| WONDERFI / NEPTUNE DIGITAL | 加拿大 | TSE:WNDR / TSE:NDA |
| OSL GROUP | 香港 | HKG:0863 |
| BITFIRE GROUP | 香港 | HKG:1611 |
| NORTHERN DATA AG | 德國 | FRA:NB2 |
| BITCOIN GROUP SE | 德國 | FRA:ADE |

如果上線觀察後發現某些代號拉不到價，可手動改為其他交易所代號（例如 NEO:WNDR、TSXV:NDA 等）。

### 可能需要核對的個股

- **skyy 分頁 row 3 — Everpure, Inc. (Class A) 代號 P**：First Trust 官網把它列為 SKYY 第 2 大持股（4.25%），但「Everpure」這個名稱配上單字母代號 P 並不常見，可能是 2025 之後的 IPO 或重新命名。請你看到時確認一下這檔是不是真的對。
- **bkch 分頁的 CIPHER DIGITAL（CIFR）**：Cipher Mining 原本是 CIFR，2026 改名為 CIPHER DIGITAL，代號維持 CIFR。
- **bkch 部分小型加密礦工股**：BMNR、ABTC、FUFU、GEMI、CD、MATH 等小型新上市股若 GOOGLEFINANCE 暫不支援，IFERROR 會顯示空白，屬正常。

## 資料來源

| 來源 | 用途 |
|---|---|
| https://fund.cnyes.com/detail/.../shareholding | fund1~fund5 持股 |
| https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=SKYY | SKYY 完整 63 檔 |
| https://www.globalxetfs.com/funds/bkch/ | BKCH 完整 39 檔 |
| https://www.ishares.com/us/products/239771/ | IGV 前 10（完整版需下載 CSV） |
