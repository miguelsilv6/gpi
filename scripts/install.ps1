# GPI — instalação click-and-play em Windows.
# Pré-requisitos: Git for Windows, Docker Desktop.
#
# Uso (one-liner em PowerShell):
#   iwr -useb https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.ps1 | iex
#
# Uso (clone manual):
#   git clone https://github.com/miguelsilv6/gestao-projetos.git ; cd gestao-projetos
#   .\scripts\install.ps1

$ErrorActionPreference = 'Stop'

# ─── Configurable via env vars ────────────────────────────────────────────────
$RepoUrl     = if ($env:GPI_REPO_URL)     { $env:GPI_REPO_URL }     else { 'https://github.com/miguelsilv6/gestao-projetos.git' }
$RepoBranch  = if ($env:GPI_REPO_BRANCH)  { $env:GPI_REPO_BRANCH }  else { 'main' }
$InstallDir  = if ($env:GPI_INSTALL_DIR)  { $env:GPI_INSTALL_DIR }  else { Join-Path $env:USERPROFILE 'gpi' }
$DefaultPort = if ($env:HOST_PORT)        { [int]$env:HOST_PORT }   else { 3000 }

# ─── Helpers ──────────────────────────────────────────────────────────────────
function Write-Info  { param([string]$msg) Write-Host "▸ $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }
function Write-Title { param([string]$msg) Write-Host "`n$msg" -ForegroundColor White }

function Test-Command {
    param([string]$Name)
    [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function New-Secret {
    # 32 bytes → 64 hex chars
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
}

function New-Password {
    # 24 chars alfanuméricos seguros (sem chars que confundam Postgres)
    $chars = ([char[]](48..57) + [char[]](65..90) + [char[]](97..122))  # 0-9 A-Z a-z
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 24
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Test-PortInUse {
    param([int]$Port)
    try {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    } catch {
        return $true
    }
}

function Find-FreePort {
    param([int]$StartPort)
    for ($p = $StartPort; $p -lt ($StartPort + 10); $p++) {
        if (-not (Test-PortInUse $p)) { return $p }
    }
    return 0
}

# ─── Pre-flight ───────────────────────────────────────────────────────────────
Write-Title 'GPI — Instalação'
Write-Info "Diretório alvo: $InstallDir"

if (-not (Test-Command 'git')) {
    Write-Fail 'Git não encontrado. Instala-o: https://git-scm.com/download/win'
}

if (-not (Test-Command 'docker')) {
    Write-Fail 'Docker não encontrado. Instala o Docker Desktop: https://www.docker.com/products/docker-desktop/'
}

# Determine compose command
$DC = $null
try {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) { $DC = 'docker compose' }
} catch { }
if (-not $DC -and (Test-Command 'docker-compose')) { $DC = 'docker-compose' }
if (-not $DC) {
    Write-Fail "docker compose plugin não encontrado. Atualiza o Docker Desktop."
}
Write-Ok "Comando compose: $DC"

# Check daemon
try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'not running' }
} catch {
    Write-Warn 'Docker daemon não está a correr. A tentar iniciar o Docker Desktop...'
    $dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process -FilePath $dockerExe
        Write-Info 'A esperar até 60s pelo Docker daemon...'
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 1
            docker info *> $null
            if ($LASTEXITCODE -eq 0) { break }
            Write-Host '.' -NoNewline
        }
        Write-Host ''
        docker info *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Fail 'Docker Desktop não respondeu. Inicia-o manualmente e volta a correr este script.'
        }
    } else {
        Write-Fail 'Docker Desktop não foi encontrado em Program Files. Inicia-o manualmente.'
    }
}
Write-Ok 'Docker daemon OK'

# ─── Clone or update ──────────────────────────────────────────────────────────
$gitDir = Join-Path $InstallDir '.git'
if (Test-Path $gitDir) {
    Write-Info "Diretório já existe — a atualizar via 'git pull'..."
    Push-Location $InstallDir
    try {
        git fetch --quiet origin $RepoBranch
        git checkout --quiet $RepoBranch
        git pull --quiet --ff-only origin $RepoBranch
        Write-Ok 'Repo atualizado'
    } finally { Pop-Location }
} elseif ((Test-Path $InstallDir) -and ((Get-ChildItem $InstallDir -Force | Measure-Object).Count -gt 0)) {
    Write-Fail "$InstallDir já existe e não é um repo git. Apaga-o ou define `$env:GPI_INSTALL_DIR para outro caminho."
} else {
    Write-Info "A clonar $RepoUrl..."
    git clone --quiet --branch $RepoBranch $RepoUrl $InstallDir
    Write-Ok "Repo clonado para $InstallDir"
}

