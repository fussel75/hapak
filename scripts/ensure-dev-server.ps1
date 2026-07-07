$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = if ($env:APP_BASE_URL) { $env:APP_BASE_URL } else { "http://127.0.0.1:5000" }
$healthUrl = "$baseUrl/api/health"
$logPath = if ($env:FRISTD_DEV_LOG) { $env:FRISTD_DEV_LOG } else { Join-Path $env:TEMP "fristd-dev-server.log" }
$errorLogPath = [System.IO.Path]::ChangeExtension($logPath, ".err.log")

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

Write-Host "Starte FriStD-Bau ERP im Hintergrund..."
Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $errorLogPath -Force -ErrorAction SilentlyContinue

$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }
$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://postgres:postgres@localhost:5432/fristd_bau" }
$env:SESSION_SECRET = if ($env:SESSION_SECRET) { $env:SESSION_SECRET } else { "local-dev-session-secret" }
$env:HOST = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
$env:PORT = if ($env:PORT) { $env:PORT } else { "5000" }

$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  $node = (Get-Command node -ErrorAction Stop).Source
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting FriStD dev server with $node on http://$($env:HOST):$($env:PORT)" | Set-Content -LiteralPath $logPath -Encoding utf8
$process = Start-Process `
  -FilePath $node `
  -ArgumentList @("node_modules/tsx/dist/cli.mjs", "server/index.ts") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errorLogPath `
  -PassThru

$ready = $false
for ($i = 0; $i -lt 90; $i++) {
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
  if ($process.HasExited) {
    Write-Host "Serverprozess wurde beendet. Exitcode: $($process.ExitCode)"
  } else {
    Write-Host "Serverprozess laeuft, Healthcheck antwortet aber nicht. Prozess-ID: $($process.Id)"
  }
  if (Test-Path $logPath) {
    Write-Host "Letzte Server-Logzeilen:"
    Get-Content -LiteralPath $logPath -Encoding utf8 -Tail 120
  }
  if (Test-Path $errorLogPath) {
    Write-Host "Letzte Server-Fehlerzeilen:"
    Get-Content -LiteralPath $errorLogPath -Encoding utf8 -Tail 120
  }
  throw "FriStD-Bau ERP wurde nicht erreichbar: $baseUrl"
}

Write-Host "ok FriStD-Bau ERP gestartet: $baseUrl"
Write-Host "Prozess-ID: $($process.Id)"
