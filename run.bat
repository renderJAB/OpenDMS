@echo off
setlocal enabledelayedexpansion

:: 1. Always switch to this script's directory
cd /d "%~dp0"
title OpenDMS Simulation Server (Port 3000)

echo ========================================================
echo   OpenDMS - Dynamic Motion Synthesis Studio
echo ========================================================
echo.

:: 2. Ensure Node.js is accessible in PATH
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  if exist "%USERPROFILE%\AppData\Roaming\fnm\node-versions\v24.22.0\installation\node.exe" (
    set "PATH=%USERPROFILE%\AppData\Roaming\fnm\node-versions\v24.22.0\installation;%PATH%"
  ) else if exist "%USERPROFILE%\AppData\Roaming\fnm\current\node.exe" (
    set "PATH=%USERPROFILE%\AppData\Roaming\fnm\current;%PATH%"
  ) else if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else (
    echo [ERROR] Node.js was not found in PATH or standard installation directories.
    echo Please ensure Node.js is installed.
    echo.
    pause
    exit /b 1
  )
)

:: 3. Clear any orphaned processes occupying port 3000
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr "LISTENING" ^| findstr ":3000 "') do (
  if not "%%p"=="" (
    echo [INFO] Port 3000 is occupied by process PID %%p. Freeing port...
    taskkill /f /pid %%p >nul 2>&1
  )
)

echo [OK] Node.js detected:
node --version
echo.

:: 3.5. Auto-install dependencies if node_modules is missing (e.g. when opened on a new device via Google Drive)
if not exist "node_modules\vite\bin\vite.js" (
  echo [SETUP] First-time setup on this device: Installing dependencies ^(npm install^)...
  call npm install
  if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] npm install failed. Please check your internet connection and Node.js installation.
    pause
    exit /b 1
  )
  echo.
)

echo [STARTING] Launching Vite development server at http://localhost:3000 ...
echo [INFO] Browser will open automatically. Keep this window open while using the app!
echo.

:: 4. Launch Vite server directly and auto-open browser
node node_modules\vite\bin\vite.js --port 3000 --host --open

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Server terminated with an error (Code: %ERRORLEVEL%).
  pause
)
