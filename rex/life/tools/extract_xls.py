#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""extract_xls.py - Excel to JSON extractor. See SCHEMA.md / SKILL.md."""
import sys, os, json, io, argparse
import msoffcrypto, xlrd


def decrypt_xls(path):
    office = msoffcrypto.OfficeFile(open(path, 'rb'))
    if not office.is_encrypted():
        return open(path, 'rb').read()
    for pw in ['VelvetSweatshop', '']:
        try:
            o2 = msoffcrypto.OfficeFile(open(path, 'rb'))
            o2.load_key(password=pw)
            out = io.BytesIO(); o2.decrypt(out)
            return out.getvalue()
        except Exception:
            continue
    raise RuntimeError('cannot decrypt')


def get_sheet(wb, name):
    for i in range(wb.nsheets):
        if wb.sheet_by_index(i).name == name:
            return wb.sheet_by_index(i)
    raise KeyError('sheet not found: ' + name)


SKL_DISCOUNT_TEMPLATES = {
    'meihong_tianfu': {
        'high_premium_tiers': [
            {'min_prem': 0,     'max_prem': 9999,      'rate': 0.0},
            {'min_prem': 10000, 'max_prem': 14999,     'rate': 0.005},
            {'min_prem': 15000, 'max_prem': 19999,     'rate': 0.01},
            {'min_prem': 20000, 'max_prem': 999999999, 'rate': 0.015},
        ],
        'first_period': 0.01, 'renewal': 0.01,
        'face_max_wan': 1000, 'face_max_wan_young': 200,
    },
    'meihong_shidai_zun': {
        'high_premium_tiers': [
            {'min_prem': 0,      'max_prem': 59999,     'rate': 0.0},
            {'min_prem': 60000,  'max_prem': 99999,     'rate': 0.010},
            {'min_prem': 100000, 'max_prem': 999999999, 'rate': 0.018},
        ],
        'first_period': 0, 'renewal': 0,
        'face_max_wan': 750, 'face_max_wan_young': 200,
    },
    'meihong_shidai_2yr': {
        'high_premium_tiers': [
            {'min_prem': 0,     'max_prem': 29999,     'rate': 0.0},
            {'min_prem': 30000, 'max_prem': 49999,     'rate': 0.010},
            {'min_prem': 50000, 'max_prem': 999999999, 'rate': 0.018},
        ],
        'first_period': 0.01, 'renewal': 0.01,
        'face_max_wan': 750, 'face_max_wan_young': 200,
    },
}


