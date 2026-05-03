# -*- coding: utf-8 -*-
import re, json, os, sys
from pathlib import Path

SOURCE_HTML = "savings_insurance_v4_13.html"
OUTPUT_DIR = "data"
SLIM_HTML = "index_slim.html"

def find_object_block(text, start_idx):
    while start_idx < len(text) and text[start_idx] != '{':
        start_idx += 1
    if start_idx >= len(text): return None
    depth, i = 0, start_idx
    in_str, str_ch, esc = False, None, False
    in_lc, in_bc = False, False
    while i < len(text):
        c = text[i]
        if esc: esc = False; i += 1; continue
        if in_str:
            if c == '\\': esc = True
            elif c == str_ch: in_str = False
            i += 1; continue
        if in_lc:
            if c == '\n': in_lc = False
            i += 1; continue
        if in_bc:
            if c == '*' and i+1 < len(text) and text[i+1] == '/':
                in_bc = False; i += 2; continue
            i += 1; continue
        if c == '/' and i+1 < len(text):
            nxt = text[i+1]
            if nxt == '/': in_lc = True; i += 2; continue
            if nxt == '*': in_bc = True; i += 2; continue
        if c in ('"', "'", '`'): in_str = True; str_ch = c; i += 1; continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return (start_idx, i + 1)
        i += 1
    return None

def js_to_json(text):
    text = re.sub(r'(?<!:)//[^\n]*', '', text)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    text = re.sub(r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:', r'\1"\2":', text)
    def s2d(m):
        s = m.group(1).replace('\\"', '"').replace('"', '\\"')
        return '"' + s + '"'
    text = re.sub(r"'((?:\\.|[^'\\])*)'", s2d, text)
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    return text

def parse_block(raw):
    try: return json.loads(raw), "JSON"
    except: pass
    try: return json.loads(js_to_json(raw)), "JS->JSON"
    except Exception as e: last = e
    try:
        import json5
        return json5.loads(raw), "json5"
    except ImportError: pass
    except Exception as e: last = e
    raise RuntimeError(f"解析失敗: {last}")

def main():
    print("="*50)
    print("HTML 拆檔工具")
    print("="*50)
    if not Path(SOURCE_HTML).exists():
        print(f"❌ 找不到 {SOURCE_HTML}")
        print(f"   目前資料夾的檔案:")
        for f in Path('.').iterdir(): print(f"   - {f.name}")
        sys.exit(1)
    size = Path(SOURCE_HTML).stat().st_size
    print(f"✓ 來源: {SOURCE_HTML} ({size:,} bytes)")
    html = open(SOURCE_HTML, encoding='utf-8').read()
    print(f"✓ 讀入 {len(html):,} 字元")
    patterns = [
        r'window\.INSURANCE_DBS\s*=\s*',
        r'const\s+INSURANCE_DBS\s*=\s*',
        r'let\s+INSURANCE_DBS\s*=\s*',
        r'var\s+INSURANCE_DBS\s*=\s*',
    ]
    m = None
    for p in patterns:
        m = re.search(p, html)
        if m: print(f"✓ 找到變數,模式: {p}"); break
    if not m:
        print("❌ 找不到 INSURANCE_DBS 變數")
        print("   請打開 HTML 用 Ctrl+F 搜尋 INSURANCE,看實際變數名")
        sys.exit(1)
    blk = find_object_block(html, m.end())
    if not blk:
        print("❌ 找不到 { ... } 區塊")
        sys.exit(1)
    bs, be = blk
    raw = html[bs:be]
    print(f"✓ 區塊位置 {bs:,}~{be:,} ({len(raw):,} 字元)")
    print("解析中...")
    try:
        dbs, method = parse_block(raw)
        print(f"✓ 解析成功 ({method})")
    except Exception as e:
        print(f"❌ {e}")
        print("   試試: pip install json5 後重跑")
        sys.exit(1)
    if not isinstance(dbs, dict):
        print(f"❌ 不是物件,是 {type(dbs).__name__}")
        sys.exit(1)
    print(f"✓ 共 {len(dbs)} 商品: {list(dbs.keys())}")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"\n輸出 {OUTPUT_DIR}/...")
    manifest = []
    for k, v in dbs.items():
        sk = re.sub(r'[^\w\-]', '_', k)
        p = Path(OUTPUT_DIR) / f"{sk}.json"
        json.dump(v, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f"  ✓ {p} ({p.stat().st_size:,} bytes)")
        item = {"key": k}
        if isinstance(v, dict):
            for mk in ["company", "product_name", "product_code", "currency",
                       "policy_term", "premium_term", "engine", "engine_version"]:
                if mk in v: item[mk] = v[mk]
        manifest.append(item)
    mp = Path(OUTPUT_DIR) / "_manifest.json"
    json.dump(manifest, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f"  ✓ {mp}")
    loader = (
        "{}; \n"
        "/* INSURANCE_DBS 已外部化 */\n"
        "window.__DB_CACHE__ = {};\n"
        "window.loadProductDB = async function(key) {\n"
        "  if (window.__DB_CACHE__[key]) return window.__DB_CACHE__[key];\n"
        "  const r = await fetch(`./data/${key}.json`);\n"
        "  if (!r.ok) throw new Error('載入 '+key+' 失敗');\n"
        "  const d = await r.json();\n"
        "  window.__DB_CACHE__[key] = d;\n"
        "  window.INSURANCE_DBS[key] = d;\n"
        "  return d;\n"
        "};\n"
        "window.loadManifest = async function() {\n"
        "  return await (await fetch('./data/_manifest.json')).json();\n"
        "};\n"
    )
    slim = html[:m.end()] + loader + html[be:]
    open(SLIM_HTML, 'w', encoding='utf-8').write(slim)
    ssize = Path(SLIM_HTML).stat().st_size
    print(f"\n✓ 瘦身版: {SLIM_HTML} ({ssize:,} bytes)")
    print(f"  原檔 {size:,} → 瘦身 {ssize:,},省下 {(size-ssize)/1024/1024:.2f} MB")
    print("\n" + "="*50)
    print("✅ 完成!")
    print("="*50)
    print("\n下一步:")
    print("1. 打開 data/ 資料夾檢查 5 個 JSON 檔")
    print("2. 開新對話傳 index_slim.html 給 Claude 改造")
    print("3. 不要再傳 v4_13.html 了!")

if __name__ == "__main__":
    main()