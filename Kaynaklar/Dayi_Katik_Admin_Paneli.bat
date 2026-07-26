@echo off
chcp 65001 > nul
title Dayı Katık Yönetici Paneli
color 04

echo ===================================================
echo           DAYI KATIK TANTUNİ VE DÖNER
echo         Yönetici Paneli Başlatılıyor...
echo ===================================================
echo.

:: Check if server is already running on port 12000
netstat -ano | findstr LISTENING | findstr :12000 >nul
if %errorlevel% equ 0 (
    echo [OK] Yerel sunucu aktif durumda.
    echo Tarayıcı açılıyor...
    start "" "http://localhost:12000/admin.html"
) else (
    echo [INFO] Yerel sunucu aktif değil, başlatılıyor...
    start /min "Dayı Katık Sunucusu" cmd /c "cd /d "C:\Users\hasan_y4hfwna\Desktop\Dayı Katık Ana Dosya" && python server.py"
    echo Sunucunun hazır olması bekleniyor...
    ping 127.0.0.1 -n 3 >nul
    start "" "http://localhost:12000/admin.html"
)

echo.
echo İşlem tamamlandı.
echo.
echo ===================================================
ping 127.0.0.1 -n 2 >nul
exit
