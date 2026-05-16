@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================
echo v84 台幣 Drew 對齊 — 開始
echo ====================================
echo.

REM 1. 備份 index.html(萬一出錯可還原)
if not exist "index.html.bak_pre_v84" (
    echo [備份] index.html.bak_pre_v84
    copy /Y index.html index.html.bak_pre_v84 >nul
)

REM 2. 跑校正腳本
echo [執行] v84_align_TWD.py
python v84_align_TWD.py
if errorlevel 1 (
    echo.
    echo ! 校正失敗,index.html 未變動。檢查上方錯誤訊息。
    pause
    exit /b 1
)

echo.
echo ====================================
echo 完成!請按任意鍵繼續...
echo.
echo 下一步:
echo   1. git add . ^&^& git commit -m "v84 TWD align" ^&^& git push
echo   2. 瀏覽器按 Ctrl+Shift+R 強制重整
echo   3. 驗證:21M TWD 3M 6yr 台幣利變非還本 應看到 33 商品
echo ====================================
pause
