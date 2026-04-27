<#
.SYNOPSIS
  End-to-end verification: API up (Docker or existing) + full Karate suite (26/26).

.PARAMETER SkipDocker
  Do not start Docker; assume something is already listening on http://localhost:3000.

.PARAMETER KeepDocker
  Leave containers running after the script finishes (default: tear down if we started Docker).

.EXAMPLE
  .\scripts\verify.ps1
  .\scripts\verify.ps1 -SkipDocker
#>
param(
    [switch]$SkipDocker,
    [switch]$KeepDocker
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Test-Health {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 3
        return ($r.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

$startedDocker = $false
if (-not $SkipDocker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker CLI not found. Install Docker Desktop or run with -SkipDocker while 'npm start' is running in server/."
    }
    Write-Host "[verify] docker compose up -d --build"
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $startedDocker = $true

    $deadline = (Get-Date).AddMinutes(3)
    Write-Host "[verify] waiting for http://localhost:3000/health ..."
    while (-not (Test-Health)) {
        if ((Get-Date) -gt $deadline) {
            Write-Error "Health check timed out after 3 minutes."
        }
        Start-Sleep -Seconds 1
    }
    Write-Host "[verify] API is healthy."
}
else {
    if (-not (Test-Health)) {
        Write-Error "SkipDocker was set but http://localhost:3000/health did not respond. Start the Node service first (cd server; npm start)."
    }
}

Write-Host "[verify] mvnw test (full Karate default profile)"
& "$RepoRoot\mvnw.cmd" test
$mvnExit = $LASTEXITCODE

if ($startedDocker -and -not $KeepDocker) {
    Write-Host "[verify] docker compose down"
    docker compose down
}

if ($mvnExit -ne 0) {
    Write-Host "[verify] FAILED (mvn exit $mvnExit)"
    exit $mvnExit
}

Write-Host "[verify] OK — Karate suite finished with exit code 0."
exit 0
