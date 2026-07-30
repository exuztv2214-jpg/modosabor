@echo off
setlocal
cd /d "%~dp0"
title Modo Sabor - WhatsApp Copiloto

if not exist "agente-whatsapp\puente-web\node_modules" (
  echo Instalando dependencias del puente WhatsApp...
  npm run whatsapp:bridge:install
  if errorlevel 1 (
    echo.
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

start "" "http://localhost:3035"
npm run whatsapp:bridge

echo.
echo El puente se detuvo.
pause
