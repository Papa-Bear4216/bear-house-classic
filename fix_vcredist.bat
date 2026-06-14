@echo off
setlocal

echo ============================================================
echo  Microsoft Visual C++ 2022 Redistributable - Repair/Install
echo ============================================================
echo.

set "DLDIR=%TEMP%\vc_redist_install"
if not exist "%DLDIR%" mkdir "%DLDIR%"

echo [1/4] Downloading x86 redistributable...
curl -L --fail --silent --show-error -o "%DLDIR%\vc_redist.x86.exe" https://aka.ms/vs/17/release/vc_redist.x86.exe
if errorlevel 1 (
    echo  ERROR: Download failed. Check your internet connection.
    pause
    exit /b 1
)

echo [2/4] Downloading x64 redistributable...
curl -L --fail --silent --show-error -o "%DLDIR%\vc_redist.x64.exe" https://aka.ms/vs/17/release/vc_redist.x64.exe
if errorlevel 1 (
    echo  ERROR: Download failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [3/4] Installing x86 version...
echo   - A UAC prompt will appear. Click YES.
echo   - Installer will run quietly; please wait...
"%DLDIR%\vc_redist.x86.exe" /install /passive /norestart
set X86_RC=%ERRORLEVEL%

echo.
echo [4/4] Installing x64 version...
echo   - Another UAC prompt will appear. Click YES.
"%DLDIR%\vc_redist.x64.exe" /install /passive /norestart
set X64_RC=%ERRORLEVEL%

echo.
echo ============================================================
echo  Results:
echo    x86 install exit code: %X86_RC%
echo    x64 install exit code: %X64_RC%
echo.
echo  Exit codes meaning:
echo    0    = Success
echo    1638 = Newer version already installed (OK)
echo    3010 = Success, reboot required
echo    Anything else = something went wrong
echo ============================================================
echo.

if "%X86_RC%"=="3010" goto reboot
if "%X64_RC%"=="3010" goto reboot

echo Done. You can close this window.
pause
exit /b 0

:reboot
echo *** A REBOOT IS REQUIRED to complete installation. ***
pause
exit /b 0
