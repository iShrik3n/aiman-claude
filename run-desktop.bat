@echo off
setlocal
title aiman desktop

cd /d "%~dp0"

rem Source-build runner. 4098 keeps this instance beside the installed aiman,
rem which normally owns 4097. To use another port: run-desktop.bat 5000
set "PORT=%~1"
if "%PORT%"=="" set "PORT=4098"
set "AIMAN_PORT=%PORT%"
set "HOST=127.0.0.1"

rem Let the desktop shell start its own server instead of inheriting a stale URL.
set "AIMAN_URL="

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun was not found in PATH.
  echo Install it from https://bun.sh and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing desktop dependencies...
  call bun install
  if errorlevel 1 (
    echo.
    echo bun install failed. See the output above.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Building the web UI...
  call bun run build:web
  if errorlevel 1 (
    echo.
    echo The web build failed. See the output above.
    pause
    exit /b 1
  )
)

echo Starting aiman desktop on http://127.0.0.1:%PORT%
echo Close any existing aiman desktop window first (the shell is single-instance).
echo Close the app window to stop the launcher.
echo.

call bun run desktop
if errorlevel 1 (
  echo.
  echo aiman desktop exited with an error.
  pause
)

endlocal
