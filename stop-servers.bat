@echo off
REM Frees ports 8000 and 5173 by stopping whatever is listening on them.
REM Leaves the database alone - use stop-all.bat for that.
for %%P in (8000 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    echo Stopping PID %%A on port %%P
    taskkill /pid %%A /f >nul 2>&1
  )
)
echo Ports 8000 and 5173 are free.
