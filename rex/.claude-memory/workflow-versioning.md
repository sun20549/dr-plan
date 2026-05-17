# Workflow · 每次 push 前必做

使用者明確要求**每次有任何變更**(包括 UI/CSS 小改)都要主動補,不要等他問。

## 三件事

### 1. Bump version

改 `life/data/_catalog.json` 內所有受影響商品的 `version` 欄 +1:

```
UPD061/UPD101 美鴻添富   ── 改 HTML/JS/JSON 都要動
UPD012/UPD022 美鴻世代   ── 同上(共享 index.html)
```

版本是 3 位數流水號(`001` → `002` → ... → `999`)。

### 2. CHANGELOG.md 新增章節

格式:

```markdown
## 全商品 [變更類型] · YYYY-MM-DD — [一句話標題]

對應版本:UPD061/UPD101 vXXX → **vYYY**,UPD012/UPD022 vXXX → **vYYY**

### 變更
...

### 結果
...

---
```

最新版本永遠在檔案頂端。

### 3. JIRA_TICKET.md 最頂端寫 Jira 文案

格式:

```markdown
## ▸ 當前版本 SKL-XXX · [一句話] · YYYY-MM-DD

對應版本:...

### Summary

\`\`\`
SKL-XXX 一行 < 60 字符的標題
\`\`\`

### Description

\`\`\`
== 問題 / 變更 ==
...

== 修正 / 結果 ==
...

== 影響版本 ==
...

== 測試 Checklist ==
* [ ] ...
\`\`\`

---
```

舊版本往下推,標題改為「歷史版本」。

## 收尾話術

要主動跟使用者講:

> 「這次 push 您要貼的 Jira 內容(已寫到 JIRA_TICKET.md 最上面):
> **Summary:**(複製這行) ...
> **Description:**(複製整段) ... 」
