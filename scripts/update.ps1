# Atualiza a instalação local de GPI (git pull + rebuild + restart).
# Dados (BD + backups) são preservados.

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $ScriptDir '..')

if (-not (Test-Path '.git')) {
    Write-Host 'Este diretório não é um repo git — abortar.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path '.env')) {
    Write-Host '.env em falta — corre primeiro o install.ps1.' -ForegroundColor Red
    exit 1
}

$DC = $null
try {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) { $DC = 'docker compose' }
} catch { }
if (-not $DC) { $DC = 'docker-compose' }

Write-Host '▸ git pull...' -ForegroundColor Cyan
git pull --ff-only

Write-Host '▸ Rebuild + restart (mantém volumes)...' -ForegroundColor Cyan
& cmd /c "$DC -f docker-compose.prod.yml up -d --build"

Write-Host '✓ Update completo.' -ForegroundColor Green
