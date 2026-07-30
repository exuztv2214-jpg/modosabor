@echo off
setlocal
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\ModoSabor WhatsApp Copiloto.bat"
set "PROJECT=%~dp0"

(
  echo @echo off
  echo cd /d "%PROJECT%"
  echo call "%PROJECT%Iniciar_WhatsApp_Copiloto.bat"
) > "%TARGET%"

echo Listo. WhatsApp Copiloto se iniciara con Windows.
echo Archivo creado:
echo %TARGET%
pause
