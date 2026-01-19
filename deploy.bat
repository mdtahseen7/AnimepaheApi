@echo off
echo ========================================
echo   AnimePahe API - Vercel Deployment
echo ========================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo.

echo [2/3] Testing locally...
echo Starting server on http://localhost:3000
echo Press Ctrl+C to stop and continue to deployment
echo.
call npm start
echo.

echo [3/3] Ready to deploy!
echo.
echo Run this command to deploy:
echo   vercel
echo.
echo Or for production:
echo   vercel --prod
echo.
pause