Set-Location $InstallDir

# ─── Generate .env ────────────────────────────────────────────────────────────
$envFile = Join-Path $InstallDir '.env'
if (Test-Path $envFile) {
    Write-Warn '.env já existe — a preservar configuração actual'
} else {
    Write-Info 'A gerar .env com secrets aleatórios...'
    $port = Find-FreePort -StartPort $DefaultPort
    if ($port -eq 0) {
        Write-Fail "Não foi possível encontrar um porto livre a partir de $DefaultPort."
    }
    if ($port -ne $DefaultPort) {
        Write-Warn "Porto $DefaultPort ocupado — a usar $port"
    }

    $nextauthSecret    = New-Secret
    $cronSecret        = New-Secret
    $postgresPassword  = New-Password

    @"
HOST_PORT=$port

POSTGRES_USER=gpi_user
POSTGRES_PASSWORD=$postgresPassword
POSTGRES_DB=gpi_db

NEXTAUTH_SECRET=$nextauthSecret
NEXTAUTH_URL=http://localhost:$port

SEED_PASSWORD=Admin123!

CRON_SECRET=$cronSecret

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=GPI Sistema
SMTP_FROM_EMAIL=noreply@gpi.local
"@ | Out-File -FilePath $envFile -Encoding ascii -NoNewline
    Write-Ok ".env criado em $envFile"
}

# Read HOST_PORT from .env
$hostPortLine = (Get-Content $envFile | Where-Object { $_ -match '^HOST_PORT=' } | Select-Object -First 1)
$hostPortVal = if ($hostPortLine) { ($hostPortLine -split '=', 2)[1].Trim() } else { '3000' }

# ─── Build and start ──────────────────────────────────────────────────────────
Write-Title 'A construir e arrancar (pode demorar 5-10 min no primeiro arranque)'
& cmd /c "$DC -f docker-compose.prod.yml up -d --build"
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Falha ao arrancar containers. Vê os logs com:  ' + "$DC -f docker-compose.prod.yml logs"
}

# ─── Wait for health ──────────────────────────────────────────────────────────
Write-Title 'A esperar pela aplicação...'
$healthUrl = "http://localhost:$hostPortVal/api/health"
$healthy = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 1
}
Write-Host ''
if ($healthy) {
    Write-Ok "Aplicação saudável em $healthUrl"
} else {
    Write-Warn "Health check sem resposta após 90s. Vê os logs: $DC -f docker-compose.prod.yml logs -f"
}

# ─── Open browser ─────────────────────────────────────────────────────────────
$url = "http://localhost:$hostPortVal"
if ($env:GPI_NO_OPEN -ne '1') {
    Start-Process $url
}

# ─── Summary ──────────────────────────────────────────────────────────────────
$seedLine = (Get-Content $envFile | Where-Object { $_ -match '^SEED_PASSWORD=' } | Select-Object -First 1)
$seedPwd  = if ($seedLine) { ($seedLine -split '=', 2)[1].Trim() } else { 'Admin123!' }

Write-Title '✅ GPI pronto'
Write-Host ''
Write-Host "  URL:           " -NoNewline; Write-Host $url -ForegroundColor White
Write-Host "  Login admin:   admin@gpi.pt / $seedPwd" -ForegroundColor White
Write-Host ''
Write-Host "Comandos úteis (a partir de $InstallDir):"
Write-Host "  Ver logs:      $DC -f docker-compose.prod.yml logs -f"
Write-Host "  Parar:         $DC -f docker-compose.prod.yml stop"
Write-Host "  Reiniciar:     $DC -f docker-compose.prod.yml restart"
Write-Host "  Atualizar:     .\scripts\update.ps1"
Write-Host "  Desinstalar:   .\scripts\uninstall.ps1"
Write-Host ''
