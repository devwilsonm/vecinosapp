@echo off
setlocal

cd /d "%~dp0"

echo Iniciando VecinosApp en http://localhost:4000

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm.cmd install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

set "NODE_ENV=development"
set "PORT=4000"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr "LISTENING"') do (
  echo Cerrando proceso existente en puerto 4000: %%a
  taskkill /PID %%a /F >nul 2>nul
)

if defined DATABASE_URL (
  echo Usando la base PostgreSQL configurada en DATABASE_URL.
) else if not exist "instance\vecinosapp.sqlite" (
  echo Inicializando base de datos...
  call npm.cmd run init-db
  if errorlevel 1 (
    echo No se pudo inicializar la base de datos.
    pause
    exit /b 1
  )
)

call npm.cmd start

pause