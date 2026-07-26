@echo off
chcp 65001 > nul
title Dayı Katık Yerel Sunucu (Port: 12000)
color 02

echo ===================================================
echo           DAYI KATIK TANTUNİ VE DÖNER
echo         Yerel HTTP Sunucusu Başlatılıyor...
echo ===================================================
echo.
echo  Port: 12000
echo  Çalışma Dizini: C:\Users\hasan_y4hfwna\Desktop\Dayı Katık Ana Dosya
echo.
echo  Tarayıcınız otomatik olarak açılacaktır.
echo  Sunucuyu kapatmak için bu pencereyi kapatabilirsiniz.
echo.
echo ===================================================

:: Start browser after a short delay
start "" http://localhost:12000

:: Start python web server
cd /d "C:\Users\hasan_y4hfwna\Desktop\Dayı Katık Ana Dosya"
python server.py
