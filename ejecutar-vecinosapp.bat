@echo off
setlocal

cd /d "%~dp0"

echo Iniciando VecinosApp en http://localhost:4000

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

if not exist "instance\vecinosapp.sqlite" (
  echo Inicializando base de datos...
  call npm run init-db
  if errorlevel 1 (
    echo No se pudo inicializar la base de datos.
    pause
    exit /b 1
  )
)

set PORT=4000
call npm start

pause
