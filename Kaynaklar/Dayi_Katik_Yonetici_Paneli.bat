@echo off
title Dayi Katik Yonetici Paneli
color 04

echo ===================================================
echo           DAYI KATIK TANTUNI VE DONER
echo         Yonetici Paneli Baslatiliyor...
echo ===================================================
echo.

:: Check if server is already running on port 12000
netstat -ano | findstr LISTENING | findstr :12000 >nul
if %errorlevel% equ 0 (
    echo [OK] Yerel sunucu aktif durumda.
    echo Tarayici aciliyor...
    start "" "http://localhost:12000/admin.html"
) else (
    echo [INFO] Yerel sunucu aktif degil, baslatiliyor...
    start /min "Dayi Katik Sunucusu" cmd /c "cd /d "C:\Users\hasan_y4hfwna\Desktop\Dayı Katık Ana Dosya" && python server.py"
    echo Sunucunun hazir olmasi bekleniyor...
    ping 127.0.0.1 -n 3 >nul
    start "" "http://localhost:12000/admin.html"
)

echo.
echo Islem tamamlandi.
echo.
echo ===================================================
ping 127.0.0.1 -n 2 >nul
exit
