"""
友邦 .xls → .xlsx 預處理 + 公式重算。

友邦 .xls 檔的公式依賴 MID/DATEVALUE 對民國年字串解析,
LibreOffice 重算後仍多半 #VALUE!,但 FACTOR/PREM 表的純數字可正常讀取。
本工具就是為了把 .xls 轉成 openpyxl 能讀的 .xlsx。

CLI 用法:
    python aia_recalc.py file1.xls file2.xls ...
    python aia_recalc.py *.xls -o /output/dir

程式呼叫:
    from aia_recalc import recalc_batch
    recalc_batch(['a.xls', 'b.xls'], output_dir='./xlsx')
"""

import subprocess
import time
import sys
import os
import re
import glob
from pathlib import Path
from typing import List, Optional


def _start_listener(port: int = 2202):
    """啟動 LibreOffice headless listener,回傳 process"""
    proc = subprocess.Popen([
        'soffice', '--headless',
        f'--accept=socket,host=localhost,port={port};urp;',
        '--norestore', '--nologo', '--nodefault'
    ])
    time.sleep(6)  # 等 listener 啟動
    return proc


def _connect_uno(port: int = 2202):
    """連接 UNO bridge,回傳 desktop"""
    sys.path.append('/usr/lib/python3/dist-packages')
    import uno
    from com.sun.star.beans import PropertyValue  # noqa
    
    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_ctx
    )
    ctx = resolver.resolve(
        f"uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext"
    )
    smgr = ctx.ServiceManager
    desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
    return desktop


def _make_property(name: str, value):
    sys.path.append('/usr/lib/python3/dist-packages')
    from com.sun.star.beans import PropertyValue
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def _extract_plan_code(filename: str) -> str:
    """從檔名抽 plan_code(例如 _UWHL-V2_ → UWHL-V2)"""
    m = re.search(r'_([A-Z][A-Z0-9]+(?:-V\d+)?)_', filename)
    return m.group(1) if m else Path(filename).stem


def recalc_one(xls_path: str, output_dir: str, desktop, hidden=True) -> Optional[str]:
    """重算單檔。回傳輸出 .xlsx 路徑或 None。"""
    xls_path = os.path.abspath(xls_path)
    plan_code = _extract_plan_code(os.path.basename(xls_path))
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{plan_code}.xlsx")
    
    p_hidden = _make_property("Hidden", hidden)
    p_macro = _make_property("MacroExecutionMode", 4)
    
    try:
        doc = desktop.loadComponentFromURL(
            f"file://{xls_path}", "_blank", 0, (p_hidden, p_macro)
        )
        doc.calculateAll()
        sp = _make_property("FilterName", "Calc Office Open XML")
        doc.storeToURL(f"file://{out_path}", (sp,))
        doc.close(True)
        return out_path
    except Exception as e:
        print(f"  ❌ {plan_code}: {e}", file=sys.stderr)
        return None


def recalc_batch(xls_files: List[str], output_dir: str = './xlsx',
                 port: int = 2202, verbose: bool = True) -> List[str]:
    """
    批次重算多檔。回傳成功產出的 .xlsx 路徑清單。
    
    每次只啟動一個 LibreOffice listener,處理完所有檔再關閉。
    """
    if not xls_files:
        return []
    
    if verbose:
        print(f"啟動 LibreOffice listener (port={port})...")
    listener = _start_listener(port)
    
    outputs = []
    try:
        desktop = _connect_uno(port)
        for i, xf in enumerate(xls_files, 1):
            plan_code = _extract_plan_code(os.path.basename(xf))
            if verbose:
                print(f"  [{i:2d}/{len(xls_files)}] {plan_code}", end=' ')
            
            out = recalc_one(xf, output_dir, desktop)
            if out:
                outputs.append(out)
                if verbose:
                    print('✅')
            else:
                if verbose:
                    print('❌')
    finally:
        listener.terminate()
        try:
            listener.wait(timeout=15)
        except subprocess.TimeoutExpired:
            listener.kill()
    
    return outputs


def main():
    import argparse
    p = argparse.ArgumentParser(
        description='友邦 .xls 批次轉 .xlsx + 公式重算',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('files', nargs='+', help='.xls 檔(支援 glob)')
    p.add_argument('-o', '--output', default='./xlsx', help='輸出目錄')
    p.add_argument('--port', type=int, default=2202, help='UNO listener port')
    p.add_argument('-q', '--quiet', action='store_true')
    args = p.parse_args()
    
    # 展開 glob
    files = []
    for pat in args.files:
        if '*' in pat or '?' in pat:
            files.extend(glob.glob(pat))
        else:
            files.append(pat)
    files = sorted(set(files))
    
    if not files:
        print("沒有找到任何 .xls 檔", file=sys.stderr)
        sys.exit(1)
    
    outputs = recalc_batch(files, args.output, args.port, verbose=not args.quiet)
    
    print(f"\n成功 {len(outputs)}/{len(files)},輸出在 {args.output}")
    return 0 if len(outputs) == len(files) else 1


if __name__ == '__main__':
    sys.exit(main())
