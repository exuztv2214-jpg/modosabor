@echo off
setlocal
if "%SOCIAL_WORKER_KEY%"=="" (
  if not exist "%~dp0.env" (
    echo Falta SOCIAL_WORKER_KEY. Crea social-worker\.env desde .env.example.
    pause
    exit /b 1
  )
)
cd /d "%~dp0"
npm run check || exit /b 1
npm start
pause
