$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = if ($env:APP_BASE_URL) { $env:APP_BASE_URL } else { "http://127.0.0.1:5000" }
$healthUrl = "$baseUrl/api/health"
$runner = Join-Path $PSScriptRoot "run-dev-server.ps1"
$logPath = Join-Path $env:TEMP "fristd-dev-server.log"

function Test-Health {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match '"ok"\s*:\s*true'
  } catch {
    return $false
  }
}

if (Test-Health) {
  Write-Host "ok FriStD-Bau ERP laeuft bereits: $baseUrl"
  exit 0
}

if (-not (Test-Path $runner)) {
  throw "Startscript nicht gefunden: $runner"
}

Write-Host "Starte FriStD-Bau ERP im Hintergrund..."
$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runner) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -PassThru

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Health) {
    $ready = $true
    break
  }
  if ($process.HasExited) {
    break
  }
}

if (-not $ready) {
  if (Test-Path $logPath) {
    Write-Host "Letzte Server-Logzeilen:"
    Get-Content -LiteralPath $logPath -Tail 80
  }
  throw "FriStD-Bau ERP wurde nicht erreichbar: $baseUrl"
}

Write-Host "ok FriStD-Bau ERP gestartet: $baseUrl"
Write-Host "Prozess-ID: $($process.Id)"
