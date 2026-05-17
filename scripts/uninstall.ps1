# Desinstala GPI: para containers, remove volumes (com confirmação) e apaga o diretório.

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path
Set-Location $InstallDir

$DC = $null
try {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) { $DC = 'docker compose' }
} catch { }
if (-not $DC) { $DC = 'docker-compose' }

Write-Host "Vai desinstalar GPI em: $InstallDir" -ForegroundColor Yellow
Write-Host ''

$removeVolumes = Read-Host 'Apagar TAMBÉM os dados da base de dados (volumes)? [s/N]'
$removeDir     = Read-Host "Apagar o diretório $InstallDir? [s/N]"

if (Test-Path 'docker-compose.prod.yml') {
    Write-Host '▸ A parar containers...' -ForegroundColor Cyan
    if ($removeVolumes -match '^[sSyY]') {
        & cmd /c "$DC -f docker-compose.prod.yml down -v"
        Write-Host '✓ Containers + volumes removidos' -ForegroundColor Green
    } else {
        & cmd /c "$DC -f docker-compose.prod.yml down"
        Write-Host '✓ Containers parados (volumes preservados)' -ForegroundColor Green
    }
}

if ($removeDir -match '^[sSyY]') {
    Set-Location ..
    Remove-Item -Recurse -Force $InstallDir
    Write-Host '✓ Diretório removido' -ForegroundColor Green
}

Write-Host 'Desinstalação completa.' -ForegroundColor Green
