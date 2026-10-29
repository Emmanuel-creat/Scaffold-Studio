@echo off
rem Lance Scaffold Studio en local (necessite Node.js 18 ou plus)
cd /d "%~dp0"
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
call npm run dev -- --open
