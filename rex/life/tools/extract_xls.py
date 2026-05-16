#!/usr/bin/env python3
"""
extract_xls.py — 從保險公司官方建議書 .xls 抽出費率資料

用法:
    python3 extract_xls.py <input.xls> <output.json>

支援:
  - 新光人壽 美鴻添富美元分紅終身壽險 (UPD061 / UPD101) 格式
  - 自動處理 Excel VelvetSweatshop 弱加密 (Read-Only Recommended)

新增其他公司時:
  - 觀察該公司 Excel 的工作表結構,改寫 extract_rates() 函式
  - 不同公司可能使用不同欄位命名 (例如 GP/Rate/Premium、UV/CV、DIV/Dividend)

需要套件:
    pip install msoffcrypto-tool xlrd
"""
import sys
import os
import json
import io
import argparse
import msoffcrypto
import xlrd


def decrypt_xls(path: str) -> bytes:
    """處理 Excel 弱加密 (VelvetSweatshop = Read-Only Recommended)"""
    office = msoffcrypto.OfficeFile(open(path, 'rb'))
    if not office.is_encrypted():
        return open(path, 'rb').read()
    # 嘗試常見的 Excel 內建密碼
    for pw in ['VelvetSweatshop', '']:
        try:
            office2 = msoffcrypto.OfficeFile(open(path, 'rb'))
            office2.load_key(password=pw)
            out = io.BytesIO()
            office2.decrypt(out)
            return out.getvalue()
        except Exception:
            continue
    raise RuntimeError('無法解密,可能是有真正的密碼,請手動輸入')


def get_sheet(wb, name):
    for i in range(wb.nsheets):
        if wb.sheet_by_index(i).name == name:
            return wb.sheet_by_index(i)
    raise KeyError(f'找不到工作表: {name}')


def extract_rates_skl_meihong(wb):
    """新光人壽 美鴻添富 (UPD061 / UPD101) 抽取函式"""

    # --- GP (gross premium per 千美元 × 10) ---
    gp = {}
    s = get_sheet(wb, 'GP')
    for r in range(1, s.nrows):
        idx = s.cell_value(r, 0)
        rate = s.cell_value(r, 7)
        if idx and rate != '':
            key = idx.rsplit('-', 1)[0]  # "UPD061M55-1" -> "UPD061M55"
            gp[key] = round(float(rate), 4)

    # --- Corridor coefficient by policy year ---
    s = get_sheet(wb, 'Corridor Rule')
    corridor = {'UPD061': {}, 'UPD101': {}}
    for r in range(2, s.nrows):
        yr = s.cell_value(r, 3)
        a = s.cell_value(r, 4)
        b = s.cell_value(r, 5)
        if isinstance(yr, (int, float)) and yr > 0:
            if a != '': corridor['UPD061'][int(yr)] = round(float(a), 6)
            if b != '': corridor['UPD101'][int(yr)] = round(float(b), 6)

    # --- Result_UV: NFV / CSV / NSP ---
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

    # --- Result_DIV: dividend coverage ---
    s = get_sheet(wb, 'Result_DIV')
    div = {}
    for r in range(1, s.nrows):
        idx = s.cell_value(r, 0)
        if idx:
            div[idx] = {
                'ad_m':  round(float(s.cell_value(r, 1) or 0), 5),
                'tdd_m': round(float(s.cell_value(r, 2) or 0), 5),
                'tds_m': round(float(s.cell_value(r, 3) or 0), 5),
                'ad_l':  round(float(s.cell_value(r, 4) or 0), 5),
                'tdd_l': round(float(s.cell_value(r, 5) or 0), 5),
                'tds_l': round(float(s.cell_value(r, 6) or 0), 5),
            }

    # --- Product Setup ---
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

    return products, gp, corridor, uv, div


