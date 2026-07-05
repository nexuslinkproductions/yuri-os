# Jeffrey auto-reindex — register a Windows Scheduled Task that keeps the local file second-brain fresh.
# Runs jeffrey-reindex.bat AT LOGON and every 4 hours (incremental: fast, and the CGS Drive root stays
# names-only so nothing downloads). Runs in René's session (so the G: Drive mount is available).
# Usage:  powershell -ExecutionPolicy Bypass -File _SYSTEM/Scripts/jeffrey-reindex-schedule.ps1
#         powershell -ExecutionPolicy Bypass -File _SYSTEM/Scripts/jeffrey-reindex-schedule.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$taskName = 'Jeffrey File Reindex'
$bat = Join-Path $PSScriptRoot 'jeffrey-reindex.bat'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$taskName'."
    return
}

if (-not (Test-Path $bat)) { throw "missing $bat" }

$action = New-ScheduledTaskAction -Execute $bat

# Trigger 1: at logon (fresh index every time René starts work).
$tLogon = New-ScheduledTaskTrigger -AtLogOn

# Trigger 2: every 4 hours, indefinitely (finite large duration avoids the PS 5.1 MaxValue quirk).
$tEvery = New-ScheduledTaskTrigger -Once -At (Get-Date)
$tEvery.Repetition.Interval = 'PT4H'
$tEvery.Repetition.Duration  = 'P3650D'

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($tLogon, $tEvery) `
    -Settings $settings -Description 'Incremental refresh of Jeffrey''s local file index (CGS second brain).' -Force | Out-Null

Write-Host "Registered scheduled task '$taskName' — at logon + every 4 hours."
Write-Host "Log: _SYSTEM/state/jeffrey/reindex.log   ·   Run now: schtasks /run /tn `"$taskName`""
