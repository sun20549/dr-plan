#!/usr/bin/env python3
"""v84 — Drew 台幣商品 → rex1688 對齊腳本

用法(在 compare/ 目錄下執行):
    python v84_align_TWD.py

需要的檔案:
    drew_anchors_TWD/*.txt   ← 從 Drew 抓的 anchor 資料(已附)
    data/**/*.json           ← 你的商品 JSON
    index.html               ← 會修改 gp_table + PRODUCTS

會做的事:
    1. 解析 17 個 anchor 檔(21M+30F+41M 6yr × 8 年期)
    2. 為每個商品建 age × sex curve(log-linear,21M+30F 兩錨點)
    3. 更新 data/<company>/<code>.json 的 gp_table
    4. 修 PRODUCTS:加新台幣商品 / 標 Drew 沒收的 hidden
    5. cache version → 20260517a

跑完會輸出 v84_align_report.md 報告。
"""
import json, glob, os, re, math, sys
from collections import defaultdict

# === 路徑(假設從 compare/ 目錄執行) ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ANCHOR_DIR = os.path.join(SCRIPT_DIR, 'drew_anchors_TWD')
DATA_ROOT = os.path.join(SCRIPT_DIR, 'data')
INDEX_HTML = os.path.join(SCRIPT_DIR, 'index.html')
REPORT_PATH = os.path.join(SCRIPT_DIR, 'v84_align_report.md')
BUDGET = 3000000  # TWD


def parse_anchor(path):
    """Returns list of dict {company, name, code, period, sa, prem_orig, prem_real}"""
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    rows = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('=') or line.startswith('period=') or line.startswith('('): continue
        parts = line.split('\t')
        if len(parts) < 7: continue
        comp, name, code, period_str, sa_str, p_orig, p_real = parts[:7]
        if sa_str in ('-', '預算不足') or '投保年齡' in sa_str: continue
        try:
            sa = int(sa_str.replace(',', ''))
            prem_orig = int(p_orig.replace(',', ''))
            prem_real = int(p_real.replace(',', ''))
        except ValueError:
            continue
        period = 1 if period_str == '躉繳' else int(period_str)
        rows.append({
            'company': comp, 'name': name, 'code': code,
            'period': period, 'sa': sa,
            'prem_orig': prem_orig, 'prem_real': prem_real,
        })
    return rows


def normalize_code(code):
    return re.sub(r'\([\d@_-]+\)', '', code).strip()


# Step 1: Parse all anchors
print('=== Step 1: Parse 台幣 anchors ===')
all_anchors = defaultdict(list)
all_drew_products = {}

age_sex_map = {'21M': (21, 'M'), '41M': (41, 'M'), '30F': (30, 'F')}

if not os.path.isdir(ANCHOR_DIR):
    print(f'! 找不到 {ANCHOR_DIR} — 請確認 drew_anchors_TWD/ 在 compare/ 下')
    sys.exit(1)

for fn in sorted(glob.glob(f'{ANCHOR_DIR}/*.txt')):
    base = os.path.basename(fn).replace('.txt', '')
    parts = base.split('_')
    period_int = int(parts[0])
    anchor = parts[1]
    age, sex = age_sex_map[anchor]
    rows = parse_anchor(fn)
    for r in rows:
        norm = normalize_code(r['code'])
        key = (norm, period_int)
        all_anchors[key].append({
            'age': age, 'sex': sex, 'sa': r['sa'],
            'prem_orig': r['prem_orig'], 'prem_real': r['prem_real'],
            'company': r['company'], 'name': r['name'],
            'raw_code': r['code'],
        })
        if norm not in all_drew_products:
            all_drew_products[norm] = {
                'company': r['company'], 'name': r['name'],
                'periods': set(), 'raw_codes': set(),
            }
        all_drew_products[norm]['periods'].add(period_int)
        all_drew_products[norm]['raw_codes'].add(r['code'])

print(f'  {len(all_anchors)} (code, period) anchor groups')
print(f'  {len(all_drew_products)} unique 台幣 products')