def slim_pack(products, gp, corridor, uv, div):
    """重新整理成扁平、體積較小的結構,給前端讀取"""

    # uv2[plan][sex][age] = [[nfv,csv,nsp], ...]  (index by policy year)
    uv2 = {}
    for k, v in uv.items():
        plan = k[:6]; sex = k[6]; rest = k[7:]
        age_str, yr_str = rest.split('-')
        age = int(age_str); yr = int(yr_str)
        uv2.setdefault(plan, {}).setdefault(sex, {}).setdefault(age, {})[yr] = [
            round(v['nfv'], 4), round(v['csv'], 4), round(v['nsp'], 4)
        ]
    for p in uv2:
        for sex in uv2[p]:
            for age in uv2[p][sex]:
                years = uv2[p][sex][age]
                m = max(years.keys())
                uv2[p][sex][age] = [years.get(y, [0,0,0]) for y in range(m+1)]

    div2 = {}
    for k, v in div.items():
        plan = k[:6]; sex = k[6]; rest = k[7:]
        age_str, yr_str = rest.split('-')
        age = int(age_str); yr = int(yr_str)
        div2.setdefault(plan, {}).setdefault(sex, {}).setdefault(age, {})[yr] = [
            round(v['ad_m'], 4), round(v['tdd_m'], 4), round(v['tds_m'], 4),
            round(v['ad_l'], 4), round(v['tdd_l'], 4), round(v['tds_l'], 4),
        ]
    for p in div2:
        for sex in div2[p]:
            for age in div2[p][sex]:
                years = div2[p][sex][age]
                m = max(years.keys())
                div2[p][sex][age] = [years.get(y, [0]*6) for y in range(m+1)]

    gp2 = {}
    for k, v in gp.items():
        plan = k[:6]; sex = k[6]; age = int(k[7:])
        gp2.setdefault(plan, {}).setdefault(sex, {})[age] = v

    return {
        'product_name': products[0]['name'] if products else '',
        'approval_no': '',
        'effective_date': '',
        'discounts': {
            'high_premium': 0.015,
            'first_period': 0.010,
            'renewal': 0.010,
        },
        'pay_freq_factors': {
            '一次繳': 1.0, '年繳': 1.0,
            '半年繳': 0.520, '季繳': 0.262, '月繳': 0.088,
        },
        'pay_freq_periods': {
            '一次繳': 1, '年繳': 1, '半年繳': 2, '季繳': 4, '月繳': 12,
        },
        'products': products,
        'gp': gp2,
        'corridor': corridor,
        'uv': uv2,
        'div': div2,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', help='輸入 .xls 檔')
    ap.add_argument('output', help='輸出 .json 檔')
    ap.add_argument('--keep-decrypted', action='store_true',
                    help='順便輸出解密後的 .xls 到旁邊')
    args = ap.parse_args()

    print(f'→ 讀取 {args.input}')
    data = decrypt_xls(args.input)

    if args.keep_decrypted:
        out_xls = args.output.replace('.json', '.decrypted.xls')
        with open(out_xls, 'wb') as fp:
            fp.write(data)
        print(f'→ 已存解密版 {out_xls}')

    wb = xlrd.open_workbook(file_contents=data, on_demand=True)
    print(f'→ 工作表: {wb.nsheets} 張')

    print('→ 抽取費率資料 (skl/美鴻添富 schema)')
    products, gp, corridor, uv, div = extract_rates_skl_meihong(wb)
    print(f'   GP: {len(gp)} 筆 · Corridor: {sum(len(v) for v in corridor.values())} 筆')
    print(f'   UV: {len(uv)} 筆 · DIV: {len(div)} 筆 · 商品: {len(products)} 種')

    slim = slim_pack(products, gp, corridor, uv, div)

    with open(args.output, 'w', encoding='utf-8') as fp:
        json.dump(slim, fp, ensure_ascii=False, separators=(',', ':'))
    sz = os.path.getsize(args.output)
    print(f'→ 完成 {args.output}  ({sz/1024:.0f} KB)')


if __name__ == '__main__':
    main()
