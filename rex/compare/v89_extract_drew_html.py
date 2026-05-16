#!/usr/bin/env python3
"""
v89 通用 Drew HTML 抽取器
========================
任何 Drew 試算 HTML(增值/身故/還本)都能抽取每商品 Y1-Y89 rate。

用法:
    1. 在 Drew 跑試算後右上「下載試算表」存 HTML zip
    2. 解壓 zip 到 drew_html/<combo>/ (e.g., drew_html/TWD_6yr_41M_increment/)
    3. 跑 python v89_extract_drew_html.py
    4. 自動寫進 data/<company>/<code>.json 的 drew_rates_by_period_and_age
    5. cache bump + JS 驗證

每個 combo 資料夾名稱必須照格式:
    <CURRENCY>_<PERIOD>yr_<ANCHOR>_<TYPE>
    例:
        USD_6yr_41M_increment    (USD 41歲男 6年 增值)
        TWD_6yr_30F_increment    (TWD 30歲女 6年 增值)
        USD_1yr_21M_death        (USD 21歲男 躉繳 身故)
"""
import os, re, json, glob, sys, subprocess, tempfile
from collections import OrderedDict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DREW_HTML_ROOT = os.path.join(SCRIPT_DIR, 'drew_html')
DATA_ROOT = os.path.join(SCRIPT_DIR, 'data')
INDEX_HTML = os.path.join(SCRIPT_DIR, 'index.html')


def extract_html(path):
    """Extract per-product Y1-Y89 rates from Drew HTML"""
    with open(path, encoding='utf-8') as f:
        html = f.read()
    parts = re.split(r'(?=class="[^"]*code-pc)', html)
    out = OrderedDict()
    for blk in parts[1:]:
        cm = re.search(r'change-color[^>]*>([A-Z0-9_/()@-]+)<', blk[:400])
        if not cm: continue
        norm = re.sub(r'\([\d@_-]+\)', '', cm.group(1)).strip()
        if norm in out: continue
        yr_pat = re.compile(
            r'class="[^"]*year-data-mb[^"]*"[^>]*>(\d+)<[\s\S]{0,4000}?'
            r'class="[^"]*return-rate-number[^"]*"[^>]*>([\d.]+)%'
        )
        rates = {}
        for y, r in yr_pat.findall(blk):
            yi = int(y)
            if yi not in rates: rates[yi] = float(r)
        if rates: out[norm] = rates
    return out


def parse_combo_name(folder_name):
    """USD_6yr_41M_increment → ('USD', 6, '41M', 'increment')"""
    m = re.match(r'(USD|TWD)_(\d+)yr_(\d+[MF])(?:_(increment|death|refund))?', folder_name)
    if not m: return None
    cur, per, anchor, typ = m.groups()
    return cur, int(per), anchor, typ or 'increment'


def main():
    if not os.path.isdir(DREW_HTML_ROOT):
        print(f'! 找不到 {DREW_HTML_ROOT}')
        print(f'  請建立目錄並放 Drew HTML zip 解壓後的資料夾')
        sys.exit(1)

    # 1. 找所有 combo folders
    folders = [f for f in os.listdir(DREW_HTML_ROOT) if os.path.isdir(os.path.join(DREW_HTML_ROOT, f))]
    if not folders:
        print(f'! 沒有 combo folder')
        sys.exit(1)

    # 2. Backup
    bak = INDEX_HTML + '.bak_v89_extract_' + str(int(os.path.getmtime(INDEX_HTML)))
    if not os.path.exists(bak):
        with open(INDEX_HTML, 'rb') as f: data = f.read()
        with open(bak, 'wb') as f: f.write(data)
        print(f'✓ backup: {bak}')

    # 3. 每個 folder 抽 rate
    all_data = {}  # {(cur, per, anchor, typ): {code: rates}}
    for f in folders:
        combo = parse_combo_name(f)
        if not combo:
            print(f'! 跳過(folder 名稱格式不對): {f}')
            continue
        # find HTML files in folder
        htmls = glob.glob(os.path.join(DREW_HTML_ROOT, f, '*.html'))
        if not htmls:
            print(f'! {f}: 沒 html')
            continue
        for h in htmls:
            rates = extract_html(h)
            if rates:
                all_data[combo] = rates
                print(f'  {f}: {len(rates)} 商品')
                break

    if not all_data:
        print('! 沒抽到任何資料')
        sys.exit(1)

    # 4. 寫入 JSON
    updated_files = set()
    by_product = {}
    for (cur, per, anchor, typ), products in all_data.items():
        for code, rates in products.items():
            by_product.setdefault(code, {}).setdefault(typ, {}).setdefault(str(per), {})[anchor] = rates

    for code, data in by_product.items():
        paths = glob.glob(f'{DATA_ROOT}/**/{code}.json', recursive=True)
        for p in paths:
            try:
                d = json.load(open(p, encoding='utf-8'))
            except: continue
            if not isinstance(d, dict): continue

            # 'increment' 是預設(向後相容用 drew_rates_by_period_and_age)
            inc = data.get('increment', {})
            if inc:
                if 'drew_rates_by_period_and_age' not in d:
                    d['drew_rates_by_period_and_age'] = {}
                for per, anchors in inc.items():
                    if per not in d['drew_rates_by_period_and_age']:
                        d['drew_rates_by_period_and_age'][per] = {}
                    d['drew_rates_by_period_and_age'][per].update(anchors)

            # 'death' / 'refund' 另存
            for typ in ('death', 'refund'):
                if typ in data:
                    key = f'drew_rates_{typ}_by_period_and_age'
                    if key not in d:
                        d[key] = {}
                    for per, anchors in data[typ].items():
                        if per not in d[key]:
                            d[key][per] = {}
                        d[key][per].update(anchors)

            d.setdefault('meta', {})['drew_extracted_combos'] = sorted(set(
                f'{per}{a}{t}' for t, pers in data.items() for per, ans in pers.items() for a in ans
            ))
            json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            updated_files.add(p)

    print(f'\n✓ {len(updated_files)} JSON 更新')

    # 5. Bump cache
    with open(INDEX_HTML, encoding='utf-8') as f: html = f.read()
    import datetime
    new_ver = '2026' + datetime.datetime.now().strftime('%m%d') + 'h'
    html = re.sub(r"window\.__DATA_VERSION__\s*=\s*'[^']+';",
                  f"window.__DATA_VERSION__ = '{new_ver}';", html)
    with open(INDEX_HTML, 'w', encoding='utf-8') as f: f.write(html)
    print(f'✓ cache → {new_ver}')

    # 6. JS verify
    m = re.search(r'<script>(.*)</script>', html, re.DOTALL)
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
        t.write(m.group(1)); fn = t.name
    r = subprocess.run(['node', '--check', fn], capture_output=True, text=True)
    print(f'JS syntax: {"✓ OK" if r.returncode==0 else "✗ FAIL: "+r.stderr[:300]}')

    print(f'\n=== 完成 ===')
    print(f'下一步:')
    print(f'  cd compare && git add . && git commit -m "v89: more anchors" && git push')
    print(f'  瀏覽器 Ctrl+Shift+R 驗證')


if __name__ == '__main__':
    main()
