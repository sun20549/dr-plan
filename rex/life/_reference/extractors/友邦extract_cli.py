"""
友邦商品抽取 CLI。整合 recalc + extract + 打包。

用法:
    # 單檔(已是 .xlsx)
    python aia_extract_cli.py UWHL-V2.xlsx -o ./output
    
    # 單檔(.xls,自動先 recalc)
    python aia_extract_cli.py UWHL-V2.xls -o ./output --recalc
    
    # 批次(資料夾或 glob)
    python aia_extract_cli.py "*.xls" -o ./output --recalc --batch
    
    # 批次並打包成 zip
    python aia_extract_cli.py "*.xls" -o ./output --recalc --batch --pack

輸出:
    ./output/<plan_short>.json     ← 每個商品 1 個
    ./output/_manifest_entries.json ← 合併用的 manifest entries
    ./output/_products_register.txt ← PRODUCTS 註冊片段
    ./output/_summary.txt          ← 處理摘要
    ./output.zip                   ← 打包(若加 --pack)
"""

import argparse
import json
import os
import sys
import glob
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict

# 把 aia_engine.py 路徑加進 sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aia_engine import AIAExtractor


# ============ type 字串對應 ============

def infer_type_str(meta: Dict) -> str:
    """從 meta 推 PRODUCTS 註冊用的 type 字串"""
    cur = meta['currency']
    cur_zh = {'USD': '美元', 'TWD': '新台幣', 'AUD': '澳幣', 'CNY': '人民幣'}.get(cur, '')
    
    is_endow_type = meta.get('product_type') == 'endowment'
    is_endow = meta.get('is_endowment', False)
    name = meta.get('product_name', '')
    has_dividend = '分紅' in name
    
    if is_endow_type:
        return f"{cur_zh}{'分紅' if has_dividend else '利率變動型'}養老保險"
    
    if has_dividend:
        body = '分紅還本終身壽險' if is_endow else '分紅終身壽險'
    else:
        body = '利率變動型還本終身壽險' if is_endow else '利率變動型終身壽險'
    
    return f'{cur_zh}{body}'


def sa_defaults(currency: str):
    if currency == 'USD':
        return 10000, 5000000
    if currency == 'AUD':
        return 10000, 3000000
    if currency == 'CNY':
        return 50000, 30000000
    return 300000, 100000000  # TWD


# ============ 處理 ============

