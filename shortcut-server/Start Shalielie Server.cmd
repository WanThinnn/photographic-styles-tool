@echo off
rem Double-click to start the Shalielie Shortcut Server. Close the window to stop it.
setlocal
title Shalielie Shortcut Server
cd /d "%~dp0.."

where uv >nul 2>nul
if not errorlevel 1 (
    uv run --quiet --group server python shortcut-server\server.py %*
    goto :end
)
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" shortcut-server\server.py %*
    goto :end
)
where py >nul 2>nul
if not errorlevel 1 (
    py -3 shortcut-server\server.py %*
    goto :end
)
where python >nul 2>nul
if not errorlevel 1 (
    python shortcut-server\server.py %*
    goto :end
)
echo Python was not found. Install uv (https://docs.astral.sh/uv/) or Python 3.12+ and try again.

:end
if errorlevel 1 pause
