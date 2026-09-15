@echo off
REM ===========================================================================
REM  BusFlow - start everything for local testing.
REM  Safe to run repeatedly: each piece is skipped if already running.
REM
REM  Uses a private PostgreSQL cluster in your user profile on port 5433, so it
REM  needs no administrator rights and does not touch a system PostgreSQL
REM  service you may already run on 5432.
REM ===========================================================================
setlocal

REM --- locate PostgreSQL binaries (newest installed major version wins) ------
set "PGBIN="
for /d %%V in ("C:\Program Files\PostgreSQL\*") do (
  if exist "%%V\bin\pg_ctl.exe" set "PGBIN=%%V\bin"
)
if not defined PGBIN (
  echo ERROR: Could not find PostgreSQL under "C:\Program Files\PostgreSQL".
  echo Install PostgreSQL, or edit PGBIN in this script.
  pause
  exit /b 1
)

set "PGDATA=%USERPROFILE%\.busflow-pg"
REM Keep the server log OUT of the data directory. PostgreSQL walks that
REM directory during crash recovery, and a log file held open inside it can
REM stall startup with a sharing violation on Windows.
set "PGLOG=%USERPROFILE%\.busflow-pg-logs"

echo [1/3] Database...
if not exist "%PGDATA%\PG_VERSION" (
  echo     first run - creating cluster in %PGDATA%
  "%PGBIN%\initdb" -D "%PGDATA%" -U postgres --auth=trust --encoding=UTF8 --locale=C >nul
  >>"%PGDATA%\postgresql.conf" echo.
  >>"%PGDATA%\postgresql.conf" echo # BusFlow local dev cluster
  >>"%PGDATA%\postgresql.conf" echo port = 5433
  >>"%PGDATA%\postgresql.conf" echo listen_addresses = '127.0.0.1'
)
if not exist "%PGLOG%" mkdir "%PGLOG%"
"%PGBIN%\pg_ctl" -D "%PGDATA%" status >nul 2>&1
if errorlevel 1 (
  start "" /b "%PGBIN%\pg_ctl" -D "%PGDATA%" -l "%PGLOG%\server.log" start
  timeout /t 3 /nobreak >nul
  echo     started on port 5433
) else (
  echo     already running on port 5433
)

REM --- create role + database on first run ----------------------------------
"%PGBIN%\psql" -h 127.0.0.1 -p 5433 -U postgres -d busflow -c "SELECT 1" >nul 2>&1
if errorlevel 1 (
  echo     creating role and database
  "%PGBIN%\psql" -h 127.0.0.1 -p 5433 -U postgres -f "%~dp0database\local-setup.sql" >nul 2>&1
  pushd "%~dp0backend"
  call npm.cmd run db:migrate
  call npm.cmd run seed
  popd
)

echo [2/3] Backend on http://localhost:8000
netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if not errorlevel 1 (
  echo     SKIPPED - port 8000 already in use. Run stop-servers.bat first.
) else (
  start "BusFlow backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
)

echo [3/3] Frontend on http://localhost:5173
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo     SKIPPED - port 5173 already in use. Run stop-servers.bat first.
) else (
  start "BusFlow frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
)

echo.
echo Open http://localhost:5173
endlocal
