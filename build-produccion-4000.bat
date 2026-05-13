@echo off
setlocal

cd /d "%~dp0"

echo Generando build de produccion de VecinosApp...

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

call npm run build
if errorlevel 1 (
  echo No se pudo generar el build de produccion.
  pause
  exit /b 1
)

if not exist "dist\instance\vecinosapp.sqlite" (
  if exist "instance\vecinosapp.sqlite" (
    echo Copiando base de datos existente al build...
    copy "instance\vecinosapp.sqlite" "dist\instance\vecinosapp.sqlite" >nul
  )
)

set NODE_ENV=production
set PORT=4000
set DATABASE_PATH=%CD%\instance\vecinosapp.sqlite
set LOG_DATABASE_PATH=%CD%\instance\vecinosapp_logs.sqlite
if "%SESSION_SECRET%"=="" set SESSION_SECRET=vecinosapp-local-production-secret-change-me

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr "LISTENING"') do (
  echo Cerrando proceso existente en puerto 4000: %%a
  taskkill /PID %%a /F >nul 2>nul
)

echo Levantando VecinosApp en produccion: http://localhost:4000
call npm run start:prod

pause
