$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = if ($env:SMOKE_BASE_URL) { $env:SMOKE_BASE_URL } else { "http://127.0.0.1:5000" }
$healthUrl = "$baseUrl/api/health"

function Test-Health {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-Health) {
  Write-Host "ok vorhandener lokaler Server erreichbar: $baseUrl"
  Push-Location $projectRoot
  try {
    npm run smoke:incoming-fibu
    if ($LASTEXITCODE -ne 0) { throw "smoke:incoming-fibu fehlgeschlagen" }
    npm run smoke:local
    if ($LASTEXITCODE -ne 0) { throw "smoke:local fehlgeschlagen" }
    npm run smoke:browser
    if ($LASTEXITCODE -ne 0) { throw "smoke:browser fehlgeschlagen" }
  } finally {
    Pop-Location
  }
  exit 0
}

$job = Start-Job -ScriptBlock {
  param($root)
  Set-Location $root

  if (-not $env:NODE_ENV) {
    $env:NODE_ENV = "development"
  }
  if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fristd_bau"
  }
  if (-not $env:SESSION_SECRET) {
    $env:SESSION_SECRET = "local-dev-session-secret"
  }

  $bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $bundledNode) {
    & $bundledNode "node_modules\tsx\dist\cli.mjs" "server\index.ts"
  } else {
    node "node_modules\tsx\dist\cli.mjs" "server\index.ts"
  }
} -ArgumentList $projectRoot

try {
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Health) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Receive-Job $job -Keep
    throw "Lokaler Smoke-Server wurde nicht erreichbar: $baseUrl"
  }

  Write-Host "ok Smoke-Server gestartet: $baseUrl"
  Push-Location $projectRoot
  try {
    npm run smoke:incoming-fibu
    if ($LASTEXITCODE -ne 0) { throw "smoke:incoming-fibu fehlgeschlagen" }
    npm run smoke:local
    if ($LASTEXITCODE -ne 0) { throw "smoke:local fehlgeschlagen" }
    npm run smoke:browser
    if ($LASTEXITCODE -ne 0) { throw "smoke:browser fehlgeschlagen" }
  } finally {
    Pop-Location
  }
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Receive-Job $job -Keep -ErrorAction SilentlyContinue | Select-Object -Last 80
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}