def adapter_skl_meihong(wb):
    # GP
    gp = {}
    s = get_sheet(wb, 'GP')
    headers = [str(s.cell_value(0, c)) for c in range(s.ncols)]
    gp_col = headers.index('GP') if 'GP' in headers else 7
    for r in range(1, s.nrows):
        idx = s.cell_value(r, 0)
        rate = s.cell_value(r, gp_col)
        if idx and rate != '':
            key = idx.rsplit('-', 1)[0]
            gp[key] = round(float(rate), 4)

    # Corridor
    s = get_sheet(wb, 'Corridor Rule')
    plan1 = str(s.cell_value(1, 4)).strip()
    plan2 = str(s.cell_value(1, 5)).strip() if s.ncols > 5 else ''
    corridor = {}
    if plan1: corridor[plan1] = {}
    if plan2: corridor[plan2] = {}
    for r in range(2, s.nrows):
        yr = s.cell_value(r, 3)
        a = s.cell_value(r, 4) if s.ncols > 4 else ''
        b = s.cell_value(r, 5) if s.ncols > 5 else ''
        if isinstance(yr, (int, float)) and yr > 0:
            if plan1 and a != '': corridor[plan1][int(yr)] = round(float(a), 6)
            if plan2 and b != '': corridor[plan2][int(yr)] = round(float(b), 6)

    # Result_UV
    s = get_sheet(wb, 'Result_UV')
    uv = {}
    for r in range(1, s.nrows):
        idx = s.cell_value(r, 0)
        if idx:
            uv[idx] = {
                'nfv': round(float(s.cell_value(r, 1) or 0), 5),
                'csv': round(float(s.cell_value(r, 2) or 0), 5),
                'nsp': round(float(s.cell_value(r, 3) or 0), 5),
            }

    # Result_DIV (mid scenario only - first 3 cols)
    s = get_sheet(wb, 'Result_DIV')
    div = {}
    for r in range(1, s.nrows):
        idx = s.cell_value(r, 0)
        if idx:
            div[idx] = {
                'ad_m':  round(float(s.cell_value(r, 1) or 0), 5),
                'tdd_m': round(float(s.cell_value(r, 2) or 0), 5),
                'tds_m': round(float(s.cell_value(r, 3) or 0), 5),
            }

    # Product Setup
    s = get_sheet(wb, 'Product_Setup')
    products = []
    for r in range(1, s.nrows):
        code = s.cell_value(r, 0)
        if code:
            products.append({
                'code': code,
                'name': s.cell_value(r, 1),
                'pay_years': int(s.cell_value(r, 3)),
                'currency': s.cell_value(r, 5),
                'unit': s.cell_value(r, 6),
                'mature_age': int(s.cell_value(r, 8)),
                'min_age': int(s.cell_value(r, 9)),
                'max_age': int(s.cell_value(r, 10)),
                'reserve_rate': round(float(s.cell_value(r, 11)), 4),
            })

    # Approval no
    approval_no = ''
    try:
        op = get_sheet(wb, 'OP')
        for r in range(op.nrows):
            for c in range(op.ncols):
                v = str(op.cell_value(r, c))
                if v.startswith('SK-') and len(v) >= 10:
                    approval_no = v; break
            if approval_no: break
    except Exception:
        pass

    # Detect product line by plan codes
    plan_codes = [p['code'] for p in products]
    is_meihong_shidai = any(c.startswith('UPD01') or c.startswith('UPD02') for c in plan_codes)

    discounts_by_plan = {}
    if is_meihong_shidai:
        for p in products:
            code = p['code']
            tpl_key = 'meihong_shidai_zun' if code.startswith('UPD01') else 'meihong_shidai_2yr'
            tpl = SKL_DISCOUNT_TEMPLATES[tpl_key]
            discounts_by_plan[code] = {
                'high_premium_tiers': tpl['high_premium_tiers'],
                'first_period': tpl['first_period'],
                'renewal': tpl['renewal'],
            }
            p['face_max_wan'] = tpl['face_max_wan']
            p['face_max_wan_young'] = tpl['face_max_wan_young']
        default_disc = discounts_by_plan[plan_codes[0]]
    else:
        tpl = SKL_DISCOUNT_TEMPLATES['meihong_tianfu']
        default_disc = {
            'high_premium_tiers': tpl['high_premium_tiers'],
            'first_period': tpl['first_period'],
            'renewal': tpl['renewal'],
        }
        for p in products:
            p['face_max_wan'] = tpl['face_max_wan']
            p['face_max_wan_young'] = tpl['face_max_wan_young']

    return {
        'company_name': '新光人壽',
        'approval_no': approval_no or 'SK-03-NA',
        'company_logo': '../../images/img_05_1d05f38a7f49.png',
        'discounts': dict(default_disc, note='threshold is original yearly premium USD'),
        'discounts_by_plan': discounts_by_plan,
        'pay_freq_factors': {'一次繳': 1.0, '年繳': 1.0, '半年繳': 0.520, '季繳': 0.262, '月繳': 0.088},
        'pay_freq_periods': {'一次繳': 1, '年繳': 1, '半年繳': 2, '季繳': 4, '月繳': 12},
        'products': products,
        'gp_raw': gp,
        'corridor': corridor,
        'uv_raw': uv,
        'div_raw': div,
    }


ADAPTERS = {'skl': adapter_skl_meihong}


def _split_key(k):
    # split "UPD012M55" or "UPD061M55" into (plan, sex, age)
    for i, ch in enumerate(k):
        if ch in 'MF':
            return k[:i], ch, int(k[i+1:])
    return None, None, None


def _split_key_yr(k):
    # split "UPD012M55-3" into (plan, sex, age, yr)
    for i, ch in enumerate(k):
        if ch in 'MF':
            tail = k[i+1:]
            age_s, yr_s = tail.split('-')
            return k[:i], ch, int(age_s), int(yr_s)
    return None, None, None, None