def build_gp_table(anchors, period_int):
    """For TWD with budget 3M, gp = real_prem / sa * 1000 (per 1000 TWD SA per year)"""
    by_sex = defaultdict(list)
    for a in anchors:
        gp_real = a['prem_real'] / a['sa'] * 1000
        disc = 1 - a['prem_real'] / a['prem_orig'] if a['prem_orig'] else 0.01
        gp_gross = gp_real / (1 - disc) if disc < 1 else gp_real
        by_sex[a['sex']].append((a['age'], gp_gross, disc))

    M_pts = sorted(by_sex.get('M', []))
    F_pts = sorted(by_sex.get('F', []))
    gp_table = {}

    if len(M_pts) >= 2:
        a1, gp1, _ = M_pts[0]
        a2, gp2, _ = M_pts[-1]
        ln1, ln2 = math.log(gp1), math.log(gp2)
        slope = (ln2 - ln1) / (a2 - a1) if a2 != a1 else 0
        for age in range(0, 91):
            ln = ln1 + slope * (age - a1)
            gp_table[f'{period_int:02d}{age:02d}M'] = round(math.exp(ln), 4)
    elif len(M_pts) == 1:
        a1, gp1, _ = M_pts[0]
        for age in range(0, 91):
            gp_table[f'{period_int:02d}{age:02d}M'] = round(gp1 * (1.04 ** (age - a1)), 4)

    if F_pts and M_pts:
        af, gpf, _ = F_pts[0]
        gp_M_at_af = gp_table.get(f'{period_int:02d}{af:02d}M')
        f_ratio = gpf / gp_M_at_af if gp_M_at_af else 0.85
        for age in range(0, 91):
            gp_M = gp_table.get(f'{period_int:02d}{age:02d}M')
            if gp_M:
                gp_table[f'{period_int:02d}{age:02d}F'] = round(gp_M * f_ratio, 4)
    elif F_pts:
        af, gpf, _ = F_pts[0]
        for age in range(0, 91):
            gp_F = gpf * (1.04 ** (age - af))
            gp_table[f'{period_int:02d}{age:02d}F'] = round(gp_F, 4)
            gp_table[f'{period_int:02d}{age:02d}M'] = round(gp_F / 0.85, 4)
    elif M_pts:
        for age in range(0, 91):
            gp_M = gp_table.get(f'{period_int:02d}{age:02d}M')
            if gp_M:
                gp_table[f'{period_int:02d}{age:02d}F'] = round(gp_M * 0.85, 4)

    discs = [a[2] for a in M_pts + F_pts]
    disc = sum(discs) / len(discs) if discs else 0.01
    return gp_table, max(0.0001, disc)


# Step 2: Update JSON
print('\n=== Step 2: Update JSON gp_tables ===')
updated_files = []
not_found = []

for (norm, period_int), anchors in sorted(all_anchors.items()):
    gp_table, disc = build_gp_table(anchors, period_int)
    if not gp_table:
        continue
    paths = glob.glob(f'{DATA_ROOT}/**/{norm}.json', recursive=True)
    if not paths:
        not_found.append((norm, period_int, len(anchors)))
        continue
    for path in paths:
        try:
            with open(path, encoding='utf-8') as f:
                d = json.load(f)
        except Exception as e:
            print(f'  ! load fail {path}: {e}')
            continue
        existing_gp = d.get('gp_table') or {}
        new_gp = {k: v for k, v in existing_gp.items() if not k.startswith(f'{period_int:02d}')}
        new_gp.update(gp_table)
        d['gp_table'] = new_gp
        if 'meta' not in d: d['meta'] = {}
        if not isinstance(d.get('discounts'), dict): d['discounts'] = {}
        d['discounts']['auto_pay_first'] = round(disc, 4)
        d['meta'][f'drew_align_v84_TWD_p{period_int:02d}'] = (
            f'anchors={len(anchors)} ' +
            ', '.join([f'{a["age"]}{a["sex"]}=SA{a["sa"]}' for a in anchors])
        )
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        updated_files.append((norm, period_int, path))

print(f'  updated: {len(updated_files)} JSON entries')
print(f'  not found in data/: {len(not_found)}')

# Step 3: PRODUCTS comparison + edit index.html
print('\n=== Step 3: PRODUCTS array vs Drew 台幣 ===')
with open(INDEX_HTML, encoding='utf-8') as f:
    html = f.read()

m = re.search(r'(const PRODUCTS\s*=\s*\[)([\s\S]*?)(\n\];)', html)
prefix = m.group(1); body = m.group(2); suffix = m.group(3)
arr_start = m.start(2); arr_end = m.end(2)

# Parse PRODUCTS entries
entries = []
buf = ''; depth = 0; in_obj = False; i = 0
while i < len(body):
    ch = body[i]
    if ch == '{':
        if depth == 0:
            in_obj = True; entry_start = i; buf = ''
        depth += 1; buf += ch
    elif ch == '}':
        depth -= 1; buf += ch
        if depth == 0:
            j = i + 1
            while j < len(body) and body[j] in ',\n\t ': j += 1
            entry_text = body[entry_start:j]
            pc_m = re.search(r"plan_code:\s*['\"]([^'\"]+)['\"]", entry_text)
            per_m = re.search(r'period:\s*(\d+)', entry_text)
            hidden_m = re.search(r'hidden:\s*(true|false)', entry_text)
            cur_m = re.search(r"currency:\s*['\"]([^'\"]+)['\"]", entry_text)
            if pc_m and per_m:
                entries.append({
                    'text': entry_text,
                    'plan_code': pc_m.group(1),
                    'period': int(per_m.group(1)),
                    'hidden': hidden_m.group(1) == 'true' if hidden_m else False,
                    'currency': cur_m.group(1) if cur_m else 'USD',
                })
            in_obj = False; i = j; continue
    elif in_obj:
        buf += ch
    i += 1

print(f'  Parsed {len(entries)} PRODUCTS entries')

