$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = if ($env:APP_BASE_URL) { $env:APP_BASE_URL } else { "http://127.0.0.1:5000" }
$healthUrl = "$baseUrl/api/health"
$runner = Join-Path $PSScriptRoot "run-dev-server.ps1"
$logPath = if ($env:FRISTD_DEV_LOG) { $env:FRISTD_DEV_LOG } else { Join-Path $env:TEMP "fristd-dev-server.log" }
$powershellExe = (Get-Command powershell.exe -ErrorAction Stop).Source

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
Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
$runnerArgument = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$process = Start-Process `
  -FilePath $powershellExe `
  -ArgumentList $runnerArgument `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
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
  throw "FriStD-Bau ERP wurde nicht erreichbar: $baseUrl"
}

Write-Host "ok FriStD-Bau ERP gestartet: $baseUrl"
Write-Host "Prozess-ID: $($process.Id)"
