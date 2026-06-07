@echo off
echo Creation des fichiers __init__.py manquants...

REM Depuis la racine du projet (fantasy26/)
type nul > backend\app\api\__init__.py
type nul > backend\app\api\routes\__init__.py
type nul > backend\app\services\__init__.py
type nul > backend\core\__init__.py

echo.
echo Verification :
dir backend\app\api\__init__.py
dir backend\app\api\routes\__init__.py
dir backend\app\services\__init__.py
dir backend\core\__init__.py

echo.
echo Termine ! Lance maintenant : python -m app.main
pause