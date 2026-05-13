# -*- coding: utf-8 -*-
"""
enrich_manifest.py — 重新產生完整的 _manifest.json

用途:讀取 data/ 資料夾裡所有商品 JSON,智能擷取 meta 資訊,
      重新產生 data/_manifest.json。

智能擷取邏輯:
  1. 先看商品 JSON 的最外層(像 ARLPLU71 那樣)
  2. 再看 meta 子物件(像 UPD061、NUIW 那樣)
  3. 兩種結構都能正確擷取

使用方式:
  把這個 enrich_manifest.py 放在跟 data/ 資料夾「同一層」
  (即 split_work 資料夾根目錄),然後:
      python enrich_manifest.py
"""

import json
import os
from pathlib import Path

DATA_DIR = "data"
MANIFEST_FILE = "_manifest.json"

META_FIELDS = [
    "company", "plan_code", "product_code", "product_name",
    "currency", "period", "policy_term", "premium_term",
    "engine", "engine_version",
    "min_age", "max_age",
    "declared_rate", "predicted_rate",
]

# 引擎推斷規則(當 JSON 裡沒明寫 engine 時的後備邏輯)
ENGINE_PREFIX_MAP = {
    "UPD": "taishin_v1",     # 新光分紅型
    "NUIW": "twlife_v1",     # 台灣人壽利變型
    "ARLP": "prudential_v1", # 保誠 RV 表
}


def extract_meta(data, key, rel_path=""):
    """從單一商品 JSON 智能擷取 meta。

    v2 (2026-05-13):
    - 加 path 欄位(子目錄部署需要)
    - 加 plan_year 為 period 後備來源
    - 保留現有 manifest 內 needs_revalidation / revalidation_note 標記
    """
    item = {"key": key}
    if rel_path:
        item["path"] = rel_path

    src_outer = data if isinstance(data, dict) else {}
    src_meta = data.get("meta", {}) if isinstance(data, dict) and isinstance(data.get("meta"), dict) else {}

    for f in META_FIELDS:
        if f in src_outer and not isinstance(src_outer[f], (dict, list)):
            item[f] = src_outer[f]
        elif f in src_meta and not isinstance(src_meta[f], (dict, list)):
            item[f] = src_meta[f]

    # period 後備:從 plan_year 取(prudential_v1 用 plan_year 命名)
    if "period" not in item:
        py = src_outer.get("plan_year") or src_meta.get("plan_year")
        if py:
            item["period"] = py

    # plan_code / product_code 統一
    if "plan_code" in item and "product_code" not in item:
        item["product_code"] = item["plan_code"]
    if "product_code" in item and "plan_code" not in item:
        item["plan_code"] = item["product_code"]
    if "plan_code" not in item:
        item["plan_code"] = key
        item["product_code"] = key

    # 引擎後備推斷
    if "engine" not in item:
        for prefix, engine in ENGINE_PREFIX_MAP.items():
            if key.startswith(prefix):
                item["engine"] = engine
                break

    # 逐年資料筆數(若有)
    if isinstance(data, dict):
        for sk in ["schedule", "years", "annual", "projection", "rows"]:
            if sk in data and isinstance(data[sk], list):
                item["row_count"] = len(data[sk])
                break

    return item


def main():
    print("=" * 50)
    print("Manifest 補強工具")
    print("=" * 50)

    data_path = Path(DATA_DIR)
    if not data_path.is_dir():
        print(f"❌ 找不到 {DATA_DIR}/ 資料夾")
        print("   請確認這個腳本跟 data/ 資料夾在同一層")
        return

    # v2 (2026-05-13):遞迴讀子目錄,排除 manifest / index.html / sub-manifest / 中文檔名 之外都收
    json_files = sorted([
        f for f in data_path.rglob("*.json")
        if f.name != MANIFEST_FILE
        and not f.name.startswith("_")
    ])

    if not json_files:
        print(f"❌ {DATA_DIR}/ 裡沒有商品 JSON 檔")
        return

    print(f"✓ 找到 {len(json_files)} 個商品 JSON\n")

    # 載入既有 manifest,保留 needs_revalidation / revalidation_note 等附加欄位
    existing_extras = {}
    if (data_path / MANIFEST_FILE).exists():
        try:
            old = json.load(open(data_path / MANIFEST_FILE, encoding="utf-8"))
            for e in old:
                k = e.get("key")
                if k:
                    extras = {kk: vv for kk, vv in e.items() if kk in ("needs_revalidation", "revalidation_note", "xlsm_url", "pdf_url", "is_estimated", "verified_at")}
                    if extras: existing_extras[k] = extras
        except Exception:
            pass

    manifest = []
    for fp in json_files:
        try:
            data = json.load(open(fp, encoding="utf-8"))
        except Exception as e:
            print(f"  ⚠️  {fp.name} 解析失敗: {e}")
            manifest.append({"key": fp.stem, "_error": str(e)})
            continue

        # 計算相對於 data/ 的路徑(支援子目錄)
        rel_path = str(fp.relative_to(data_path)).replace(os.sep, "/")
        item = extract_meta(data, fp.stem, rel_path)
        # 合併保留欄位
        if fp.stem in existing_extras:
            item.update(existing_extras[fp.stem])
        manifest.append(item)

        # 簡短報告
        company = item.get("company", "?")
        engine = item.get("engine", "?")
        name = (item.get("product_name") or "?")[:30]
        flag = " ⚠️" if item.get("needs_revalidation") else ""
        print(f"  ✓ {fp.stem:15s} {company:8s} {engine:15s} {name}{flag}")

    out_path = data_path / MANIFEST_FILE
    json.dump(manifest, open(out_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"\n✓ 寫入 {out_path} ({out_path.stat().st_size:,} bytes)")
    print(f"   總條目: {len(manifest)}  / 警告需重抽: {sum(1 for x in manifest if x.get('needs_revalidation'))}")
    print("\n" + "=" * 50)
    print("✅ 完成!")
    print("=" * 50)


if __name__ == "__main__":
    main()