def process_one(xlsx_path: str, output_dir: str) -> Dict:
    """處理單檔。回傳 {status, plan_short, meta, schedule_count, errors, warnings}"""
    plan_code = Path(xlsx_path).stem
    
    try:
        ext = AIAExtractor(xlsx_path, plan_code=plan_code)
    except NotImplementedError as e:
        return {
            'status': 'unsupported',
            'plan_code': plan_code,
            'plan_short': plan_code.split('-')[0],
            'errors': [str(e)],
            'warnings': [],
        }
    except Exception as e:
        return {
            'status': 'fail',
            'plan_code': plan_code,
            'plan_short': plan_code.split('-')[0],
            'errors': [f'載入失敗: {e}'],
            'warnings': [],
        }
    
    result = ext.extract()
    
    if result is None:
        return {
            'status': 'fail',
            'plan_code': plan_code,
            'plan_short': ext.plan_short,
            'errors': ext.errors,
            'warnings': ext.warnings,
        }
    
    # 寫 JSON(乾淨版)
    clean = ext.to_clean_dict(result)
    out_path = os.path.join(output_dir, f"{ext.plan_short}.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    
    return {
        'status': 'ok',
        'plan_code': plan_code,
        'plan_short': ext.plan_short,
        'out_path': out_path,
        'meta': result['meta'],
        'schedule_count': len(result['schedule']),
        'errors': ext.errors,
        'warnings': ext.warnings,
        'db_type': result['meta'].get('_db_type_inferred'),
    }


def write_manifest_and_products(results: List[Dict], output_dir: str):
    """寫 _manifest_entries.json + _products_register.txt"""
    manifest_entries = []
    products_lines = ['  // === 友邦人壽商品(由 aia_engine 自動產出) ===']
    
    for r in results:
        if r['status'] != 'ok':
            continue
        
        meta = r['meta']
        plan = r['plan_short']
        type_str = infer_type_str(meta)
        min_sa, max_sa = sa_defaults(meta['currency'])
        
        # PRODUCTS entry
        extras = []
        if meta.get('is_endowment'):
            extras.append('    is_endowment: true,')
        if meta.get('db_pattern') == 'stepped':
            extras.append("    db_pattern: 'stepped',")
            if meta.get('step_up_year'):
                extras.append(f"    step_up_year: {meta['step_up_year']},")
        if meta.get('product_type') == 'endowment':
            extras.append("    product_type: 'endowment',")
            if meta.get('protection_period'):
                extras.append(f"    protection_period: {meta['protection_period']},")
        extra_str = ('\n' + '\n'.join(extras)) if extras else ''
        
        products_lines.append(f"""  {{
    plan_code: '{plan}',
    company: '友邦人壽',
    product_name: '{meta['product_name']}',
    period: {meta['period']},
    currency: '{meta['currency']}',
    type: '{type_str}',
    declared_rate: {meta['declared_rate']},
    predicted_rate: 0,
    discount: {meta['discount']},
    discount_method: 'simple',
    engine: '{meta['engine']}',
    unit_size: 1000,
    min_sa: {min_sa},
    max_sa: {max_sa},
    min_age: 0,
    max_age: 75{extra_str}
  }},""")
        
        # manifest entry
        manifest_entries.append({
            'key': plan,
            'company': '友邦人壽',
            'plan_code': plan,
            'product_name': meta['product_name'],
            'currency': meta['currency'],
            'period': meta['period'],
            'engine': meta['engine'],
            'product_code': plan,
            'path': f'aia/{plan}.json',
        })
    
    with open(os.path.join(output_dir, '_manifest_entries.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest_entries, f, ensure_ascii=False, indent=2)
    with open(os.path.join(output_dir, '_products_register.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(products_lines))


def write_summary(results: List[Dict], output_dir: str):
    """寫 _summary.txt"""
    lines = [
        '=== 友邦商品抽取結果 ===',
        f'總共處理: {len(results)}',
        f'成功:     {sum(1 for r in results if r["status"] == "ok")}',
        f'失敗:     {sum(1 for r in results if r["status"] == "fail")}',
        f'不支援:   {sum(1 for r in results if r["status"] == "unsupported")}',
        '',
        '=== 詳細 ===',
    ]
    
    for r in results:
        if r['status'] == 'ok':
            m = r['meta']
            wn = f' ⚠️{len(r["warnings"])}' if r['warnings'] else ''
            lines.append(
                f"✅ {r['plan_short']:10s} {m['currency']:3s} {m['period']:>2d}年 "
                f"SA={m['base_sa']:>13,}  PREM={m['base_premium']:>11,.0f}  "
                f"N={r['schedule_count']:>2d}  {r.get('db_type', ''):12s}{wn}"
            )
            for w in r['warnings']:
                lines.append(f"     ⚠️ {w}")
        elif r['status'] == 'unsupported':
            lines.append(f"⏭️ {r['plan_short']:10s}  不支援: {r['errors'][0] if r['errors'] else ''}")
        else:
            lines.append(f"❌ {r['plan_short']:10s}  {r['errors']}")
    
    with open(os.path.join(output_dir, '_summary.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    return '\n'.join(lines)


# ============ Main ============

def main():
    p = argparse.ArgumentParser(
        description='友邦商品 Excel → JSON 抽取 CLI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    p.add_argument('files', nargs='+', help='.xls 或 .xlsx 檔(支援 glob)')
    p.add_argument('-o', '--output', default='./output', help='輸出目錄')
    p.add_argument('--recalc', action='store_true',
                   help='輸入是 .xls 時先用 LibreOffice 重算')
    p.add_argument('--recalc-dir', default='./xlsx',
                   help='--recalc 中介 .xlsx 暫存目錄')
    p.add_argument('--batch', action='store_true',
                   help='批次模式(不單檔停下確認)')
    p.add_argument('--pack', action='store_true',
                   help='打包成 zip(用 output 目錄當名)')
    p.add_argument('-q', '--quiet', action='store_true')
    args = p.parse_args()
    
    # 展開 glob
    files = []
    for pat in args.files:
        if any(c in pat for c in '*?['):
            files.extend(glob.glob(pat))
        else:
            files.append(pat)
    files = sorted(set(files))
    
    if not files:
        print("沒有找到任何輸入檔", file=sys.stderr)
        sys.exit(1)
    
    os.makedirs(args.output, exist_ok=True)
    
    # 預處理:.xls → .xlsx
    if args.recalc or any(f.lower().endswith('.xls') for f in files):
        from aia_recalc import recalc_batch
        xls_files = [f for f in files if f.lower().endswith('.xls')]
        xlsx_files = [f for f in files if f.lower().endswith('.xlsx')]
        
        if xls_files:
            if not args.quiet:
                print(f"預處理 {len(xls_files)} 個 .xls...")
            recalced = recalc_batch(xls_files, args.recalc_dir, verbose=not args.quiet)
            xlsx_files.extend(recalced)
        
        files = xlsx_files
    
    # 處理每個檔
    if not args.quiet:
        print(f"\n抽取 {len(files)} 個 .xlsx...")
    
    results = []
    for i, xf in enumerate(files, 1):
        plan = Path(xf).stem
        if not args.quiet:
            print(f"  [{i:2d}/{len(files)}] {plan}", end=' ')
        
        r = process_one(xf, args.output)
        results.append(r)
        
        if not args.quiet:
            if r['status'] == 'ok':
                m = r['meta']
                wn = f' ⚠️{len(r["warnings"])}' if r['warnings'] else ''
                print(f"✅ {m['currency']} {m['period']}年 N={r['schedule_count']}{wn}")
            elif r['status'] == 'unsupported':
                print(f"⏭️ 不支援")
            else:
                print(f"❌ {r['errors'][0] if r['errors'] else 'fail'}")
    
    # 寫 manifest + PRODUCTS + summary
    write_manifest_and_products(results, args.output)
    summary = write_summary(results, args.output)
    
    if not args.quiet:
        print('\n' + '=' * 60)
        print(summary)
    
    # 打包 zip
    if args.pack:
        zip_name = os.path.basename(args.output.rstrip('/')) + '.zip'
        zip_path = os.path.join(os.path.dirname(args.output) or '.', zip_name)
        # 先做 base 目錄
        out_dir_abs = os.path.abspath(args.output)
        parent = os.path.dirname(out_dir_abs)
        base = os.path.basename(out_dir_abs)
        cwd = os.getcwd()
        os.chdir(parent)
        try:
            subprocess.run(['zip', '-r', zip_name, base],
                           check=True, capture_output=True)
        finally:
            os.chdir(cwd)
        print(f"\n打包: {os.path.join(parent, zip_name)}")
    
    # exit code
    n_fail = sum(1 for r in results if r['status'] == 'fail')
    return 0 if n_fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
