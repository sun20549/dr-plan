# 地雷 · index.html 重大損壞復原方法

## 何時用

當 `life/index.html` 被截斷到只剩 CSS 殘片(< 30 KB)、JS 全失、看不到 `</script>` `</body>` `</html>`。

## 復原來源

Claude 工作階段 jsonl 紀錄:
```
/sessions/{session-id}/mnt/.claude/projects/{project-id}/*.jsonl
```

裡面記錄了每一次 Write / Edit 工具呼叫的完整 `content` / `old_string` / `new_string`。

## 復原腳本

```python
import json
ops = []
with open(JSONL_PATH) as f:
    for line in f:
        obj = json.loads(line)
        for c in (obj.get('message') or {}).get('content', []):
            if not isinstance(c, dict) or c.get('type') != 'tool_use': continue
            name = c.get('name'); inp = c.get('input', {})
            fp = inp.get('file_path', '')
            if 'life/index.html' not in fp.replace('\\\\','/'): continue
            if name == 'Write':
                ops.append(('W', inp.get('content', '')))
            elif name == 'Edit':
                ops.append(('E', inp.get('old_string',''), inp.get('new_string',''),
                            bool(inp.get('replace_all'))))

# 從最後一次 Write 開始,套用後續所有 Edit
last_w = max(i for i,o in enumerate(ops) if o[0]=='W')
current = ops[last_w][1]
for op in ops[last_w+1:]:
    if op[0] == 'W':
        current = op[1]
    elif op[0] == 'E':
        if op[1] in current:
            current = (current.replace(op[1], op[2])
                       if op[3] else current.replace(op[1], op[2], 1))

# 驗證後寫回
assert '</body>' in current and '</html>' in current
open(DEST, 'w', encoding='utf-8').write(current)
```

## 已驗證的復原案例

2026-05-17:從 24 KB 截斷狀態,套用最後一次 Write + 146 Edit,
還原成 134 KB 完整版,v002-v034 所有功能保留。

備份永遠留一份在 `/sessions/.../mnt/outputs/index_final.html`,
每次大改後同步覆蓋這份備份。