def pack_to_schema(raw):
    gp = {}
    for k, v in raw['gp_raw'].items():
        plan, sex, age = _split_key(k)
        if plan:
            gp.setdefault(plan, {}).setdefault(sex, {})[age] = v

    uv2 = {}
    for k, v in raw['uv_raw'].items():
        plan, sex, age, yr = _split_key_yr(k)
        if plan is None:
            continue
        uv2.setdefault(plan, {}).setdefault(sex, {}).setdefault(age, {})[yr] = [
            round(v['nfv'], 4), round(v['csv'], 4), round(v['nsp'], 4)
        ]
    for p in uv2:
        for s in uv2[p]:
            for a in uv2[p][s]:
                ys = uv2[p][s][a]
                m = max(ys.keys())
                uv2[p][s][a] = [ys.get(y, [0, 0, 0]) for y in range(m + 1)]

    div2 = {}
    for k, v in raw['div_raw'].items():
        plan, sex, age, yr = _split_key_yr(k)
        if plan is None:
            continue
        div2.setdefault(plan, {}).setdefault(sex, {}).setdefault(age, {})[yr] = [
            round(v['ad_m'], 4), round(v['tdd_m'], 4), round(v['tds_m'], 4)
        ]
    for p in div2:
        for s in div2[p]:
            for a in div2[p][s]:
                ys = div2[p][s][a]
                m = max(ys.keys())
                div2[p][s][a] = [ys.get(y, [0, 0, 0]) for y in range(m + 1)]

    floor = {}
    for plan in uv2:
        floor[plan] = {}
        for sex in uv2[plan]:
            floor[plan][sex] = {}
            for age in uv2[plan][sex]:
                rows = uv2[plan][sex][age]
                final_nsp = 0
                for row in reversed(rows):
                    if row[2] > 0:
                        final_nsp = row[2]; break
                floor[plan][sex][age] = round(final_nsp, 5)

    return {
        'product_name': raw['products'][0]['name'] if raw['products'] else '',
        'company_name': raw['company_name'],
        'company_logo': raw['company_logo'],
        'approval_no': raw['approval_no'],
        'effective_date': raw.get('effective_date', ''),
        'discounts': raw['discounts'],
        'discounts_by_plan': raw.get('discounts_by_plan', {}),
        'pay_freq_factors': raw['pay_freq_factors'],
        'pay_freq_periods': raw['pay_freq_periods'],
        'products': raw['products'],
        'gp': gp,
        'corridor': raw['corridor'],
        'uv': uv2,
        'div': div2,
        'c_floor_nsp': floor,
    }


def validate(d):
    issues = []
    for k in ['products', 'gp', 'corridor', 'uv', 'div']:
        if not d.get(k): issues.append('missing ' + k)
    if not d.get('discounts', {}).get('high_premium_tiers'):
        issues.append('missing high_premium_tiers')
    return issues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--company', required=True, choices=list(ADAPTERS.keys()))
    ap.add_argument('--effective-date', default='')
    ap.add_argument('input')
    ap.add_argument('output')
    ap.add_argument('--keep-decrypted', action='store_true')
    args = ap.parse_args()

    print('reading', args.input)
    data = decrypt_xls(args.input)
    if args.keep_decrypted:
        with open(args.output.replace('.json', '.decrypted.xls'), 'wb') as fp:
            fp.write(data)

    wb = xlrd.open_workbook(file_contents=data, on_demand=True)
    print(wb.nsheets, 'sheets, company =', args.company)

    adapter = ADAPTERS[args.company]
    raw = adapter(wb)
    if args.effective_date:
        raw['effective_date'] = args.effective_date

    print('GP', len(raw['gp_raw']), 'UV', len(raw['uv_raw']), 'DIV', len(raw['div_raw']),
          'products', len(raw['products']))

    packed = pack_to_schema(raw)
    issues = validate(packed)
    if issues:
        print('VALIDATION FAILED:')
        for i in issues: print('  -', i)
        sys.exit(1)

    with open(args.output, 'w', encoding='utf-8') as fp:
        json.dump(packed, fp, ensure_ascii=False, separators=(',', ':'))
    print('done:', args.output, os.path.getsize(args.output), 'bytes')


if __name__ == '__main__':
    main()
