@echo off
REM Stops the BusFlow dev database. Use stop-servers.bat for the app servers.
setlocal
set "PGBIN="
for /d %%V in ("C:\Program Files\PostgreSQL\*") do (
  if exist "%%V\bin\pg_ctl.exe" set "PGBIN=%%V\bin"
)
"%PGBIN%\pg_ctl" -D "%USERPROFILE%\.busflow-pg" -m fast stop
endlocal
