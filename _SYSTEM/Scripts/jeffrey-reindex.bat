@echo off
REM Jeffrey file-index incremental refresh — run by Windows Task Scheduler to keep the second brain
REM fresh as René adds designs. Incremental (only changed files by mtime): fast, cheap, and the CGS
REM Drive root stays names-only so nothing is downloaded. Registered by jeffrey-reindex-schedule.ps1.
REM Manual run: jeffrey-reindex.bat   (or `jeffrey reindex` in Git Bash)
setlocal
cd /d "%~dp0..\..\"
if not exist "_SYSTEM\state\jeffrey" mkdir "_SYSTEM\state\jeffrey"
echo [%DATE% %TIME%] reindex start >> "_SYSTEM\state\jeffrey\reindex.log"
node "_SYSTEM\Scripts\jeffrey-file-index.mjs" >> "_SYSTEM\state\jeffrey\reindex.log" 2>&1
echo [%DATE% %TIME%] reindex done (exit %ERRORLEVEL%) >> "_SYSTEM\state\jeffrey\reindex.log"
endlocal
