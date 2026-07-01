@echo off
REM Launch the Windows/CUDA Parakeet push-to-talk lane.
REM Hold RIGHT-CTRL (VOICE_PTT_KEY to change), speak, release -> text pastes into the focused window.
REM Pass --list-devices to print microphone indices.
setlocal
set "VENV=C:\Users\rene\.venvs\parakeet-ptt\Scripts\python.exe"
"%VENV%" "%~dp0voice-ptt-win.py" %*
endlocal
