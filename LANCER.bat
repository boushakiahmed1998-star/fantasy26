@echo off
title Fantasy Boulzazen WC 2026
color 0A

echo.
echo  ============================================
echo   🏆  FANTASY BOULZAZEN - Coupe du Monde 2026
echo  ============================================
echo.

REM ── Chemins ───────────────────────────────────
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend
set VENV=%BACKEND%\venv311\Scripts\activate.bat

REM ── Vérification venv ─────────────────────────
if not exist "%VENV%" (
    echo [ERREUR] venv311 introuvable dans backend\
    echo Crée-le avec : py -3.11 -m venv venv311
    pause
    exit /b 1
)

REM ── Vérification node_modules ─────────────────
if not exist "%FRONTEND%\node_modules" (
    echo [INFO] Installation des packages npm...
    cd "%FRONTEND%"
    call npm install
)

echo [1/2] Lancement du Backend FastAPI ^(hot-reload actif^)...
start "Backend - FastAPI" cmd /k "cd /d %BACKEND% && call venv311\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

REM Petite pause pour laisser le backend démarrer
timeout /t 3 /nobreak >nul

echo [2/2] Lancement du Frontend Vite ^(hot-reload actif^)...
start "Frontend - Vite" cmd /k "cd /d %FRONTEND% && npm run dev"

echo.
echo  ✅ Application démarrée !
echo  ─────────────────────────────────────────────
echo  🌐 Frontend : http://localhost:5173
echo  ⚙️  Backend  : http://localhost:8000
echo  📖 API Docs : http://localhost:8000/api/v1/docs
echo  ─────────────────────────────────────────────
echo.
echo  Ferme les 2 fenêtres CMD pour tout arrêter.
echo.

REM Ouvre le navigateur automatiquement
timeout /t 2 /nobreak >nul
start http://localhost:5173

pause