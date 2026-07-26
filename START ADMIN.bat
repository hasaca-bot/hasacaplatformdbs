@echo off
chcp 65001 > nul
title HASACA Platform - Local Development
cd /d "%~dp0"

echo ======================================================
echo    HASACA MULTI-TENANT RESTAURANT SAAS
echo    Local development launcher
echo ======================================================
echo.

:: 1) Node.js check
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on this machine.
    echo Install Node.js 22+ from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b
)

cd backend

:: 2) Install dependencies on first run
if not exist "node_modules" (
    echo [1/4] Installing dependencies ^(first run^)...
    call npm install
    echo.
) else (
    echo [1/4] Dependencies already installed.
)

:: 3) Run migrations (idempotent - safe every time)
echo [2/4] Running database migrations...
call npm run migrate
echo.

:: 4) Seed demo data (skips automatically if the demo tenant already exists)
echo [3/4] Seeding demo data ^(skips if already present^)...
call npm run seed
echo.

:: 5) Open the admin panel in the default browser, then start the server
echo [4/4] Opening browser and starting the server...
echo.
echo    Customer site : http://localhost:12999
echo    Admin panel   : http://localhost:12999/admin.html
echo    Root panel    : http://localhost:12999/root
echo    Demo tenant   : http://localhost:12999/admin.html?tenant=demo  ^(demo / demo1234^)
echo.
echo    Keep this window open. Close it to stop the server.
echo ------------------------------------------------------

start "" "http://localhost:12999/admin.html"

node server.js

pause
