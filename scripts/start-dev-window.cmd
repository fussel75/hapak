@echo off
cd /d "%~dp0\.."
echo [%date% %time%] Starting FriStD-Bau dev server... > dev-window.log
call "%~dp0start-dev.cmd" >> dev-window.log 2>&1
echo [%date% %time%] Dev server exited with code %ERRORLEVEL%. >> dev-window.log
echo.
echo Dev server exited with code %ERRORLEVEL%.
echo Log: %cd%\dev-window.log
pause
