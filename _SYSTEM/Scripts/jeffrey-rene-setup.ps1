# Jeffrey + René local stack setup (Windows, RTX 5060 Ti 16GB)
# Usage: powershell -ExecutionPolicy Bypass -File _SYSTEM/Scripts/jeffrey-rene-setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Jeffrey setup for René (5060 Ti 16GB) ===" -ForegroundColor Cyan

# Env recommendations
$env:YURI_LOCAL_MAX_CONCURRENCY = "1"
if (-not $env:OLLAMA_FLASH_ATTENTION) { $env:OLLAMA_FLASH_ATTENTION = "1" }

function Test-Ollama {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Ollama)) {
    Write-Host "Ollama not reachable at http://localhost:11434" -ForegroundColor Yellow
    Write-Host "Install from https://ollama.com then run: ollama serve"
    exit 1
}

$models = @(
    "qwen3-vl:8b-thinking",
    "qwen3:14b",
    "gemma4:12b",
    "xentriom/gemma-4-12B-coder-fable5-composer2.5-v1:Q4_K_M"
)

foreach ($m in $models) {
    Write-Host "Pulling $m ..." -ForegroundColor Green
    ollama pull $m
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Pull failed for $m — continue with others"
    }
}

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path (Join-Path $repoRoot "_SYSTEM/Scripts/fix-main-module-guard.mjs")) {
    Push-Location $repoRoot
    Write-Host "YURI win32 guard check..." -ForegroundColor Green
    node _SYSTEM/Scripts/fix-main-module-guard.mjs --check
    Pop-Location
}

Write-Host ""
Write-Host "=== Clicky Windows ===" -ForegroundColor Cyan
Write-Host @"
1. git clone https://github.com/Bitshank-2338/clicky-windows.git
2. Copy .env.example -> .env
3. Set:
   OLLAMA_VISION_MODEL=qwen3-vl:8b-thinking
   OLLAMA_TEXT_MODEL=qwen3:14b
4. pip install -r requirements.txt && python main.py
"@

Write-Host ""
Write-Host "Guide: 02_RESOURCES/GUIDES/rene-jeffrey-local-stack.md" -ForegroundColor Cyan
Write-Host "Done." -ForegroundColor Green
