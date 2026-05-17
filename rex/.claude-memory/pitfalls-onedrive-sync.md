# 地雷 · OneDrive 同步把 Edit 截斷

## 症狀

`Edit` 工具回報成功,但檔案最後幾百 bytes(包括 `</body></html>`)消失。
查 bash `stat` 跟 Python `len()` 顯示不同 size(同步衝突)。

## 為什麼

`life/index.html` 在 OneDrive 同步資料夾內。Edit 工具寫入後,OneDrive 可能用「上次同步的版本」蓋過,導致末段被截掉。

## 解法

**所有大檔案 (>50KB) 改動都用 Python 直寫**,不要用 Edit 工具多次小改:

```python
src = '/sessions/.../mnt/outputs/index_final.html'   # 已知好的備份
dst = '/sessions/.../mnt/rex/life/index.html'
current = open(src, encoding='utf-8').read()
# 套用 patch...
current = current.replace(old, new, 1)
# 一次性寫
open(dst, 'w', encoding='utf-8').write(current)
open(src, 'w', encoding='utf-8').write(current)   # 同步更新 backup
```

**驗證步驟必跑:**
```python
data = open(dst, encoding='utf-8').read()
assert '</body>' in data and '</html>' in data and 'init();' in data
```

## 警示信號

每次改 index.html 後一定要 grep 確認:
```
</script>=2, </body>=1, </html>=1
```
這三個值任一缺失 → 立刻從 `outputs/index_final.html` 復原。
