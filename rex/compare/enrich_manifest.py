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


def extract_meta(data, key):
    """從單一商品 JSON 智能擷取 meta。"""
    item = {"key": key}

    src_outer = data if isinstance(data, dict) else {}
    src_meta = data.get("meta", {}) if isinstance(data, dict) and isinstance(data.get("meta"), dict) else {}

    for f in META_FIELDS:
        if f in src_outer and not isinstance(src_outer[f], (dict, list)):
            item[f] = src_outer[f]
        elif f in src_meta and not isinstance(src_meta[f], (dict, list)):
            item[f] = src_meta[f]

    # plan_code / product_code 統一
    if "plan_code" in item and "product_code" not in item:
        item["product_code"] = item["plan_code"]

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

    json_files = sorted([
        f for f in data_path.iterdir()
        if f.suffix == ".json" and f.name != MANIFEST_FILE
    ])

    if not json_files:
        print(f"❌ {DATA_DIR}/ 裡沒有商品 JSON 檔")
        return

    print(f"✓ 找到 {len(json_files)} 個商品 JSON\n")

    manifest = []
    for fp in json_files:
        try:
            data = json.load(open(fp, encoding="utf-8"))
        except Exception as e:
            print(f"  ⚠️  {fp.name} 解析失敗: {e}")
            manifest.append({"key": fp.stem, "_error": str(e)})
            continue

        item = extract_meta(data, fp.stem)
        manifest.append(item)

        # 簡短報告
        company = item.get("company", "?")
        engine = item.get("engine", "?")
        name = item.get("product_name", "?")
        print(f"  ✓ {fp.stem:12s} {company:8s} {engine:15s} {name}")

    out_path = data_path / MANIFEST_FILE
    json.dump(manifest, open(out_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"\n✓ 寫入 {out_path} ({out_path.stat().st_size:,} bytes)")
    print("\n" + "=" * 50)
    print("✅ 完成!")
    print("=" * 50)


if __name__ == "__main__":
    main()
