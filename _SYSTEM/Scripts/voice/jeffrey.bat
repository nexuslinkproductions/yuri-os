@echo off
REM jeffrey — one-word launcher for René's local Jeffrey brain (Ollama qwen3:14b, on-device, $0).
REM For cmd.exe / double-click / a desktop shortcut. Git Bash users: use the `jeffrey` alias instead.
REM   jeffrey            start the brain (Jeffrey mode, :8013) — close window to stop
REM   jeffrey test       health + one chat round-trip smoke, then exit
REM   jeffrey stop       stop a running brain
REM Delegates to jeffrey.sh via Git Bash so the logic lives in one place.
setlocal
bash "%~dp0jeffrey.sh" %*
endlocal
