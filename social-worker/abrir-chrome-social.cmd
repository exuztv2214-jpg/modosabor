@echo off
setlocal
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo No se encontro Google Chrome. Instala Chrome o ajusta este acceso.
  pause
  exit /b 1
)
start "Modo Sabor Social" "%CHROME%" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\ModoSaborSocialChrome" https://www.facebook.com/
