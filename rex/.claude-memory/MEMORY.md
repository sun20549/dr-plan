# Memory Index · rex/

> 未來 Claude session 開工前先讀這份。一行一條,點進去看細節。

## 使用者偏好

- [user-profile.md](user-profile.md) — 業務員身分、工作流、講話偏好

## 專案結構

- [project-life.md](project-life.md) — life/ 試算頁(**主力 + 唯一可信賴**):架構、版本管理、3 段下拉、PDF 列印、計算邏輯雙軌
- 其他子模組:rex/A&H/(意外醫療)、rex/income/(失能扶助)
- ⚠ **rex/compare/ 是舊版(2026-05 v64 卡 65%),已凍結** — 看 `../life/BOUNDARY.md` 跟 `../compare/DEPRECATED.md`。**絕對不可從 compare/ 複製資料進 life/**
- ✨ **`life/_reference/`** — 從 compare/ 搶救的有用資料(2026-05-17 snapshot):Drew 247 條真值 / 491 商品清單 / 11 個 extractor。**讀來學設計、查真值用,不可信數字**。看 `life/REFERENCES.md`

## 保險公司知識

- [insurer-skl.md](insurer-skl.md) — 新光人壽 (SKL):Excel 結構、商品代碼、計算公式、地雷彙整
  - 詳細手冊看 `../life/SKILL_SKL.md`(338 行)
- [insurer-twlife.md](insurer-twlife.md) — 台灣人壽 (TWLife):.xlsm 加密密碼=客服電話、元 USD 單位、pws+CorridorCriteria 公式
  - 詳細手冊看 `../life/SKILL_TWLIFE.md`

## 工作流程慣例

- [workflow-versioning.md](workflow-versioning.md) — 每次改動必做:bump version + CHANGELOG + JIRA_TICKET
- [workflow-validation.md](workflow-validation.md) — 商品上架必驗:對照官方 PDF 至少 3 案例,誤差 ≤ 0.01 USD;**滿期年 attained=110 那列 J=K 強制驗(v008 踩過)**

## 已知坑

- [pitfalls-onedrive-sync.md](pitfalls-onedrive-sync.md) — Edit 工具有時被 OneDrive sync 截斷,需用 Python 直寫
- [pitfalls-recovery.md](pitfalls-recovery.md) — index.html 損毀時從 `.claude/projects/*.jsonl` 重組的方法