# Drew TWD pairs
drew_pairs = {(c, p) for c in all_drew_products for p in all_drew_products[c]['periods']}
rex_twd_pairs = set((p['plan_code'], p['period']) for p in entries if p['currency'] == 'TWD')
print(f'  Drew TWD pairs: {len(drew_pairs)}')
print(f'  rex TWD pairs: {len(rex_twd_pairs)}')

drew_only = drew_pairs - rex_twd_pairs
rex_twd_only = rex_twd_pairs - drew_pairs

# Hide rex-only TWD entries
hide_set = rex_twd_only
hide_count = 0
for e in entries:
    if e['currency'] == 'TWD' and (e['plan_code'], e['period']) in hide_set and not e['hidden']:
        new_txt = re.sub(r"(plan_code:\s*['\"][^'\"]+['\"]\s*,)", r"\1\n    hidden: true,", e['text'], count=1)
        e['text'] = new_txt
        e['hidden'] = True
        hide_count += 1
print(f'  Hidden TWD: {hide_count}')

# Add Drew-only TWD entries
def find_meta(plan_code):
    paths = glob.glob(f'{DATA_ROOT}/**/{plan_code}.json', recursive=True)
    if not paths: return None
    try: d = json.load(open(paths[0], encoding='utf-8'))
    except: return None
    meta = d.get('meta', {})
    return {
        'declared_rate': meta.get('declared_rate', 0.02),
        'engine': meta.get('engine', 'twlife_v2_full'),
        'unit_size': meta.get('unit_size', 1000),
        'min_sa': meta.get('min_sa', 1000),
        'max_sa': meta.get('max_sa', 1000000000),
        'min_age': meta.get('min_age', 0),
        'max_age': meta.get('max_age', 90),
        'granular_sa': meta.get('granular_sa', False),
    }

new_entries = []
added = 0
for code, period in drew_only:
    info = all_drew_products.get(code, {})
    json_meta = find_meta(code)
    if not json_meta:
        continue
    declared = json_meta['declared_rate']
    if declared and declared > 1: declared /= 100
    block = f"""{{
    plan_code: '{code}',
    company: '{info.get("company","?")}',
    product_name: '{info.get("name", code)}({code})',
    period: {period},
    currency: 'TWD',
    type: '台幣利率變動型終身壽險',
    declared_rate: {declared},
    predicted_rate: 0,
    discount: 0.01,
    discount_method: 'simple',
    engine: '{json_meta['engine']}',
    schedule_includes_dividend: false,
    granular_sa: {str(json_meta['granular_sa']).lower()},
    unit_size: {json_meta['unit_size']},
    min_sa: {json_meta['min_sa']},
    max_sa: {json_meta['max_sa']},
    min_age: {json_meta['min_age']},
    max_age: {json_meta['max_age']},
  }}"""
    new_entries.append(block)
    added += 1
print(f'  Added new TWD entries: {added}')

# Re-emit
all_blocks = [e['text'] for e in entries] + new_entries
normalized = []
for b in all_blocks:
    b = b.rstrip()
    if not b.endswith(','): b = b + ','
    normalized.append(b)
new_body = '\n' + '\n'.join(normalized) + '\n'
new_html = html[:arr_start] + new_body + html[arr_end:]

# Bump cache
new_html = re.sub(r"window\.__DATA_VERSION__\s*=\s*'[^']+';",
                  "window.__DATA_VERSION__ = '20260517a';", new_html)

with open(INDEX_HTML, 'w', encoding='utf-8') as f:
    f.write(new_html)
print(f'\nindex.html updated')
print(f'  PRODUCTS: {len(entries)} → {len(entries)+added}')
print(f'  Hidden total: {sum(1 for e in entries if e["hidden"])}')

# Step 4: Write report
with open(REPORT_PATH, 'w', encoding='utf-8') as f:
    f.write('# v84 台幣 Drew 對齊報告\n\n')
    f.write(f'## 採集規模\n\n')
    f.write(f'- Anchor 檔: {len(glob.glob(f"{ANCHOR_DIR}/*.txt"))}\n')
    f.write(f'- (代號, 年期) 組合: {len(all_anchors)}\n')
    f.write(f'- 獨立台幣商品: {len(all_drew_products)}\n\n')
    f.write(f'## 校正結果\n\n')
    f.write(f'- JSON 更新: {len(updated_files)}\n')
    f.write(f'- 找不到 JSON: {len(not_found)}\n\n')
    f.write(f'## PRODUCTS 變動\n\n')
    f.write(f'- 新增 TWD 條目: {added}\n')
    f.write(f'- 隱藏 TWD 條目: {hide_count}\n\n')
    if not_found:
        f.write(f'### 找不到 JSON 的台幣商品(前 30):\n\n')
        for c, p, n in not_found[:30]:
            info = all_drew_products.get(c, {})
            f.write(f'- {c} period={p} anchors={n} | {info.get("company","?")} {info.get("name","?")}\n')

print(f'\nReport: {REPORT_PATH}')
print(f'\n=== 完成 — 記得:')
print(f'  1) cd compare && git add . && git commit && git push')
print(f'  2) 瀏覽器 Ctrl+Shift+R')
